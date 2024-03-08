import { getOwner } from "@ember/application";
import { next } from "@ember/runloop";
import $ from "jquery";
import {
  lookupCachedUploadUrl,
  lookupUncachedUploadUrls,
  MISSING,
} from "pretty-text/upload-short-url";
import { Promise } from "rsvp";
import { ajax } from "discourse/lib/ajax";
import {
  fetchUnseenHashtagsInContext,
  linkSeenHashtagsInContext,
} from "discourse/lib/hashtag-autocomplete";
import lightbox from "discourse/lib/lightbox";
import {
  fetchUnseenMentions,
  linkSeenMentions,
} from "discourse/lib/link-mentions";
import { loadOneboxes } from "discourse/lib/load-oneboxes";
import { withPluginApi } from "discourse/lib/plugin-api";
import { cook } from "discourse/lib/text";
import { markdownNameFromFileName } from "discourse/lib/uploads";
import { iconNode } from "discourse-common/lib/icon-library";
import I18n from "I18n";
import { base64ToBuffer } from "discourse/plugins/discourse-encrypt/lib/base64";
import DebouncedQueue from "discourse/plugins/discourse-encrypt/lib/debounced-queue";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getUserIdentities,
  hasTopicKey,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  verify,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { downloadEncryptedFile } from "discourse/plugins/discourse-encrypt/lib/uploads";
import ActivateEncrypt from "../components/modal/activate-encrypt";

/*
 * Debounced queues for fetching information about user identities, mentions,
 * hashtags and short upload URLs from the server.
 */

let userIdentitiesQueues;
let mentionsQueues = [];
let hashtagsQueue;
let shortUrlsQueue;

function checkMetadata(post, expected) {
  const actual = {
    signed_by_id: post.user_id,
    signed_by_name: post.username,
    user_id: post.user_id,
    user_name: post.username,
    created_at: post.created_at,
    updated_at: post.updated_at,
    topic_id: post.topic_id,
    post_id: post.id,
    post_number: post.post_number,
  };

  const diff = [];
  Object.keys(expected).forEach((attr) => {
    if (
      attr === "raw" ||
      // Signature is checked using crypto primitives.
      attr === "signature" ||
      // Check user ID only if username matches, so it does not report both
      // username and user ID.
      (attr === "signed_by_id" &&
        actual.signed_by_name !== expected.signed_by_name) ||
      (attr === "user_id" && actual.user_name !== expected.user_name)
    ) {
      return;
    }

    let a = actual[attr];
    let b = expected[attr];
    let isDifferent = a !== b;

    if (attr === "created_at" || attr === "updated_at") {
      a = new Date(a);
      b = new Date(b);
      isDifferent = Math.abs(a - b) >= 5000; // Account for time skew.
    }

    if (isDifferent) {
      diff.push({ attr, actual: a, expected: b });
    }
  });

  // eslint-disable-next-line no-console
  if (console && console.warn && diff.length > 0) {
    let warning = "";
    warning += `Integrity check for post #${attrs.post_number} (post ID ${attrs.id}) failed.\n`;
    diff.forEach(
      (d) =>
        (warning += `  - ${d.attr} - expected "${d.expected}" vs actual "${d.actual}"\n`)
    );

    // eslint-disable-next-line no-console
    console.warn(warning);
  }

  return diff;
}

function resolveShortUrlElement($el) {
  const shortUrl = $el.data("orig-src") || $el.data("orig-href");
  const data = lookupCachedUploadUrl(shortUrl);
  const url = data.short_path;
  if (!url) {
    return;
  }

  const topicId = $el.closest("[data-topic-id]").data("topic-id");
  const keyPromise = $el.data("key")
    ? new Promise((resolve, reject) => {
        window.crypto.subtle
          .importKey(
            "raw",
            base64ToBuffer($el.data("key")),
            { name: "AES-GCM", length: 256 },
            true,
            ["encrypt", "decrypt"]
          )
          .then(resolve, reject);
      })
    : getTopicKey(topicId);

  if ($el.prop("tagName") === "A") {
    $el.removeAttr("data-orig-href");
    if (url === MISSING) {
      return;
    }

    $el.attr("href", url);

    const isEncrypted = $el.data("key") || $el.text().endsWith(".encrypted");
    if (!isEncrypted || !$el.hasClass("attachment")) {
      return;
    }

    $el.off("click.discourse-encrypt");
    $el.on("click.discourse-encrypt", () => {
      downloadEncryptedFile(url, keyPromise, { type: $el.data("type") }).then(
        (file) => {
          const a = document.createElement("a");
          a.href = window.URL.createObjectURL(file.blob);
          a.download = (file.name || $el.text()).replace(/\.encrypted$/, "");
          a.style.display = "none";

          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          window.URL.revokeObjectURL(a.href);
        }
      );
      return false;
    });
  } else if ($el.prop("tagName") === "IMG") {
    $el.removeAttr("data-orig-src");
    if (url === MISSING) {
      return;
    }

    const isEncrypted =
      $el.data("key") || $el.attr("alt").endsWith(".encrypted");
    if (!isEncrypted) {
      $el.attr("src", url);
      return;
    }

    if (!data.promise) {
      data.promise = downloadEncryptedFile(url, keyPromise, {
        type: $el.data("type"),
      });
    }
    data.promise.then((file) => {
      data.url = file.blob_url = window.URL.createObjectURL(file.blob);
      return file;
    });

    return data.promise.then((file) => {
      const imageName = file.name
        ? markdownNameFromFileName(file.name)
        : $el.attr("alt").replace(/\.encrypted$/, "");
      $el.attr("alt", imageName);
      $el.attr("src", file.blob_url);
    });
  }
}

function postProcessPost(siteSettings, site, topicId, post) {
  // Paint mentions
  const unseenMentions = linkSeenMentions(post, siteSettings);
  if (unseenMentions.length > 0) {
    if (!mentionsQueues[topicId]) {
      mentionsQueues[topicId] = new DebouncedQueue(500, (names) =>
        fetchUnseenMentions({ names, topicId })
      );
    }
    mentionsQueues[topicId]
      .push(...unseenMentions)
      .then(() => linkSeenMentions(post, siteSettings));
  }

  // Paint category and tag hashtags
  const hashtagContext = site.hashtag_configurations["topic-composer"];
  const unseenTagHashtags = linkSeenHashtagsInContext(hashtagContext, post);
  if (unseenTagHashtags.length > 0) {
    if (!hashtagsQueue) {
      hashtagsQueue = new DebouncedQueue(500, () =>
        fetchUnseenHashtagsInContext(hashtagContext, unseenTagHashtags)
      );
    }
    hashtagsQueue.push(...unseenTagHashtags).then(() => {
      linkSeenHashtagsInContext(hashtagContext, post);
    });
  }

  // Resolve short URLs
  post
    .querySelectorAll("img[data-orig-src], a[data-orig-href]")
    .forEach((el) => {
      const url = el.dataset.origSrc || el.dataset.origHref;

      if (lookupCachedUploadUrl(url).url) {
        resolveShortUrlElement($(el));
      } else {
        if (!shortUrlsQueue) {
          shortUrlsQueue = new DebouncedQueue(500, (items) =>
            lookupUncachedUploadUrls(items, ajax)
          );
        }

        shortUrlsQueue.push(url).then(() => resolveShortUrlElement($(el)));
      }
    });

  // Load Oneboxes
  loadOneboxes(
    post,
    ajax,
    topicId,
    null, // categoryId
    siteSettings.max_oneboxes_per_post,
    false
  );
}

export default {
  name: "decrypt-posts",

  initialize(container) {
    const currentUser = container.lookup("service:current-user");
    const siteSettings = container.lookup("service:site-settings");
    if (getEncryptionStatus(currentUser) === ENCRYPT_DISABLED) {
      return;
    }

    withPluginApi("0.11.3", (api) => {
      // Keys represent post IDs and values represent either arrays of errors
      // or 'null' to indicate that the post has been processed, but it had no
      // signature.
      const verified = {};

      api.includePostAttributes("encrypted_raw");

      api.decorateWidget("post-contents:after-cooked", () => {
        $(".cooked img")
          .not($(".d-lazyload-hidden"))
          .not($("a.lightbox img"))
          .each(function () {
            const src = $(this).attr("src");
            if (
              (this.naturalWidth > siteSettings.max_image_width ||
                this.naturalHeight > siteSettings.max_image_height) &&
              src.startsWith("blob:")
            ) {
              $(this).wrap(
                '<div class="lightbox-wrapper"><a class="lightbox" href="' +
                  src +
                  '"</a></div>'
              );
              lightbox($(this).parents(".cooked")[0], siteSettings);
            }
          });
      });

      // Add 'encrypted' badge to posts
      api.decorateWidget("post-meta-data:after", (helper) => {
        const post = helper.getModel();
        if (alreadyDecrypted.has(post)) {
          return helper.h(
            "div.post-info.encrypted",
            { title: I18n.t("encrypt.post_is_encrypted") },
            iconNode("user-secret")
          );
        }
      });

      // Add integrity status to posts
      api.decorateWidget("post-meta-data:after", (helper) => {
        const result = verified[helper.attrs.id];
        if (result === undefined) {
          return;
        } else if (result === null) {
          return helper.h(
            "div.post-info.integrity.integrity-warn",
            { title: I18n.t("encrypt.integrity_check_skip") },
            iconNode("exclamation-triangle")
          );
        } else if (result.length === 0) {
          return helper.h(
            "div.post-info.integrity.integrity-pass",
            { title: I18n.t("encrypt.integrity_check_pass") },
            iconNode("check")
          );
        }

        const messages = [];

        // Show a more descriptive error message if user does not match or if
        // it was recently updated because these errors are more common and
        // are not clear indicators of a problem or malicious behavior.
        const signedError = result.find((x) => x.attr === "signed_by_name");
        if (signedError) {
          messages.push(
            I18n.t("encrypt.integrity_check_warn_signed_by", {
              actual: signedError.actual,
              expected: signedError.expected,
            })
          );
        }

        const updatedAtError = result.find((x) => x.attr === "updated_at");
        if (updatedAtError) {
          messages.push(I18n.t("encrypt.integrity_check_warn_updated_at"));
        }

        const otherFields = result
          .map((x) => x.attr)
          .filter((attr) => attr !== "signed_by_name" && attr !== "updated_at");
        if (otherFields.length > 0) {
          messages.push(
            I18n.t("encrypt.integrity_check_fail", {
              fields: otherFields.join(", "),
            })
          );
        }

        // Show red error icon only if signature is invalid, all other messages
        // are treated as warnings otherwise.
        const isError = result.find((x) => x.attr === "signature");

        return helper.h(
          isError
            ? "div.post-info.integrity.integrity-fail"
            : "div.post-info.integrity.integrity-warn",
          { title: messages.join(" ") },
          iconNode(isError ? "times" : "exclamation-triangle")
        );
      });

      api.modifyClass("model:post-stream", {
        refresh() {
          return this._super(...arguments).then(async (result) => {
            await Promise.all(
              this.posts.map((post) => decryptPost(post, getOwner(this)))
            );
            return result;
          });
        },
        prependMore() {
          return this._super(...arguments).then(async (result) => {
            await Promise.all(
              this.posts.map((post) => decryptPost(post, getOwner(this)))
            );
            return result;
          });
        },
        appendMore() {
          return this._super(...arguments).then(async (result) => {
            await Promise.all(
              this.posts.map((post) => decryptPost(post, getOwner(this)))
            );
            return result;
          });
        },
        findPostsByIds() {
          return this._super(...arguments).then(async (result) => {
            await Promise.all(
              result.map((post) => decryptPost(post, getOwner(this)))
            );
            return result;
          });
        },
        stagePost(post) {
          decryptPost(post);
          return this._super(...arguments);
        },
      });

      api.decorateCookedElement((postElement, helper) => {
        if (helper) {
          const post = helper.getModel();
          if (alreadyDecrypted.has(post)) {
            postProcessPost(
              api.container.lookup("service:site-settings"),
              api.container.lookup("service:site"),
              post.topic_id,
              postElement
            );
          }
        }
      });

      function errorHtml(key) {
        return `<div class='alert alert-error'>${I18n.t(key)}</div>`;
      }

      const alreadyDecrypted = new WeakMap();

      async function decryptPost(post, owner) {
        const ciphertext = post.encrypted_raw;

        if (!ciphertext || alreadyDecrypted.has(post)) {
          return;
        } else if (!window.isSecureContext) {
          post.set("cooked", errorHtml("encrypt.preferences.insecure_context"));
          return;
        } else if (ciphertext && !hasTopicKey(post.topic_id)) {
          post.set("cooked", errorHtml("encrypt.missing_topic_key"));

          return;
        }

        alreadyDecrypted.set(post, true);

        try {
          await getIdentity();

          let key;
          try {
            key = await getTopicKey(post.topic_id);
          } catch (error) {
            post.set("cooked", errorHtml("encrypt.invalid_topic_key"));
            return;
          }

          let plaintext;
          try {
            plaintext = await decrypt(key, ciphertext);
          } catch (error) {
            post.set("cooked", errorHtml("encrypt.invalid_ciphertext"));
            return;
          }

          if (plaintext.signature) {
            if (!userIdentitiesQueues) {
              userIdentitiesQueues = new DebouncedQueue(500, getUserIdentities);
            }

            try {
              const ids = await userIdentitiesQueues.push(
                plaintext.signed_by_name
              );

              const userIdentity = ids[plaintext.signed_by_name];

              verified[post.id] = checkMetadata(post, plaintext);

              const result = await verify(
                userIdentity.signPublic,
                plaintext,
                ciphertext
              );

              if (!result) {
                verified[post.id].push({
                  attr: "signature",
                  actual: false,
                  expected: true,
                });
              }
            } catch (error) {
              verified[post.id] = [
                {
                  attr: "signature",
                  actual: false,
                  expected: true,
                },
              ];
            }
          } else {
            verified[post.id] = null;
          }

          const cooked = await cook(plaintext.raw);

          post.set("cooked", cooked.toString());
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(error);
          const store = owner.lookup("service:encrypt-widget-store");
          store.add(this);

          const modal = owner.lookup("service:modal");
          next(() => {
            modal.show(ActivateEncrypt);
          });
        }
      }

      api.decorateWidget("post-meta-data:after", (dec) => {
        const post = dec.getModel();

        if (post?.topic.archetype === "private_message") {
          return dec.attach("encrypted-post-timer-counter", { post });
        }
      });
    });
  },
};

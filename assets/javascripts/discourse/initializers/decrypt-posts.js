import { next } from "@ember/runloop";
import { iconHTML, iconNode } from "discourse-common/lib/icon-library";
import { renderSpinner } from "discourse/helpers/loading-spinner";
import { ajax } from "discourse/lib/ajax";
import lightbox from "discourse/lib/lightbox";
import {
  fetchUnseenHashtags,
  linkSeenHashtags,
} from "discourse/lib/link-hashtags";
import {
  fetchUnseenMentions,
  linkSeenMentions,
} from "discourse/lib/link-mentions";
import { loadOneboxes } from "discourse/lib/load-oneboxes";
import { withPluginApi } from "discourse/lib/plugin-api";
import showModal from "discourse/lib/show-modal";
import { cookAsync } from "discourse/lib/text";
import { markdownNameFromFileName } from "discourse/lib/uploads";
import { base64ToBuffer } from "discourse/plugins/discourse-encrypt/lib/base64";
import DebouncedQueue from "discourse/plugins/discourse-encrypt/lib/debounced-queue";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getUserIdentities,
  hasTopicKey,
  hasTopicTitle,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  verify,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { downloadEncryptedFile } from "discourse/plugins/discourse-encrypt/lib/uploads";
import I18n from "I18n";
import { ATTACHMENT_CSS_CLASS } from "pretty-text/engines/discourse-markdown-it";
import {
  MISSING,
  lookupCachedUploadUrl,
  lookupUncachedUploadUrls,
} from "pretty-text/upload-short-url";
import { Promise } from "rsvp";

/*
 * Debounced queues for fetching information about user identities, mentions,
 * hashtags and short upload URLs from the server.
 */

let userIdentitiesQueues;
let mentionsQueues = [];
let hashtagsQueue;
let shortUrlsQueue;

function checkMetadata(attrs, expected) {
  const actual = {
    user_id: attrs.user_id,
    user_name: attrs.username,
    created_at: attrs.created_at,
    updated_at: attrs.updated_at,
    topic_id: attrs.topicId,
    post_id: attrs.id,
    post_number: attrs.post_number,
  };

  const diff = [];
  Object.keys(expected).forEach((attr) => {
    if (
      attr === "raw" ||
      attr === "signed_by_id" ||
      attr === "signed_by_name" ||
      // Check user_id only if username matches, so it does not report
      // username and user_id.
      (attr === "user_id" && attrs.user_name !== expected.user_name)
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

  if (expected.signed_by_name !== attrs.username) {
    diff.push({
      attr: "signed_by_name",
      actual: expected.signed_by_name,
      expected: attrs.username,
    });
  }

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
    if (!isEncrypted || !$el.hasClass(ATTACHMENT_CSS_CLASS)) {
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

function postProcessPost(siteSettings, topicId, $post) {
  // Paint mentions
  const unseenMentions = linkSeenMentions($post, siteSettings);
  if (unseenMentions.length > 0) {
    if (!mentionsQueues[topicId]) {
      mentionsQueues[topicId] = new DebouncedQueue(500, (items) =>
        fetchUnseenMentions(items, topicId)
      );
    }
    mentionsQueues[topicId]
      .push(...unseenMentions)
      .then(() => linkSeenMentions($post, siteSettings));
  }

  // Paint category and tag hashtags
  const unseenTagHashtags = linkSeenHashtags($post);
  if (unseenTagHashtags.length > 0) {
    if (!hashtagsQueue) {
      hashtagsQueue = new DebouncedQueue(500, fetchUnseenHashtags);
    }
    hashtagsQueue.push(...unseenTagHashtags).then(() => {
      linkSeenHashtags($post);
    });
  }

  // Resolve short URLs
  $post.find("img[data-orig-src], a[data-orig-href]").each((_, el) => {
    const $el = $(el);
    const url = $el.data("orig-src") || $el.data("orig-href");

    if (lookupCachedUploadUrl(url).url) {
      resolveShortUrlElement($el);
    } else {
      if (!shortUrlsQueue) {
        shortUrlsQueue = new DebouncedQueue(500, (items) =>
          lookupUncachedUploadUrls(items, ajax)
        );
      }

      shortUrlsQueue.push(url).then(() => resolveShortUrlElement($el));
    }
  });

  // Load Oneboxes
  loadOneboxes(
    $post[0],
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
    const currentUser = container.lookup("current-user:main");
    const siteSettings = container.lookup("site-settings:main");
    if (getEncryptionStatus(currentUser, siteSettings) === ENCRYPT_DISABLED) {
      return;
    }

    withPluginApi("0.8.25", (api) => {
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

      api.decorateWidget("post-meta-data:after", (helper) => {
        const result = verified[helper.attrs.id];
        if (result === undefined) {
          return;
        } else if (result.length === 0) {
          return helper.h(
            "div.post-info.integrity-pass",
            { title: I18n.t("encrypt.integrity_check_pass") },
            iconNode("check")
          );
        }

        const fields = result
          .map((x) => x.attr)
          .filter((x) => x !== "updated_at" && x !== "signed_by_name");

        const warns = [];
        if (fields.length > 0) {
          warns.push(
            I18n.t("encrypt.integrity_check_fail", {
              fields: fields.join(", "),
            })
          );
        } else {
          result.forEach((x) => {
            if (x.attr === "updated_at") {
              warns.push(I18n.t("encrypt.integrity_check_warn_updated_at"));
            } else if (x.attr === "signed_by_name") {
              warns.push(I18n.t("encrypt.integrity_check_warn_signed_by", x));
            }
          });
        }

        return helper.h(
          fields.length === 0
            ? "div.post-info.integrity-warn"
            : "div.post-info.integrity-fail",
          { title: warns.join(" ") },
          iconNode(fields.length === 0 ? "exclamation-triangle" : "times")
        );
      });

      api.reopenWidget("post-contents", {
        html(attrs, state) {
          const topicId = attrs.topicId;
          if (attrs.id !== -1 && hasTopicTitle(topicId)) {
            decryptPost.call(this, attrs, state, topicId);
            updateHtml.call(this, attrs, state, topicId);
          }
          return this._super(...arguments);
        },
      });

      api.reopenWidget("post-small-action", {
        html(attrs, state) {
          const topicId = attrs.topicId;
          if (
            attrs.id !== -1 &&
            hasTopicTitle(topicId) &&
            attrs.encrypted_raw !== ""
          ) {
            decryptPost.call(this, attrs, state, topicId);
            updateHtml.call(this, attrs, state, topicId);
          }
          return this._super(...arguments);
        },
      });

      function decryptPost(attrs, state, topicId) {
        const ciphertext = attrs.encrypted_raw;

        if (!ciphertext || state.ciphertext === ciphertext) {
          return;
        } else if (!window.isSecureContext) {
          state.encryptState = "error";
          state.error = I18n.t("encrypt.preferences.insecure_context");
          return;
        } else if (ciphertext && !hasTopicKey(topicId)) {
          state.encryptState = "error";
          state.error = I18n.t("encrypt.missing_topic_key");
          return;
        }

        state.encryptState = "decrypting";
        state.ciphertext = ciphertext;

        getIdentity()
          .then(() => {
            getTopicKey(topicId)
              .then((key) => {
                decrypt(key, ciphertext)
                  .then((plaintext) => {
                    if (plaintext.signature) {
                      if (!userIdentitiesQueues) {
                        userIdentitiesQueues = new DebouncedQueue(
                          500,
                          getUserIdentities
                        );
                      }
                      userIdentitiesQueues
                        .push(plaintext.signed_by_name)
                        .then((ids) => ids[plaintext.signed_by_name])
                        .then((userIdentity) => {
                          return verify(
                            userIdentity.signPublic,
                            plaintext,
                            ciphertext
                          );
                        })
                        .then((result) => {
                          verified[attrs.id] = checkMetadata(attrs, plaintext);
                          if (!result) {
                            verified[attrs.id].push({
                              attr: "signature",
                              actual: false,
                              expected: true,
                            });
                          }
                        })
                        .catch(() => {
                          verified[attrs.id] = [
                            {
                              attr: "signature",
                              actual: false,
                              expected: true,
                            },
                          ];
                        })
                        .finally(() => this.scheduleRerender());
                    }
                    return cookAsync(plaintext.raw);
                  })
                  .then((cooked) => {
                    state.encryptState = "decrypted";
                    state.plaintext = cooked.string;
                    this.scheduleRerender();
                  })
                  .catch(() => {
                    state.encryptState = "error";
                    state.error = I18n.t("encrypt.invalid_ciphertext");
                    this.scheduleRerender();
                  });
              })
              .catch(() => {
                state.encryptState = "error";
                state.error = I18n.t("encrypt.invalid_topic_key");
                this.scheduleRerender();
              });
          })
          .catch(() => {
            showModal("activate-encrypt", { model: { widget: this } });
          });
      }

      function updateHtml(attrs, state, topicId) {
        if (state.encryptState === "decrypting") {
          attrs.cooked =
            "<div class='alert alert-info'>" +
            renderSpinner("small") +
            " " +
            I18n.t("encrypt.decrypting") +
            "</div>";
        } else if (state.encryptState === "decrypted") {
          attrs.cooked = state.plaintext;
          next(() => {
            let $post = $(`article[data-post-id='${attrs.id}']`);
            if ($post.length === 0) {
              $post = $(`#post_${attrs.post_number}.small-action`);
            }

            postProcessPost(this.siteSettings, topicId, $post);
          });
        } else if (state.encryptState === "error") {
          attrs.cooked =
            "<div class='alert alert-error'>" +
            iconHTML("times") +
            " " +
            state.error +
            "</div>" +
            attrs.cooked;
        }
        return attrs.cooked;
      }

      api.decorateWidget("post-meta-data:after", (dec) => {
        const post = dec.getModel();
        return dec.attach("encrypted-post-timer-counter", { post });
      });
    });
  },
};

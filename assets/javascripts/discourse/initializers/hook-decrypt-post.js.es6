import { debounce } from "@ember/runloop";
import { iconHTML, iconNode } from "discourse-common/lib/icon-library";
import { renderSpinner } from "discourse/helpers/loading-spinner";
import { ajax } from "discourse/lib/ajax";
import {
  fetchUnseenCategoryHashtags,
  linkSeenCategoryHashtags
} from "discourse/lib/link-category-hashtags";
import {
  fetchUnseenMentions,
  linkSeenMentions
} from "discourse/lib/link-mentions";
import {
  fetchUnseenTagHashtags,
  linkSeenTagHashtags
} from "discourse/lib/link-tag-hashtag";
import { withPluginApi } from "discourse/lib/plugin-api";
import showModal from "discourse/lib/show-modal";
import { cookAsync } from "discourse/lib/text";
import { imageNameFromFileName } from "discourse/lib/uploads";
import { base64ToBuffer } from "discourse/plugins/discourse-encrypt/lib/base64";
import {
  ENCRYPT_DISABLED,
  getDebouncedUserIdentities,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  hasTopicKey,
  hasTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  verify
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { ATTACHMENT_CSS_CLASS } from "pretty-text/engines/discourse-markdown-it";
import {
  lookupCachedUploadUrl,
  lookupUncachedUploadUrls,
  MISSING
} from "pretty-text/upload-short-url";
import { Promise } from "rsvp";

function checkMetadata(attrs, expected) {
  const actual = {
    user_id: attrs.user_id,
    user_name: attrs.username,
    created_at: attrs.created_at,
    updated_at: attrs.updated_at,
    topic_id: attrs.topicId,
    post_id: attrs.id,
    post_number: attrs.post_number
  };

  const diff = [];
  Object.keys(expected).forEach(attr => {
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
      expected: attrs.username
    });
  }

  // eslint-disable-next-line no-console
  if (console && console.warn && diff.length > 0) {
    let warning = "";
    warning += `Integrity check for post #${attrs.post_number} (post ID ${attrs.id}) failed.\n`;
    diff.forEach(
      d =>
        (warning += `  - ${d.attr} - expected "${d.expected}" vs actual "${d.actual}"\n`)
    );

    // eslint-disable-next-line no-console
    console.warn(warning);
  }

  return diff;
}

function downloadEncryptedFile(url, keyPromise) {
  const downloadPromise = new Promise((resolve, reject) => {
    var req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.responseType = "arraybuffer";
    req.onload = function() {
      let filename = req.getResponseHeader("Content-Disposition");
      if (filename) {
        // Requires Access-Control-Expose-Headers: Content-Disposition.
        filename = filename.match(/filename="(.*?)"/)[1];
      }
      resolve({ buffer: req.response, filename });
    };
    req.onerror = reject;
    req.send(null);
  });

  return Promise.all([keyPromise, downloadPromise]).then(([key, download]) => {
    const iv = download.buffer.slice(0, 12);
    const content = download.buffer.slice(12);

    return new Promise((resolve, reject) => {
      window.crypto.subtle
        .decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, content)
        .then(resolve, reject);
    }).then(buffer => ({
      blob: new Blob([buffer], { type: "octet/stream" }),
      name: download.filename
    }));
  });
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

    $el.text($el.text().replace(/\.encrypted$/, ""));
    $el.on("click", () => {
      downloadEncryptedFile(url, keyPromise).then(file => {
        const a = document.createElement("a");
        a.href = window.URL.createObjectURL(file.blob);
        a.download = file.name || $el.text();
        a.download = a.download.replace(/\.encrypted$/, "");
        a.style.display = "none";

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        window.URL.revokeObjectURL(a.href);
      });
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

    return downloadEncryptedFile(url, keyPromise).then(file => {
      const imageName = file.name
        ? imageNameFromFileName(file.name)
        : $el.attr("alt").replace(/\.encrypted$/, "");
      $el.attr("alt", imageName);
      $el.attr("src", window.URL.createObjectURL(file.blob));
    });
  }
}

function lookupAndResolveShortUrlElement(urls, $elements) {
  urls = Array.from(new Set(urls));
  return lookupUncachedUploadUrls(urls, ajax).then(() => {
    $elements.each((_, el) => resolveShortUrlElement($(el)));
  });
}

function postProcessPost(siteSettings, topicId, $post) {
  // Paint mentions.
  const unseenMentions = linkSeenMentions($post, siteSettings);
  if (unseenMentions.length) {
    fetchUnseenMentions(unseenMentions, topicId).then(() =>
      linkSeenMentions($post, siteSettings)
    );
  }

  // Paint category hashtags.
  const unseenCategoryHashtags = linkSeenCategoryHashtags($post);
  if (unseenCategoryHashtags.length) {
    fetchUnseenCategoryHashtags(unseenCategoryHashtags).then(() => {
      linkSeenCategoryHashtags($post);
    });
  }

  // Paint tag hashtags.
  if (siteSettings.tagging_enabled) {
    const unseenTagHashtags = linkSeenTagHashtags($post);
    if (unseenTagHashtags.length) {
      fetchUnseenTagHashtags(unseenTagHashtags).then(() => {
        linkSeenTagHashtags($post);
      });
    }
  }

  // Resolve short URLs (first using cache and then using fresh data)
  const urls = [];
  $("img[data-orig-src], a[data-orig-href]").each((_, el) => {
    const $el = $(el);
    const url = $el.data("orig-src") || $el.data("orig-href");
    if (lookupCachedUploadUrl(url).url) {
      resolveShortUrlElement($el);
    } else {
      urls.push(url);
    }
  });

  const $elements = $("img[data-orig-src], a[data-orig-href]");
  if ($elements.length > 0) {
    debounce(this, lookupAndResolveShortUrlElement, urls, $elements, 450, true);
  }
}

export default {
  name: "hook-decrypt-post",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) === ENCRYPT_DISABLED) {
      return;
    }

    withPluginApi("0.8.25", api => {
      const verified = {};

      api.includePostAttributes("encrypted_raw");

      api.decorateWidget("post-meta-data:after", helper => {
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
          .map(x => x.attr)
          .filter(x => x !== "updated_at" && x !== "signed_by_name");

        const warns = [];
        if (fields.length > 0) {
          warns.push(
            I18n.t("encrypt.integrity_check_fail", {
              fields: fields.join(", ")
            })
          );
        } else {
          result.forEach(x => {
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
          if (attrs.id === -1 || !hasTopicTitle(topicId)) {
            return this._super(...arguments);
          }

          const ciphertext = attrs.encrypted_raw;
          if (
            hasTopicKey(topicId) &&
            ciphertext &&
            (!state.encrypted || state.encrypted !== ciphertext)
          ) {
            state.encrypted = ciphertext;

            if (!window.isSecureContext) {
              state.decrypting = false;
              state.decrypted = true;
              state.error = I18n.t("encrypt.preferences.insecure_context");
            } else {
              state.decrypting = true;
              getIdentity().then(identity => {
                if (!identity) {
                  // Absence of private key means user did not activate encryption.
                  showModal("activate-encrypt", { model: this });
                  return;
                }

                getTopicKey(topicId)
                  .then(key => decrypt(key, ciphertext))
                  .then(plaintext => {
                    if (plaintext.signature) {
                      getDebouncedUserIdentities([plaintext.signed_by_name])
                        .then(identities => {
                          return verify(
                            identities[plaintext.signed_by_name].signPublic,
                            plaintext,
                            ciphertext
                          );
                        })
                        .then(result => {
                          verified[attrs.id] = checkMetadata(attrs, plaintext);
                          if (!result) {
                            verified[attrs.id].push({
                              attr: "signature",
                              actual: false,
                              expected: true
                            });
                          }
                        })
                        .catch(() => {
                          verified[attrs.id] = [
                            {
                              attr: "signature",
                              actual: false,
                              expected: true
                            }
                          ];
                        })
                        .finally(() => this.scheduleRerender());
                    }

                    return cookAsync(plaintext.raw);
                  })
                  .then(cooked => (state.decrypted = cooked.string))
                  .catch(() => {
                    state.decrypted = true;
                    state.error = I18n.t("encrypt.decryption_failed");
                  })
                  .finally(() => {
                    state.decrypting = false;
                    this.scheduleRerender();
                  });
              });
            }
          }

          if (state.decrypted && state.decrypted !== true) {
            attrs.cooked = state.decrypted;
            Ember.run.next(() => {
              const $post = $(`article[data-post-id='${attrs.id}']`);
              postProcessPost(this.siteSettings, topicId, $post);
            });
          } else if (state.decrypting) {
            attrs.cooked =
              "<div class='alert alert-info'>" +
              renderSpinner("small") +
              " " +
              I18n.t("encrypt.decrypting") +
              "</div>";
          } else {
            attrs.cooked =
              "<div class='alert alert-error'>" +
              iconHTML("times") +
              " " +
              state.error +
              "</div>" +
              attrs.cooked;
          }

          return this._super(...arguments);
        }
      });
    });
  }
};

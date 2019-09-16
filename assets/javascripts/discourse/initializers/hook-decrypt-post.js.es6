import { iconHTML, iconNode } from "discourse-common/lib/icon-library";
import { renderSpinner } from "discourse/helpers/loading-spinner";
import { ajax } from "discourse/lib/ajax";
import { withPluginApi } from "discourse/lib/plugin-api";
import showModal from "discourse/lib/show-modal";
import { cookAsync } from "discourse/lib/text";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getUserIdentities,
  hasTopicKey,
  hasTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  verify
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { resolveAllShortUrls } from "pretty-text/upload-short-url";
import {
  linkSeenMentions,
  fetchUnseenMentions
} from "discourse/lib/link-mentions";
import {
  linkSeenCategoryHashtags,
  fetchUnseenCategoryHashtags
} from "discourse/lib/link-category-hashtags";
import {
  linkSeenTagHashtags,
  fetchUnseenTagHashtags
} from "discourse/lib/link-tag-hashtag";

function warnMetadataMismatch(attrs, diff) {
  // eslint-disable-next-line no-console
  if (!console || !console.warn || !diff || diff.length === 0) {
    return;
  }

  let warning = "";
  warning += `Integrity check for post #${attrs.post_number} (post ID ${attrs.id}) failed.\n`;
  diff.forEach(
    d =>
      (warning += `  - ${d.attr} - expected "${d.expected}" vs actual "${d.actual}"\n`)
  );

  // eslint-disable-next-line no-console
  console.warn(warning);
}

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
      attr === "signed_by_name"
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

  warnMetadataMismatch(attrs, diff);
  return diff;
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

  // Paint short URLs.
  resolveAllShortUrls(ajax);
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
        if (verified[helper.attrs.id] === undefined) {
          return;
        } else if (verified[helper.attrs.id] === false) {
          return helper.h(
            "div.post-info.integrity-fail",
            { title: I18n.t("encrypt.integrity_check_failed") },
            iconNode("exclamation-triangle")
          );
        } else if (verified[helper.attrs.id].length === 0) {
          return helper.h(
            "div.post-info.integrity-pass",
            { title: I18n.t("encrypt.integrity_check_passed") },
            iconNode("check")
          );
        }

        return helper.h(
          "div.post-info.integrity-fail",
          {
            title: I18n.t("encrypt.integrity_check_mismatch", {
              fields: verified[helper.attrs.id].map(d => d.attr).join(", ")
            })
          },
          iconNode("exclamation-triangle")
        );
      });

      api.reopenWidget("post-contents", {
        html(attrs, state) {
          const topicId = attrs.topicId;
          if (!hasTopicTitle(topicId)) {
            return this._super(...arguments);
          }

          const ciphertext = attrs.encrypted_raw;
          if (
            hasTopicKey(topicId) &&
            ciphertext &&
            (!state.encrypted || state.encrypted !== ciphertext)
          ) {
            state.encrypted = ciphertext;
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
                    getUserIdentities([plaintext.signed_by_name])
                      .then(identities =>
                        verify(
                          identities[plaintext.signed_by_name].signPublic,
                          plaintext,
                          ciphertext
                        )
                      )
                      .then(result => {
                        verified[attrs.id] =
                          result && checkMetadata(attrs, plaintext);
                        this.scheduleRerender();
                      })
                      .catch(() => {
                        verified[attrs.id] = false;
                      });
                  }

                  return cookAsync(plaintext.raw);
                })
                .then(cooked => {
                  state.decrypting = false;
                  state.decrypted = cooked.string;
                  this.scheduleRerender();
                })
                // Absence of topic key underlies a bigger error.
                .catch(() => {
                  state.decrypting = false;
                  state.decrypted = true;
                  this.scheduleRerender();
                });
            });
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
              I18n.t("encrypt.decryption_failed") +
              "</div>" +
              attrs.cooked;
          }

          return this._super(...arguments);
        }
      });
    });
  }
};

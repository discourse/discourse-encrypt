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

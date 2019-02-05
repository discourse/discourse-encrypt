import { withPluginApi } from "discourse/lib/plugin-api";
import { iconHTML } from "discourse-common/lib/icon-library";
import { decrypt } from "discourse/plugins/discourse-encrypt/lib/keys";
import { cookAsync } from "discourse/lib/text";
import {
  getTopicKey,
  hasTopicKey,
  hasTopicTitle,
  isEncryptEnabled
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { renderSpinner } from "discourse/helpers/loading-spinner";
import showModal from "discourse/lib/show-modal";

export default {
  name: "hook-decrypt-post",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.8.25", api => {
      api.reopenWidget("post-contents", {
        html(attrs, state) {
          const topicId = attrs.topicId;

          // An unencrypted topic will not have an encrypted title so we can
          // return early.
          if (!hasTopicTitle(topicId)) {
            return this._super(...arguments);
          }

          // Check if post has been updated (if last decrypted ciphertext
          // is different than the current ciphertext).
          const ciphertext = $(attrs.cooked).text();
          if (state.encrypted && state.encrypted !== ciphertext) {
            state.decrypting = false;
            state.decrypted = undefined;
          }

          if (hasTopicKey(topicId) && !state.decrypted) {
            state.encrypted = ciphertext;
            state.decrypting = true;

            getTopicKey(topicId)
              .then(key => decrypt(key, ciphertext))
              .then(plaintext => cookAsync(plaintext))
              .then(cooked => {
                state.decrypted = cooked.string;
                this.scheduleRerender();
              })
              .catch(() => {
                showModal("activate-encrypt", { model: this });
              });
          }

          // Checking if topic is already being decrypted
          if (state.decrypting) {
            if (state.decrypted) {
              attrs.cooked = state.decrypted;
            } else {
              attrs.cooked =
                "<div class='alert alert-info'>" +
                renderSpinner("small") +
                " " +
                I18n.t("encrypt.decrypting") +
                "</div>";
            }
          } else {
            attrs.cooked =
              "<div class='alert alert-error'>" +
              iconHTML("times") +
              " " +
              I18n.t("encrypt.decryption_failed") +
              "</div>";
          }

          return this._super(...arguments);
        }
      });
    });
  }
};

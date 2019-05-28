import { resolveAllShortUrls } from "pretty-text/image-short-url";
import { withPluginApi } from "discourse/lib/plugin-api";
import { cookAsync } from "discourse/lib/text";
import { ajax } from "discourse/lib/ajax";
import showModal from "discourse/lib/show-modal";
import { renderSpinner } from "discourse/helpers/loading-spinner";
import { iconHTML } from "discourse-common/lib/icon-library";
import { decrypt } from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  getPrivateKey,
  getTopicKey,
  hasTopicKey,
  hasTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-decrypt-post",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) === ENCRYPT_DISABLED) {
      return;
    }

    withPluginApi("0.8.25", api => {
      api.includePostAttributes("encrypted_raw");
      api.reopenWidget("post-contents", {
        html(attrs, state) {
          const topicId = attrs.topicId;
          if (!hasTopicTitle(topicId)) {
            return this._super(...arguments);
          }

          const ciphertext = attrs.encrypted_raw;
          if (
            (!state.decrypted || state.encrypted !== ciphertext) &&
            hasTopicKey(topicId)
          ) {
            state.encrypted = ciphertext;
            state.decrypting = true;

            getPrivateKey()
              .then(() =>
                getTopicKey(topicId)
                  .then(key => decrypt(key, ciphertext))
                  .then(plaintext => cookAsync(plaintext))
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
                  })
              )
              // Absence of private key means user did not activate encryption.
              .catch(() => showModal("activate-encrypt", { model: this }));
          }

          if (state.decrypted && state.decrypted !== true) {
            attrs.cooked = state.decrypted;
            Ember.run.next(() => resolveAllShortUrls(ajax));
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

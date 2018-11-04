import { withPluginApi } from "discourse/lib/plugin-api";
import { decrypt } from "discourse/plugins/discourse-encrypt/lib/keys";
import { cookAsync } from "discourse/lib/text";
import {
  getTopicKey,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { renderSpinner } from "discourse/helpers/loading-spinner";

export default {
  name: "hook-decrypt-post",

  initialize() {
    // Hook post-contents widget.
    withPluginApi("0.8.25", api => {
      api.reopenWidget("post-contents", {
        html(attrs, state) {
          if (state.decrypting) {
            if (state.decrypted) {
              attrs.cooked = state.decrypted;
            }
            return this._super(...arguments);
          }

          state.decrypting = true;
          const topicId = attrs.topicId;

          if (hasTopicKey(topicId)) {
            const ciphertext = $(attrs.cooked).text();
            attrs.cooked =
              renderSpinner("small") + " " + I18n.t("encrypt.decrypting");

            getTopicKey(topicId)
              .then(key => decrypt(key, ciphertext))
              .then(plaintext => cookAsync(plaintext))
              .then(cooked => {
                state.decrypted = cooked.string;
                this.scheduleRerender();
              });
          }

          return this._super(...arguments);
        }
      });
    });
  }
};

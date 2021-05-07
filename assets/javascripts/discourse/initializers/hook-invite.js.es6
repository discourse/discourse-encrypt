import I18n from "I18n";
import { ajax } from "discourse/lib/ajax";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicKey,
  getUserIdentities,
  hasTopicKey,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { exportKey } from "discourse/plugins/discourse-encrypt/lib/protocol";
import { Promise } from "rsvp";

export default {
  name: "hook-invite",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const siteSettings = container.lookup("site-settings:main");
    if (getEncryptionStatus(currentUser, siteSettings) !== ENCRYPT_ACTIVE) {
      return;
    }

    Topic.reopen({
      createInvite(user, group_names, custom_message) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!hasTopicKey(this.id)) {
          return _super.call(this, ...arguments);
        }

        return Promise.all([getTopicKey(this.id), getUserIdentities([user])])
          .then(([key, identities]) =>
            exportKey(key, identities[user].encryptPublic)
          )
          .then((key) => {
            ajax(`/t/${this.get("id")}/invite`, {
              type: "POST",
              data: { user, key, group_names, custom_message },
            });
          })
          .catch((username) => {
            bootbox.alert(
              I18n.t("encrypt.composer.user_has_no_key", { username })
            );
            return Promise.reject(username);
          });
      },
    });
  },
};

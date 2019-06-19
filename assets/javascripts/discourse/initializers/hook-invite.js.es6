import { ajax } from "discourse/lib/ajax";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_ACTIVE,
  exportKey,
  getEncryptionStatus,
  getTopicKey,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-invite",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    Topic.reopen({
      createInvite(user, group_names, custom_message) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!hasTopicKey(this.id)) {
          return _super.call(this, ...arguments);
        }

        const topicKeyPromise = getTopicKey(this.id);
        const userKeyPromise = ajax("/encrypt/user", {
          type: "GET",
          data: { usernames: [user] }
        })
          .then(userKeys => {
            if (!userKeys[user]) {
              bootbox.alert(
                I18n.t("encrypt.composer.user_has_no_key", { username: user })
              );
              return Ember.RSVP.Promise.reject(user);
            }

            return userKeys[user];
          })
          .then(key => importPublicKey(key));

        return Ember.RSVP.Promise.all([topicKeyPromise, userKeyPromise])
          .then(([topicKey, userKey]) => exportKey(topicKey, userKey))
          .then(key =>
            ajax(`/t/${this.get("id")}/invite`, {
              type: "POST",
              data: { user, key, group_names, custom_message }
            })
          );
      }
    });
  }
};

import Topic from "discourse/models/topic";
import TopicDetails from "discourse/models/topic-details";
import { ajax } from "discourse/lib/ajax";
import {
  getPrivateKey,
  isEncryptEnabled
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  exportKey,
  importKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";

export default {
  name: "hook-invite",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    Topic.reopen({
      createInvite(username) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (!this.get("topic_key")) {
          return _super.call(this, ...arguments);
        }

        // Getting this topic's key.
        const topicKeyPromise = getPrivateKey().then(key =>
          importKey(this.get("topic_key"), key)
        );

        // Getting user's key.
        const userKeyPromise = ajax("/encrypt/user", {
          type: "GET",
          data: { usernames: [username] }
        })
          .then(userKeys => {
            if (!userKeys[username]) {
              bootbox.alert(
                I18n.t("encrypt.composer.user_has_no_key", { username })
              );
              return Ember.RSVP.Promise.reject(username);
            }

            return userKeys[username];
          })
          .then(key => importPublicKey(key));

        // Send topic's key encrypted with user's key.
        return Ember.RSVP.Promise.all([topicKeyPromise, userKeyPromise])
          .then(([topicKey, userKey]) => exportKey(topicKey, userKey))
          .then(key =>
            ajax("/encrypt/topic", {
              type: "PUT",
              data: { topic_id: this.get("id"), keys: { [username]: key } }
            })
          )
          .then(() => _super.call(this, ...arguments));
      }
    });

    TopicDetails.reopen({
      removeAllowedUser(user) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        const topic = this.get("topic");
        if (!topic.get("topic_key")) {
          return _super.call(this, ...arguments);
        }

        // TODO: Generate a new topic key.
        // TODO: Re-encrypt and edit all posts in topic.
        // TODO: Re-encrypt and save keys for all users.

        return ajax("/encrypt/topic", {
          type: "DELETE",
          data: { topic_id: topic.get("id"), usernames: [user.username] }
        }).then(() => _super.call(this, ...arguments));
      }
    });
  }
};

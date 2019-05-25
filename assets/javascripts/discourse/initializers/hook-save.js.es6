import PostAdapter from "discourse/adapters/post";
import Topic from "discourse/models/topic";
import { ajax } from "discourse/lib/ajax";
import {
  encrypt,
  exportKey,
  generateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  hasTopicKey,
  putTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { getTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-save",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    Topic.reopenClass({
      update(topic, props) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!hasTopicKey(topic.id)) {
          return _super.call(this, ...arguments);
        }

        return getTopicKey(topic.id)
          .then(key => encrypt(key, props.title))
          .then(encryptedTitle => {
            props.title = I18n.t("encrypt.encrypted_topic_title");
            props.encrypted_title = encryptedTitle;
          })
          .then(() => _super.call(this, ...arguments));
      }
    });

    PostAdapter.reopen({
      createRecord(store, type, args) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!args.is_encrypted) {
          return _super.call(this, ...arguments);
        }

        let topicKey = args.topic_id
          ? getTopicKey(args.topic_id)
          : generateKey();

        let titlePromise = args.title
          ? topicKey
              .then(key => encrypt(key, args.title))
              .then(encryptedTitle => {
                args.title = I18n.t("encrypt.encrypted_topic_title");
                args.encrypted_title = encryptedTitle;
              })
          : Ember.RSVP.Promise.resolve();

        let replyPromise = args.raw
          ? topicKey
              .then(key => encrypt(key, args.raw))
              .then(encryptedRaw => {
                args.raw = I18n.t("encrypt.encrypted_topic_raw");
                args.encrypted_raw = encryptedRaw;
              })
          : Ember.RSVP.Promise.resolve();

        let encryptedKeysPromise = Ember.RSVP.Promise.resolve();
        if (args.target_usernames) {
          const usernames = args.target_usernames.split(",");
          usernames.push(Discourse.User.current().username);

          const userKeysPromise = ajax("/encrypt/user", {
            type: "GET",
            data: { usernames }
          });

          encryptedKeysPromise = Promise.all([topicKey, userKeysPromise])
            .then(([key, userKeys]) => {
              const promises = [];

              for (let i = 0; i < usernames.length; ++i) {
                const username = usernames[i];
                if (!userKeys[username]) {
                  promises.push(Ember.RSVP.Promise.reject(username));
                } else {
                  promises.push(
                    importPublicKey(userKeys[username]).then(userKey =>
                      exportKey(key, userKey)
                    )
                  );
                }
              }

              return Ember.RSVP.Promise.all(promises);
            })
            .then(userKeys => {
              args.encrypted_keys = {};
              for (let i = 0; i < userKeys.length; ++i) {
                args.encrypted_keys[usernames[i]] = userKeys[i];
              }
              args.encrypted_keys = JSON.stringify(args.encrypted_keys);
            })
            .catch(username => {
              bootbox.alert(
                I18n.t("encrypt.composer.user_has_no_key", { username })
              );
              return Ember.RSVP.Promise.reject(username);
            });
        }

        // Hide any information that might give a hint of what this message
        // may contain.
        args.composer_open_duration_msecs = 10000;
        args.typing_duration_msecs = 10000;

        return Promise.all([titlePromise, replyPromise, encryptedKeysPromise])
          .then(() => _super.call(this, ...arguments))
          .then(result =>
            topicKey
              .then(key => putTopicKey(result.payload.topic_id, key))
              .then(() => result)
          );
      },

      update(store, type, id, attrs) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!hasTopicKey(attrs.topic_id)) {
          return _super.call(this, ...arguments);
        }

        return getTopicKey(attrs.topic_id)
          .then(key => encrypt(key, attrs.raw))
          .then(encryptedRaw => {
            attrs.cooked = undefined;
            attrs.raw = encryptedRaw;
            attrs.raw_old = undefined;
          })
          .then(() => _super.call(this, ...arguments));
      }
    });
  }
};

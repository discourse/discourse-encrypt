import Composer from "discourse/models/composer";
import { ajax } from "discourse/lib/ajax";
import {
  default as computed,
  observes,
  on
} from "ember-addons/ember-computed-decorators";
import {
  encrypt,
  decrypt,
  rsaDecrypt,
  exportKey,
  importKey,
  generateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  putTopicKey,
  getTopicKey,
  hasTopicKey,
  getPrivateKey,
  getTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-composer",
  initialize(container) {
    // Decode composer on reply reload. This usually occurs when a post is
    // edited or a draft is loaded.
    const appEvents = container.lookup("app-events:main");
    appEvents.on("composer:reply-reloaded", model => {
      let decTitle, decReply;

      if (model.get("draftKey") === Composer.NEW_PRIVATE_MESSAGE_KEY) {
        /*
         * Decrypt private message drafts.
         */
        const p = getPrivateKey();
        decTitle = p.then(key => rsaDecrypt(key, model.get("title")));
        decReply = p.then(key => rsaDecrypt(key, model.get("reply")));
      } else {
        /*
         * Decrypt replies.
         */
        let topicId;

        // Try get topic ID from topic model.
        const topic = model.get("topic");
        if (topic) {
          topicId = topic.get("id");
        }

        // Try get topic ID from draft key.
        if (!topicId) {
          const draftKey = model.get("draftKey");
          if (draftKey && draftKey.indexOf("topic_") === 0) {
            topicId = draftKey.substring("topic_".length);
          }
        }

        if (hasTopicKey(topicId)) {
          decTitle = getTopicTitle(topicId);
          const reply = model.get("reply");
          if (reply) {
            decReply = getTopicKey(topicId).then(key => decrypt(key, reply));
          }
        }
      }

      if (decTitle) {
        decTitle
          .then(title => model.setProperties({ title, isEncrypted: true }))
          .catch(() => {});
      }

      if (decReply) {
        decReply
          .then(reply => model.setProperties({ reply, isEncrypted: true }))
          .catch(() => {});
      }
    });

    // Encrypt the Composer contents on-the-fly right before it is sent over
    // to the server.
    Composer.reopen({
      save() {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        const title = this.get("title");
        const reply = this.get("reply");

        // Edited posts already have a topic key.
        if (this.get("topic.topic_key")) {
          return getPrivateKey()
            .then(key => importKey(this.get("topic.topic_key"), key))
            .then(key => {
              const p0 = encrypt(key, reply).then(r => this.set("reply", r));
              const p1 = encrypt(key, title).then(encTitle => {
                this.set("title", I18n.t("encrypt.encrypted_topic_title"));
                ajax("/encrypt/topic", {
                  type: "PUT",
                  data: { topic_id: this.get("topic.id"), title: encTitle }
                });
              });

              return Ember.RSVP.Promise.all([p0, p1]);
            })
            .then(() => _super.call(this, ...arguments))
            .finally(() => this.setProperties({ title, reply }));
        }

        // Not encrypted messages.
        if (!this.get("isEncrypted")) {
          return _super.call(this, ...arguments);
        }

        // Generating a new topic key.
        const p0 = generateKey();

        // Encrypting user keys.
        const usernames = this.get("recipients");
        const p1 = p0.then(key =>
          ajax("/encrypt/user", {
            type: "GET",
            data: { usernames }
          })
            .then(userKeys => {
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
            .catch(username => {
              bootbox.alert(
                I18n.t("encrypt.composer.user_has_no_key", { username })
              );
              return Ember.RSVP.Promise.reject(username);
            })
        );

        // Encrypting title and reply.
        const p2 = p0.then(key => encrypt(key, title));
        const p3 = p0.then(key => encrypt(key, reply));

        // Send user keys, title and reply encryption to the server.
        return Ember.RSVP.Promise.all([p1, p2, p3])
          .then(([keys, encTitle, encReply]) => {
            const userKeys = {};
            for (let i = 0; i < keys.length; ++i) {
              userKeys[usernames[i]] = keys[i];
            }

            this.set("title", I18n.t("encrypt.encrypted_topic_title"));
            this.set("reply", encReply);

            const result = _super.call(this, ...arguments);
            return Ember.RSVP.Promise.all([p0, encTitle, userKeys, result]);
          })
          .then(([key, encTitle, userKeys, result]) => {
            const topicId = result.responseJson.post.topic_id;

            putTopicKey(topicId, key);
            ajax("/encrypt/topic", {
              type: "PUT",
              data: { topic_id: topicId, title: encTitle, keys: userKeys }
            });

            return result;
          })
          .finally(() => this.setProperties({ title, reply }));
      },

      @on("init")
      initEncrypt() {
        this.setProperties({
          encryptError: "",
          isEncryptedDisabled: false,
          isEncrypted: false
        });
      },

      @observes("targetUsernames")
      checkKeys() {
        const usernames = this.get("recipients");
        if (usernames.length === 0) {
          this.setProperties({
            encryptError: "",
            isEncryptedDisabled: false,
            isEncrypted: true
          });
          return;
        }

        ajax("/encrypt/user", {
          type: "GET",
          data: { usernames }
        }).then(userKeys => {
          for (let i = 0; i < usernames.length; ++i) {
            const username = usernames[i];
            if (!userKeys[username]) {
              // Show the error message only if user is interested in encrypting
              // the message (i.e. filled the encrypt checkbox).
              if (this.get("isEncrypted")) {
                this.set(
                  "encryptError",
                  I18n.t("encrypt.composer.user_has_no_key", { username })
                );
              }

              this.setProperties({
                isEncryptedDisabled: true,
                isEncrypted: false
              });
              return;
            }
          }

          // Remember user preferences. If user enters a recipient, unchecks
          // encryption and then adds another recipient, this will not revert
          // his uncheck.
          if (this.get("isEncryptedDisabled")) {
            this.setProperties({
              encryptError: "",
              isEncryptedDisabled: false,
              isEncrypted: true
            });
          }
        });
      },

      @computed("targetUsernames")
      recipients(targetUsernames) {
        const recipients = targetUsernames ? targetUsernames.split(",") : [];
        recipients.push(this.get("user.username"));
        return recipients;
      }
    });
  }
};

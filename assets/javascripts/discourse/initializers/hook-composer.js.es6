import {
  default as computed,
  observes,
  on
} from "ember-addons/ember-computed-decorators";
import { ajax } from "discourse/lib/ajax";
import Composer from "discourse/models/composer";
import {
  decrypt,
  encrypt,
  exportKey,
  generateKey,
  importKey,
  importPublicKey,
  rsaDecrypt
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getPrivateKey,
  getTopicKey,
  getTopicTitle,
  hasTopicKey,
  putTopicKey,
  putTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-composer",
  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    // Decode composer on reply reload. This usually occurs when a post is
    // edited or a draft is loaded.
    const appEvents = container.lookup("app-events:main");
    appEvents.on("composer:reply-reloaded", model => {
      if (!model.get("privateMessage")) {
        return;
      }

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
      getCookedHtml() {
        return hasTopicKey(this.get("topic.id")) ? "" : this._super(...arguments);
      },

      save() {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!this.get("privateMessage")) {
          return _super.call(this, ...arguments);
        }

        const title = this.get("title");
        const reply = this.get("reply");

        if (this.get("topic.topic_key")) {
          putTopicKey(this.get("topic.id"), this.get("topic.topic_key"));
          return getTopicKey(this.get("topic.id"))
            .then(key => {
              const promises = [];

              if (title) {
                promises.push(
                  encrypt(key, title).then(encTitle => {
                    const topicId = this.get("topic.id");

                    this.set("title", I18n.t("encrypt.encrypted_topic_title"));
                    putTopicTitle(topicId, encTitle);

                    ajax("/encrypt/topic", {
                      type: "PUT",
                      data: { topic_id: topicId, title: encTitle }
                    });
                  })
                );
              }

              if (reply) {
                promises.push(
                  encrypt(key, reply).then(encReply =>
                    this.set("reply", encReply)
                  )
                );
              }

              return Ember.RSVP.Promise.all(promises);
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
            putTopicTitle(topicId, encTitle);

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
          isEncryptedDisabled: false,
          isEncrypted: false,
          encryptError: "",
          showEncryptError: false
        });
      },

      @observes("topic")
      topicUpdated() {
        const value = hasTopicKey(this.get("topic.id"));
        this.setProperties({
          isEncryptedDisabled: false,
          isEncrypted: value,
          encryptError: value ? "" : I18n.t("encrypt.cannot_encrypt"),
          showEncryptError: true
        });
      },

      @observes("targetUsernames")
      checkKeys() {
        const usernames = this.get("recipients");
        if (usernames.length === 0) {
          this.setProperties({
            isEncryptedDisabled: false,
            isEncrypted: true,
            encryptError: ""
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
              this.setProperties({
                isEncryptedDisabled: true,
                isEncrypted: false,
                encryptError: I18n.t("encrypt.composer.user_has_no_key", {
                  username
                })
              });
              return;
            }
          }

          // Remember user preferences. If user enters a recipient, unchecks
          // encryption and then adds another recipient, this will not revert
          // his uncheck.
          if (this.get("isEncryptedDisabled")) {
            this.setProperties({
              isEncryptedDisabled: false,
              isEncrypted: true,
              encryptError: ""
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

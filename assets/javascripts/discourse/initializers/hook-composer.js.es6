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

    // Register custom fields to be saved for new post.
    Composer.serializeOnCreate("encryptedTitle", "encryptedTitle");
    Composer.serializeOnCreate("encryptedRaw", "encryptedRaw");
    Composer.serializeOnCreate("encryptedKeys", "encryptedKeys");

    // Encrypt the Composer contents on-the-fly right before it is sent over
    // to the server.
    Composer.reopen({
      getCookedHtml() {
        return hasTopicKey(this.get("topic.id"))
          ? ""
          : this._super(...arguments);
      },

      save() {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!this.privateMessage) {
          return _super.call(this, ...arguments);
        }

        const title = this.title;
        const reply = this.reply;

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
        if (!this.isEncrypted) {
          return _super.call(this, ...arguments);
        }

        // Generating a new topic key.
        const topicKey = generateKey();

        const usernames = this.recipients;
        const encryptedKeys = topicKey.then(key =>
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

        const encryptedTitle = topicKey.then(key => encrypt(key, title));
        const encryptedRaw = topicKey.then(key => encrypt(key, reply));

        // Send user keys, title and reply encryption to the server.
        return Ember.RSVP.Promise.all([
          encryptedTitle,
          encryptedRaw,
          encryptedKeys
        ]).then(([encTitle, encReply, encKeys]) => {
          const userKeys = {};
          for (let i = 0; i < encKeys.length; ++i) {
            userKeys[usernames[i]] = encKeys[i];
          }

          this.setProperties({
            title: I18n.t("encrypt.encrypted_topic_title"),
            raw: I18n.t("encrypt.encrypted_topic_raw"),
            encryptedTitle: encTitle,
            encryptedRaw: encReply,
            encryptedKeys: JSON.stringify(userKeys)
          });

          return _super
            .call(this, ...arguments)
            .finally(() => this.setProperties({ title: title, raw: reply }));
        });
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
        const usernames = this.recipients;
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
          if (this.isEncryptedDisabled) {
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

    // Decode composer on reply reload. This usually occurs when a post is
    // edited or a draft is loaded.
    const appEvents = container.lookup("app-events:main");
    appEvents.on("composer:reply-reloaded", model => {
      const draftKey = model.draftKey;

      let encrypted, decTitle, decReply;
      if (draftKey === Composer.NEW_PRIVATE_MESSAGE_KEY) {
        encrypted = true;
      } else if (draftKey.indexOf("topic_") === 0) {
        const topicId = draftKey.substr("topic_".length);
        encrypted = !!hasTopicKey(topicId);
      }

      if (encrypted) {
        if (model.action === "edit" && model.originalText) {
          const topicId = model.get("topic.id");
          decTitle = getTopicTitle(topicId);
          decReply = getTopicKey(topicId).then(key =>
            decrypt(key, model.reply)
          );
        } else {
          const pk = getPrivateKey();
          decTitle =
            model.title && pk.then(key => rsaDecrypt(key, model.title));
          decReply =
            model.reply && pk.then(key => rsaDecrypt(key, model.reply));
        }
      }

      if (decTitle) {
        decTitle.then(title =>
          model.setProperties({ title, isEncrypted: true })
        );
      }

      if (decReply) {
        decReply.then(reply =>
          model.setProperties({ reply, isEncrypted: true })
        );
      }
    });
  }
};

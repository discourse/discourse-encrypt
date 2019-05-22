import { observes, on } from "ember-addons/ember-computed-decorators";
import { ajax } from "discourse/lib/ajax";
import Composer from "discourse/models/composer";
import {
  decrypt,
  rsaDecrypt
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getPrivateKey,
  getTopicKey,
  getTopicTitle,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-composer",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    // Register custom fields to be saved for new post.
    Composer.serializeOnCreate("is_encrypted", "isEncrypted");

    // Check recipients and show encryption status in composer.
    Composer.reopen({
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
        const targetUsernames = this.get("targetUsernames");
        const usernames = targetUsernames ? targetUsernames.split(",") : [];
        usernames.push(this.get("user.username"));

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

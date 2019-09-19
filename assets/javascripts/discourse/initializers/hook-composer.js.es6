import { ajax } from "discourse/lib/ajax";
import Composer from "discourse/models/composer";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getTopicTitle,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  importKey
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { observes, on } from "ember-addons/ember-computed-decorators";

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
      updateEncryptProperties() {
        const encryptedTopic = this.topic && this.topic.encrypted_title;
        const canEncryptTopic = this.topic && hasTopicKey(this.topic.id);
        this.setProperties({
          /** @var Whether the current message is going to be encrypted. */
          isEncrypted: encryptedTopic && canEncryptTopic,
          /** @var Disable encrypt indicator to enforce encrypted message, if
                   message is encrypted, or enforce decrypted message if one
                   of the recipients does not have encryption enabled. */
          disableEncryptIndicator: encryptedTopic,
          /** @var Current encryption error. */
          encryptError: "",
          /** @var Immediately show encryption error if it is fatal. */
          showEncryptError: false
        });
      },

      @on("init")
      initEncrypt() {
        this.updateEncryptProperties();
      },

      @observes("creatingPrivateMessage", "topic")
      updateComposerEncrypt() {
        this.updateEncryptProperties();
      },

      @observes("targetUsernames")
      checkKeys() {
        if (!this.targetUsernames) {
          this.setProperties({
            isEncrypted: true,
            disableEncryptIndicator: false,
            encryptError: ""
          });
          return;
        }

        const usernames = this.targetUsernames.split(",");
        usernames.push(this.user.username);

        ajax("/encrypt/user", {
          type: "GET",
          data: { usernames }
        }).then(userKeys => {
          for (let i = 0; i < usernames.length; ++i) {
            const username = usernames[i];
            if (!userKeys[username]) {
              this.setProperties({
                isEncrypted: false,
                disableEncryptIndicator: true,
                encryptError: I18n.t("encrypt.composer.user_has_no_key", {
                  username
                }),
                showEncryptError: this.showEncryptError || this.isEncrypted
              });
              return;
            }
          }

          this.setProperties({
            disableEncryptIndicator: false,
            encryptError: ""
          });
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
          decReply = getTopicKey(topicId)
            .then(key => decrypt(key, model.reply))
            .then(decrypted => decrypted.raw);
        } else {
          const pos = model.reply ? model.reply.indexOf("\n") : -1;
          if (pos !== -1) {
            const topicKey = model.reply.substr(0, pos);
            model.reply = model.reply.substr(pos + 1);

            const decKey = getIdentity().then(identity =>
              importKey(topicKey, identity.encryptPrivate)
            );

            decTitle = model.title
              ? decKey.then(key => decrypt(key, model.title))
              : "";

            decReply = model.reply
              ? decKey
                  .then(key => decrypt(key, model.reply))
                  .then(decrypted => decrypted.raw)
              : "";
          }
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

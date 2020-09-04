import I18n from "I18n";
import { observes, on } from "discourse-common/utils/decorators";
import { ajax } from "discourse/lib/ajax";
import Composer from "discourse/models/composer";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getTopicTitle,
  hasTopicKey,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";

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
        const newIsEncryped =
          (encryptedTopic && canEncryptTopic) ||
          (this.overwriteDefault
            ? this.isEncrypted
            : this.isNew && this.creatingPrivateMessage);

        this.setProperties({
          /** @var Whether the current message is going to be encrypted. */
          isEncrypted: newIsEncryped,
          /** @var Disable encrypt indicator to enforce encrypted message, if
                   message is encrypted, or enforce decrypted message if one
                   of the recipients does not have encryption enabled. */
          disableEncryptIndicator: encryptedTopic,
          /** @var Current encryption error. */
          encryptError: "",
          /** @var Immediately show encryption error if it is fatal. */
          showEncryptError: false,
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

      @observes("targetRecipients")
      checkKeys() {
        if (!this.targetRecipients) {
          this.setProperties({
            isEncrypted: true,
            disableEncryptIndicator: false,
            encryptError: "",
          });
          return;
        }

        const usernames = this.targetRecipients.split(",");
        usernames.push(this.user.username);

        const groupNames = new Set(this.site.groups.map((g) => g.name));
        if (usernames.some((username) => groupNames.has(username))) {
          this.setProperties({
            isEncrypted: false,
            disableEncryptIndicator: true,
            encryptError: I18n.t("encrypt.composer.group_not_allowed"),
            showEncryptError: this.showEncryptError || this.isEncrypted,
          });
          return;
        }

        ajax("/encrypt/user", {
          type: "GET",
          data: { usernames },
        }).then((userKeys) => {
          for (let i = 0; i < usernames.length; ++i) {
            const username = usernames[i];
            if (!userKeys[username]) {
              this.setProperties({
                isEncrypted: false,
                overwriteDefault: true,
                disableEncryptIndicator: true,
                encryptError: I18n.t("encrypt.composer.user_has_no_key", {
                  username,
                }),
                showEncryptError: this.showEncryptError || this.isEncrypted,
              });
              return;
            }
          }

          this.setProperties({
            disableEncryptIndicator: false,
            encryptError: "",
          });
        });
      },
    });

    // Decode composer on reply reload. This usually occurs when a post is
    // edited or a draft is loaded.
    const appEvents = container.lookup("service:app-events");
    appEvents.on("composer:reply-reloaded", this, this.composerReplyReloaded);
  },

  composerReplyReloaded(model) {
    if (!model.privateMessage) {
      return;
    }

    let decTitle, decReply;

    if (model.action === "edit" && model.originalText) {
      const topicId = model.get("topic.id");
      if (!hasTopicKey(topicId)) {
        return;
      }

      decTitle = getTopicTitle(topicId);
      decReply = getTopicKey(topicId)
        .then((key) => decrypt(key, model.reply))
        .then((decrypted) => decrypted.raw);
    } else {
      const pos = model.reply ? model.reply.indexOf("\n") : -1;
      if (pos === -1) {
        return;
      }

      const topicKey = model.reply.substr(0, pos).trim();
      const reply = model.reply.substr(pos + 1).trim();

      const decKey = getIdentity().then((identity) =>
        importKey(topicKey, identity.encryptPrivate)
      );

      if (model.title) {
        decTitle = decKey.then((key) => decrypt(key, model.title));
      }

      if (reply) {
        decReply = decKey
          .then((key) => decrypt(key, reply))
          .then((decrypted) => decrypted.raw);
      }
    }

    if (decTitle) {
      decTitle.then((title) =>
        model.setProperties({ title, isEncrypted: true })
      );
    }

    if (decReply) {
      decReply.then((reply) =>
        model.setProperties({ reply, isEncrypted: true })
      );
    }
  },
};

import discourseComputed, {
  observes,
  on,
} from "discourse-common/utils/decorators";
import { withPluginApi } from "discourse/lib/plugin-api";
import Composer from "discourse/models/composer";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getTopicTitle,
  getUserIdentities,
  hasTopicKey,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import I18n from "I18n";
import { Promise } from "rsvp";
import { getOwner } from "@ember/application";

export default {
  name: "encrypt-composer",

  initialize(container) {
    const user = container.lookup("service:current-user");

    if (getEncryptionStatus(user) !== ENCRYPT_ACTIVE) {
      return;
    }

    // Register custom fields to be saved for new post.
    Composer.serializeOnCreate("is_encrypted", "isEncrypted");
    Composer.serializeOnCreate("delete_after_minutes", "deleteAfterMinutes");

    withPluginApi("0.11.3", (api) => {
      // Check recipients and show encryption status in composer.
      api.modifyClass("model:composer", {
        pluginId: "encrypt-composer",

        @on("init")
        @observes("creatingPrivateMessage", "topic")
        updateEncryptProperties() {
          let isEncrypted = this.isEncrypted;

          if (
            this.topic &&
            this.topic.encrypted_title &&
            hasTopicKey(this.topic.id)
          ) {
            // Force encryption for existing encrypted topics.
            isEncrypted = true;
          } else if (this.isNew && this.creatingPrivateMessage) {
            // `isEncryptedChanged` is set true only when the value of
            // `isEncrypted` is changed. This is needed because during save
            // (serialization), this method is called and `isEncrypted` is
            // reset.
            if (!this.isEncryptedChanged) {
              const currentUser = getOwner(this).lookup("service:current-user");
              isEncrypted = currentUser.encrypt_pms_default;
            }
          }

          this.setProperties({
            /** @var Whether the current message is going to be encrypted. */
            isEncrypted,

            /** @var Whether current error is shown or not. In most cases, it
             *       is equal to `isEncrypted` except when `isEncrypted` is
             *       forcibly set to false (i.e. when an error occurs).
             */
            showEncryptError: isEncrypted,
          });
        },

        @observes("targetRecipients")
        checkEncryptRecipients() {
          if (!this.targetRecipients || this.targetRecipients.length === 0) {
            const currentUser = getOwner(this).lookup("service:current-user");
            this.setProperties({
              isEncrypted: currentUser.encrypt_pms_default,
              isEncryptedChanged: true,
              showEncryptError: true,
              encryptErrorUser: false,
              encryptErrorGroup: false,
            });
            return;
          }

          const recipients = this.targetRecipients.split(",");
          recipients.push(this.user.username);

          const allGroupNames = new Set(
            this.site.groups.map((g) => g.name.toLowerCase())
          );

          const groups = recipients.filter((r) =>
            allGroupNames.has(r.toLowerCase())
          );

          if (groups.length > 0) {
            this.setProperties({
              isEncrypted: false,
              isEncryptedChanged: true,
              showEncryptError: this.showEncryptError || this.isEncrypted,
              encryptErrorGroup: true,
            });
          } else {
            this.setProperties({ encryptErrorGroup: false });
          }

          const usernames = recipients.filter(
            (r) => !allGroupNames.has(r.toLowerCase())
          );

          getUserIdentities(usernames)
            .then(() => {
              this.setProperties({ encryptErrorUser: false });
            })
            .catch((username) => {
              this.setProperties({
                isEncrypted: false,
                isEncryptedChanged: true,
                showEncryptError: this.showEncryptError || this.isEncrypted,
                encryptErrorUser: username,
              });
            });
        },

        @discourseComputed("topic.encrypted_title", "topic.id")
        encryptErrorMissingKey(encryptedTitle, topicId) {
          return encryptedTitle && !hasTopicKey(topicId);
        },

        @discourseComputed(
          "encryptErrorMissingKey",
          "encryptErrorUser",
          "encryptErrorGroup"
        )
        encryptError(missingKey, username, group) {
          if (missingKey) {
            return I18n.t("encrypt.composer.no_topic_key");
          } else if (username) {
            return I18n.t("encrypt.composer.user_has_no_key", { username });
          } else if (group) {
            return I18n.t("encrypt.composer.group_not_allowed");
          }
        },

        beforeSave() {
          if (!this.showEncryptError || !this.encryptError) {
            return Promise.resolve();
          }

          return new Promise((resolve, reject) => {
            getOwner(this)
              .lookup("service:dialog")
              .yesNoConfirm({
                message: I18n.t("encrypt.composer.confirm.message", {
                  error: this.encryptError,
                }),
                didConfirm: () => resolve(),
                didCancel: () => reject(),
              });
          });
        },
      });
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
        model.setProperties({
          title,
          isEncrypted: true,
          isEncryptedChanged: true,
        })
      );
    }

    if (decReply) {
      decReply.then((reply) =>
        model.setProperties({
          reply,
          isEncrypted: true,
          isEncryptedChanged: true,
        })
      );
    }
  },
};

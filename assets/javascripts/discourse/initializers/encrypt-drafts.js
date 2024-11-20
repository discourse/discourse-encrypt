import { Promise } from "rsvp";
import { withPluginApi } from "discourse/lib/plugin-api";
import { emojiUnescape } from "discourse/lib/text";
import { escapeExpression } from "discourse/lib/utilities";
import { getOwnerWithFallback } from "discourse-common/lib/get-owner";
import I18n from "I18n";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  hasTopicKey,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  exportKey,
  generateKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { filterObjectKeys } from "discourse/plugins/discourse-encrypt/lib/utils";

const ALLOWED_DRAFT_FIELDS = [
  "action",
  "archetypeId",
  "categoryId",
  "composerTime",
  "noBump",
  "postId",
  "reply", // will be encrypted
  "tags",
  "title", // will be encrypted
  "recipients",
  "whisper",
];

export default {
  name: "encrypt-drafts",

  initialize(container) {
    const currentUser = container.lookup("service:current-user");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.11.3", (api) => {
      api.modifyClassStatic("model:draft", {
        pluginId: "encrypt-drafts",

        save(draftKey, sequence, data, clientId) {
          // TODO: https://github.com/emberjs/ember.js/issues/15291
          let { _super } = this;

          const controller =
            getOwnerWithFallback(this).lookup("service:composer");
          let encrypted = !!controller.get("model.isEncrypted");
          if (draftKey.indexOf("topic_") === 0) {
            const topicId = draftKey.substr("topic_".length);
            encrypted = !!hasTopicKey(topicId);
          }

          if (encrypted) {
            data = filterObjectKeys(data, ALLOWED_DRAFT_FIELDS);
            if (!data.title && !data.reply) {
              return _super.call(this, ...arguments);
            }

            const topicKey = generateKey();

            const encKey = Promise.all([topicKey, getIdentity()]).then(
              ([key, identity]) => exportKey(key, identity.encryptPublic)
            );

            const encTitle = data.title
              ? topicKey.then((key) => encrypt(key, data.title))
              : "";

            const encReply = data.reply
              ? topicKey.then((key) =>
                  encrypt(key, { raw: data.reply }, { includeUploads: true })
                )
              : "";

            return Promise.all([encTitle, encReply, encKey]).then(
              ([title, reply, key]) => {
                data.title = title;
                data.reply = key + "\n" + reply;
                data.encrypted = true;
                return _super.call(this, draftKey, sequence, data, clientId);
              }
            );
          }

          return _super.call(this, ...arguments);
        },
      });

      api.modifyClass("model:user-drafts-stream", {
        pluginId: "encrypt-drafts",

        findItems(site) {
          return this._super(site).then(() => {
            this.content.forEach((draft) => {
              if (draft.data.encrypted) {
                draft.setProperties({
                  title: emojiUnescape(
                    escapeExpression(
                      ":lock: " + I18n.t("encrypt.encrypted_title")
                    )
                  ),
                  excerpt: I18n.t("encrypt.encrypted_post"),
                });
              }
            });
          });
        },
      });
    });
  },
};

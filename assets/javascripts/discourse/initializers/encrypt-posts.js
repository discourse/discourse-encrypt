import { getOwner } from "@ember/application";
import { Promise } from "rsvp";
import { ajax } from "discourse/lib/ajax";
import { withPluginApi } from "discourse/lib/plugin-api";
import { escapeExpression } from "discourse/lib/utilities";
import { observes } from "discourse-common/utils/decorators";
import I18n from "I18n";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getTopicTitle,
  getUserIdentities,
  hasTopicKey,
  putTopicKey,
  putTopicTitle,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  exportKey,
  generateKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";

/**
 * Adds metadata extracted from the composer.
 *
 * @param {Object} metadata
 *
 * @return {Object}
 */
function addMetadata(composer, metadata) {
  const model = composer.model;

  const currentUser = composer.currentUser;
  const now = new Date().toISOString();

  metadata.signed_by_id = currentUser.id;
  metadata.signed_by_name = currentUser.username;
  metadata.user_id = model.post ? model.post.user_id : model.user.id;
  metadata.user_name = model.post ? model.post.username : model.user.username;
  metadata.created_at = model.post ? model.post.created_at : now;
  metadata.updated_at = now;

  if (model.topic) {
    metadata.topic_id = model.topic.id;
  }

  if (model.post) {
    metadata.post_id = model.post.id;
    metadata.post_number = model.post.post_number;
  }

  return metadata;
}

export default {
  name: "encrypt-posts",

  initialize(container) {
    const user = container.lookup("service:current-user");
    if (getEncryptionStatus(user) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.11.3", (api) => {
      api.modifyClassStatic("model:topic", {
        pluginId: "encrypt-posts",

        update(topic, props) {
          // TODO: https://github.com/emberjs/ember.js/issues/15291
          const { _super } = this;
          if (!hasTopicKey(topic.id)) {
            return _super.call(this, ...arguments);
          }

          const unencryptedTitle = props.title;

          return getTopicKey(topic.id)
            .then((key) => encrypt(key, { raw: props.title }))
            .then((encryptedTitle) => {
              props.title = I18n.t("encrypt.encrypted_title");
              props.encrypted_title = encryptedTitle;
            })
            .then(() => _super.call(this, ...arguments))
            .then(() => {
              topic.set("fancy_title", escapeExpression(unencryptedTitle));
              topic.set("unicode_title", unencryptedTitle);
            });
        },
      });

      api.modifyClass("adapter:post", {
        pluginId: "encrypt-posts",

        createRecord(store, type, args) {
          // TODO: https://github.com/emberjs/ember.js/issues/15291
          const { _super } = this;
          if (!args.is_encrypted) {
            return _super.call(this, ...arguments);
          }

          const identityPromise = getIdentity();
          const topicKeyPromise = args.topic_id
            ? getTopicKey(args.topic_id)
            : generateKey();

          const { title, raw } = args;
          const titlePromise = title
            ? topicKeyPromise
                .then((key) => encrypt(key, { raw: title }))
                .then(
                  (encryptedTitle) => (args.encrypted_title = encryptedTitle)
                )
                .finally(() => (args.title = I18n.t("encrypt.encrypted_title")))
            : Promise.resolve();
          const replyPromise = raw
            ? topicKeyPromise
                .then((key) => encrypt(key, { raw }, { includeUploads: true }))
                .then((encryptedRaw) => (args.encrypted_raw = encryptedRaw))
                .finally(() => (args.raw = I18n.t("encrypt.encrypted_post")))
            : Promise.resolve();

          let encryptedKeysPromise = Promise.resolve();
          let usernames = [];
          if (args.target_recipients) {
            usernames = args.target_recipients.split(",");
          }

          const currentUser = getOwner(this).lookup("service:current-user");

          if (usernames.length > 0) {
            usernames.push(currentUser.username);
            encryptedKeysPromise = Promise.all([
              topicKeyPromise,
              getUserIdentities(usernames),
            ])
              .then(([key, identities]) => {
                const promises = [];
                for (let i = 0; i < usernames.length; ++i) {
                  promises.push(
                    exportKey(key, identities[usernames[i]].encryptPublic)
                  );
                }
                return Promise.all(promises);
              })
              .then((userKeys) => {
                args.encrypted_keys = {};
                for (let i = 0; i < userKeys.length; ++i) {
                  args.encrypted_keys[usernames[i]] = userKeys[i];
                }
                args.encrypted_keys = JSON.stringify(args.encrypted_keys);
              })
              .catch((username) => {
                const dialog = getOwner(this).lookup("service:dialog");
                dialog.alert(
                  I18n.t("encrypt.composer.user_has_no_key", { username })
                );
                return Promise.reject(username);
              });
          }

          // Hide any information that might give a hint of what this message
          // may contain.
          args.composer_open_duration_msecs = 10000;
          args.typing_duration_msecs = 10000;

          return Promise.all([titlePromise, replyPromise, encryptedKeysPromise])
            .then(() => _super.call(this, ...arguments))
            .then((result) =>
              Promise.all([topicKeyPromise, titlePromise, identityPromise])
                .then(([key, encTitle, identity]) => {
                  putTopicKey(result.payload.topic_id, key);
                  putTopicTitle(result.payload.topic_id, encTitle);

                  return encrypt(
                    key,
                    {
                      raw,
                      signed_by_id: currentUser.id,
                      signed_by_name: currentUser.username,
                      user_id: result.payload.user_id,
                      user_name: result.payload.username,
                      topic_id: result.payload.topic_id,
                      post_id: result.payload.id,
                      post_number: result.payload.post_number,
                      created_at: result.payload.created_at,
                      updated_at: result.payload.updated_at,
                    },
                    {
                      signKey: identity.signPrivate,
                      includeUploads: true,
                    }
                  ).then((encryptedRaw) => {
                    result.payload.encrypted_raw = encryptedRaw;
                    return ajax("/encrypt/post", {
                      type: "PUT",
                      data: {
                        post_id: result.payload.id,
                        encrypted_raw: encryptedRaw,
                      },
                    });
                  });
                })
                .then(() => result)
            );
        },

        update(store, type, id, attrs) {
          // TODO: https://github.com/emberjs/ember.js/issues/15291
          const { _super } = this;
          if (!hasTopicKey(attrs.topic_id)) {
            return _super.call(this, ...arguments);
          }

          return Promise.all([getTopicKey(attrs.topic_id), getIdentity()])
            .then(([key, identity]) => {
              const metadata = addMetadata(
                getOwner(this).lookup("controller:composer"),
                {
                  raw: attrs.raw,
                }
              );

              return encrypt(key, metadata, {
                signKey: identity.signPrivate,
                includeUploads: true,
              });
            })
            .then((encryptedRaw) => {
              delete attrs.cooked;
              delete attrs.raw_old;
              attrs.raw = encryptedRaw;
            })
            .then(() => _super.call(this, ...arguments));
        },
      });

      api.modifyClass("controller:topic", {
        pluginId: "encrypt",

        @observes("editingTopic")
        _editingTopicChanged() {
          if (this.get("editingTopic")) {
            const topicId = this.get("model.id");

            getTopicTitle(topicId).then((topicTitle) => {
              // Update the title stored in buffered state
              this.buffered.set("title", topicTitle);
            });
          }
        },
      });
    });
  },
};

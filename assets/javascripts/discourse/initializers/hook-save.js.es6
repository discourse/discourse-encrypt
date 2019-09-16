import PostAdapter from "discourse/adapters/post";
import { ajax } from "discourse/lib/ajax";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  getTopicKey,
  getUserIdentities,
  hasTopicKey,
  putTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  exportKey,
  generateKey
} from "discourse/plugins/discourse-encrypt/lib/protocol";

/**
 * Adds metadata extracter from the composer.
 *
 * @param {Object} metadata
 *
 * @return {Object}
 */
function addMetadata(metadata) {
  const controller = Discourse.__container__.lookup("controller:composer");
  const model = controller.model;

  const currentUser = controller.currentUser;
  const user = model.user;
  const topic = model.topic;
  const post = model.post;

  const now = new Date().toISOString();

  metadata.signed_by_id = currentUser.id;
  metadata.signed_by_name = currentUser.username;
  metadata.user_id = user.id;
  metadata.user_name = user.username;
  metadata.created_at = post ? post.created_at : now;
  metadata.updated_at = now;

  if (topic) {
    metadata.topic_id = topic.id;
  }

  if (post) {
    metadata.post_id = post.id;
  }

  if (post) {
    metadata.post_number = post.post_number;
  } else if (topic) {
    metadata.post_number = topic.highest_post_number;
  } else {
    metadata.post_number = 1;
  }

  return metadata;
}

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
          .then(key => encrypt(key, { raw: props.title }))
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

        const { title, raw } = args;

        let identityPromise = getIdentity();

        let topicKey = args.topic_id
          ? getTopicKey(args.topic_id)
          : generateKey();

        let titlePromise = title
          ? topicKey
              .then(key => encrypt(key, { raw: title }))
              .then(encryptedTitle => {
                args.encrypted_title = encryptedTitle;
                args.title = I18n.t("encrypt.encrypted_topic_title");
              })
          : Ember.RSVP.Promise.resolve();

        let replyPromise = raw
          ? Ember.RSVP.Promise.all([topicKey, identityPromise])
              .then(([key, identity]) =>
                encrypt(key, addMetadata({ raw }), {
                  signKey: identity.signPrivate,
                  includeUploads: true
                })
              )
              .then(encryptedRaw => {
                args.encrypted_raw = encryptedRaw;
                args.raw = I18n.t("encrypt.encrypted_post");
              })
          : Ember.RSVP.Promise.resolve();

        let encryptedKeysPromise = Ember.RSVP.Promise.resolve();
        if (args.target_usernames) {
          const usernames = args.target_usernames.split(",");
          usernames.push(Discourse.User.current().username);
          const identitiesPromise = getUserIdentities(usernames);

          encryptedKeysPromise = Ember.RSVP.Promise.all([
            topicKey,
            identitiesPromise
          ])
            .then(([key, identities]) => {
              const promises = [];
              for (let i = 0; i < usernames.length; ++i) {
                const username = usernames[i];
                promises.push(
                  exportKey(key, identities[username].encryptPublic)
                );
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

        return Ember.RSVP.Promise.all([
          titlePromise,
          replyPromise,
          encryptedKeysPromise
        ])
          .then(() => _super.call(this, ...arguments))
          .then(result =>
            Ember.RSVP.Promise.all([topicKey, identityPromise])
              .then(([key, identity]) => {
                putTopicKey(result.payload.topic_id, key);
                if (!identity.signPrivate) {
                  return;
                }

                return encrypt(
                  key,
                  addMetadata({
                    raw,
                    topic_id: result.payload.topic_id,
                    post_id: result.payload.id
                  }),
                  {
                    signKey: identity.signPrivate,
                    includeUploads: true
                  }
                ).then(encryptedRaw =>
                  ajax(
                    this.pathFor(store, type, result.payload.id),
                    this.getPayload("PUT", {
                      post: {
                        topic_id: result.payload.topic_id,
                        raw: encryptedRaw,
                        edit_reason: I18n.t("encrypt.integrity_updated")
                      }
                    })
                  )
                );
              })
              .then(() => result)
          );
      },

      update(store, type, id, attrs) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        if (!hasTopicKey(attrs.topic_id)) {
          return _super.call(this, ...arguments);
        }

        return Ember.RSVP.Promise.all([
          getTopicKey(attrs.topic_id),
          getIdentity()
        ])
          .then(([key, identity]) =>
            encrypt(key, addMetadata({ raw: attrs.raw }), {
              signKey: identity.signPrivate,
              includeUploads: true
            })
          )
          .then(encryptedRaw => {
            delete attrs.cooked;
            delete attrs.raw_old;
            attrs.raw = encryptedRaw;
          })
          .then(() => _super.call(this, ...arguments));
      }
    });
  }
};

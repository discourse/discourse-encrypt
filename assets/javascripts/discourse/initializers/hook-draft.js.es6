import Draft from "discourse/models/draft";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  exportKey,
  generateKey
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
  "usernames",
  "whisper"
];

export default {
  name: "hook-draft",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    Draft.reopenClass({
      save(draftKey, sequence, data, clientId) {
        if (!container || container.isDestroyed || container.isDestroying) {
          // Since at this point we cannot be sure if it is an encrypted
          // topic or not, the draft is simply discarded.
          return Ember.RSVP.Promise.reject();
        }

        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        const controller = container.lookup("controller:composer");
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

          const encKey = Ember.RSVP.Promise.all([
            topicKey,
            getIdentity()
          ]).then(([key, identity]) => exportKey(key, identity.encryptPublic));

          const encTitle = data.title
            ? topicKey.then(key => encrypt(key, data.title))
            : "";

          const encReply = data.reply
            ? topicKey.then(key =>
                encrypt(key, { raw: data.reply }, { includeUploads: true })
              )
            : "";

          return Ember.RSVP.Promise.all([encTitle, encReply, encKey]).then(
            ([title, reply, key]) => {
              data.title = title;
              data.reply = key + "\n" + reply;
              return _super.call(this, draftKey, sequence, data, clientId);
            }
          );
        }

        return _super.call(this, ...arguments);
      }
    });
  }
};

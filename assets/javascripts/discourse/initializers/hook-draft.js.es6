import Composer from "discourse/models/composer";
import Draft from "discourse/models/draft";
import {
  encrypt,
  exportKey,
  generateKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  hasTopicKey,
  getRsaKey,
  getEncryptionStatus,
  ENCRYPT_ACTIVE
} from "discourse/plugins/discourse-encrypt/lib/discourse";
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
      save(draftKey, sequence, data) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        let encrypted;

        if (draftKey === Composer.NEW_PRIVATE_MESSAGE_KEY) {
          const controller = container.lookup("controller:composer");
          encrypted = !!controller.get("model.isEncrypted");
        } else if (draftKey.indexOf("topic_") === 0) {
          const topicId = draftKey.substr("topic_".length);
          encrypted = !!hasTopicKey(topicId);
        }

        if (encrypted) {
          data = filterObjectKeys(data, ALLOWED_DRAFT_FIELDS);
          if (!data.title && !data.reply) {
            return _super.call(this, draftKey, sequence, data);
          }

          const topicKey = generateKey();

          const encKey = Ember.RSVP.Promise.all([topicKey, getRsaKey()]).then(
            ([key, keyPair]) => exportKey(key, keyPair[0])
          );

          const encTitle = data.title
            ? topicKey.then(key => encrypt(key, data.title))
            : "";

          const encReply = data.reply
            ? topicKey.then(key => encrypt(key, data.reply))
            : "";

          return Ember.RSVP.Promise.all([encTitle, encReply, encKey]).then(
            ([title, reply, key]) => {
              data.title = title;
              data.reply = key + "\n" + reply;
              return _super.call(this, draftKey, sequence, data);
            }
          );
        }

        return _super.call(this, ...arguments);
      }
    });
  }
};

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
import { Promise } from "rsvp";

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

let globalContainer;

export default {
  name: "hook-draft",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    // In testing environment, the initializer will be called on every `visit`
    // call. As a result, `Draft` class will be patched multiple times. The
    // following lines ensure that the patch is applied only once (the first
    // time, when there is no old "container"). However, the reference to
    // `container` must be updated every time the initializer is called
    // because it is used inside the patched method.
    let initializedBefore = !!globalContainer;
    globalContainer = container;
    if (initializedBefore) {
      return;
    }

    Draft.reopenClass({
      save(draftKey, sequence, data, clientId) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (
          !globalContainer ||
          globalContainer.isDestroyed ||
          globalContainer.isDestroying
        ) {
          // Since at this point we cannot be sure if it is an encrypted
          // topic or not, the draft is simply discarded.
          return Promise.reject();
        }

        const controller = globalContainer.lookup("controller:composer");
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

          const encKey = Promise.all([
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

          return Promise.all([encTitle, encReply, encKey]).then(
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

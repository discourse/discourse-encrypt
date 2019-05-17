import Composer from "discourse/models/composer";
import Draft from "discourse/models/draft";
import {
  hasTopicKey,
  getPublicKey,
  getEncryptionStatus,
  ENCRYPT_ACTIVE
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { rsaEncrypt } from "discourse/plugins/discourse-encrypt/lib/keys";

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
        let encrypted, encTitle, encReply;

        if (draftKey === Composer.NEW_PRIVATE_MESSAGE_KEY) {
          const controller = container.lookup("controller:composer");
          encrypted = !!controller.get("model.isEncrypted");
        } else if (draftKey.indexOf("topic_") === 0) {
          const topicId = draftKey.substr("topic_".length);
          encrypted = !!hasTopicKey(topicId);
        }

        if (encrypted) {
          const pk = getPublicKey();
          encTitle = data.title && pk.then(key => rsaEncrypt(key, data.title));
          encReply = data.reply && pk.then(key => rsaEncrypt(key, data.reply));

          return Ember.RSVP.Promise.all([encTitle, encReply]).then(
            ([title, reply]) => {
              data.title = title;
              data.reply = reply;
              return _super.call(this, ...arguments);
            }
          );
        }

        return _super.call(this, ...arguments);
      }
    });
  }
};

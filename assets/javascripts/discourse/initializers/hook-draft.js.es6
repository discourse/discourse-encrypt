import {
  hasTopicKey,
  getTopicKey,
  getPublicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  rsaEncrypt
} from "discourse/plugins/discourse-encrypt/lib/keys";
import Composer from "discourse/models/composer";
import Draft from "discourse/models/draft";

export default {
  name: "hook-draft",

  initialize() {
    Draft.reopenClass({
      save(key, sequence, data) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;
        let encTitle, encReply;

        if (key === Composer.NEW_PRIVATE_MESSAGE_KEY) {
          /*
           * Encrypt private message drafts.
           */
          // TODO: Avoid using the container.
          const container = Discourse.__container__;
          const controller = container.lookup("controller:composer");
          if (controller.get("model.isEncrypted")) {
            const p = getPublicKey();
            encTitle = p.then(publicKey => rsaEncrypt(publicKey, data.title));
            encReply = p.then(publicKey => rsaEncrypt(publicKey, data.reply));
          }
        } else if (key.indexOf("topic_") === 0) {
          /*
           * Encrypt replies.
           */
          const topicId = key.substr("topic_".length);
          if (hasTopicKey(topicId)) {
            const p = getTopicKey(topicId);
            encTitle = p.then(topicKey => encrypt(topicKey, data.title));
            encReply = p.then(topicKey => encrypt(topicKey, data.reply));
          }
        }

        if (encTitle && encReply) {
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

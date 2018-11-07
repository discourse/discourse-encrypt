import {
  hasTopicKey,
  getTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { encrypt } from "discourse/plugins/discourse-encrypt/lib/keys";
import Draft from "discourse/models/draft";

export default {
  name: "hook-draft",

  initialize() {
    Draft.reopenClass({
      save(key, sequence, data) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (key.indexOf("topic_") === 0) {
          const topicId = key.substr("topic_".length);

          if (hasTopicKey(topicId)) {
            return getTopicKey(topicId)
              .then(topicKey => encrypt(topicKey, data.reply))
              .then(reply => {
                data.reply = reply;
                return _super.call(this, ...arguments);
              });
          }
        }

        return _super.call(...arguments);
      }
    });
  }
};

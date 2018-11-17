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
            const p0 = getTopicKey(topicId);
            const p1 = p0.then(topicKey => encrypt(topicKey, data.title));
            const p2 = p0.then(topicKey => encrypt(topicKey, data.reply));
            Promise.all([p1, p2]).then(([title, reply]) => {
              data.title = title;
              data.reply = reply;
              return _super.call(this, ...arguments);
            });
          }
        }

        return _super.call(this, ...arguments);
      }
    });
  }
};

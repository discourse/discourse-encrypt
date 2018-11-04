import PreloadStore from "preload-store";
import Topic from "discourse/models/topic";
import { putTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-gather-keys",

  initialize() {
    // Go through the `PreloadStore` and look for any preloaded topic keys.
    for (var storeKey in PreloadStore.data) {
      if (storeKey.includes("topic_")) {
        const topic = PreloadStore.data[storeKey];
        putTopicKey(topic.id, topic.topic_key);
      }
    }

    // Hook `Topic` model to gather encrypted topic keys.
    Topic.reopenClass({
      create(args) {
        putTopicKey(args.id, args.topic_key);
        return this._super(...arguments);
      }
    });
  }
};

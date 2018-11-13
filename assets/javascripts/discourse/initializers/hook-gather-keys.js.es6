import PreloadStore from "preload-store";
import Topic from "discourse/models/topic";
import {
  putTopicKey,
  putTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-gather-keys",

  initialize() {
    // Go through the `PreloadStore` and look for any preloaded topic keys.
    for (var storeKey in PreloadStore.data) {
      if (storeKey.includes("topic_")) {
        const topic = PreloadStore.data[storeKey];

        if (topic.topic_key) {
          putTopicKey(topic.id, topic.topic_key);
          putTopicTitle(topic.id, topic.encrypted_title);
        }

        if (topic.related_messages) {
          for (let i = 0; i < topic.related_messages.length; ++i) {
            const relatedTopic = topic.related_messages[i];
            putTopicKey(relatedTopic.id, relatedTopic.topic_key);
            putTopicTitle(relatedTopic.id, relatedTopic.encrypted_title);
          }
        }
      }
    }

    // Hook `Topic` model to gather encrypted topic keys.
    Topic.reopenClass({
      create(args) {
        if (args.topic_key) {
          putTopicKey(args.id, args.topic_key);
          putTopicTitle(args.id, args.encrypted_title);
        }

        return this._super(...arguments);
      }
    });
  }
};

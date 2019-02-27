import PreloadStore from "preload-store";
import Topic from "discourse/models/topic";
import {
  putTopicKey,
  putTopicTitle,
  getEncryptionStatus,
  ENCRYPT_DISABLED
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-gather-keys",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) === ENCRYPT_DISABLED) {
      return;
    }

    // Go through the `PreloadStore` and look for any preloaded topic keys.
    for (var storeKey in PreloadStore.data) {
      if (storeKey.includes("topic_")) {
        const topic = PreloadStore.data[storeKey];

        putTopicKey(topic.id, topic.topic_key);
        putTopicTitle(topic.id, topic.encrypted_title);

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

    Topic.reopen({
      updateFromJson(json) {
        if (json.topic_key) {
          putTopicKey(json.id, json.topic_key);
          putTopicTitle(json.id, json.encrypted_title);
        }
        return this._super(...arguments);
      }
    });
  }
};

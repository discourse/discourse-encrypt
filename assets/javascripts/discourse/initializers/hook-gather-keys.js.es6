import NotificationAdapter from "discourse/adapters/notification";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  putTopicKey,
  putTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import PreloadStore from "preload-store";

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

    // Hook `Notification` adapter to gather encrypted topic keys.
    NotificationAdapter.reopen({
      find() {
        return this._super(...arguments).then(result => {
          result.notifications.forEach(notification => {
            if (notification.topic_key) {
              putTopicKey(notification.topic_id, notification.topic_key);
              putTopicTitle(
                notification.topic_id,
                notification.encrypted_title
              );
            }
          });
          return result;
        });
      }
    });

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

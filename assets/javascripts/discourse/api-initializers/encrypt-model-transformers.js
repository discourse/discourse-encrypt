import { apiInitializer } from "discourse/lib/api";
import { escapeExpression } from "discourse/lib/utilities";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicTitle,
  putTopicKey,
  putTopicTitle,
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default apiInitializer("0.8", (api) => {
  const currentUser = api.getCurrentUser();
  if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
    // No point adding these transforms if we can't actually decrypt
    return;
  }

  api.registerModelTransformer("topic", async (topics) => {
    for (const topic of topics) {
      if (topic.topic_key && topic.encrypted_title) {
        putTopicKey(topic.id, topic.topic_key);
        putTopicTitle(topic.id, topic.encrypted_title);
        try {
          const decryptedTitle = await getTopicTitle(topic.id);
          if (decryptedTitle) {
            topic.set("fancy_title", escapeExpression(decryptedTitle));
            topic.set("unicode_title", decryptedTitle);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `Decrypting the title of encrypted message (topicId: ${topic.id}) failed with the following error:`,
            err,
            err?.stack
          );
        }
      }
    }
  });

  api.registerModelTransformer("bookmark", async (bookmarks) => {
    for (const bookmark of bookmarks) {
      if (bookmark.topic_id && bookmark.topic_key && bookmark.encrypted_title) {
        putTopicKey(bookmark.topic_id, bookmark.topic_key);
        putTopicTitle(bookmark.topic_id, bookmark.encrypted_title);
        try {
          const decryptedTitle = await getTopicTitle(bookmark.topic_id);
          if (decryptedTitle) {
            bookmark.title = decryptedTitle;
            bookmark.fancy_title = escapeExpression(decryptedTitle);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `Decrypting the title of encrypted message (topicId: ${bookmark.topic_id}) failed with the following error:`,
            err,
            err?.stack
          );
        }
      }
    }
  });

  api.registerModelTransformer("notification", async (notifications) => {
    for (const notification of notifications) {
      if (
        notification.topic_id &&
        notification.topic_key &&
        notification.encrypted_title
      ) {
        putTopicKey(notification.topic_id, notification.topic_key);
        putTopicTitle(notification.topic_id, notification.encrypted_title);
        try {
          const decryptedTitle = await getTopicTitle(notification.topic_id);
          if (decryptedTitle) {
            notification.fancy_title = escapeExpression(decryptedTitle);
          }
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn(
            `Decrypting the title of encrypted message (topicId: ${notification.topic_id}) failed with the following error:`,
            err,
            err?.stack
          );
        }
      }
    }
  });
});

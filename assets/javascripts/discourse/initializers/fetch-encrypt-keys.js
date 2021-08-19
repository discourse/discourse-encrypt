import { iconHTML } from "discourse-common/lib/icon-library";
import NotificationAdapter from "discourse/adapters/notification";
import { ajax } from "discourse/lib/ajax";
import PreloadStore from "discourse/lib/preload-store";
import Bookmark from "discourse/models/bookmark";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  getTopicTitle,
  putTopicKey,
  putTopicTitle,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { Promise } from "rsvp";

const CACHE_KEY = "discourse-encrypt-bookmark-cache";

function saveBookmarksResponse(session, response) {
  if (!response?.user_bookmark_list?.bookmarks) {
    return Promise.resolve();
  }

  const cacheObj = {};

  // Keep current cache values
  let cache = session.get(CACHE_KEY);
  if (cache) {
    cache.forEach((bookmark) => {
      cacheObj[bookmark.id] = bookmark;
    });
  }

  const promises = [];
  response?.user_bookmark_list?.bookmarks?.forEach((bookmark) => {
    if (!bookmark.topic_key) {
      return;
    }

    putTopicKey(bookmark.topic_id, bookmark.topic_key);
    putTopicTitle(bookmark.topic_id, bookmark.encrypted_title);

    promises.push(
      getTopicTitle(bookmark.topic_id)
        .then((title) => {
          bookmark.title = title;
          bookmark.fancy_title = `${iconHTML("user-secret")} ${title}`;
          bookmark.excerpt = null;
          cacheObj[bookmark.id] = bookmark;
        })
        .catch(() => {})
    );
  });

  return Promise.all(promises).then(() => {
    session.set(CACHE_KEY, Object.values(cacheObj));
  });
}

export default {
  name: "fetch-encrypt-keys",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) === ENCRYPT_DISABLED) {
      return;
    }

    const session = container.lookup("session:main");

    // Go through the `PreloadStore` and look for preloaded topic keys
    for (let storeKey in PreloadStore.data) {
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

    NotificationAdapter.reopen({
      find() {
        return this._super(...arguments).then((result) => {
          result.notifications.forEach((notification) => {
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
      },
    });

    Topic.reopenClass({
      create(args) {
        if (args && args.topic_key) {
          putTopicKey(args.id, args.topic_key);
          putTopicTitle(args.id, args.encrypted_title);
        }
        return this._super(...arguments);
      },
    });

    Topic.reopen({
      updateFromJson(json) {
        if (json.topic_key) {
          putTopicKey(json.id, json.topic_key);
          putTopicTitle(json.id, json.encrypted_title);
        }
        return this._super(...arguments);
      },
    });

    Bookmark.reopen({
      loadItems(params) {
        return this._super(...arguments).then((response) => {
          if (!params.q) {
            saveBookmarksResponse(session, response);
            return response;
          }

          let cachePromise = Promise.resolve();
          if (!session.get(CACHE_KEY)) {
            const url = `/u/${currentUser.username}/bookmarks.json`;
            cachePromise = ajax(url).then((resp) =>
              saveBookmarksResponse(session, resp)
            );
          }

          return cachePromise.then(() => {
            const bookmarkIds = new Set();
            response?.user_bookmark_list?.bookmarks?.forEach((bookmark) => {
              bookmarkIds.add(bookmark.id);
            });

            const cache = session.get(CACHE_KEY);
            cache.forEach((bookmark) => {
              if (
                bookmark.title.toLowerCase().includes(params.q.toLowerCase())
              ) {
                if (!response?.user_bookmark_list?.bookmarks) {
                  response = { user_bookmark_list: { bookmarks: [] } };
                }

                if (!bookmarkIds.has(bookmark.id)) {
                  bookmarkIds.add(bookmark.id);
                  response.user_bookmark_list.bookmarks.push(bookmark);
                }
              }
            });
            return response;
          });
        });
      },
    });
  },
};

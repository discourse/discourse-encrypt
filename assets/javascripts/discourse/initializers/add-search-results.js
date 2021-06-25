import { Promise } from "rsvp";
import { ajax } from "discourse/lib/ajax";
import { withPluginApi } from "discourse/lib/plugin-api";
import Post from "discourse/models/post";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getIdentity,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  decrypt,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import I18n from "I18n";

const CACHE_KEY = "discourse-encrypt-cache";

function addCacheItem(session, type, item) {
  let cache = session.get(CACHE_KEY);
  if (!cache) {
    session.set(CACHE_KEY, (cache = {}));
  }

  if (!cache[type]) {
    cache[type] = [];
  } else if (item.id) {
    cache[type] = cache[type].filter((i) => i.id !== item.id);
  }
  cache[type].push(item);
}

function getOrFetchCache(session) {
  const cache = session.get(CACHE_KEY);
  if (cache) {
    return Promise.resolve(cache);
  }

  return ajax("/encrypt/posts")
    .then((result) => {
      const promises = [];

      result.posts.forEach((post) => {
        addCacheItem(session, "posts", post);
      });

      result.topics.forEach((topic) => {
        promises.push(
          getIdentity()
            .then((id) => importKey(topic.topic_key, id.encryptPrivate))
            .then((key) => decrypt(key, topic.encrypted_title))
            .then((decrypted) => {
              topic.title = topic.fancy_title = decrypted.raw;
              addCacheItem(session, "topics", topic);
            })
            .catch(() => {})
        );
      });

      return Promise.all(promises);
    })
    .then(() => session.get(CACHE_KEY));
}

export default {
  name: "add-search-results",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const siteSettings = container.lookup("site-settings:main");
    if (getEncryptionStatus(currentUser, siteSettings) !== ENCRYPT_ACTIVE) {
      return;
    }

    const session = container.lookup("session:main");
    withPluginApi("0.11.3", (api) => {
      api.addSearchResultsCallback((results) => {
        const term = results.grouped_search_result.term;
        const words = term.split(/\s+/);

        if (!words.some((w) => w === "in:personal")) {
          return Promise.resolve(results);
        }

        return getOrFetchCache(session).then((cache) => {
          const topics = {};
          if (cache.topics) {
            cache.topics.forEach((topic) => {
              if (!words.some((word) => topic.title.indexOf(word) !== -1)) {
                return;
              }

              const topicObj = results.topics.find((t) => topic.id === t.id);
              if (topicObj) {
                topicObj.setProperties(topic);
              } else {
                topic = Topic.create(topic);
                topics[topic.id] = topic;
              }
            });
          }

          const posts = {};
          if (cache.posts) {
            cache.posts.forEach((post) => {
              if (!topics[post.topic_id]) {
                return;
              }

              post = Post.create(post);
              post.setProperties({
                topic: topics[post.topic_id],
                blurb: I18n.t("encrypt.encrypted_post"),
              });
              posts[post.topic_id] = post;
            });
          }

          Object.values(topics).forEach((topic) => {
            results.topics.unshift(topic);
          });

          Object.values(posts).forEach((p) => {
            results.posts.unshift(p);
            results.grouped_search_result.post_ids.unshift(p.id);
          });

          return results;
        });
      });
    });
  },
};

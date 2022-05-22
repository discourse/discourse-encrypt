import { iconHTML } from "discourse-common/lib/icon-library";
import { ajax } from "discourse/lib/ajax";
import { withPluginApi } from "discourse/lib/plugin-api";
import Post from "discourse/models/post";
import Topic from "discourse/models/topic";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicTitle,
  putTopicKey,
  putTopicTitle,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import I18n from "I18n";
import { Promise } from "rsvp";

const CACHE_KEY = "discourse-encrypt-cache";

function addObjectToCache(cache, type, object) {
  if (!cache[type]) {
    cache[type] = {};
  }
  cache[type][object.id] = object;
}

function addPostToCache(cache, post) {
  post.topic_title_headline = null;
  addObjectToCache(cache, "posts", post);
}

function addTopicToCache(cache, topic) {
  if (!topic.topic_key || !topic.encrypted_title) {
    return;
  }

  putTopicKey(topic.id, topic.topic_key);
  putTopicTitle(topic.id, topic.encrypted_title);

  return getTopicTitle(topic.id)
    .then((title) => {
      topic.title = title;
      topic.fancy_title = `${iconHTML("user-secret")} ${title}`;
      topic.excerpt = null;

      addObjectToCache(cache, "topics", topic);
    })
    .catch(() => {});
}

function getCache(session) {
  let cache = session.get(CACHE_KEY);
  if (!cache) {
    session.set(CACHE_KEY, (cache = {}));
  }
  return cache;
}

function loadCache(cache) {
  return ajax("/encrypt/posts").then((result) => {
    const promises = [];

    result.posts?.forEach((post) => addPostToCache(cache, post));
    result.topics?.forEach((topic) =>
      promises.push(addTopicToCache(cache, topic))
    );

    return Promise.all(promises);
  });
}

function addEncryptedSearchResultsFromCache(cache, results) {
  const terms = results.grouped_search_result.term
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((term) => !term.startsWith("@") && !term.includes(":"));

  // Add to results encrypted topics that have matching titles
  const existentTopicIds = new Set(results.topics.map((topic) => topic.id));
  const topics = {};
  Object.values(cache.topics || {}).forEach((topic) => {
    if (existentTopicIds.has(topic.id)) {
      return;
    }

    if (!topic.title) {
      // eslint-disable-next-line no-console
      console.warn("Encrypted topic title is missing: topic =", topic);
      return;
    }

    if (terms.every((term) => topic.title.toLowerCase().includes(term))) {
      topics[topic.id] = topic = Topic.create(topic);
      results.topics.unshift(topic);
    }
  });

  // Add associated posts for each new topic
  Object.values(cache.posts || {}).forEach((post) => {
    if (post.post_number !== 1 || !topics[post.topic_id]) {
      return;
    }

    post = Post.create(post);
    post.setProperties({
      topic: topics[post.topic_id],
      blurb: I18n.t("encrypt.encrypted_post"),
    });

    results.posts.unshift(post);
    results.grouped_search_result.post_ids.unshift(post.id);
  });

  // Reset topic_title_headline for encrypted results
  if (cache.topics) {
    results.posts.map((post) => {
      if (cache.topics[post.topic_id]) {
        post.set("topic_title_headline", "");
      }
    });
  }
}

export default {
  name: "add-search-results",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    const session = container.lookup("session:main");
    withPluginApi("0.11.3", (api) => {
      api.addSearchResultsCallback((results) => {
        const cache = getCache(session);
        const promises = [];

        // Decrypt existing topics and cache them
        results.topics.forEach((topic) => {
          promises.push(addTopicToCache(cache, topic));
        });

        // Search for more encrypted topics
        if (results?.topics[0]?.archetype === "private_message") {
          let cachePromise = Promise.resolve();
          if (!cache.loaded) {
            cachePromise = loadCache(cache);
            cache.loaded = true;
          }

          promises.push(
            cachePromise.then(() =>
              addEncryptedSearchResultsFromCache(cache, results)
            )
          );
        }

        return Promise.all(promises).then(() => results);
      });
    });
  },
};

import PreloadStore from "preload-store";
import Topic from "discourse/models/topic";
import {
  decrypt,
  importKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { loadKeyPairFromIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";
import { cookAsync } from "discourse/lib/text";

/**
 * @var Dictionary of all topic keys (topic_id => key).
 */
const keys = {};

/**
 * Decrypts all elements described by a selector.
 *
 * @param containerSelector Item list (container) selector
 * @param elementSelector   Encrypted element selector
 * @param cookPlaintext     Whether plaintext should be cooked.
 */
function decryptElements(containerSelector, elementSelector, cookPlaintext) {
  $(containerSelector).each(async function() {
    if ($(this).data("decrypted")) {
      return;
    }

    const topicId = $(this).data("topic-id");
    const $el = $(this).find(elementSelector);
    if (!topicId || !keys[topicId] || !$el.length) {
      return;
    }

    const [_, privateKey] = await loadKeyPairFromIndexedDb(); // eslint-disable-line no-unused-vars
    const key = await importKey(keys[topicId], privateKey);

    const ciphertext = $el.text().trim();
    const plaintext = await decrypt(key, ciphertext);

    $(this).data("decrypted", true);
    if (cookPlaintext) {
      cookAsync(plaintext).then(cooked => $el.html(cooked.string));
    } else {
      $el.html(plaintext);
    }
  });
}

/**
 * Decrypts all encrypted messages contained in a subset of elements.
 */
function decryptAll() {
  decryptElements("article.onscreen-post", ".cooked", true);
  decryptElements("h1", ".fancy-title");
  decryptElements(".topic-list-item, .latest-topic-list-item", ".title");

  // TODO: Avoid polling for encrypted messages.
  Ember.run.later(decryptAll, 1000);
}

export default {
  name: "hook-decrypt",

  initialize() {
    // Go through the `PreloadStore` and look for any preloaded topic keys.
    for (var key in PreloadStore.data) {
      if (key.includes("topic_")) {
        const topic = PreloadStore.data[key];
        if (topic.user_key) {
          keys[topic.id] = topic.user_key;
        }
      }
    }

    // Hook `Topic` model to gather encrypted topic keys.
    Topic.reopenClass({
      create(args) {
        if (args.user_key) {
          keys[args.id] = args.user_key;
        }
        return this._super(...arguments);
      }
    });

    decryptAll();
  }
};

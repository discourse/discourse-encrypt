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

    $(this).data("decrypted", true);

    const [_, privateKey] = await loadKeyPairFromIndexedDb(); // eslint-disable-line no-unused-vars
    const key = await importKey(keys[topicId], privateKey);

    const ciphertext = $el.text().trim();
    const plaintext = await decrypt(key, ciphertext);

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

    // Schedule decryption after all elements were rendered.
    var self = this;
    Ember.Component.reopen({
      didInsertElement: function() {
        this._super();
        Ember.run.scheduleOnce("afterRender", this, () => {
          Ember.run.debounce(self, decryptAll, 10);
        });
      }
    });
  }
};

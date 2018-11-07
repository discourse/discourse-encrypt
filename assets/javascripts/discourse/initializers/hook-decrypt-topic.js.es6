import { decrypt } from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  hasTopicKey,
  getTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

/**
 * Decrypts all elements described by a selector.
 *
 * @param containerSelector Item list (container) selector
 * @param elementSelector   Encrypted element selector
 */
function decryptElements(containerSelector, elementSelector) {
  $(containerSelector).each(async function() {
    if ($(this).data("decrypted")) {
      return;
    }

    const topicId = $(this).data("topic-id");
    const $el = elementSelector ? $(this).find(elementSelector) : $(this);
    if (!topicId || !hasTopicKey(topicId) || !$el.length) {
      return;
    }

    $(this).data("decrypted", true);
    const ciphertext = $el.text().trim();

    getTopicKey(topicId)
      .then(key => decrypt(key, ciphertext))
      .then(plaintext => $el.html(plaintext));
  });
}

export default {
  name: "hook-decrypt-topic",

  initialize() {
    // Hook components to trigger decryption after each render.
    var self = this;
    Ember.Component.reopen({
      didRender() {
        Ember.run.scheduleOnce("afterRender", this, () => {
          Ember.run.debounce(
            self,
            () => {
              decryptElements("h1", ".fancy-title");
              decryptElements(
                ".topic-list-item, .latest-topic-list-item",
                ".title"
              );
              decryptElements("a.topic-link", "span");
              decryptElements("a.topic-link");
            },
            100
          );
        });
        return this._super();
      }
    });
  }
};

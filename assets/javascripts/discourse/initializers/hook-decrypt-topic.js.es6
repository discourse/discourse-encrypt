import { iconHTML } from "discourse-common/lib/icon-library";
import {
  hasTopicTitle,
  getTopicTitle
} from "discourse/plugins/discourse-encrypt/lib/discourse";

/**
 * Decrypts all elements described by a selector.
 *
 * @param containerSelector Item list (container) selector
 * @param elementSelector   Encrypted element selector
 */
function decryptElements(containerSelector, elementSelector) {
  $(containerSelector).each(function() {
    if ($(this).data("decrypted")) {
      return;
    }

    const topicId = $(this).data("topic-id");
    const $el = elementSelector ? $(this).find(elementSelector) : $(this);
    if (!topicId || !hasTopicTitle(topicId) || !$el.length) {
      return;
    }

    $(this).data("decrypted", true);
    getTopicTitle(topicId).then(t => $el.html(iconHTML("unlock") + " " + t));
  });
}

export default {
  name: "hook-decrypt-topic",

  initialize() {
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
              decryptElements("a.raw-topic-link");
            },
            100
          );
        });
        return this._super();
      }
    });
  }
};

import { escapeExpression } from "discourse/lib/utilities";
import { iconHTML } from "discourse-common/lib/icon-library";
import {
  hasTopicTitle,
  getTopicTitle,
  getEncryptionStatus,
  ENCRYPT_ACTIVE
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
    getTopicTitle(topicId)
      .then(title => {
        const icon = iconHTML("user-secret", {
          title: "encrypt.encrypted_icon_title"
        });

        // Replace glyph if exists or else add to title.
        const $glyph = $(`h1[data-topic-id=${topicId}] .private-message-glyph`);
        if ($glyph.length) {
          $glyph.html(icon);
          $el.html(escapeExpression(title));
        } else {
          $el.html(icon + " " + title);
        }

        // TODO: Hide quick-edit button for the time being.
        $(".edit-topic").hide();
      })
      .catch(() => $(this).data("decrypted", null));
  });
}

/**
 * Decrypts all title elements.
 */
export function decryptTitles() {
  decryptElements("h1", ".fancy-title");
  decryptElements(".topic-list-item, .latest-topic-list-item", ".title");
  decryptElements("a.topic-link", "span");
  decryptElements("a.topic-link");
  decryptElements("a.raw-topic-link");
}

export default {
  name: "hook-decrypt-topic",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    const appEvents = container.lookup("app-events:main");
    appEvents.on("encrypt:status-changed", decryptTitles);

    var self = this;
    Ember.Component.reopen({
      didRender() {
        Ember.run.scheduleOnce("afterRender", self, () => {
          Ember.run.debounce(self, decryptTitles, 500);
        });
        return this._super(...arguments);
      }
    });
  }
};

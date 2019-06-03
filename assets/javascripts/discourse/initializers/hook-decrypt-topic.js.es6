import { withPluginApi } from "discourse/lib/plugin-api";
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
function decryptElements(containerSelector, elementSelector, opts) {
  opts = opts || {};

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
        if (opts.replaceIcon) {
          const $glyph = $(`h1 .private-message-glyph`);
          if ($glyph.length) {
            $glyph.html(icon);
            $el.html(escapeExpression(title));
          }
        } else if (opts.addIcon) {
          $el.html(icon + " " + title);
        } else {
          $el.html(title);
        }
      })
      .catch(() => $(this).data("decrypted", null));

    // TODO: Hide quick-edit button for the time being.
    $(this)
      .find(".edit-topic")
      .hide();
  });
}

/**
 * Decrypts all title elements.
 */
export function decryptTitles() {
  decryptElements("h1[data-topic-id]", ".fancy-title", { replaceIcon: true });
  decryptElements("h1 .topic-link", "span", { replaceIcon: true });
  decryptElements(
    ".topic-list-item[data-topic-id], .latest-topic-list-item[data-topic-id]",
    ".title",
    { addIcon: true }
  );
  decryptElements("a.topic-link[data-topic-id]", "span", { addIcon: true });
  decryptElements("a.topic-link[data-topic-id]", { addIcon: true });
  decryptElements("a.raw-topic-link[data-topic-id]", { addIcon: true });
  decryptElements(".notifications span[data-topic-id]");
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

    withPluginApi("0.8.31", api => {
      api.decorateWidget("header:after", helper => {
        if (helper.widget.state.userVisible) {
          decryptTitles();
          Ember.run.debounce(self, decryptTitles, 500);
        }
      });
    });
  }
};

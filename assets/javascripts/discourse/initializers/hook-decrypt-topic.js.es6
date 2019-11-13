import { iconHTML } from "discourse-common/lib/icon-library";
import { withPluginApi } from "discourse/lib/plugin-api";
import { emojiUnescape } from "discourse/lib/text";
import { escapeExpression } from "discourse/lib/utilities";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicTitle,
  hasTopicTitle
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
        title = emojiUnescape(escapeExpression(title));
        const icon = iconHTML("user-secret", {
          title: "encrypt.encrypted_icon_title"
        });

        if (opts.replaceIcon) {
          const $glyph = $(`h1 .private-message-glyph`);
          if ($glyph.length) {
            $glyph.html(icon);
            $el.html(title);
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

export default {
  name: "hook-decrypt-topic",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", this, "decryptTitles");
    appEvents.on("page:changed", this, "decryptDocTitle");

    // Try to decrypt new titles that may appear after rendering a component.
    var self = this;
    Ember.Component.reopen({
      didRender() {
        Ember.run.scheduleOnce("afterRender", self, () => {
          Ember.run.debounce(self, self.decryptTitles, 500);
        });
        return this._super(...arguments);
      }
    });

    // Decrypt notifications when opening the user menu.
    withPluginApi("0.8.31", api => {
      api.decorateWidget("header:after", helper => {
        if (helper.widget.state.userVisible) {
          self.decryptTitles();
          Ember.run.debounce(self, self.decryptTitles, 500);
        }
      });
    });
  },

  decryptTitles() {
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
    decryptElements(".quick-access-panel span[data-topic-id]");
  },

  decryptDocTitle(data) {
    if (data.currentRouteName.startsWith("topic.")) {
      const topicId = Discourse.__container__
        .lookup("controller:topic")
        .get("model.id");
      getTopicTitle(topicId).then(topicTitle =>
        Discourse.set(
          "_docTitle",
          data.title.replace(
            I18n.t("encrypt.encrypted_topic_title"),
            topicTitle
          )
        )
      );
    }
  }
};

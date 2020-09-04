import I18n from "I18n";
import { debounce, scheduleOnce } from "@ember/runloop";
import { iconHTML } from "discourse-common/lib/icon-library";
import { withPluginApi } from "discourse/lib/plugin-api";
import { emojiUnescape } from "discourse/lib/text";
import { escapeExpression } from "discourse/lib/utilities";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicTitle,
  syncGetTopicTitle,
  hasTopicTitle,
  waitForPendingTitles,
} from "discourse/plugins/discourse-encrypt/lib/discourse";

/**
 * Decrypts all elements described by a selector.
 *
 * @param {String} containerSelector Item list (container) selector
 * @param {String} elementSelector   Encrypted element selector
 *                                   If not present, the container element is
 *                                   used
 * @param {{ addIcon: Boolean,
 *           replaceIcon: Boolean }} opts
 */
function decryptElements(containerSelector, elementSelector, opts) {
  opts = opts || {};

  $(containerSelector).each(function () {
    const topicId = $(this).data("topic-id");
    const $el = elementSelector ? $(this).find(elementSelector) : $(this);
    if (!topicId || !hasTopicTitle(topicId) || !$el.length) {
      return;
    }

    getTopicTitle(topicId)
      .then((title) => {
        title = emojiUnescape(escapeExpression(title));
        const icon = iconHTML("user-secret", {
          title: "encrypt.encrypted_icon_title",
          class: "private-message-glyph",
        });

        if (opts.replaceIcon) {
          const $glyph = $(`h1 .private-message-glyph-wrapper`);
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
    $(this).find(".edit-topic").hide();

    // Hide excerpt in search
    $(this).parents(".search-link").find(".blurb").hide();
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
    appEvents.on("encrypt:status-changed", this, this.decryptTitles);
    appEvents.on("page:changed", this, this.decryptDocTitle);

    // Try to decrypt new titles that may appear after rendering a component.
    var self = this;
    Ember.Component.reopen({
      didRender() {
        scheduleOnce("afterRender", self, () => {
          debounce(self, self.decryptTitles, 500);
        });
        return this._super(...arguments);
      },
    });

    withPluginApi("0.8.31", (api) => {
      // All quick-access panels
      api.reopenWidget("quick-access-panel", {
        setItems() {
          // Artificially delay loading until all titles are decrypted
          return waitForPendingTitles().then(() => this._super(...arguments));
        },
      });

      // Notification topic titles
      api.reopenWidget("default-notification-item", {
        description() {
          if (
            this.attrs.fancy_title &&
            this.attrs.topic_id &&
            this.attrs.topic_key
          ) {
            const decrypted = syncGetTopicTitle(this.attrs.topic_id);
            if (decrypted)
              return `<span data-topic-id="${
                this.attrs.topic_id
              }">${escapeExpression(decrypted)}</span>`;
          }
          return this._super(...arguments);
        },
      });

      // Non-notification quick-access topic titles (assign, bookmarks, PMs)
      api.reopenWidget("quick-access-item", {
        _contentHtml() {
          const href = this.attrs.href;
          if (href) {
            let topicId = href.match(/\/t\/.*?\/(\d+)/);
            if (topicId && topicId[1]) {
              topicId = parseInt(topicId[1], 10);
              const decrypted = syncGetTopicTitle(topicId);
              if (decrypted) return escapeExpression(decrypted);
            }
          }

          return this._super(...arguments);
        },
      });
    });

    withPluginApi("0.8.31", (api) => {
      api.decorateWidget("header:after", (helper) => {
        if (
          helper.widget.state.userVisible ||
          helper.widget.state.searchVisible
        ) {
          debounce(self, self.decryptTitles, 500);
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
    decryptElements("a.topic-link[data-topic-id]", "span");
    decryptElements("a.topic-link[data-topic-id]", { addIcon: true });
    decryptElements("a.raw-topic-link[data-topic-id]", { addIcon: true });
    decryptElements(".search-result-topic span[data-topic-id]");
  },

  decryptDocTitle(data) {
    if (data.currentRouteName.startsWith("topic.")) {
      const topicId = Discourse.__container__
        .lookup("controller:topic")
        .get("model.id");
      getTopicTitle(topicId).then((topicTitle) =>
        Discourse.set(
          "_docTitle",
          data.title.replace(
            I18n.t("encrypt.encrypted_topic_title"),
            topicTitle
          )
        )
      );
    }
  },
};

import Component from "@ember/component";
import { scheduleOnce } from "@ember/runloop";
import discourseDebounce from "discourse-common/lib/debounce";
import { iconHTML } from "discourse-common/lib/icon-library";
import { withPluginApi } from "discourse/lib/plugin-api";
import { emojiUnescape } from "discourse/lib/text";
import { escapeExpression } from "discourse/lib/utilities";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicTitle,
  hasTopicTitle,
  syncGetTopicTitle,
  waitForPendingTitles,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import I18n from "I18n";

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

  document.querySelectorAll(containerSelector).forEach((element) => {
    const titleElement = elementSelector
      ? element.querySelector(elementSelector)
      : element;
    if (!titleElement) {
      return;
    }

    const topicId = element.dataset.topicId || titleElement.dataset.topicId;
    if (!topicId || !hasTopicTitle(topicId)) {
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
          const iconElement = element.querySelector(
            ".private-message-glyph-wrapper"
          );
          if (iconElement) {
            iconElement.innerHTML = icon;
            titleElement.innerHTML = title;
          }
        } else if (opts.addIcon) {
          titleElement.innerHTML = icon + " " + title;
        } else {
          titleElement.innerHTML = title;
        }
      })
      .catch(() => {});

    // Hide quick-edit button for the time being
    const quickEditBtn = element.querySelector(".edit-topic");
    if (quickEditBtn) {
      quickEditBtn.style.display = "none";
    }
  });
}

export default {
  name: "decrypt-topics",
  container: null,

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    // Save a reference to container to be used by `decryptDocTitle`.
    this.container = container;

    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", this, this.decryptTitles);
    appEvents.on("page:changed", this, this.decryptDocTitle);

    // Try to decrypt new titles that may appear after rendering a component.
    const self = this;
    Component.reopen({
      didRender() {
        scheduleOnce("afterRender", self, () => {
          discourseDebounce(self, self.decryptTitles, 500);
        });
        return this._super(...arguments);
      },
    });

    withPluginApi("0.8.31", (api) => {
      // All quick-access panels
      api.reopenWidget("quick-access-panel", {
        setItems() {
          // Artificially delay loading until all titles are decrypted
          return waitForPendingTitles()
            .catch(() => {
              // eslint-disable-next-line no-console
              console.warn("Not all encrypted titles could be decrypted");
            })
            .finally(() => this._super(...arguments));
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
            if (decrypted) {
              return `<span data-topic-id="${
                this.attrs.topic_id
              }">${emojiUnescape(escapeExpression(decrypted))}</span>`;
            }
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
              if (decrypted) {
                return emojiUnescape(escapeExpression(decrypted));
              }
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
          discourseDebounce(self, self.decryptTitles, 500);
        }
      });
    });
  },

  decryptTitles() {
    decryptElements("a.raw-topic-link", null, { addIcon: true });
    decryptElements("a.topic-link", "span");
    decryptElements("a.topic-link", null, { addIcon: true });

    // Title in site header
    decryptElements("h1.header-title", ".topic-link", { replaceIcon: true });

    // Title in topic header
    decryptElements("h1", ".fancy-title", { replaceIcon: true });

    // Title in topic lists
    decryptElements(".topic-list-item, .latest-topic-list-item", ".title", {
      addIcon: true,
    });
  },

  decryptDocTitle(data) {
    if (!data.currentRouteName.startsWith("topic.")) {
      return;
    }

    const topicId = this.container.lookup("controller:topic").get("model.id");
    getTopicTitle(topicId).then((topicTitle) => {
      const documentTitle = this.container.lookup("service:document-title");
      documentTitle.setTitle(
        documentTitle
          .getTitle()
          .replace(I18n.t("encrypt.encrypted_title"), topicTitle)
      );
    });
  },
};

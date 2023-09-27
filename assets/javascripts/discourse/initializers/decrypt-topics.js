import Component from "@ember/component";
import EmberObject from "@ember/object";
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
  putTopicKey,
  putTopicTitle,
  syncGetTopicTitle,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { observes } from "discourse-common/utils/decorators";

const PLUGIN_ID = "discourse-encrypt";

/**
 * Decrypts elements that contain topic titles
 *
 * @param {String} containerSelector Item list (container) selector
 * @param {String} elementSelector   Encrypted title element selector
 *                                   If not present, the container is used
 * @param {Boolean} addIcon          Adds "user-secret" icon before title
 */
function decryptTopicTitles(
  containerSelector,
  elementSelector,
  addIcon = false
) {
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

        if (addIcon) {
          const icon = iconHTML("user-secret", {
            title: "encrypt.encrypted_icon_title",
            class: "private-message-glyph",
          });

          titleElement.innerHTML = icon + " " + title;
        } else {
          titleElement.innerHTML = title;
        }
      })
      .catch(() => {});
  });
}

/**
 * Replaces PM icon with "user-secret" icon
 *
 * @param {String} containerSelector Item list (container) selector
 * @param {String} elementSelector   Encrypted title element selector
 *                                   If not present, the container is used
 * @param {Boolean} iconSelector     Icon container selector
 */
function replaceIcons(containerSelector, elementSelector, iconSelector) {
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

    const iconElement = element.querySelector(iconSelector);
    if (iconElement) {
      iconElement.innerHTML = iconHTML("user-secret", {
        title: "encrypt.encrypted_icon_title",
        class: "private-message-glyph",
      });
    }
  });
}

let registeredComponentHook = false;

export default {
  name: "decrypt-topics",
  container: null,

  initialize(container) {
    const currentUser = container.lookup("service:current-user");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    // Save a reference to container to be used by `decryptTopicPage`
    this.container = container;

    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", this, this.decryptTopicTitles);
    appEvents.on("page:changed", this, this.decryptTopicPage);

    const self = this;
    if (!registeredComponentHook) {
      // Try to decrypt new titles that may appear after rendering a component
      EmberObject.reopen.call(Component, {
        didRender() {
          scheduleOnce("afterRender", self, () => {
            discourseDebounce(self, self.decryptTopicTitles, 500);
          });
          return this._super(...arguments);
        },
      });
      registeredComponentHook = true;
    }

    withPluginApi("0.11.3", (api) => {
      // Full-screen notification list topic titles
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

      if (api.registerModelTransformer) {
        api.registerModelTransformer("topic", async (topics) => {
          for (const topic of topics) {
            if (topic.topic_key && topic.encrypted_title) {
              putTopicKey(topic.id, topic.topic_key);
              putTopicTitle(topic.id, topic.encrypted_title);
              try {
                const decryptedTitle = await getTopicTitle(topic.id);
                if (decryptedTitle) {
                  topic.fancy_title = escapeExpression(decryptedTitle);
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(
                  `Decrypting the title of encrypted message (topicId: ${topic.id}) failed with the following error:`,
                  err,
                  err.stack
                );
              }
            }
          }
        });
        api.registerModelTransformer("bookmark", async (bookmarks) => {
          for (const bookmark of bookmarks) {
            if (
              bookmark.topic_id &&
              bookmark.topic_key &&
              bookmark.encrypted_title
            ) {
              putTopicKey(bookmark.topic_id, bookmark.topic_key);
              putTopicTitle(bookmark.topic_id, bookmark.encrypted_title);
              try {
                const decryptedTitle = await getTopicTitle(bookmark.topic_id);
                if (decryptedTitle) {
                  bookmark.title = decryptedTitle;
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(
                  `Decrypting the title of encrypted message (topicId: ${bookmark.topic_id}) failed with the following error:`,
                  err,
                  err.stack
                );
              }
            }
          }
        });
        api.registerModelTransformer("notification", async (notifications) => {
          for (const notification of notifications) {
            if (
              notification.topic_id &&
              notification.topic_key &&
              notification.encrypted_title
            ) {
              putTopicKey(notification.topic_id, notification.topic_key);
              putTopicTitle(
                notification.topic_id,
                notification.encrypted_title
              );
              try {
                const decryptedTitle = await getTopicTitle(
                  notification.topic_id
                );
                if (decryptedTitle) {
                  notification.fancy_title = escapeExpression(decryptedTitle);
                }
              } catch (err) {
                // eslint-disable-next-line no-console
                console.warn(
                  `Decrypting the title of encrypted message (topicId: ${notification.topic_id}) failed with the following error:`,
                  err,
                  err.stack
                );
              }
            }
          }
        });
      }

      api.decorateWidget("header:after", (helper) => {
        if (
          helper.widget.state.userVisible ||
          helper.widget.state.searchVisible
        ) {
          discourseDebounce(self, self.decryptTopicTitles, 500);
        }
      });

      api.modifyClass("controller:topic", {
        pluginId: PLUGIN_ID,

        @observes("editingTopic")
        _editingTopicChanged() {
          if (this.get("editingTopic")) {
            const topicId = this.get("model.id");

            getTopicTitle(topicId).then((topicTitle) => {
              // Update the title stored in buffered state
              this.buffered.set("title", topicTitle);
            });
          }
        },
      });
    });
  },

  decryptTopicTitles() {
    // Title in miscellaneous
    decryptTopicTitles("a.raw-topic-link", null, true);
    decryptTopicTitles("a.topic-link", "span");
    decryptTopicTitles("a.topic-link", null, true);

    // Title in site header
    decryptTopicTitles("h1.header-title", ".topic-link");

    // Title in topic lists
    decryptTopicTitles(
      ".topic-list-item, .latest-topic-list-item",
      ".title",
      true
    );

    // Replace PM icons
    replaceIcons("h1", null, ".private-message-glyph-wrapper");
    replaceIcons("h1", ".topic-link", ".private-message-glyph-wrapper");

    // Decrypt topic controller
    // This is necessary because sometimes the model is loaded after
    // page:changed event was triggered.
    if (
      !this.container ||
      this.container.isDestroyed ||
      this.container.isDestroying
    ) {
      return;
    }

    const { currentRouteName } = this.container.lookup("service:router");
    this.decryptTopicPage({ currentRouteName });
  },

  decryptTopicPage(data) {
    if (!data.currentRouteName?.startsWith("topic.")) {
      return;
    }

    if (
      !this.container ||
      this.container.isDestroyed ||
      this.container.isDestroying
    ) {
      return;
    }

    const topicController = this.container.lookup("controller:topic");
    const topic = topicController.get("model");
    const topicId = topic.id;

    if (topic?.encrypted_title) {
      document.querySelector(".private_message").classList.add("encrypted");
    }

    getTopicTitle(topicId).then((topicTitle) => {
      // Update fancy title stored in model
      topicController.model.set("fancy_title", escapeExpression(topicTitle));

      // Update document title
      const documentTitle = this.container.lookup("service:document-title");
      documentTitle.setTitle(
        documentTitle
          .getTitle()
          .replace(topicController.model.title, topicTitle)
      );
    });
  },
};

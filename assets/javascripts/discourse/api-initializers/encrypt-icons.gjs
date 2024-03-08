import { computed } from "@ember/object";
import TopicStatusIcons from "discourse/helpers/topic-status-icons";
import { apiInitializer } from "discourse/lib/api";
import icon from "discourse-common/helpers/d-icon";
import i18n from "discourse-common/helpers/i18n";
import I18n from "discourse-i18n";

export default apiInitializer("0.8", (api) => {
  // Header icon
  if (!TopicStatusIcons.find(([prop]) => prop === "encrypted_title")) {
    TopicStatusIcons.addObject(["encrypted_title", "user-secret", "encrypted"]);
  }

  // topic-list-item icon
  api.modifyClass("raw-view:topic-status", {
    pluginId: "encrypt",

    statuses: computed(function () {
      const results = this._super(...arguments);

      if (this.topic.encrypted_title) {
        results.push({
          openTag: "span",
          closeTag: "span",
          title: I18n.t("topic-statuses.encrypted.help"),
          icon: "user-secret",
          key: "encrypted",
        });
      }

      return results;
    }),
  });

  // Main topic title
  api.renderInOutlet("after-topic-status", <template>
    {{#if @outletArgs.topic.encrypted_title}}
      <span
        title={{i18n "topic-statuses.encrypted.help"}}
        class="topic-status encrypted"
      >{{icon "user-secret"}}</span>
    {{/if}}
  </template>);
});

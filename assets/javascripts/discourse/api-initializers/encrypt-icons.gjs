import { computed } from "@ember/object";
import { apiInitializer } from "discourse/lib/api";
import icon from "discourse-common/helpers/d-icon";
import i18n from "discourse-common/helpers/i18n";
import { withSilencedDeprecations } from "discourse-common/lib/deprecated";
import I18n from "discourse-i18n";

export default apiInitializer("2.0.0", (api) => {
  withSilencedDeprecations("discourse.hbr-topic-list-overrides", () => {
    let topicStatusIcons;
    try {
      topicStatusIcons =
        require("discourse/helpers/topic-status-icons").default;
    } catch {}

    if (
      topicStatusIcons &&
      !topicStatusIcons.entries.find(([prop]) => prop === "encrypted_title")
    ) {
      topicStatusIcons?.addObject([
        "encrypted_title",
        "user-secret",
        "encrypted",
      ]);
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

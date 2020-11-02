import I18n from "I18n";
import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";
import { computed } from "@ember/object";
import { isEmpty } from "@ember/utils";

export default DropdownSelectBoxComponent.extend({
  classNames: ["encrypt-time-bomb-dropdown"],
  classNameBindings: ["shouldHide:hidden"],

  selectKitOptions: {
    icon: "stopwatch",
    showFullTitle: true,
  },

  content: computed("topicDetonateAt", function () {
    const options = [
      { id: "", name: I18n.t("encrypt.time_bomb.never") },
      { id: "3", name: I18n.t("encrypt.time_bomb.3minutes") },
      { id: "60", name: I18n.t("encrypt.time_bomb.1hour") },
      { id: "180", name: I18n.t("encrypt.time_bomb.3hours") },
      { id: "720", name: I18n.t("encrypt.time_bomb.12hours") },
      { id: "1440", name: I18n.t("encrypt.time_bomb.24hours") },
      { id: "4320", name: I18n.t("encrypt.time_bomb.3days") },
      { id: "10080", name: I18n.t("encrypt.time_bomb.7days") },
    ];
    if (this.topicDetonateAt) {
      return options.filter((option) => {
        return (
          option.id.length > 0 &&
          moment().add(option.id, "minutes") < moment(this.topicDetonateAt)
        );
      });
    } else {
      return options;
    }
  }),

  shouldHide: computed("content.[]", function () {
    return isEmpty(this.content);
  }),
});

import I18n from "I18n";
import DropdownSelectBoxComponent from "select-kit/components/dropdown-select-box";
import { computed } from "@ember/object";
import { empty } from "@ember/object/computed";

const TIMER_OPTIONS = [
  { id: "", name: I18n.t("encrypt.time_bomb.never") },
  { id: "3", name: I18n.t("encrypt.time_bomb.3_minutes") },
  { id: "60", name: I18n.t("encrypt.time_bomb.1_hour") },
  { id: "180", name: I18n.t("encrypt.time_bomb.3_hours") },
  { id: "720", name: I18n.t("encrypt.time_bomb.12_hours") },
  { id: "1440", name: I18n.t("encrypt.time_bomb.24_hours") },
  { id: "4320", name: I18n.t("encrypt.time_bomb.3_days") },
  { id: "10080", name: I18n.t("encrypt.time_bomb.7_days") },
];

export default DropdownSelectBoxComponent.extend({
  classNames: ["encrypted-post-timer-dropdown"],
  classNameBindings: ["hidden:hidden"],

  selectKitOptions: {
    icon: "discourse-trash-clock",
    showFullTitle: true,
  },

  content: computed("topicDeleteAt", function () {
    if (this.topicDeleteAt) {
      return TIMER_OPTIONS.filter((option) => {
        return (
          option.id.length > 0 &&
          moment().add(option.id, "minutes") < moment(this.topicDeleteAt)
        );
      });
    } else {
      return TIMER_OPTIONS;
    }
  }),

  hidden: empty("content"),
});

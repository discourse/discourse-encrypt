import { createWidget } from "discourse/widgets/widget";
import { iconNode } from "discourse-common/lib/icon-library";
import { later } from "@ember/runloop";
import { h } from "virtual-dom";
import i18n from "I18n";

createWidget("encrypted-post-timer-counter", {
  tagName: "div.encrypted-post-timer-counter",

  init(attrs) {
    if (attrs.post.delete_at) {
      later(() => {
        this.scheduleRerender();
      }, 60000);
    }
  },

  formatedClock(attrs) {
    const miliseconds = Math.max(
      moment(attrs.post.delete_at) - moment().utc(),
      60000
    );

    return moment.duration(miliseconds).humanize();
  },

  html(attrs) {
    if (attrs.post.delete_at) {
      return h(
        "div",
        {
          attributes: {
            title: i18n.t("encrypt.time_bomb.title", {
              after: this.formatedClock(attrs),
            }),
          },
        },
        [this.formatedClock(attrs), iconNode("stopwatch")]
      );
    }
  },
});

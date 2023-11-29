import { later } from "@ember/runloop";
import { h } from "virtual-dom";
import { createWidget } from "discourse/widgets/widget";
import { iconNode } from "discourse-common/lib/icon-library";
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

  formattedClock(attrs) {
    const milliseconds = Math.max(
      moment(attrs.post.delete_at) - moment().utc(),
      60000
    );

    return moment.duration(milliseconds).humanize();
  },

  html(attrs) {
    if (attrs.post.delete_at) {
      return h(
        "div",
        {
          attributes: {
            title: i18n.t("encrypt.time_bomb.title", {
              after: this.formattedClock(attrs),
            }),
          },
        },
        [iconNode("discourse-trash-clock"), this.formattedClock(attrs)]
      );
    }
  },
});

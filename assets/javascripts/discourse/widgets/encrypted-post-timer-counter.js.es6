import { createWidget } from "discourse/widgets/widget";
import { iconNode } from "discourse-common/lib/icon-library";
import { later } from "@ember/runloop";


createWidget("encrypted-post-timer-counter", {
  tagName: "div.encrypted-post-timer-counter",

  init() {
    later(() => {
      this.scheduleRerender();
    }, 60000);
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
      return [iconNode("stopwatch"), this.formatedClock(attrs)];
    }
  },
});

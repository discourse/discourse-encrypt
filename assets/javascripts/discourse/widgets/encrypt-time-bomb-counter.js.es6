import { createWidget } from "discourse/widgets/widget";
import { iconNode } from "discourse-common/lib/icon-library";

createWidget("encrypt-time-bomb-counter", {
  tagName: "div.time-bomb-counter",

  init() {
    setTimeout(() => {
      this.scheduleRerender();
    }, 60000);
  },

  formatedClock(attrs) {
    const miliseconds = Math.max(
      moment(attrs.post.detonate_at) - moment().utc(),
      60000
    );
    return moment.duration(miliseconds).humanize();
  },

  html(attrs) {
    if (attrs.post.detonate_at) {
      return [iconNode("stopwatch"), this.formatedClock(attrs)];
    }
  },
});

import discourseDebounce from "discourse-common/lib/debounce";
import { Promise } from "rsvp";

export default class DebouncedQueue {
  constructor(wait, handler) {
    this.wait = wait;
    this.handler = handler;
    this.queue = null;
    this.promise = null;
    this.resolve = null;
  }

  push(...items) {
    if (!this.queue) {
      this.queue = [];
      this.promise = new Promise((resolve) => {
        this.resolve = resolve;
      });
      discourseDebounce(this, this.pop, this.wait);
    }

    this.queue.push(...items);
    return this.promise;
  }

  pop() {
    const items = Array.from(new Set(this.queue));
    this.handler(items).then(this.resolve);

    this.queue = null;
    this.promise = null;
    this.resolve = null;
  }
}

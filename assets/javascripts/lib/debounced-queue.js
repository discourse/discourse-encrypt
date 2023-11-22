import discourseDebounce from "discourse-common/lib/debounce";
import { Promise } from "rsvp";

export default class DebouncedQueue {
  constructor(wait, handler) {
    this.wait = wait;
    this.handler = handler;
    this.queue = null;
    this.promise = null;
    this.resolve = null;
    this.reject = null;
  }

  push(...items) {
    if (!this.queue) {
      this.queue = [];
      this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
      discourseDebounce(this, this.pop, this.wait);
    }

    this.queue.push(...items);
    return this.promise;
  }

  pop() {
    const items = Array.from(new Set(this.queue));
    this.handler(items).then(this.resolve).catch(this.reject);

    this.queue = null;
    this.promise = null;
    this.resolve = null;
  }
}

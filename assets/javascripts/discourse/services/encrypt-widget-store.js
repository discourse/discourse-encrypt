import Service from "@ember/service";
import { TrackedArray } from "@ember-compat/tracked-built-ins";

export default class EncryptWidgetStore extends Service {
  widgets = new TrackedArray();

  add(widget) {
    this.widgets.push(widget);
  }

  reset() {
    this.widgets.length = 0;
  }
}

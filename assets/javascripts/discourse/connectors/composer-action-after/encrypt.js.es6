import { hideComponentIfDisabled } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  setupComponent(args, component) {
    component.setProperties({
      model: args.model,
      handler: hideComponentIfDisabled(component),
      willDestroyElement() {
        this._super(...arguments);
        this.appEvents.off("encrypt:status-changed", this, this.get("handler"));
      }
    });
  }
};

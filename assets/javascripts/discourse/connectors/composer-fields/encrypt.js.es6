import { hideComponentIfDisabled } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  setupComponent(args, component) {
    component.setProperties({
      model: args.model
    });

    hideComponentIfDisabled(component);
  }
};

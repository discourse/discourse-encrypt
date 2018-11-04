import { hideComponentIfDisabled } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  setupComponent(args, component) {
    hideComponentIfDisabled(component);
  }
};

import { hideComponentIfDisabled } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  async setupComponent(args, component) {
    hideComponentIfDisabled(component);
  }
};

import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  setupComponent(args, component) {
    const currentUser = Discourse.User.current();
    component.setProperties({
      model: args.model,
      /** @var Whether the encryption is active on this device. */
      isEncryptActive: getEncryptionStatus(currentUser) === ENCRYPT_ACTIVE,
      /** Listens for encryptino status updates. */
      listener() {
        const newStatus = getEncryptionStatus(currentUser);
        component.set("isEncryptActive", newStatus === ENCRYPT_ACTIVE);
      },
      didInsertElement() {
        this._super(...arguments);
        this.appEvents.on("encrypt:status-changed", this.get("listener"));
      },
      willDestroyElement() {
        this._super(...arguments);
        this.appEvents.off("encrypt:status-changed", this.get("listener"));
      }
    });
  }
};

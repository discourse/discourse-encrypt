import computed from "ember-addons/ember-computed-decorators";
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

      /** Listens for encryption status updates. */
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
      },

      clicked() {
        this.set("model.showEncryptError", true);
        if (!this.get("model.isEncryptedDisabled")) {
          this.set("model.isEncrypted", !this.get("model.isEncrypted"));
        }
      }
    });
  }
};

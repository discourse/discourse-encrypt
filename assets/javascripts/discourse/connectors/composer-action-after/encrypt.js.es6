import { getOwner } from "discourse-common/lib/get-owner";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  setupComponent(args, component) {
    const currentUser = getOwner(component).lookup("current-user:main");
    const status = getEncryptionStatus(currentUser);

    component.setProperties({
      model: args.model,
      isEncryptEnabled: status !== ENCRYPT_DISABLED,
      isEncryptActive: status === ENCRYPT_ACTIVE,

      /** Listens for encryption status updates. */
      listener() {
        const newStatus = getEncryptionStatus(currentUser);
        component.setProperties({
          isEncryptEnabled: newStatus !== ENCRYPT_DISABLED,
          isEncryptActive: newStatus === ENCRYPT_ACTIVE,
        });
      },

      didInsertElement() {
        this._super(...arguments);
        this.appEvents.on("encrypt:status-changed", this.listener);
      },

      willDestroyElement() {
        this._super(...arguments);
        this.appEvents.off("encrypt:status-changed", this.listener);
      },

      clicked() {
        this.set("model.showEncryptError", true);
        if (!this.get("model.isEncryptedDisabled")) {
          this.set("model.isEncrypted", !this.get("model.isEncrypted"));
        }
      }
    });

    Ember.defineProperty(
      component,
      "title",
      Ember.computed(
        "model.isEncrypted",
        "model.isEncryptedDisabled",
        () => {
          if (this.model.isEncryptedDisabled) {
            return "encrypt.checkbox.disabled";
          } else if (this.model.isEncrypted) {
            return "encrypt.checkbox.checked";
          } else {
            return "encrypt.checkbox.unchecked";
          }
        }
      )
    );
  }
};

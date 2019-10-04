import { getOwner } from "discourse-common/lib/get-owner";
import { registerHelper } from "discourse-common/lib/helpers";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

// TODO: I believe this should get into core.
// Handlebars offers `if` but no other helpers for conditions, which eventually
// lead to a lot of JavaScript bloat.
registerHelper("or", ([a, b]) => a || b);

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
          isEncryptActive: newStatus === ENCRYPT_ACTIVE
        });
      },

      didInsertElement() {
        this._super(...arguments);
        this.appEvents.on("encrypt:status-changed", this, this.listener);
      },

      willDestroyElement() {
        this._super(...arguments);
        this.appEvents.off("encrypt:status-changed", this, this.listener);
      },

      clicked() {
        this.set("model.showEncryptError", true);
        if (!this.get("model.disableEncryptIndicator")) {
          this.set("model.isEncrypted", !this.get("model.isEncrypted"));
        }
      }
    });

    Ember.defineProperty(
      component,
      "title",
      Ember.computed(
        "model.isEncrypted",
        "model.disableEncryptIndicator",
        () => {
          if (this.model.isEncrypted) {
            return "encrypt.checkbox.checked";
          } else if (this.model.disableEncryptIndicator) {
            return "encrypt.checkbox.disabled";
          } else {
            return "encrypt.checkbox.unchecked";
          }
        }
      )
    );
  }
};

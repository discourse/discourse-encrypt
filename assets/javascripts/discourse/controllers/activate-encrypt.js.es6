import ModalFunctionality from "discourse/mixins/modal-functionality";
import { saveDbIdentity } from "discourse/plugins/discourse-encrypt/lib/database";
import { importIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    const models = this.models || [];
    models.push(this.model);

    this.setProperties({
      models: models,
      passphrase: "",
      error: ""
    });
  },

  onClose() {
    const models = this.models || [];
    models.forEach(model => {
      model.state.decrypting = false;
      model.state.decrypted = true;
      model.scheduleRerender();
    });
    this.set("models", null);
  },

  actions: {
    activate() {
      this.set("inProgress", true);

      const exported = this.currentUser.custom_fields.encrypt_private;
      return importIdentity(exported, this.passphrase)
        .then(identity => saveDbIdentity(identity))
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.models.forEach(model => {
            model.state.decrypting = false;
            model.state.decrypted = false;
            model.scheduleRerender();
          });
          this.set("models", null);
          this.send("closeModal");
          window.location.reload();
        })
        .catch(() =>
          this.set("error", I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() => this.set("inProgress", false));
    }
  }
});

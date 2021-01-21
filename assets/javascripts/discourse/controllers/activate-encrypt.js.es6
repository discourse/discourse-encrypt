import I18n from "I18n";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { activateEncrypt } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    const models = this.models || [];
    models.push(this.model);

    this.setProperties({
      models: models,
      passphrase: "",
      error: "",
    });
  },

  onClose() {
    const models = this.models || [];
    models.forEach((model) => {
      model.state.encryptState = "error";
      model.state.error = I18n.t(
        "encrypt.preferences.status_enabled_but_inactive"
      );
      model.scheduleRerender();
    });
    this.set("models", null);
  },

  actions: {
    activate() {
      this.set("inProgress", true);

      return activateEncrypt(this.currentUser, this.passphrase)
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.models.forEach((model) => {
            model.state.decrypting = true;
            model.state.decrypted = false;
            model.scheduleRerender();
          });
          this.set("models", null);
          this.send("closeModal");
        })
        .catch(() =>
          this.set("error", I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() => this.set("inProgress", false));
    },
  },
});

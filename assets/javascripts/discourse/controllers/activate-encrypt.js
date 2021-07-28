import Controller from "@ember/controller";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { activateEncrypt } from "discourse/plugins/discourse-encrypt/lib/discourse";
import I18n from "I18n";

export default Controller.extend(ModalFunctionality, {
  onShow() {
    const widgets = this.widgets || [];
    widgets.push(this.model.widget);

    this.setProperties({
      widgets,
      passphrase: "",
      error: "",
    });
  },

  onClose() {
    if (!this.widgets) {
      return;
    }

    this.widgets.forEach((widget) => {
      widget.state.encryptState = "error";
      widget.state.error = I18n.t(
        "encrypt.preferences.status_enabled_but_inactive"
      );
      widget.scheduleRerender();
    });
  },

  actions: {
    activate() {
      this.set("inProgress", true);

      return activateEncrypt(this.currentUser, this.passphrase)
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.widgets.forEach((widget) => {
            widget.state.encryptState = "decrypting";
            widget.scheduleRerender();
          });
          this.set("widgets", null);
          this.send("closeModal");
        })
        .catch(() =>
          this.set("error", I18n.t("encrypt.preferences.paper_key_invalid"))
        )
        .finally(() => this.set("inProgress", false));
    },
  },
});

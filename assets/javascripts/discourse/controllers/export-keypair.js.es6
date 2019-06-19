import copyText from "discourse/lib/copy-text";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import {
  exportIdentity,
  importIdentity
} from "discourse/plugins/discourse-encrypt/lib/protocol";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({
      passphrase: "",
      exported: "",
      inProgress: false,
      error: ""
    });
  },

  onClose() {
    this.onShow();
  },

  actions: {
    export() {
      this.set("inProgress", true);

      const userIdentity = this.model.custom_fields.encrypt_private;
      return importIdentity(userIdentity, this.passphrase, true)
        .then(identity => exportIdentity(identity))
        .then(exported => {
          this.setProperties({
            exported,
            inProgress: false,
            error: ""
          });
        })
        .catch(() => {
          this.setProperties({
            inProgress: false,
            error: I18n.t("encrypt.preferences.passphrase_invalid")
          });
        });
    },

    copy() {
      const $copyRange = $("pre.exported-keypair");
      if (copyText("", $copyRange[0])) {
        this.set("copied", true);
        Ember.run.later(() => this.set("copied", false), 2000);
      }
    }
  }
});

import copyText from "discourse/lib/copy-text";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { packIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
import { exportIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({ inProgress: true, exported: "" });

    getIdentity()
      .then(identity => exportIdentity(identity))
      .then(exported => {
        this.setProperties({
          exported: packIdentity(exported.private),
          inProgress: false
        });
      })
      .catch(() => {
        this.setProperties({
          inProgress: false,
          error: I18n.t("encrypt.preferences.passphrase_invalid")
        });
      });
  },

  onClose() {
    this.setProperties({ inProgress: false, exported: "" });
  },

  actions: {
    copy() {
      const $copyRange = $("pre.exported-key-pair");
      if (copyText("", $copyRange[0])) {
        this.set("copied", true);
        Ember.run.later(() => this.set("copied", false), 2000);
      }
    }
  }
});

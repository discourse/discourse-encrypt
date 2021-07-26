import Controller from "@ember/controller";
import { later } from "@ember/runloop";
import copyText from "discourse/lib/copy-text";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { packIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
import { exportIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";
import I18n from "I18n";

export default Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({ inProgress: true, exported: "" });

    getIdentity()
      .then((identity) => exportIdentity(identity))
      .then((exported) => {
        this.setProperties({
          exported: packIdentity(exported.private),
          inProgress: false,
        });
      })
      .catch(() => {
        this.setProperties({
          inProgress: false,
          error: I18n.t("encrypt.preferences.paper_key_invalid"),
        });
      });
  },

  onClose() {
    this.setProperties({ inProgress: false, exported: "" });
  },

  actions: {
    copy() {
      const copyRange = document.querySelector("pre.exported-key-pair");
      if (copyText("", copyRange)) {
        this.set("copied", true);
        later(() => this.set("copied", false), 2000);
      }
    },
  },
});

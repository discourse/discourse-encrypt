import Controller from "@ember/controller";
import { ajax } from "discourse/lib/ajax";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { generatePaperKey } from "discourse/plugins/discourse-encrypt/lib/paper-key";
import { exportIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";

export default Controller.extend(ModalFunctionality, {
  onShow() {
    this.set("inProgress", true);
    const paperKey = generatePaperKey();
    const label = this.model.device
      ? "device"
      : "paper_" + paperKey.substr(0, paperKey.indexOf(" ")).toLowerCase();

    getIdentity()
      .then((identity) => exportIdentity(identity, paperKey))
      .then((exported) => {
        this.set("paperKey", paperKey);

        return ajax("/encrypt/keys", {
          type: "PUT",
          data: {
            public: exported.public,
            private: exported.private,
            label: label,
          },
        });
      })
      .finally(() => this.set("inProgress", false));
  },

  onClose() {
    this.setProperties({
      paperKey: "",
      inProgress: false,
    });
  },
});

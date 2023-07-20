import Controller from "@ember/controller";
import { inject as service } from "@ember/service";
import discourseComputed from "discourse-common/utils/decorators";
import { ajax } from "discourse/lib/ajax";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import GeneratePaperKey from "../components/modal/generate-paper-key";

export default Controller.extend(ModalFunctionality, {
  modal: service(),

  @discourseComputed("model.encrypt_private")
  keys() {
    const keys = [];
    if (this.model.encrypt_private) {
      const privateKeys = JSON.parse(this.model.encrypt_private);
      Object.keys(privateKeys).forEach((label) => {
        if (label.startsWith("paper_")) {
          keys.push({
            isPaper: true,
            label,
            name: label.substr("paper_".length),
          });
        } else if (label === "passphrase") {
          keys.unshift({
            isPassphrase: true,
            label: "passphrase",
          });
        }
      });
    }
    return keys;
  },

  actions: {
    generatePaperKey() {
      this.modal.show(GeneratePaperKey, {
        model: { device: false },
      });
    },

    delete(label) {
      return ajax("/encrypt/keys", {
        type: "DELETE",
        data: { label },
      });
    },
  },
});

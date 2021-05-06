import discourseComputed from "discourse-common/utils/decorators";
import { ajax } from "discourse/lib/ajax";
import showModal from "discourse/lib/show-modal";
import ModalFunctionality from "discourse/mixins/modal-functionality";

export default Ember.Controller.extend(ModalFunctionality, {
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
      showModal("generate-paper-key", {
        model: {
          user: this.model,
          device: false,
        },
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

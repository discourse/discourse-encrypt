import { ajax } from "discourse/lib/ajax";
import showModal from "discourse/lib/show-modal";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import computed from "ember-addons/ember-computed-decorators";

export default Ember.Controller.extend(ModalFunctionality, {
  @computed("model.custom_fields.encrypt_private")
  keys() {
    const keys = [];
    if (this.model.custom_fields.encrypt_private) {
      const privateKeys = JSON.parse(this.model.custom_fields.encrypt_private);
      Object.keys(privateKeys).forEach(label => {
        if (label.startsWith("paper_")) {
          keys.push({
            isPaper: true,
            label,
            name: label.substr("paper_".length)
          });
        } else if (label === "passphrase") {
          keys.unshift({
            isPassphrase: true,
            label: "passphrase"
          });
        }
      });
    }
    return keys;
  },

  actions: {
    generatePaperKey() {
      showModal("generate-paperkey", {
        model: {
          user: this.model,
          device: false
        }
      });
    },

    delete(label) {
      return ajax("/encrypt/keys", {
        type: "DELETE",
        data: { label }
      }).then(() => {
        const privateKeys = this.model.custom_fields.encrypt_private
          ? JSON.parse(this.model.custom_fields.encrypt_private)
          : {};
        delete privateKeys[label];
        this.set(
          "model.custom_fields.encrypt_private",
          JSON.stringify(privateKeys)
        );
      });
    }
  }
});

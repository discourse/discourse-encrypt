import { ajax } from "discourse/lib/ajax";
import showModal from "discourse/lib/show-modal";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import computed from "ember-addons/ember-computed-decorators";

export default Ember.Controller.extend(ModalFunctionality, {
  @computed("model.custom_fields.encrypt_private")
  labels() {
    const labels = [];
    if (this.model.custom_fields.encrypt_private) {
      const privateKeys = JSON.parse(this.model.custom_fields.encrypt_private);
      Object.keys(privateKeys).forEach(key => {
        if (key.startsWith("paper_")) {
          labels.push(key.substr("paper_".length));
        }
      });
    }
    return labels;
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

    delete(firstWord) {
      const label = "paper_" + firstWord.toLowerCase();
      ajax("/encrypt/keys", {
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

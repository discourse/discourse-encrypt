import Component from "@glimmer/component";
import { inject as service } from "@ember/service";
import { action } from "@ember/object";
import { ajax } from "discourse/lib/ajax";
import GeneratePaperKey from "./generate-paper-key";
import { isTesting } from "discourse-common/config/environment";

export default class ManagePaperKeys extends Component {
  @service modal;

  get keys() {
    if (!this.args.model.encrypt_private) {
      return [];
    }

    const privateKeys = JSON.parse(this.args.model.encrypt_private);
    const keys = [];

    for (const label of Object.keys(privateKeys)) {
      if (label.startsWith("paper_")) {
        keys.push({
          isPaper: true,
          label,
          name: label.substring("paper_".length),
        });
      } else if (label === "passphrase") {
        keys.unshift({
          isPassphrase: true,
          label: "passphrase",
        });
      }
    }

    return keys;
  }

  @action
  generatePaperKey() {
    this.modal.show(GeneratePaperKey, {
      model: { device: false },
    });
  }

  @action
  async delete(label) {
    await ajax("/encrypt/keys", {
      type: "DELETE",
      data: { label },
    });

    if (!isTesting()) {
      window.location.reload();
    }
  }
}
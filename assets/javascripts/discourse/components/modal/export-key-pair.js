import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { later } from "@ember/runloop";
import copyText from "discourse/lib/copy-text";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { packIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
import { exportIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";
import I18n from "I18n";

export default class ExportKeyPair extends Component {
  @tracked inProgress = true;
  @tracked exported = "";
  @tracked copied;
  @tracked error;

  async export() {
    try {
      const identity = await getIdentity();
      const exported = await exportIdentity(identity);
      this.exported = packIdentity(exported.private);
      this.inProgress = false;
    } catch {
      this.inProgress = false;
      this.error = I18n.t("encrypt.preferences.paper_key_invalid");
    }
  }

  @action
  copy() {
    const copyRange = document.querySelector("pre.exported-key-pair");

    if (copyText("", copyRange)) {
      this.copied = true;
      later(() => (this.copied = false), 2000);
    }
  }
}

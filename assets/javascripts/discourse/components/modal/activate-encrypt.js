import Component from "@glimmer/component";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { activateEncrypt } from "discourse/plugins/discourse-encrypt/lib/discourse";
import I18n from "I18n";

export default class ActivateEncrypt extends Component {
  @service currentUser;
  @service appEvents;
  @service encryptWidgetStore;

  @tracked inProgress = false;
  @tracked passphrase;
  @tracked error;

  @action
  async activate() {
    this.inProgress = true;

    try {
      await activateEncrypt(this.currentUser, this.passphrase);

      this.appEvents.trigger("encrypt:status-changed");

      for (const widget of this.encryptWidgetStore.widgets) {
        widget.state.encryptState = "decrypting";
        widget.scheduleRerender();
      }

      this.encryptWidgetStore.reset();
      this.args.closeModal();
    } catch (e) {
      this.error = I18n.t("encrypt.preferences.paper_key_invalid");
    } finally {
      this.inProgress = false;
    }
  }

  @action
  close() {
    for (const widget of this.encryptWidgetStore.widgets) {
      widget.state.encryptState = "error";
      widget.state.error = I18n.t(
        "encrypt.preferences.status_enabled_but_inactive"
      );
      widget.scheduleRerender();
    }

    this.encryptWidgetStore.reset();
    this.args.closeModal();
  }
}

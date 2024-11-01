import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didUpdate from "@ember/render-modifiers/modifiers/did-update";
import { service } from "@ember/service";
import DButton from "discourse/components/d-button";
import DModal from "discourse/components/d-modal";
import i18n from "discourse-common/helpers/i18n";
import {
  ENCRYPT_DISABLED,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import PermanentTopicDecrypter from "discourse/plugins/discourse-encrypt/lib/permanent-topic-decrypter";

export default class DecryptTopicButton extends Component {
  @service modal;
  @service currentUser;
  @service siteSettings;

  @action
  openDecryptModal() {
    this.modal.show(DecryptTopicModal, {
      model: { topic_id: this.args.outletArgs.model.id },
    });
  }

  get canDecrypt() {
    return (
      this.args.outletArgs.model.encrypted_title &&
      this.currentUser &&
      getEncryptionStatus(this.currentUser) !== ENCRYPT_DISABLED &&
      this.siteSettings.allow_decrypting_pms
    );
  }

  <template>
    {{#if this.canDecrypt}}
      <DButton
        @action={{this.openDecryptModal}}
        @label="encrypt.decrypt_permanently.button"
        @icon="unlock"
        class="decrypt-topic-button"
      />
    {{/if}}
  </template>
}

class DecryptTopicModal extends Component {
  @service router;

  @tracked running = false;
  @tracked done = false;

  @tracked logContent = "";

  @action
  async decryptTopic() {
    this.running = true;

    const decrypter = new PermanentTopicDecrypter(
      this.args.model.topic_id,
      this.log
    );

    try {
      await decrypter.run();
      this.log("Refresh page to continue");
      this.done = true;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      this.running = false;
    }
  }

  @action
  log(msg) {
    this.logContent += msg + "\n";
  }

  @action
  scrollBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  @action
  refresh() {
    window.location.reload();
  }

  <template>
    <DModal
      @closeModal={{if this.done this.refresh @closeModal}}
      @title={{i18n "encrypt.decrypt_permanently.modal_title"}}
      class="decrypt-topic-modal"
    >
      <:body>
        {{#if this.logContent}}
          <pre
            style="width: 100%; height: 200px; overflow-y: scroll;"
            {{didUpdate this.scrollBottom this.logContent}}
          >{{this.logContent}}</pre>
        {{else}}
          <p>{{i18n "encrypt.decrypt_permanently.modal_body"}}</p>
        {{/if}}
      </:body>
      <:footer>
        {{#if this.done}}
          <DButton
            @label="encrypt.decrypt_permanently.refresh_page"
            class="btn-primary"
            @action={{this.refresh}}
          />
        {{else}}
          <DButton
            @label="encrypt.decrypt_permanently.modal_cancel"
            @action={{@closeModal}}
            disabled={{this.running}}
          />
          <DButton
            @label="encrypt.decrypt_permanently.modal_confirm"
            class="btn-primary"
            @action={{this.decryptTopic}}
            disabled={{this.running}}
            @isLoading={{this.running}}
          />
        {{/if}}
      </:footer>
    </DModal>
  </template>
}

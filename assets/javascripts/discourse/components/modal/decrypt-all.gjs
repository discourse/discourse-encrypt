import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import didUpdate from "@ember/render-modifiers/modifiers/did-update";
import { TrackedMap } from "@ember-compat/tracked-built-ins";
import { or } from "truth-helpers";
import DButton from "discourse/components/d-button";
import DModal from "discourse/components/d-modal";
import { ajax } from "discourse/lib/ajax";
import i18n from "discourse-common/helpers/i18n";
import { putTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";
import PermanentTopicDecrypter from "discourse/plugins/discourse-encrypt/lib/permanent-topic-decrypter";

export default class DecryptAllModal extends Component {
  @tracked running = false;
  @tracked done = false;

  @tracked loadingTopics = true;
  @tracked topics;

  @tracked successCount = 0;
  @tracked errorCount = 0;
  @tracked doneCount = 0;

  @tracked logContent = "";

  requestStop = false;

  decrypters = new TrackedMap();

  constructor() {
    super(...arguments);
    this.loadTopicsList();
  }

  async loadTopicsList() {
    try {
      this.topics = (await ajax("/encrypt/list.json")).topics;
    } finally {
      this.loadingTopics = false;
    }
  }

  get topicCount() {
    if (this.topics) {
      return Object.keys(this.topics).length;
    }
  }

  @action
  async decryptTopics() {
    this.running = true;
    this.doneCount = 0;
    this.successCount = 0;
    this.errorCount = 0;

    for (const [topicId, topicKey] of Object.entries(this.topics)) {
      if (this.requestStop) {
        break;
      }
      putTopicKey(topicId, topicKey);
      const decrypter = new PermanentTopicDecrypter(topicId);
      this.decrypters.set(topicId, decrypter);

      try {
        await decrypter.run();
        this.successCount++;
      } catch (e) {
        // throw e;
        this.errorCount++;
      }
      this.doneCount++;
    }
    this.running = false;
    this.done = true;
  }

  @action
  scrollBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  @action
  cancel() {
    if (this.running) {
      this.requestStop = true;
    } else {
      this.args.closeModal();
    }
  }

  <template>
    <DModal
      @closeModal={{this.cancel}}
      @title={{i18n "encrypt.decrypt_all.modal_title"}}
      class="decrypt-all-modal"
    >
      <:body>
        {{#if (or this.running this.done)}}
          Processing
          {{this.doneCount}}
          of
          {{this.topicCount}}
          ({{this.successCount}}
          success,
          {{this.errorCount}}
          errors)

          {{#each-in this.decrypters as |topicId decrypter|}}
            {{! template-lint-disable no-nested-interactive }}
            <details open={{decrypter.running}}>
              <summary>
                {{#if decrypter.error}}
                  ❌
                {{else if decrypter.success}}
                  ✅
                {{else}}
                  ⏳
                {{/if}}

                topic
                <a
                  href="/t/{{decrypter.topicId}}"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{decrypter.topicId}}</a>
                {{#if decrypter.topicTitle}}
                  -
                  {{decrypter.topicTitle}}
                {{/if}}

              </summary>
              <pre
                style="width: 100%; height: 200px; overflow-y: scroll;"
                {{didUpdate this.scrollBottom decrypter.logContent}}
              >{{decrypter.logContent}}</pre>
            </details>
          {{/each-in}}
        {{else}}
          <p>{{i18n "encrypt.decrypt_all.modal_body"}}</p>
          {{#if this.loadingTopics}}
            <p>{{i18n "encrypt.decrypt_all.modal_loading"}}</p>
          {{else}}
            <p>{{i18n
                "encrypt.decrypt_all.modal_count"
                count=this.topicCount
              }}</p>
          {{/if}}
        {{/if}}
      </:body>
      <:footer>
        {{#if this.done}}
          <DButton
            @label="encrypt.decrypt_all.done"
            class="btn-primary"
            @action={{@closeModal}}
          />
        {{else}}
          <DButton
            @label="encrypt.decrypt_all.modal_cancel"
            @action={{this.cancel}}
          />
          <DButton
            @label="encrypt.decrypt_all.modal_confirm"
            class="btn-primary"
            @action={{this.decryptTopics}}
            disabled={{this.running}}
            @isLoading={{this.running}}
          />
        {{/if}}
      </:footer>
    </DModal>
  </template>
}

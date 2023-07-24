import Component from "@glimmer/component";
import { inject as service } from "@ember/service";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import { saveDbIdentity } from "discourse/plugins/discourse-encrypt/lib/database";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  exportIdentity,
  exportKey,
  generateIdentity,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";

export default class RotateKeyPair extends Component {
  @service currentUser;
  @service appEvents;

  @tracked confirmation = "";
  @tracked loadingState;
  @tracked error;

  get label() {
    return this.loadingState
      ? `encrypt.rotate.loading_states.${this.loadingState}`
      : "encrypt.rotate.title";
  }

  get disabled() {
    return this.loadingState || this.currentUser.username !== this.confirmation;
  }

  @action
  async rotate() {
    this.loadingState = "fetching";
    this.error = null;

    try {
      // eslint-disable-next-line no-restricted-globals
      const [data, oldIdentity, newIdentity] = await Promise.all([
        ajax("/encrypt/rotate"),
        getIdentity(),
        generateIdentity(),
      ]);
      this.loadingState = "rotating";

      // Rotating signatures will invalidate all previous signatures.
      newIdentity.signPublic = oldIdentity.signPublic;
      newIdentity.signPrivate = oldIdentity.signPrivate;

      const topicKeys = {};
      // eslint-disable-next-line no-restricted-globals
      await Promise.all(
        Object.entries(data.topic_keys).map(async ([topicId, topicKey]) => {
          const key = await importKey(topicKey, oldIdentity.encryptPrivate);
          topicKeys[topicId] = exportKey(key, newIdentity.encryptPublic);
        })
      );

      const exportedIdentity = await exportIdentity(newIdentity);

      this.loadingState = "saving";
      await ajax("/encrypt/rotate", {
        type: "PUT",
        data: {
          public: exportedIdentity.public,
          keys: topicKeys,
        },
      });

      this.loadingState = "updating";
      await saveDbIdentity(newIdentity);

      this.loadingState = "finished";
      this.appEvents.trigger("encrypt:status-changed");
    } catch (error) {
      this.confirmation = "";
      this.loadingState = null;
      this.error = extractError(error);
    }
  }
}

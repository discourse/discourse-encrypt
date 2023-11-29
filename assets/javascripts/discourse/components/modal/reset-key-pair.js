import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { action } from "@ember/object";
import { inject as service } from "@ember/service";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";

export default class ResetKeyPair extends Component {
  @service currentUser;
  @service appEvents;

  @tracked isLoadingStats = true;
  @tracked inProgress = false;
  @tracked encryptedPmsCount;
  @tracked confirmation = "";

  get disabled() {
    return (
      this.isLoadingStats ||
      this.inProgress ||
      (this.encryptedPmsCount > 0 &&
        this.currentUser.username !== this.confirmation)
    );
  }

  @action
  async loadStats() {
    try {
      const result = await ajax("/encrypt/stats", {
        data: { user_id: this.args.model.user.id },
      });

      if (result.encrypted_pms_count > 0) {
        this.encryptedPmsCount = result.encrypted_pms_count;
      }
    } finally {
      this.isLoadingStats = false;
    }
  }

  @action
  async reset() {
    this.inProgress = true;

    try {
      // eslint-disable-next-line no-restricted-globals
      await Promise.all([
        ajax("/encrypt/reset", {
          type: "POST",
          data: { user_id: this.args.model.user.id },
        }),
        deleteDb,
      ]);

      this.currentUser.setProperties({
        encrypt_public: null,
        encrypt_private: null,
      });

      this.appEvents.trigger("encrypt:status-changed");
      this.args.closeModal();
    } catch (error) {
      popupAjaxError(error);
    } finally {
      this.inProgress = false;
    }
  }
}

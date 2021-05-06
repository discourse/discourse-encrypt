import discourseComputed from "discourse-common/utils/decorators";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import { Promise } from "rsvp";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({
      isLoadingStats: true,
      inProgress: false,
      encryptedPmsCount: null,
      confirmation: "",
    });

    ajax("/encrypt/stats", { data: { user_id: this.get("model.id") } })
      .then((result) => {
        if (result.encrypted_pms_count > 0) {
          this.set("encryptedPmsCount", result.encrypted_pms_count);
        }
      })
      .finally(() => {
        this.set("isLoadingStats", false);
      });
  },

  @discourseComputed(
    "isLoadingStats",
    "inProgress",
    "encryptedPmsCount",
    "currentUser.username",
    "confirmation"
  )
  disabled(
    isLoadingStats,
    inProgress,
    encryptedPmsCount,
    username,
    confirmation
  ) {
    return (
      isLoadingStats ||
      inProgress ||
      (encryptedPmsCount && encryptedPmsCount > 0 && username !== confirmation)
    );
  },

  actions: {
    reset() {
      this.set("inProgress", true);

      Promise.all([
        ajax("/encrypt/reset", {
          type: "POST",
          data: { user_id: this.get("model.id") },
        }),
        deleteDb,
      ])
        .then(() => {
          this.currentUser.setProperties({
            encrypt_public: null,
            encrypt_private: null,
          });

          this.appEvents.trigger("encrypt:status-changed");
          this.send("closeModal");
        })
        .catch(popupAjaxError)
        .finally(() => {
          this.set("inProgress", false);
        });
    },
  },
});

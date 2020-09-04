import discourseComputed from "discourse-common/utils/decorators";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import { Promise } from "rsvp";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({
      inProgress: false,
      everything: true,
      confirmation: "",
    });
  },

  @discourseComputed("inProgress", "currentUser.username", "confirmation")
  disabled(inProgress, username, confirmation) {
    return inProgress || username !== confirmation;
  },

  actions: {
    reset() {
      this.set("inProgress", true);

      Promise.all([
        ajax("/encrypt/reset", {
          type: "POST",
          data: {
            user_id: this.get("model.id"),
            everything: this.everything,
          },
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

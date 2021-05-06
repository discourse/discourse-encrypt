import I18n from "I18n";
import { getOwner } from "discourse-common/lib/get-owner";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  setupComponent(args, component) {
    const currentUser = getOwner(component).lookup("current-user:main");
    const status = getEncryptionStatus(currentUser, component.siteSettings);

    component.setProperties({
      isEncryptEnabled: status !== ENCRYPT_DISABLED,
      isEncryptActive: status === ENCRYPT_ACTIVE,

      /** Listens for encryption status updates. */
      listener() {
        const newStatus = getEncryptionStatus(
          currentUser,
          component.siteSettings
        );
        component.setProperties({
          isEncryptEnabled: newStatus !== ENCRYPT_DISABLED,
          isEncryptActive: newStatus === ENCRYPT_ACTIVE,
        });
      },

      didInsertElement() {
        this._super(...arguments);
        this.appEvents.on("encrypt:status-changed", this, this.listener);
      },

      willDestroyElement() {
        this._super(...arguments);
        this.appEvents.off("encrypt:status-changed", this, this.listener);
      },

      clicked() {
        if (!this.disabled) {
          this.model.setProperties({
            isEncrypted: !this.model.isEncrypted,
            isEncryptedChanged: true,
            showEncryptError: !this.model.isEncrypted,
            deleteAfterMinutes: null,
            deleteAfterMinutesLabel: null,
          });
        } else {
          this.model.set("showEncryptError", !this.model.showEncryptError);
        }
      },
    });

    Ember.defineProperty(
      component,
      "showEncryptControls",
      Ember.computed(
        "model.isNew",
        "model.creatingPrivateMessage",
        "model.topic.encrypted_title",
        () => {
          return (
            (this.model.isNew && this.model.creatingPrivateMessage) ||
            (this.model.topic && this.model.topic.encrypted_title)
          );
        }
      )
    );

    // Whether the user can encrypt the current message or not.
    //
    // This is true usually when an encrypt error is set:
    //  - the user does not have a key for the current topic
    //  - one of the recipients is a group
    //  - one of the recipients did not enable encrypt
    Ember.defineProperty(
      component,
      "canEncrypt",
      Ember.computed("model.encryptError", () => {
        return !this.model.encryptError;
      })
    );

    // Whether the user can disable encryption for the current message or not.
    //
    // A user cannot disable encryption when replying to an already encrypted
    // private message.
    Ember.defineProperty(
      component,
      "canDisableEncrypt",
      Ember.computed("model.topic.encrypted_title", () => {
        return !(this.model.topic && this.model.topic.encrypted_title);
      })
    );

    // Whether the encryption checkbox is disabled or not.
    Ember.defineProperty(
      component,
      "disabled",
      Ember.computed(
        "model.isEncrypted",
        "canEncrypt",
        "canDisableEncrypt",
        () => {
          return this.model.isEncrypted
            ? !this.canDisableEncrypt
            : !this.canEncrypt;
        }
      )
    );

    Ember.defineProperty(
      component,
      "title",
      Ember.computed("model.isEncrypted", "model.encryptError", () => {
        if (this.model.encryptError) {
          return this.model.encryptError;
        } else if (this.model.isEncrypted) {
          return I18n.t("encrypt.checkbox.checked");
        } else {
          return I18n.t("encrypt.checkbox.unchecked");
        }
      })
    );
  },

  actions: {
    timerClicked(actionId, { name }) {
      if (actionId) {
        this.model.setProperties({
          deleteAfterMinutes: actionId,
          deleteAfterMinutesLabel: name,
        });
      } else {
        this.model.setProperties({
          deleteAfterMinutes: null,
          deleteAfterMinutesLabel: null,
        });
      }
    },
  },
};

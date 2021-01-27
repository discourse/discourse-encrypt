import showModal from "discourse/lib/show-modal";
import User from "discourse/models/user";
import {
  deleteDb,
  saveDbIdentity,
} from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  activateEncrypt,
  canEnableEncrypt,
  enableEncrypt,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { unpackIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
import { importIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";
import I18n from "I18n";

export default {
  setupComponent(args, component) {
    const currentUser = User.current();
    const isCurrentUser = args.model.id === currentUser.id;

    component.setProperties({
      /** crypto.subtle is only available in secure contexts. */
      isInsecureContext: !window.isSecureContext,
      /** Not all algorithms are available in IE11. */
      isIE11: this.capabilities.isIE11,
      /** Whether current user is the same as model user. */
      isCurrentUser,
      /** Whether plugin is enabled for current user. */
      canEnableEncrypt: canEnableEncrypt(args.model),
      /** Whether the encryption is enabled or not. */
      isEncryptEnabled: !!args.model.encrypt_public,
    });

    if (isCurrentUser) {
      const status = getEncryptionStatus(args.model);
      component.setProperties({
        /** Value of passphrase input.
         *  It should stay in memory for as little time as possible.
         *  Clear it often.
         */
        passphrase: "",
        /** Whether it is an import operation. */
        importIdentity: false,
        /** Key to be imported .*/
        identity: "",
        /** Whether any operation (AJAX request, key generation, etc.) is
         *  in progress. */
        inProgress: false,
        /** Whether the encryption is enabled or not. */
        isEncryptEnabled: status !== ENCRYPT_DISABLED,
        /** Whether the encryption is active on this device. */
        isEncryptActive: status === ENCRYPT_ACTIVE,
        /** Listens for encryption status updates. */
        listener() {
          const newStatus = getEncryptionStatus(args.model);
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
      });
    }
  },

  actions: {
    enableEncrypt() {
      this.set("inProgress", true);

      return enableEncrypt(this.model, this.importIdentity && this.identity)
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
        })
        .catch(() =>
          bootbox.alert(I18n.t("encrypt.preferences.key_pair_invalid"))
        )
        .finally(() => {
          this.setProperties({
            passphrase: "",
            inProgress: false,
            importIdentity: false,
            identity: "",
          });
        });
    },

    activateEncrypt() {
      this.set("inProgress", true);

      const identityPromise = this.importIdentity
        ? importIdentity(unpackIdentity(this.identity)).then((identity) =>
            saveDbIdentity(identity)
          )
        : activateEncrypt(this.model, this.passphrase);

      return identityPromise
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
        })
        .catch(() => {
          if (this.importIdentity) {
            bootbox.alert(I18n.t("encrypt.preferences.key_pair_invalid"));
          } else {
            bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"));
          }
        })
        .finally(() =>
          this.setProperties({
            passphrase: "",
            inProgress: false,
            importIdentity: false,
            identity: "",
          })
        );
    },

    deactivateEncrypt() {
      this.setProperties("inProgress", true);

      deleteDb()
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
        })
        .finally(() => this.set("inProgress", false));
    },

    generatePaperKey(device) {
      showModal("generate-paper-key", {
        model: {
          user: this.model,
          device,
        },
      });
    },

    selectEncryptPreferencesDropdownAction(actionId) {
      switch (actionId) {
        case "export":
          showModal("export-key-pair", { model: this.model });
          break;
        case "managePaperKeys":
          showModal("manage-paper-keys", { model: this.model });
          break;
        case "reset":
          showModal("reset-key-pair", { model: this.model });
          break;
      }
    },

    selectEncryptEnableDropdownAction(actionId) {
      switch (actionId) {
        case "import":
          this.toggleProperty("importIdentity");
          break;
        case "reset":
          showModal("reset-key-pair", { model: this.model });
          break;
      }
    },
  },
};

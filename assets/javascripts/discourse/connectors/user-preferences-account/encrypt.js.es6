import { ajax } from "discourse/lib/ajax";
import showModal from "discourse/lib/show-modal";
import User from "discourse/models/user";
import {
  deleteDb,
  saveDbIdentity
} from "discourse/plugins/discourse-encrypt/lib/database";
import {
  activateEncrypt,
  canEnableEncrypt,
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  reload
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { unpackIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
import {
  exportIdentity,
  generateIdentity,
  importIdentity
} from "discourse/plugins/discourse-encrypt/lib/protocol";

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
      isEncryptEnabled: !!args.model.get("custom_fields.encrypt_public")
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
            isEncryptActive: newStatus === ENCRYPT_ACTIVE
          });
        },
        didInsertElement() {
          this._super(...arguments);
          this.appEvents.on("encrypt:status-changed", this, this.listener);
        },
        willDestroyElement() {
          this._super(...arguments);
          this.appEvents.off("encrypt:status-changed", this, this.listener);
        }
      });
    }
  },

  actions: {
    enableEncrypt() {
      this.set("inProgress", true);

      const identityPromise = this.importIdentity
        ? importIdentity(unpackIdentity(this.identity))
        : generateIdentity();

      const saveIdentityPromise = identityPromise
        .then(identity => exportIdentity(identity))
        .then(exported => {
          this.set("model.custom_fields.encrypt_public", exported.public);
          return ajax("/encrypt/keys", {
            type: "PUT",
            data: {
              public: exported.public
            }
          });
        });

      const saveDbIdentityPromise = identityPromise
        .then(identity => saveDbIdentity(identity))
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          reload();
        })
        .finally(() => {
          this.setProperties({
            passphrase: "",
            inProgress: false,
            importIdentity: false,
            identity: ""
          });
        });

      return Ember.RSVP.Promise.all([
        saveIdentityPromise,
        saveDbIdentityPromise
      ]);
    },

    activateEncrypt() {
      this.set("inProgress", true);

      const identityPromise = this.importIdentity
        ? importIdentity(unpackIdentity(this.identity)).then(identity =>
            saveDbIdentity(identity)
          )
        : activateEncrypt(this.model, this.passphrase);

      return identityPromise
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          reload();
        })
        .catch(() =>
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() =>
          this.setProperties({
            passphrase: "",
            inProgress: false,
            importIdentity: false,
            identity: ""
          })
        );
    },

    changeEncrypt() {
      this.set("inProgress", true);

      const oldIdentity = this.model.custom_fields.encrypt_private;
      return importIdentity(oldIdentity, this.oldPassphrase)
        .then(identity => exportIdentity(identity, this.passphrase))
        .then(exported => {
          this.set("model.custom_fields.encrypt_public", exported.public);
          this.set("model.custom_fields.encrypt_private", exported.private);
          return ajax("/encrypt/keys", {
            type: "PUT",
            data: {
              public: exported.public,
              private: exported.private
            }
          });
        })
        .then(() => this.set("passphrase", ""))
        .catch(() =>
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() => this.set("inProgress", false));
    },

    deactivateEncrypt() {
      this.setProperties("inProgress", true);

      deleteDb()
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          reload();
        })
        .finally(() => this.set("inProgress", false));
    },

    export() {
      showModal("export-keypair", { model: this.model });
    },

    reset() {
      showModal("reset-keypair", { model: this.model });
    },

    generatePaperKey(device) {
      showModal("generate-paperkey", {
        model: {
          user: this.model,
          device
        }
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
      }
    }
  }
};

import { registerHelper } from "discourse-common/lib/helpers";
import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import showModal from "discourse/lib/show-modal";
import {
  deleteDb,
  saveDbIdentity
} from "discourse/plugins/discourse-encrypt/lib/database";
import {
  canEnableEncrypt,
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  exportIdentity,
  generateIdentity,
  importIdentity
} from "discourse/plugins/discourse-encrypt/lib/protocol";

// TODO: I believe this should get into core.
// Handlebars offers `if` but no other helpers for conditions, which eventually
// lead to a lot of JavaScript bloat.
registerHelper("or", ([a, b]) => a || b);

export default {
  setupComponent(args, component) {
    const currentUser = Discourse.User.current();
    if (args.model.id === currentUser.id) {
      const status = getEncryptionStatus(args.model);
      component.setProperties({
        model: args.model,
        /** @var Value of passphrase input (old, current and retyped).
         *       It should stay in memory for as little time as possible.
         *       Clear it often.
         */
        oldPassphrase: "",
        passphrase: "",
        passphrase2: "",
        /** @var Whether the passphrase input is shown. */
        passphraseInput: false,
        /** @var Whether any operation (AJAX request, key generation, etc.) is
         *       in progress. */
        inProgress: false,
        /** @var Whether current user is the same as model user. */
        isCurrentUser: true,
        /** @var Whether plugin is enabled for current user. */
        canEnableEncrypt: canEnableEncrypt(args.model),
        /** @var Whether the encryption is enabled or not. */
        isEncryptEnabled: status !== ENCRYPT_DISABLED,
        /** @var Whether the encryption is active on this device. */
        isEncryptActive: status === ENCRYPT_ACTIVE,
        /** @var Whether it is an import operation. */
        importKey: false,
        /** @var Key to be imported .*/
        key: "",
        /** Listens for encryptino status updates. */
        listener() {
          const newStatus = getEncryptionStatus(args.model);
          component.setProperties({
            isEncryptEnabled: newStatus !== ENCRYPT_DISABLED,
            isEncryptActive: newStatus === ENCRYPT_ACTIVE
          });
        },
        didInsertElement() {
          this._super(...arguments);
          this.appEvents.on("encrypt:status-changed", this.listener);
        },
        willDestroyElement() {
          this._super(...arguments);
          this.appEvents.off("encrypt:status-changed", this.listener);
        }
      });
      Ember.defineProperty(
        component,
        "passphraseStatus",
        Ember.computed("passphrase", "passphrase2", function() {
          const passphrase = component.passphrase;
          const passphrase2 = component.passphrase2;
          if (!passphrase) {
            return "encrypt.preferences.passphrase_enter";
          } else if (passphrase.length < 15) {
            return "encrypt.preferences.passphrase_insecure";
          } else if (passphrase !== passphrase2) {
            return "encrypt.preferences.passphrase_mismatch";
          }
        })
      );
    } else {
      component.setProperties({
        model: args.model,
        isCurrentUser: false,
        canEnableEncrypt: canEnableEncrypt(args.model),
        isEncryptEnabled: !!args.model.get("custom_fields.encrypt_public_key")
      });
    }
  },

  actions: {
    showPassphraseInput() {
      this.setProperties({
        passphrase: "",
        passphrase2: "",
        oldPassphrase: "",
        passphraseInput: true
      });
    },

    hidePassphraseInput() {
      this.setProperties({
        passphrase: "",
        passphrase2: "",
        oldPassphrase: "",
        passphraseInput: false
      });
    },

    enableEncrypt() {
      this.set("inProgress", true);

      const identityPromise = this.importKey
        ? importIdentity(this.key)
        : generateIdentity();

      const saveIdentityPromise = identityPromise
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
        });

      return Ember.RSVP.Promise.all([
        identityPromise
          .then(identity => exportIdentity(identity))
          .then(exported => importIdentity(exported)),
        saveIdentityPromise
      ])
        .then(results => saveDbIdentity(results[0]))
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          window.location.reload();
        })
        .catch(popupAjaxError)
        .finally(() => {
          this.send("hidePassphraseInput");
          this.setProperties({
            inProgress: false,
            importKey: false,
            key: ""
          });
        });
    },

    activateEncrypt() {
      this.set("inProgress", true);

      const exported = this.model.custom_fields.encrypt_private;
      return importIdentity(exported, this.passphrase)
        .then(identity => saveDbIdentity(identity))
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.send("hidePassphraseInput");
          window.location.reload();
        })
        .catch(() =>
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() => this.set("inProgress", false));
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
        .then(() => this.send("hidePassphraseInput"))
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
          window.location.reload();
        })
        .finally(() => this.set("inProgress", false));
    },

    export() {
      showModal("export-keypair").set("model", this.model);
    },

    reset() {
      showModal("reset-keypair").set("model", this.model);
    }
  }
};

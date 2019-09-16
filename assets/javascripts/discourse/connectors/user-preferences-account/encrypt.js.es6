import { registerHelper } from "discourse-common/lib/helpers";
import { ajax } from "discourse/lib/ajax";
import showModal from "discourse/lib/show-modal";
import {
  deleteDb,
  saveDbIdentity
} from "discourse/plugins/discourse-encrypt/lib/database";
import {
  activateEncrypt,
  canEnableEncrypt,
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { unpackIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
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
        passphrase: "",
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
        importIdentity: false,
        /** @var Key to be imported .*/
        identity: "",
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
          window.location.reload();
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

      return activateEncrypt(this.model, this.passphrase)
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.set("passphrase", "");
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
          window.location.reload();
        })
        .finally(() => this.set("inProgress", false));
    },

    export() {
      showModal("export-keypair").set("model", this.model);
    },

    reset() {
      showModal("reset-keypair").set("model", this.model);
    },

    generatePaperKey(device) {
      showModal("generate-paperkey").setProperties({
        model: this.model,
        device
      });
    },

    managePaperKeys() {
      showModal("manage-paperkeys").set("model", this.model);
    }
  }
};

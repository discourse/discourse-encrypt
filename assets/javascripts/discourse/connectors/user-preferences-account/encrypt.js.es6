import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import showModal from "discourse/lib/show-modal";
import { registerHelper } from "discourse-common/lib/helpers";
import {
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  generatePassphraseKey,
  generateSalt,
  importPrivateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  saveKeyPairToIndexedDb,
  deleteIndexedDb
} from "discourse/plugins/discourse-encrypt/lib/keys_db";
import {
  canEnableEncrypt,
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  PACKED_KEY_FOOTER,
  PACKED_KEY_HEADER,
  PACKED_KEY_SEPARATOR,
  reload
} from "discourse/plugins/discourse-encrypt/lib/discourse";

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

      // 1. Generate new key pair or import existing one.
      let keyPairPromise;
      if (this.importKey) {
        const str = (this.key || PACKED_KEY_SEPARATOR)
          .replace(PACKED_KEY_HEADER, "")
          .replace(PACKED_KEY_FOOTER, "")
          .split(PACKED_KEY_SEPARATOR);

        const publicStr = str[0]
          .split(/\s+/)
          .map(x => x.trim())
          .join("");
        const privateStr = str[1]
          .split(/\s+/)
          .map(x => x.trim())
          .join("");

        keyPairPromise = Ember.RSVP.Promise.all([
          importPublicKey(publicStr),
          importPublicKey(privateStr, ["decrypt", "unwrapKey"])
        ]);
      } else {
        keyPairPromise = generateKeyPair();
      }

      // 2. a. Export public key to string.
      // 2. b. Export private key to a string (using passphrase).
      keyPairPromise
        .then(keyPair => {
          const [publicKey, privateKey] = keyPair;

          const passphrase = this.passphrase;
          const salt = generateSalt();
          const publicStr = exportPublicKey(publicKey);
          const privateStr = generatePassphraseKey(passphrase, salt).then(
            passphraseKey => exportPrivateKey(privateKey, passphraseKey)
          );

          return Ember.RSVP.Promise.all([publicStr, privateStr, salt]);
        })

        // 3. Save keys to server.
        .then(([publicStr, privateStr, salt]) => {
          this.set("model.custom_fields.encrypt_public_key", publicStr);
          this.set("model.custom_fields.encrypt_private_key", privateStr);
          this.set("model.custom_fields.encrypt_salt", salt);
          const saveKeys = ajax("/encrypt/keys", {
            type: "PUT",
            data: { public_key: publicStr, private_key: privateStr, salt }
          });

          return Ember.RSVP.Promise.all([
            publicStr,
            privateStr,
            salt,
            saveKeys
          ]);
        })

        // 4. Re-import keys but this time as `unextractable`.
        .then(([publicStr, privateStr, salt]) =>
          Ember.RSVP.Promise.all([
            importPublicKey(publicStr),
            generatePassphraseKey(this.passphrase, salt).then(passphraseKey =>
              importPrivateKey(privateStr, passphraseKey)
            )
          ])
        )

        // 5. Save key pair in local IndexedDb.
        .then(([publicKey, privateKey]) =>
          saveKeyPairToIndexedDb(publicKey, privateKey)
        )

        // 6. Reset component status.
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");

          this.send("hidePassphraseInput");
          this.setProperties({
            inProgress: false,
            importKey: false,
            key: ""
          });

          reload();
        })

        .catch(popupAjaxError);
    },

    activateEncrypt() {
      this.set("inProgress", true);

      const publicStr = this.get("model.custom_fields.encrypt_public_key");
      const privateStr = this.get("model.custom_fields.encrypt_private_key");
      const salt = this.get("model.custom_fields.encrypt_salt");
      const passphrase = this.passphrase;

      // 1. a. Import public key from string.
      // 1. b. Import private from string (using passphrase).
      const importPub = importPublicKey(publicStr);
      const importPrv = generatePassphraseKey(passphrase, salt).then(
        passphraseKey => importPrivateKey(privateStr, passphraseKey)
      );

      Ember.RSVP.Promise.all([importPub, importPrv])

        // 2. Save key pair in local IndexedDb.
        .then(([publicKey, privateKey]) =>
          saveKeyPairToIndexedDb(publicKey, privateKey)
        )

        // 3. Reset component status.
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.send("hidePassphraseInput");
          reload();
        })

        .catch(() =>
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() => this.set("inProgress", false));
    },

    changeEncrypt() {
      this.set("inProgress", true);

      const oldPublicStr = this.get("model.custom_fields.encrypt_public_key");
      const oldPrivateStr = this.get("model.custom_fields.encrypt_private_key");
      const oldSalt = this.get("model.custom_fields.encrypt_salt");
      const oldPassphrase = this.oldPassphrase;
      const salt = generateSalt();
      const passphrase = this.passphrase;

      // 1. a. Decrypt private key with old passphrase.
      // 1. b. Generate new passphrase key.
      const p0 = generatePassphraseKey(oldPassphrase, oldSalt).then(
        // Import key as extractable so it can be later exported.
        passphraseKey => importPrivateKey(oldPrivateStr, passphraseKey, true)
      );
      const p1 = generatePassphraseKey(passphrase, salt);

      Ember.RSVP.Promise.all([p0, p1])

        // 2. Encrypt private key with new passphrase key.
        .then(([privateKey, passphraseKey]) =>
          exportPrivateKey(privateKey, passphraseKey)
        )

        // 3. Send old public key (unchanged) and new private key back to
        // server.
        .then(privateStr => {
          this.set("model.custom_fields.encrypt_private_key", privateStr);
          this.set("model.custom_fields.encrypt_salt", salt);
          return ajax("/encrypt/keys", {
            type: "PUT",
            data: { public_key: oldPublicStr, private_key: privateStr, salt }
          });
        })

        // 4. Reset component status.
        .then(() => this.send("hidePassphraseInput"))
        .catch(() =>
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"))
        )
        .finally(() => this.set("inProgress", false));
    },

    deactivateEncrypt() {
      this.setProperties("inProgress", true);

      deleteIndexedDb()
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          reload();
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

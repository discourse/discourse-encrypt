import { ajax } from "discourse/lib/ajax";
import { registerHelper } from "discourse-common/lib/helpers";
import {
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  generatePassphraseKey,
  importPrivateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  saveKeyPairToIndexedDb,
  deleteIndexedDb
} from "discourse/plugins/discourse-encrypt/lib/keys_db";
import {
  ENCRYPT_DISBLED,
  ENCRYPT_ACTIVE,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

// TODO: I believe this should get into core.
// Handlebars offers `if` but no other helpers for conditions, which eventually
// lead to a lot of JavaScript bloat.
registerHelper("or", ([a, b]) => a || b);

export default {
  setupComponent(args, component) {
    getEncryptionStatus().then(status => {
      component.setProperties({
        model: args.model,
        save: args.save,
        /** @var Value of passphrase input.
         *       It should stay in memory for as little time as possible.
         *       Clear it often.
         */
        passphrase: "",
        passphrase2: "",
        /** @var Whether the passphrase input is shown. */
        passphraseInput: false,
        /** @var Whether any operation (AJAX request, key generation, etc.) is
         *       in progress. */
        inProgress: false,
        /** @var Whether the encryption is enabled or not. */
        isEnabled: status !== ENCRYPT_DISBLED,
        /** @var Whether the encryption is active on this device. */
        isActive: status === ENCRYPT_ACTIVE,
        // TOOD: Check out if there is a way to define functions like this in
        //       the `export default` scope.
        passphraseStatus: function() {
          const passphrase = component.get("passphrase");
          const passphrase2 = component.get("passphrase2");
          if (!passphrase) {
            return "encrypt.preferences.passphrase_enter";
          } else if (passphrase.length < 15) {
            return "encrypt.preferences.passphrase_insecure";
          } else if (passphrase !== passphrase2) {
            return "encrypt.preferences.passphrase_mismatch";
          }
        }.property("passphrase", "passphrase2")
      });
    });
  },

  actions: {
    showPassphraseInput() {
      this.setProperties({
        passphrase: "",
        passphrase2: "",
        passphraseInput: true
      });
    },

    hidePassphraseInput() {
      this.setProperties({
        passphrase: "",
        passphrase2: "",
        passphraseInput: false
      });
    },

    enableEncrypt() {
      this.set("inProgress", true);

      // 1. Generate key pair.
      generateKeyPair()
        // 2. a. Export public key to string.
        // 2. b. Export private key to a string (using passphrase).
        .then(keyPair => {
          const [publicKey, privateKey] = keyPair;

          const passphrase = this.get("passphrase");
          const publicStr = exportPublicKey(publicKey);
          const privateStr = generatePassphraseKey(passphrase).then(
            passphraseKey => exportPrivateKey(privateKey, passphraseKey)
          );

          return Promise.all([publicStr, privateStr]);
        })

        // 3. Save keys to server.
        .then(([publicStr, privateStr]) => {
          this.set("model.custom_fields.encrypt_public_key", publicStr);
          this.set("model.custom_fields.encrypt_private_key", privateStr);
          const saveKeys = ajax("/encrypt/keys", {
            type: "PUT",
            data: { public_key: publicStr, private_key: privateStr }
          });

          return Promise.all([publicStr, privateStr, saveKeys]);
        })

        // 4. Re-import keys but this time as `unextractable`.
        .then(([publicStr, privateStr]) =>
          Promise.all([
            importPublicKey(publicStr),
            generatePassphraseKey(this.get("passphrase")).then(passphraseKey =>
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
          this.send("hidePassphraseInput");
          this.setProperties({
            inProgress: false,
            isEnabled: true,
            isActive: true
          });
        });
    },

    activateEncrypt() {
      this.set("inProgress", true);

      const publicStr = this.get("model.custom_fields.encrypt_public_key");
      const privateStr = this.get("model.custom_fields.encrypt_private_key");
      const passphrase = this.get("passphrase");

      // 1. a. Import public key from string.
      // 1. b. Import private from string (using passphrase).
      const importPub = importPublicKey(publicStr);
      const importPrv = generatePassphraseKey(passphrase).then(passphraseKey =>
        importPrivateKey(privateStr, passphraseKey)
      );

      Promise.all([importPub, importPrv])

        // 2. Save key pair in local IndexedDb.
        .then(([publicKey, privateKey]) =>
          saveKeyPairToIndexedDb(publicKey, privateKey)
        )

        // 3. Reset component status.
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");

          this.send("hidePassphraseInput");
          this.setProperties({
            inProgress: false,
            isEnabled: true,
            isActive: true
          });
        })

        .catch(() => {
          this.set("inProgress", false);
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"));
        });
    },

    changeEncrypt() {
      this.set("inProgress", true);

      const oldPrivateStr = this.get("model.custom_fields.encrypt_private_key");

      const oldPassphrase = this.get("old_passphrase");
      const passphrase = this.get("passphrase");

      // 1. a. Decrypt private key with old passphrase.
      // 1. b. Generate new passphrase key.
      const p0 = generatePassphraseKey(oldPassphrase).then(passphraseKey =>
        // Import key as extractable so it can be later exported.
        importPrivateKey(oldPrivateStr, passphraseKey, true)
      );
      const p1 = generatePassphraseKey(passphrase);

      Promise.all([p0, p1])

        // 2. Encrypt private key with new passphrase key.
        .then(([privateKey, passphraseKey]) =>
          exportPrivateKey(privateKey, passphraseKey)
        )

        // 3. Send old public key (unchanged) and new private key back to
        // server.
        .then(privateStr => {
          this.set("model.custom_fields.encrypt_private_key", privateStr);
          return ajax("/encrypt/keys", {
            type: "PUT",
            data: { private_key: privateStr }
          });
        })

        // 4. Reset component status.
        .then(() => {
          this.send("hidePassphraseInput");
          this.set("inProgress", false);
        })

        .catch(() => {
          this.set("inProgress", false);
          bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"));
        });
    },

    deactivateEncrypt() {
      deleteIndexedDb().then(() => {
        this.appEvents.trigger("encrypt:status-changed");
      });
    }
  }
};

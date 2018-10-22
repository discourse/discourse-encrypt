import { ajax } from "discourse/lib/ajax";
import { popupAjaxError } from "discourse/lib/ajax-error";
import { registerHelper } from "discourse-common/lib/helpers";

import {
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  generatePassphraseKey,
  importPrivateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { saveKeyPairToIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";
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
  async setupComponent(args, component) {
    const status = await getEncryptionStatus();

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
      /** @var Whether any operation (AJAX request, key generation, etc.) is in
       *       progress. */
      inProgress: false,
      /** @var Whether the encryption is enabled or not. */
      isEnabled: status !== ENCRYPT_DISBLED,
      /** @var Whether the encryption is active on this device. */
      isActive: status === ENCRYPT_ACTIVE,
      // TOOD: Check out if there is a way to define functions like this in the
      //       `export default` scope.
      passphraseMismatch: function() {
        const passphrase = component.get("passphrase");
        const passphrase2 = component.get("passphrase2");
        return !passphrase || !passphrase2 || passphrase !== passphrase2;
      }.property("passphrase", "passphrase2")
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

    async enableEncrypt() {
      this.set("inProgress", true);

      // Generating a new key-pair.
      const [publicKey, privateKey] = await generateKeyPair();

      // Encrypting key-pair with passphrase.
      const passphrase = this.get("passphrase");
      const publicStr = await exportPublicKey(publicKey);
      const privateStr = await exportPrivateKey(
        privateKey,
        await generatePassphraseKey(passphrase)
      );

      // Sending key-pair to server.
      await ajax("/encrypt/keys", {
        type: "PUT",
        data: { public_key: publicStr, private_key: privateStr }
      });

      // Saving to IndexedDB.
      await saveKeyPairToIndexedDb(publicKey, privateKey);

      // Resetting state.
      this.send("hidePassphraseInput");
      this.setProperties({
        inProgress: false,
        isEnabled: true,
        isActive: true
      });
    },

    async activateEncrypt() {
      this.set("inProgress", true);

      // Getting key-pair from server.
      const publicStr = this.get("model.custom_fields.encrypt_public_key");
      const privateStr = this.get("model.custom_fields.encrypt_private_key");

      // Decrypting key-pair with passphrase.
      try {
        const passphrase = this.get("passphrase");
        const publicKey = await importPublicKey(publicStr);
        const privateKey = await importPrivateKey(
          privateStr,
          await generatePassphraseKey(passphrase)
        );

        // Saving to IndexedDB.
        await saveKeyPairToIndexedDb(publicKey, privateKey);

        // Letting other components know.
        this.appEvents.trigger("encrypt:status-changed");

        // Resetting state.
        this.send("hidePassphraseInput");
        this.setProperties({
          inProgress: false,
          isEnabled: true,
          isActive: true
        });
      } catch (e) {
        this.set("inProgress", false);
        bootbox.alert(I18n.t("encrypt.preferences.passphrase_invalid"));
      }
    },

    disableEncrypt() {
      this.set("inProgress", true);

      // TODO: Delete client keys.

      ajax("/encrypt/keys", { type: "DELETE" })
        .then(() => {
          this.appEvents.trigger("encrypt:status-changed");
          this.setProperties({
            inProgress: false,
            isEnabled: false,
            isActive: false
          });
        })
        .catch(popupAjaxError);
    }
  }
};

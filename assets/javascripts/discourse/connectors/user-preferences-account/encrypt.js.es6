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

import {
  loadKeyPairFromIndexedDb,
  saveKeyPairToIndexedDb
} from "discourse/plugins/discourse-encrypt/lib/keys_db";

// TODO: I believe this should get into core.
// Handlebars offers `if` but no other helpers for conditions, which eventually
// lead to a lot of JavaScript bloat.
registerHelper("or", ([a, b]) => a || b);

export default {
  async setupComponent(args, component) {
    const serverPublicKey = args.model.get("custom_fields.encrypt_public_key");
    const serverPrivateKey = args.model.get(
      "custom_fields.encrypt_private_key"
    );
    const [
      clientPublicKey,
      clientPrivateKey
    ] = await loadKeyPairFromIndexedDb();

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
      isEnabled: !!serverPublicKey && !!serverPrivateKey,
      /** @var Whether the encryption is active on this device. */
      isActive:
        !!clientPublicKey &&
        !!clientPrivateKey &&
        serverPublicKey === (await exportPublicKey(clientPublicKey)),
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
      const passphrase = this.get("passphrase");
      const publicKey = await importPublicKey(publicStr);
      const privateKey = await importPrivateKey(
        privateStr,
        await generatePassphraseKey(passphrase)
      );

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

    disableEncrypt() {
      this.set("inProgress", true);
      ajax("/encrypt/keys", { type: "DELETE" })
        .then(() =>
          this.setProperties({
            inProgress: false,
            isEnabled: false,
            isActive: false
          })
        )
        .catch(popupAjaxError);
    }
  }
};

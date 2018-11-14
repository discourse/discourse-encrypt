import ModalFunctionality from "discourse/mixins/modal-functionality";
import {
  generatePassphraseKey,
  importPrivateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { saveKeyPairToIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({
      passphrase: "",
      error: ""
    });
  },

  actions: {
    activate() {
      this.set("inProgress", true);

      const user = Discourse.User.current();
      const publicStr = user.get("custom_fields.encrypt_public_key");
      const privateStr = user.get("custom_fields.encrypt_private_key");
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
          this.get("model").scheduleRerender();
          this.send("closeModal");
        })

        .catch(() => {
          this.set("inProgress", false);
          this.set("error", I18n.t("encrypt.preferences.passphrase_invalid"));
        });
    },

    cancel() {
      const model = this.get("model");
      model.state.decrypting = false;
      model.state.decrypted = true;
      model.scheduleRerender();
      this.send("closeModal");
    }
  }
});

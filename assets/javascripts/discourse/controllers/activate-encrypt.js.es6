import ModalFunctionality from "discourse/mixins/modal-functionality";
import {
  generatePassphraseKey,
  importPrivateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { saveKeyPairToIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    const models = this.get("models") || [];
    models.push(this.get("model"));

    this.setProperties({
      models: models,
      passphrase: "",
      error: ""
    });
  },

  onClose() {
    const models = this.get("models") || [];
    models.forEach(model => {
      model.state.decrypting = false;
      model.state.decrypted = true;
      model.scheduleRerender();
    });
    this.set("models", null);
  },

  actions: {
    activate() {
      this.set("inProgress", true);

      const user = Discourse.User.current();
      const publicStr = user.get("custom_fields.encrypt_public_key");
      const privateStr = user.get("custom_fields.encrypt_private_key");
      const salt = user.get("custom_fields.encrypt_salt");
      const passphrase = this.get("passphrase");

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
          this.get("models").forEach(model => model.scheduleRerender());
          this.set("models", null);
          this.send("closeModal");
        })

        .catch(() => {
          this.set("inProgress", false);
          this.set("error", I18n.t("encrypt.preferences.passphrase_invalid"));
        });
    }
  }
});

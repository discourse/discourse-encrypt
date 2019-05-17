import copyText from "discourse/lib/copy-text";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import {
  exportPublicKey,
  generatePassphraseKey,
  importPrivateKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  PACKED_KEY_COLUMNS,
  PACKED_KEY_HEADER,
  PACKED_KEY_SEPARATOR,
  PACKED_KEY_FOOTER
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default Ember.Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({
      passphrase: "",
      exported: "",
      inProgress: false,
      error: ""
    });
  },

  onClose() {
    this.onShow();
  },

  packKeyPair(publicKey, privateKey) {
    const segments = [];
    segments.push(PACKED_KEY_HEADER);
    for (let i = 0, len = publicKey.length; i < len; i += PACKED_KEY_COLUMNS) {
      segments.push(publicKey.substr(i, PACKED_KEY_COLUMNS));
    }
    segments.push(PACKED_KEY_SEPARATOR);
    for (let i = 0, len = privateKey.length; i < len; i += PACKED_KEY_COLUMNS) {
      segments.push(privateKey.substr(i, PACKED_KEY_COLUMNS));
    }
    segments.push(PACKED_KEY_FOOTER);
    return segments.join("\n");
  },

  actions: {
    export() {
      this.set("inProgress", true);

      const user = this.model;
      const publicStr = user.get("custom_fields.encrypt_public_key");
      const privateStr = user.get("custom_fields.encrypt_private_key");
      const salt = user.get("custom_fields.encrypt_salt");
      const passphrase = this.passphrase;

      const exportedPrivateStr = generatePassphraseKey(passphrase, salt)
        .then(key => importPrivateKey(privateStr, key, true))
        .then(privateKey => exportPublicKey(privateKey));

      Ember.RSVP.Promise.all([publicStr, exportedPrivateStr])
        .then(([publicKey, privateKey]) => {
          this.setProperties({
            exported: this.packKeyPair(publicKey, privateKey),
            inProgress: false,
            error: ""
          });
        })
        .catch(() => {
          this.setProperties({
            inProgress: false,
            error: I18n.t("encrypt.preferences.passphrase_invalid")
          });
        });
    },

    copy() {
      const $copyRange = $("pre.exported-keypair");
      if (copyText("", $copyRange[0])) {
        this.set("copied", true);
        Ember.run.later(() => this.set("copied", false), 2000);
      }
    }
  }
});

import { action, computed, defineProperty } from "@ember/object";
import showModal from "discourse/lib/show-modal";
import {
  deleteDb,
  saveDbIdentity,
} from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  activateEncrypt,
  enableEncrypt,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  getPackedPlaceholder,
  unpackIdentity,
} from "discourse/plugins/discourse-encrypt/lib/pack";
import { importIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";
import I18n from "I18n";
import { getOwner } from "discourse-common/lib/get-owner";
import { isTesting } from "discourse-common/config/environment";
import { popupAjaxError } from "discourse/lib/ajax-error";

export default {
  setupComponent(args, component) {
    component.set("isInsecureContext", !window.isSecureContext);

    // Whether plugin is enabled for current user
    defineProperty(
      component,
      "canEnableEncrypt",
      computed("model.can_encrypt", () => this.model.can_encrypt)
    );

    // Only current user can enable encryption for themselves
    defineProperty(
      component,
      "isCurrentUser",
      computed(
        "currentUser.id",
        "model.id",
        () => this.currentUser.id === this.model.id
      )
    );

    if (component.isCurrentUser) {
      component.setProperties({
        encryptStatus: getEncryptionStatus(args.model),

        /** Value of passphrase input. */
        passphrase: "",

        /** Whether it is an import operation. */
        importIdentity: false,

        /** Key to be imported .*/
        identity: "",
        identityPlaceholder: getPackedPlaceholder(),

        /** Whether any operation (AJAX request, key generation, etc) is
         *  in progress.
         */
        inProgress: false,

        listener() {
          component.set("encryptStatus", getEncryptionStatus(args.model));
        },

        didInsertElement() {
          this._super(...arguments);
          this.appEvents.on("encrypt:status-changed", this, this.listener);
        },

        willDestroyElement() {
          this._super(...arguments);
          this.appEvents.off("encrypt:status-changed", this, this.listener);
        },
      });

      defineProperty(
        component,
        "isEncryptEnabled",
        computed("encryptStatus", () => this.encryptStatus !== ENCRYPT_DISABLED)
      );

      defineProperty(
        component,
        "isEncryptActive",
        computed("encryptStatus", () => this.encryptStatus === ENCRYPT_ACTIVE)
      );
    } else {
      defineProperty(
        component,
        "isEncryptEnabled",
        computed("model.encrypt_public", () => !!this.model.encrypt_public)
      );
    }
  },

  @action
  enableEncrypt() {
    this.set("inProgress", true);
    const dialog = getOwner(this).lookup("service:dialog");

    return enableEncrypt(this.model, this.importIdentity && this.identity)
      .then(() => {
        this.appEvents.trigger("encrypt:status-changed");
      })
      .catch(() => dialog.alert(I18n.t("encrypt.preferences.key_pair_invalid")))
      .finally(() => {
        this.setProperties({
          passphrase: "",
          inProgress: false,
          importIdentity: false,
          identity: "",
        });
      });
  },

  @action
  activateEncrypt() {
    this.set("inProgress", true);
    const dialog = getOwner(this).lookup("service:dialog");

    const identityPromise = this.importIdentity
      ? importIdentity(unpackIdentity(this.identity)).then((identity) =>
          saveDbIdentity(identity)
        )
      : activateEncrypt(this.model, this.passphrase);

    return identityPromise
      .then(() => {
        this.appEvents.trigger("encrypt:status-changed");
      })
      .catch(() => {
        if (this.importIdentity) {
          dialog.alert(I18n.t("encrypt.preferences.key_pair_invalid"));
        } else {
          dialog.alert(I18n.t("encrypt.preferences.paper_key_invalid"));
        }
      })
      .finally(() =>
        this.setProperties({
          passphrase: "",
          inProgress: false,
          importIdentity: false,
          identity: "",
        })
      );
  },

  @action
  deactivateEncrypt() {
    this.setProperties("inProgress", true);

    deleteDb()
      .then(() => {
        this.appEvents.trigger("encrypt:status-changed");
      })
      .finally(() => this.set("inProgress", false));
  },

  @action
  generatePaperKey(device) {
    showModal("generate-paper-key", {
      model: {
        user: this.model,
        device,
      },
    });
  },

  @action
  savePreference() {
    this.set("saved", false);
    return this.model
      .save(["encrypt_pms_default"])
      .then(() => {
        this.set("saved", true);
        if (!isTesting()) {
          location.reload();
        }
      })
      .catch(popupAjaxError);
  },

  @action
  selectEncryptPreferencesDropdownAction(actionId) {
    switch (actionId) {
      case "export":
        showModal("export-key-pair", { model: this.model });
        break;
      case "managePaperKeys":
        showModal("manage-paper-keys", { model: this.model });
        break;
      case "rotate":
        showModal("rotate-key-pair", { model: this.model });
        break;
      case "reset":
        showModal("reset-key-pair", { model: this.model });
        break;
    }
  },

  @action
  selectEncryptEnableDropdownAction(actionId) {
    switch (actionId) {
      case "import":
        this.toggleProperty("importIdentity");
        break;
      case "reset":
        showModal("reset-key-pair", { model: this.model });
        break;
    }
  },
};

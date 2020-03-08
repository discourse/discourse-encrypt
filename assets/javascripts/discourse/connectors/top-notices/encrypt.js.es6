import { getOwner } from "discourse-common/lib/get-owner";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

const NO_BACKUP_WARN_NOTICE_KEY = "discourse-encrypt-no-backup-warn";

export default {
  setupComponent(args, component) {
    const currentUser = getOwner(component).lookup("current-user:main");
    const status = getEncryptionStatus(currentUser);

    component.setProperties({
      basePath: Discourse.BaseUri,
      isEncryptEnabled: status !== ENCRYPT_DISABLED,
      isEncryptActive: status === ENCRYPT_ACTIVE,
      showNoBackupWarning: 15,

      /** Listens for encryption status updates. */
      listener() {
        const newStatus = getEncryptionStatus(currentUser);
        component.setProperties({
          isEncryptEnabled: newStatus !== ENCRYPT_DISABLED,
          isEncryptActive: newStatus === ENCRYPT_ACTIVE
        });
      },

      didInsertElement() {
        this._super(...arguments);
        this.appEvents.on("encrypt:status-changed", this, this.listener);
      },

      willDestroyElement() {
        this._super(...arguments);
        this.appEvents.off("encrypt:status-changed", this, this.listener);
      }
    });

    Ember.defineProperty(component, "noticeStatus", {
      set(value) {
        window.localStorage.setItem(NO_BACKUP_WARN_NOTICE_KEY, value);
        return window.localStorage.getItem(NO_BACKUP_WARN_NOTICE_KEY);
      },
      get() {
        return window.localStorage.getItem(NO_BACKUP_WARN_NOTICE_KEY);
      }
    });

    Ember.defineProperty(
      component,
      "showNoBackupWarning",
      Ember.computed(
        "isEncryptActive",
        "noticeStatus",
        "currentUser.encrypt_private",
        () => {
          const ids = this.get("currentUser.encrypt_private");
          return (
            this.isEncryptActive &&
            !this.noticeStatus &&
            (!ids || Object.keys(JSON.parse(ids)).length === 0)
          );
        }
      )
    );
  }
};

import {
  ENCRYPT_DISABLED,
  enableEncrypt,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";

const AUTO_ENABLE_KEY = "discourse-encrypt-auto-enable";

export default {
  name: "auto-enable-encrypt",

  initialize(container) {
    const siteSettings = container.lookup("service:site-settings");
    if (!siteSettings.auto_enable_encrypt) {
      return;
    }

    const currentUser = container.lookup("service:current-user");
    if (currentUser) {
      if (
        !window.localStorage.getItem(AUTO_ENABLE_KEY) &&
        getEncryptionStatus(currentUser) === ENCRYPT_DISABLED
      ) {
        window.localStorage.setItem(AUTO_ENABLE_KEY, true);
        const appEvents = container.lookup("service:app-events");

        enableEncrypt(currentUser).then(() => {
          appEvents.trigger("encrypt:status-changed");
        });
      }
    } else {
      window.localStorage.removeItem(AUTO_ENABLE_KEY);
    }
  },
};

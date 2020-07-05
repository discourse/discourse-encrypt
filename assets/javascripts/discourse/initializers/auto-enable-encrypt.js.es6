import {
  enableEncrypt,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

const AUTO_ENABLE_KEY = "discourse-encrypt-auto-enable";

export default {
  name: "auto-enable-encrypt",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (currentUser) {
      if (
        !window.localStorage.getItem(AUTO_ENABLE_KEY) &&
        getEncryptionStatus(currentUser) === ENCRYPT_DISABLED
      ) {
        window.localStorage.setItem(AUTO_ENABLE_KEY, true);
        enableEncrypt(currentUser).then(() => {
          const appEvents = container.lookup("service:app-events");
          appEvents.trigger("encrypt:status-changed");
        });
      }
    } else {
      window.localStorage.removeItem(AUTO_ENABLE_KEY);
    }
  }
};

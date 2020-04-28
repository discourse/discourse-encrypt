import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus,
  reload
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "update-state",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const messageBus = container.lookup("message-bus:main");

    const appEvents = container.lookup("service:app-events");
    appEvents.on("encrypt:status-changed", skipReload => {
      if (!skipReload) {
        reload();
      }
    });

    const status = getEncryptionStatus(currentUser);
    if (!currentUser || status !== ENCRYPT_ACTIVE) {
      deleteDb();
    }

    if (messageBus && status !== ENCRYPT_DISABLED) {
      messageBus.subscribe("/plugin/encrypt/keys", function(data) {
        currentUser.setProperties({
          encrypt_public: data.public,
          encrypt_private: data.private
        });
        appEvents.trigger("encrypt:status-changed", true);
      });
    }
  }
};

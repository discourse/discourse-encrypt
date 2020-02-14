import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "update-state",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const messageBus = container.lookup("message-bus:main");

    const status = getEncryptionStatus(currentUser);

    if (!currentUser || status !== ENCRYPT_ACTIVE) {
      deleteDb();
    }

    if (messageBus && status !== ENCRYPT_DISABLED) {
      messageBus.subscribe("/plugin/encrypt/keys", function(data) {
        currentUser.set("custom_fields.encrypt_public", data.public);
        currentUser.set("custom_fields.encrypt_private", data.private);
      });
    }
  }
};

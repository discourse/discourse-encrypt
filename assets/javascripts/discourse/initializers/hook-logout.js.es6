import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-logout",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (!currentUser || getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      deleteDb();
    }
  }
};

import { deleteIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";
import { isEncryptEnabled } from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-logout",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    if (!Discourse.User.current()) {
      deleteIndexedDb();
    }
  }
};

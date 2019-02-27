import { deleteIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

export default {
  name: "hook-logout",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (!currentUser) {
      deleteIndexedDb();
    }
  }
};

import { deleteDb } from "discourse/plugins/discourse-encrypt/lib/database";

export default {
  name: "hook-logout",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (!currentUser) {
      deleteDb();
    }
  }
};

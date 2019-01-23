import { deleteIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

export default {
  name: "hook-logout",

  initialize(container) {
    const siteSettings = container.lookup("site-settings:main");
    if (!siteSettings.encrypt_enabled) {
      return;
    }

    if (!Discourse.User.current()) {
      deleteIndexedDb();
    }
  }
};

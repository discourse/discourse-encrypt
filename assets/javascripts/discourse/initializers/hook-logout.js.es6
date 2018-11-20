import { deleteIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

export default {
  name: "hook-logout",

  initialize() {
    if (!Discourse.User.current()) {
      deleteIndexedDb();
    }
  }
};

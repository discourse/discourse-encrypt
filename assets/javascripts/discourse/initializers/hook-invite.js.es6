import Topic from "discourse/models/topic";
import TopicDetails from "discourse/models/topic-details";
import { ajax } from "discourse/lib/ajax";
import { loadKeyPairFromIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";
import {
  exportKey,
  importKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";

export default {
  name: "hook-invite",

  initialize() {
    Topic.reopen({
      async createInvite(username) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (!this.get("topic_key")) {
          return _super.call(this, ...arguments);
        }

        const publicKeys = await ajax("/encrypt/userkeys", {
          type: "GET",
          data: { usernames: [username] }
        });

        if (!publicKeys[username]) {
          bootbox.alert(
            I18n.t("encrypt.composer.user_has_no_key", { username })
          );
          return;
        }

        const privateKey = (await loadKeyPairFromIndexedDb())[1];
        const key = await importKey(this.get("topic_key"), privateKey);
        const userkey = await exportKey(
          key,
          await importPublicKey(publicKeys[username])
        );

        await ajax("/encrypt/topickeys", {
          type: "PUT",
          data: { topic_id: this.get("id"), keys: { [username]: userkey } }
        });

        return _super.call(this, ...arguments);
      }
    });

    TopicDetails.reopen({
      async removeAllowedUser(user) {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        const topic = this.get("topic");
        if (!topic.get("topic_key")) {
          return _super.call(this, ...arguments);
        }

        await ajax("/encrypt/topickeys", {
          type: "DELETE",
          data: { topic_id: topic.get("id"), users: [user.username] }
        });

        // TODO: Generate a new topic key.
        // TODO: Re-encrypt and edit all posts in topic.
        // TODO: Re-encrypt and save keys for all users.

        return _super.call(this, ...arguments);
      }
    });
  }
};

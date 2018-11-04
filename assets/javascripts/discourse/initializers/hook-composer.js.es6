import Composer from "discourse/models/composer";
import { ajax } from "discourse/lib/ajax";
import {
  default as computed,
  observes
} from "ember-addons/ember-computed-decorators";
import {
  encrypt,
  decrypt,
  exportKey,
  importKey,
  generateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { loadKeyPairFromIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";
import {
  getTopicKey,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-composer",
  initialize(container) {
    // Send `is_encrypted` over to the server via POST.
    // Composer.serializeOnCreate("is_encrypted", "isEncrypted");

    // Decode composer on reply reload. This usually occurs when a post is
    // edited.
    const appEvents = container.lookup("app-events:main");
    appEvents.on("composer:reply-reloaded", () => {
      const model = container.lookup("controller:composer").get("model");

      const topic = model.get("topic");
      const topicId = topic.get("id");
      if (!hasTopicKey(topicId)) {
        return;
      }

      getTopicKey(topicId).then(key => {
        decrypt(key, model.get("title")).then(msg => model.set("title", msg));
        decrypt(key, model.get("reply")).then(msg => model.set("reply", msg));
      });
    });

    // Encrypt the Composer contents on-the-fly right before it is sent over
    // to the server.
    Composer.reopen({
      async save() {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (this.get("topic.topic_key")) {
          const privateKey = (await loadKeyPairFromIndexedDb())[1];
          const key = await importKey(this.get("topic.topic_key"), privateKey);

          this.set("title", await encrypt(key, this.get("title")));
          this.set("reply", await encrypt(key, this.get("reply")));

          return _super.call(this, ...arguments);
        }

        if (!this.get("isEncrypted")) {
          return _super.call(this, ...arguments);
        }

        const title = this.get("title");
        const reply = this.get("reply");
        const usernames = this.get("recipients");

        const key = await generateKey();
        const publicKeys = await ajax("/encrypt/userkeys", {
          type: "GET",
          data: { usernames }
        });

        const userKeys = {};
        for (let i = 0; i < usernames.length; ++i) {
          const username = usernames[i];
          if (publicKeys[username]) {
            userKeys[username] = await exportKey(
              key,
              await importPublicKey(publicKeys[username])
            );
          } else {
            bootbox.alert(
              I18n.t("encrypt.composer.user_has_no_key", { username })
            );
            return;
          }
        }

        // Swapping the encrypted contents.
        this.set("title", await encrypt(key, title));
        this.set("reply", await encrypt(key, reply));

        // Saving the topic, restoring the result and returning the result.
        return _super.call(this, ...arguments).then(async result => {
          this.setProperties({ title, reply });
          const topicId = result.responseJson.post.topic_id;
          await ajax("/encrypt/topickeys", {
            type: "PUT",
            data: { topic_id: topicId, keys: userKeys }
          });
          return result;
        });
      },

      @observes("targetUsernames")
      async checkKeys() {
        if (!this.get("isEncrypted")) {
          return;
        }

        const usernames = this.get("recipients");
        const keys = await ajax("/encrypt/userkeys", {
          type: "GET",
          data: { usernames }
        });

        for (let i = 0; i < usernames.length; ++i) {
          const username = usernames[i];
          if (!keys[username]) {
            bootbox.alert(
              I18n.t("encrypt.composer.user_has_no_key", { username })
            );
            return;
          }
        }
      },

      @computed("targetUsernames")
      recipients(targetUsernames) {
        return targetUsernames.split(",").concat([this.get("user.username")]);
      }
    });
  }
};

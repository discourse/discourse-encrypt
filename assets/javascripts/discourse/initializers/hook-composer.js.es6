import Composer from "discourse/models/composer";
import { ajax } from "discourse/lib/ajax";
import {
  encrypt,
  exportKey,
  generateKey,
  importPublicKey
} from "discourse/plugins/discourse-encrypt/lib/keys";

export default {
  name: "hook-composer",
  initialize() {
    // Send `is_encrypted` over to the server via POST.
    Composer.serializeOnCreate("is_encrypted", "isEncrypted");

    // Encrypt the Composer contents on-the-fly right before it is sent over
    // to the server.
    Composer.reopen({
      async save() {
        // TODO: This is part of a hack around `_super` not working properly
        // when used in `async` functions.
        // https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        if (!this.get("isEncrypted")) {
          return _super.call(this, ...arguments);
        }

        const title = this.get("title");
        const reply = this.get("reply");
        const usernames = this.get("targetUsernames")
          .split(",")
          .concat([this.get("user.username")]);

        const key = await generateKey();
        const publicKeys = await ajax("/encrypt/userkeys", {
          type: "GET",
          data: { usernames }
        });

        const userKeys = {};
        usernames.forEach(async username => {
          if (publicKeys[username]) {
            userKeys[username] = await exportKey(
              key,
              await importPublicKey(publicKeys[username])
            );
          } else {
            // TODO: Warn user that the recipient does not have encryption
            // enabled.
            // TODO: Maybe there should be a check for keys as soon as the
            // target usernames field changes.
            console.log("There is no key for " + username + ".");
          }
        });

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
      }
    });
  }
};

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
import {
  getTopicKey,
  hasTopicKey,
  getPrivateKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-composer",
  initialize(container) {
    // Send `is_encrypted` over to the server via POST.
    // Composer.serializeOnCreate("is_encrypted", "isEncrypted");

    // Decode composer on reply reload. This usually occurs when a post is
    // edited.
    const appEvents = container.lookup("app-events:main");
    appEvents.on("composer:reply-reloaded", model => {
      let topicId;

      // Try get topic ID from topic model.
      const topic = model.get("topic");
      if (topic) {
        topicId = topic.get("id");
      }

      // Try get topic ID from draft key.
      if (!topicId) {
        const draftKey = model.get("draftKey");
        if (draftKey && draftKey.indexOf("topic_") === 0) {
          topicId = draftKey.substring("topic_".length);
        }
      }

      if (hasTopicKey(topicId)) {
        getTopicKey(topicId).then(key => {
          const title = model.get("title");
          if (title) {
            decrypt(key, title).then(t => model.set("title", t));
          }

          const reply = model.get("reply");
          if (reply) {
            decrypt(key, reply).then(r => model.set("reply", r));
          }
        });
      }
    });

    // Encrypt the Composer contents on-the-fly right before it is sent over
    // to the server.
    Composer.reopen({
      save() {
        // TODO: https://github.com/emberjs/ember.js/issues/15291
        let { _super } = this;

        const title = this.get("title");
        const reply = this.get("reply");

        // Edited posts already have a topic key.
        if (this.get("topic.topic_key")) {
          return getPrivateKey()
            .then(key => importKey(this.get("topic.topic_key"), key))
            .then(key =>
              Promise.all([
                encrypt(key, title).then(t => this.set("title", t)),
                encrypt(key, reply).then(r => this.set("reply", r))
              ])
            )
            .then(() => _super.call(this, ...arguments));
        }

        // Not encrypted messages.
        if (!this.get("isEncrypted")) {
          return _super.call(this, ...arguments);
        }

        // Generating a new topic key.
        const p0 = generateKey();

        // Encrypting user keys.
        const usernames = this.get("recipients");
        const p1 = p0.then(key =>
          ajax("/encrypt/userkeys", {
            type: "GET",
            data: { usernames }
          }).then(userKeys => {
            const promises = [];

            for (let i = 0; i < usernames.length; ++i) {
              const username = usernames[i];
              if (!userKeys[username]) {
                promises.push(Promise.reject(username));
              } else {
                promises.push(
                  importPublicKey(userKeys[username]).then(userKey =>
                    exportKey(key, userKey)
                  )
                );
              }
            }

            return Promise.all(promises);
          })
        );

        // Encrypting title and reply.
        const p2 = p0.then(key => encrypt(key, title));
        const p3 = p0.then(key => encrypt(key, reply));

        // Send user keys, title and reply encryption to the server.
        return Promise.all([p1, p2, p3])
          .then(([keys, encTitle, encReply]) => {
            const userKeys = {};
            for (let i = 0; i < keys.length; ++i) {
              userKeys[usernames[i]] = keys[i];
            }

            this.set("title", encTitle);
            this.set("reply", encReply);

            return Promise.all([userKeys, _super.call(this, ...arguments)]);
          }).then(([userKeys, result]) => {
            const topicId = result.responseJson.post.topic_id;
            ajax("/encrypt/topickeys", {
              type: "PUT",
              data: { topic_id: topicId, keys: userKeys }
            });

            return result;
          })
          .finally(() => this.setProperties({ title, reply }));
      },

      @observes("targetUsernames")
      checkKeys() {
        if (!this.get("isEncrypted")) {
          return;
        }

        const usernames = this.get("recipients");
        ajax("/encrypt/userkeys", {
          type: "GET",
          data: { usernames }
        }).then(userKeys => {
          for (let i = 0; i < usernames.length; ++i) {
            const username = usernames[i];
            if (!userKeys[username]) {
              bootbox.alert(
                I18n.t("encrypt.composer.user_has_no_key", { username })
              );
              return;
            }
          }
        });
      },

      @computed("targetUsernames")
      recipients(targetUsernames) {
        return targetUsernames.split(",").concat([this.get("user.username")]);
      }
    });
  }
};

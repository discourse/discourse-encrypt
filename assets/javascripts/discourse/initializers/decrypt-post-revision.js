import { cookAsync } from "discourse/lib/text";
import Post from "discourse/models/post";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicKey,
  hasTopicKey,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { decrypt } from "discourse/plugins/discourse-encrypt/lib/protocol";
import { Promise } from "rsvp";

export default {
  name: "decrypt-post-revisions",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const siteSettings = container.lookup("site-settings:main");
    if (getEncryptionStatus(currentUser, siteSettings) !== ENCRYPT_ACTIVE) {
      return;
    }

    Post.reopenClass({
      loadRevision() {
        return this._super(...arguments).then((result) => {
          if (!hasTopicKey(result.topic_id)) {
            return result;
          }

          const topicKey = getTopicKey(result.topic_id);
          return Promise.all([
            topicKey.then((k) => decrypt(k, result.raws.previous)),
            topicKey.then((k) => decrypt(k, result.raws.current)),
          ])
            .then(([previous, current]) =>
              Promise.all([
                previous.raw,
                cookAsync(previous.raw),
                current.raw,
                cookAsync(current.raw),
              ])
            )
            .then(([prevRaw, prevCooked, currRaw, currCooked]) => {
              result.body_changes.side_by_side = `
                <div class="revision-content">${prevCooked}</div>
                <div class="revision-content">${currCooked}</div>`;
              result.body_changes.side_by_side_markdown = `
                <table class="markdown">
                  <tr>
                    <td class="diff-del">${prevRaw}</td>
                    <td class="diff-ins">${currRaw}</td>
                  </tr>
                </table>`;
              return result;
            });
        });
      },
    });
  },
};

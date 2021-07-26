import Controller from "@ember/controller";
import discourseComputed from "discourse-common/utils/decorators";
import { ajax } from "discourse/lib/ajax";
import { extractError } from "discourse/lib/ajax-error";
import ModalFunctionality from "discourse/mixins/modal-functionality";
import { saveDbIdentity } from "discourse/plugins/discourse-encrypt/lib/database";
import { getIdentity } from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  exportIdentity,
  exportKey,
  generateIdentity,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { Promise } from "rsvp";

export default Controller.extend(ModalFunctionality, {
  onShow() {
    this.setProperties({
      confirmation: "",
      loading: false,
      error: null,
    });
  },

  @discourseComputed("loading")
  label(loading) {
    return loading ? `encrypt.rotate.${loading}` : "encrypt.rotate.title";
  },

  @discourseComputed("loading", "currentUser.username", "confirmation")
  disabled(loading, username, confirmation) {
    return loading || username !== confirmation;
  },

  actions: {
    rotate() {
      this.set("loading", "fetching");
      this.appEvents.trigger("modal-body:clearFlash");

      Promise.all([ajax("/encrypt/rotate"), getIdentity(), generateIdentity()])
        .then(([data, oldIdentity, newIdentity]) => {
          this.set("loading", "rotating");

          // Rotating signatures will invalidate all previous signatures.
          newIdentity.signPublic = oldIdentity.signPublic;
          newIdentity.signPrivate = oldIdentity.signPrivate;

          const topicIds = Object.keys(data.topic_keys);

          return Promise.all([
            newIdentity,
            exportIdentity(newIdentity),
            Promise.all(
              topicIds.map((topicId) =>
                importKey(
                  data.topic_keys[topicId],
                  oldIdentity.encryptPrivate
                ).then((key) => exportKey(key, newIdentity.encryptPublic))
              )
            ).then((exportedKeys) => {
              const topicKeys = {};
              for (let i = 0; i < topicIds.length; ++i) {
                topicKeys[topicIds[i]] = exportedKeys[i];
              }
              return topicKeys;
            }),
          ]);
        })
        .then(([identity, exportedIdentity, topicKeys]) => {
          this.set("loading", "saving");
          return ajax("/encrypt/rotate", {
            type: "PUT",
            data: {
              public: exportedIdentity.public,
              keys: topicKeys,
            },
          })
            .then(() => {
              this.set("loading", "updating");
              return saveDbIdentity(identity);
            })
            .then(() => {
              this.set("loading", "finished");
              this.appEvents.trigger("encrypt:status-changed");
            });
        })
        .catch((e) => {
          this.setProperties({ confirmation: "", loading: null });
          this.appEvents.trigger("modal-body:flash", {
            messageClass: "error",
            text: extractError(e),
          });
        });
    },
  },
});

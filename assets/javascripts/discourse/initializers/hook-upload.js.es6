import { withPluginApi } from "discourse/lib/plugin-api";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicKey,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-upload",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.8.31", api => {
      api.addComposerUploadHandler([".*"], (file, editor) => {
        const controller = container.lookup("controller:composer");
        const topicId = controller.get("model.topic.id");

        if (!hasTopicKey(topicId)) {
          if (controller.get("model.isEncrypted")) {
            // Cannot encrypt uploads for new topics.
            bootbox.alert(I18n.t("encrypt.encrypted_uploads"));
            return false;
          }
          return true;
        }

        let reader = new FileReader();
        reader.onloadend = () => {
          const iv = window.crypto.getRandomValues(new Uint8Array(12));
          getTopicKey(topicId)
            .then(key =>
              window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv, tagLength: 128 },
                key,
                reader.result
              )
            )
            .then(buffer => {
              let blob = new Blob([iv, buffer], {
                type: "application/x-binary"
              });
              let f = new File([blob], `${file.name}.encrypted`);
              editor.$().fileupload("send", {
                files: [f],
                originalFiles: [f],
                formData: { type: "composer" }
              });
            });
        };
        reader.readAsArrayBuffer(file);
        return false;
      });

      api.decorateCooked($el => {
        $el.on("click.discourse-encrypt", "a.attachment", function() {
          const topicId = $(this)
            .closest("[data-topic-id]")
            .data("topic-id");
          if (!hasTopicKey(topicId)) {
            return true;
          }

          const href = $(this).attr("href");
          new Ember.RSVP.Promise((resolve, reject) => {
            var req = new XMLHttpRequest();
            req.open("GET", href, true);
            req.responseType = "arraybuffer";
            req.onload = function() {
              const filename = req
                .getResponseHeader("Content-Disposition")
                .match(/filename="(.*?)\.encrypted"/)[1];
              resolve([req.response, filename]);
            };
            req.onerror = reject;
            req.send(null);
          }).then(([result, filename]) => {
            const iv = result.slice(0, 12);
            const content = result.slice(12);
            getTopicKey(topicId)
              .then(key =>
                window.crypto.subtle.decrypt(
                  { name: "AES-GCM", iv: iv, tagLength: 128 },
                  key,
                  content
                )
              )
              .then(decrypted => {
                var a = document.createElement("a");
                a.download = filename;
                a.style.display = "none";

                let blob = new Blob([decrypted], { type: "octet/stream" });
                let url = window.URL.createObjectURL(blob);
                a.href = url;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
              });
          });

          return false;
        });
      });
    });
  }
};

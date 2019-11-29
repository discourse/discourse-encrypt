import { withPluginApi } from "discourse/lib/plugin-api";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicKey,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";

export default {
  name: "hook-encrypt-upload",

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
                { name: "AES-GCM", iv, tagLength: 128 },
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
    });
  }
};

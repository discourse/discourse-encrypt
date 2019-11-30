import { withPluginApi } from "discourse/lib/plugin-api";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  getTopicKey,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { getUploadMarkdown, isAnImage } from "discourse/lib/uploads";

export default {
  name: "hook-encrypt-upload",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.8.31", api => {
      const localData = {};

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

        if (isAnImage(file.name)) {
          const img = new Image();
          img.onload = function() {
            const ratio = Math.min(
              Discourse.SiteSettings.max_image_width / img.width,
              Discourse.SiteSettings.max_image_height / img.height
            );

            localData[file.name] = {
              original_filename: file.name,
              width: img.width,
              height: img.height,
              thumbnail_width: Math.floor(img.width * ratio),
              thumbnail_height: Math.floor(img.height * ratio)
            };

            // TODO: Save object URL to be used in composer
          };
          img.src = window.URL.createObjectURL(file);
        } else {
          localData[file.name] = { original_filename: file.name };
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

      api.addComposerUploadMarkdownResolver(upload => {
        const realUpload = {};
        Object.assign(realUpload, upload);

        const filename = upload.original_filename.replace(/\.encrypted$/, "");
        if (!localData[filename]) {
          return;
        }

        Object.assign(realUpload, localData[filename]);
        delete localData[filename];

        return getUploadMarkdown(realUpload).replace("|", ".encrypted|");
      });
    });
  }
};

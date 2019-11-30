import { withPluginApi } from "discourse/lib/plugin-api";
import { getUploadMarkdown, isAnImage } from "discourse/lib/uploads";
import { bufferToBase64 } from "discourse/plugins/discourse-encrypt/lib/base64";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  hasTopicKey
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { DEFAULT_LIST } from "pretty-text/white-lister";
import { Promise } from "rsvp";

export default {
  name: "hook-encrypt-upload",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.8.31", api => {
      DEFAULT_LIST.push("a[data-key]");
      DEFAULT_LIST.push("img[data-key]");

      const uploadsKeys = {};
      const uploadsData = {};

      api.addComposerUploadHandler([".*"], (file, editor) => {
        const controller = container.lookup("controller:composer");
        const topicId = controller.get("model.topic.id");
        if (!controller.get("model.isEncrypted") && !hasTopicKey(topicId)) {
          return true;
        }

        const dataPromise = isAnImage(file.name)
          ? new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = err => reject(err);
              img.src = window.URL.createObjectURL(file);
            }).then(img => {
              const ratio = Math.min(
                Discourse.SiteSettings.max_image_width / img.width,
                Discourse.SiteSettings.max_image_height / img.height
              );

              return {
                original_filename: file.name,
                width: img.width,
                height: img.height,
                thumbnail_width: Math.floor(img.width * ratio),
                thumbnail_height: Math.floor(img.height * ratio)
              };
            })
          : Promise.resolve({ original_filename: file.name });

        const decryptedPromise = new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = err => reject(err);
          reader.readAsArrayBuffer(file);
        });

        const keyPromise = new Promise((resolve, reject) => {
          window.crypto.subtle
            .generateKey({ name: "AES-GCM", length: 256 }, true, [
              "encrypt",
              "decrypt"
            ])
            .then(resolve, reject);
        });

        const exportedKeyPromise = keyPromise.then(key => {
          return window.crypto.subtle
            .exportKey("raw", key)
            .then(wrapped => bufferToBase64(wrapped));
        });

        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedPromise = Promise.all([
          decryptedPromise,
          keyPromise
        ]).then(([decrypted, key]) => {
          return window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv, tagLength: 128 },
            key,
            decrypted
          );
        });

        Promise.all([encryptedPromise, exportedKeyPromise, dataPromise]).then(
          ([encrypted, exportedKey, data]) => {
            uploadsKeys[file.name] = exportedKey;
            uploadsData[file.name] = data;

            const blob = new Blob([iv, encrypted], {
              type: "application/x-binary"
            });
            const f = new File([blob], `${file.name}.encrypted`);
            editor.$().fileupload("send", {
              files: [f],
              originalFiles: [f],
              formData: { type: "composer" }
            });
          }
        );
        return false;
      });

      api.addComposerUploadMarkdownResolver(upload => {
        const filename = upload.original_filename.replace(/\.encrypted$/, "");
        if (!uploadsKeys[filename] && !uploadsData[filename]) {
          return;
        }

        const realUpload = {};
        Object.assign(realUpload, upload);
        Object.assign(realUpload, uploadsData[filename]);
        const key = uploadsKeys[filename];

        delete uploadsData[filename];
        delete uploadsKeys[filename];

        return getUploadMarkdown(realUpload).replace("](", `|key=${key}](`);
      });
    });
  }
};

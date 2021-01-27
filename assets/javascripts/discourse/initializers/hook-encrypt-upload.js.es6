import { withPluginApi } from "discourse/lib/plugin-api";
import { getUploadMarkdown } from "discourse/lib/uploads";
import { bufferToBase64 } from "discourse/plugins/discourse-encrypt/lib/base64";
import {
  generateUploadKey,
  getMetadata,
  readFile,
} from "discourse/plugins/discourse-encrypt/lib/uploads";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
  hasTopicKey,
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

    withPluginApi("0.8.31", (api) => {
      DEFAULT_LIST.push("a[data-key]");
      DEFAULT_LIST.push("a[data-type]");
      DEFAULT_LIST.push("img[data-key]");
      DEFAULT_LIST.push("img[data-type]");

      const uploadsKeys = {};
      const uploadsType = {};
      const uploadsData = {};
      const uploadsUrl = {};

      api.addComposerUploadHandler([".*"], (file, editor) => {
        const controller = container.lookup("controller:composer");
        const topicId = controller.get("model.topic.id");
        if (!controller.get("model.isEncrypted") && !hasTopicKey(topicId)) {
          return true;
        }

        const metadataPromise = getMetadata(file, uploadsUrl);
        const plaintextPromise = readFile(file);
        const keyPromise = generateUploadKey();
        const exportedKeyPromise = keyPromise.then((key) => {
          return window.crypto.subtle
            .exportKey("raw", key)
            .then((wrapped) => bufferToBase64(wrapped));
        });

        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const ciphertextPromise = Promise.all([
          plaintextPromise,
          keyPromise,
        ]).then(([plaintext, key]) => {
          return window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv, tagLength: 128 },
            key,
            plaintext
          );
        });

        Promise.all([
          ciphertextPromise,
          exportedKeyPromise,
          metadataPromise,
        ]).then(([ciphertext, exportedKey, data]) => {
          uploadsKeys[file.name] = exportedKey;
          uploadsType[file.name] = file.type;
          uploadsData[file.name] = data;

          const blob = new Blob([iv, ciphertext], {
            type: "application/x-binary",
          });
          const f = new File([blob], `${file.name}.encrypted`);
          editor.$().fileupload("send", {
            files: [f],
            originalFiles: [f],
            formData: { type: "composer" },
          });
        });
        return false;
      });

      api.addComposerUploadMarkdownResolver((upload) => {
        const filename = upload.original_filename.replace(/\.encrypted$/, "");
        if (!uploadsKeys[filename]) {
          return;
        }

        const realUpload = {};
        Object.assign(realUpload, upload);
        Object.assign(realUpload, uploadsData[filename]);
        const key = uploadsKeys[filename];
        const type = uploadsType[filename];
        upload.url = uploadsUrl[filename];

        delete uploadsData[filename];
        delete uploadsKeys[filename];
        delete uploadsType[filename];
        delete uploadsUrl[filename];

        return getUploadMarkdown(realUpload).replace(
          "](",
          `|type=${type}|key=${key}](`
        );
      });
    });
  },
};

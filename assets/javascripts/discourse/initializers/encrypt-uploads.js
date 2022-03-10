import { withPluginApi } from "discourse/lib/plugin-api";
import { getUploadMarkdown } from "discourse/lib/uploads";
import {
  ENCRYPT_ACTIVE,
  getEncryptionStatus,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import UppyUploadEncrypt from "discourse/plugins/discourse-encrypt/lib/uppy-upload-encrypt-plugin";
import { DEFAULT_LIST } from "pretty-text/white-lister";

export default {
  name: "encrypt-uploads",

  initialize(container) {
    const currentUser = container.lookup("current-user:main");
    const siteSettings = container.lookup("site-settings:main");
    if (getEncryptionStatus(currentUser) !== ENCRYPT_ACTIVE) {
      return;
    }

    withPluginApi("0.11.3", (api) => {
      DEFAULT_LIST.push("a[data-key]");
      DEFAULT_LIST.push("a[data-type]");
      DEFAULT_LIST.push("img[data-key]");
      DEFAULT_LIST.push("img[data-type]");

      const uploads = {};
      api.addComposerUploadPreProcessor(
        UppyUploadEncrypt,
        ({ composerModel }) => {
          return {
            composerModel,
            siteSettings,
            storeEncryptedUpload: (fileName, data) => {
              uploads[fileName] = data;
            },
          };
        }
      );

      api.addComposerUploadMarkdownResolver((upload) => {
        const encryptedUpload =
          uploads[upload.original_filename.replace(/\.encrypted$/, "")] ||
          Object.values(uploads).find((u) => u.filesize === upload.filesize);
        if (!encryptedUpload) {
          return;
        }

        Object.assign(upload, encryptedUpload.metadata);
        const markdown = getUploadMarkdown(upload).replace(
          "](",
          `|type=${encryptedUpload.type}|key=${encryptedUpload.key}](`
        );
        delete uploads[encryptedUpload.original_filename];
        return markdown;
      });
    });
  },
};

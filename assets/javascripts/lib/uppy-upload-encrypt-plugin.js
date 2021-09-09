import { Promise } from "rsvp";
import { hasTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { bufferToBase64 } from "discourse/plugins/discourse-encrypt/lib/base64";
import { UploadPreProcessorPlugin } from "discourse/lib/uppy-plugin-base";

import {
  generateUploadKey,
  getMetadata,
  readFile,
} from "discourse/plugins/discourse-encrypt/lib/uploads";

export default class UppyUploadEncrypt extends UploadPreProcessorPlugin {
  static pluginId = "uppy-upload-encrypt";

  constructor(uppy, opts) {
    super(uppy, opts);
    this.composerModel = opts.composerModel;
    this.storeEncryptedUpload = opts.storeEncryptedUpload;
    this.siteSettings = opts.siteSettings;
  }

  async _encryptFile(fileId) {
    let file = this._getFile(fileId);
    this._emitProgress(file);

    const key = await generateUploadKey();
    let exportedKey = await window.crypto.subtle.exportKey("raw", key);
    exportedKey = bufferToBase64(exportedKey);

    const metadata = await getMetadata(file.data, this.siteSettings);
    const plaintext = await readFile(file.data);

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      key,
      plaintext
    );

    const blob = new Blob([iv, ciphertext], {
      type: "application/x-binary",
    });

    this._setFileState(fileId, {
      data: blob,
      size: blob.size,
      name: `${file.name}.encrypted`,
    });

    this.storeEncryptedUpload(file.name, {
      key: exportedKey,
      metadata,
      type: file.type,
      filesize: blob.size,
    });
    this._emitComplete(file);
  }

  async _encryptFiles(fileIds) {
    if (
      !this.composerModel.isEncrypted &&
      !hasTopicKey(this.composerModel.get("topic.id"))
    ) {
      return Promise.resolve();
    }

    let encryptTasks = fileIds.map((fileId) => () =>
      this._encryptFile.call(this, fileId)
    );

    for (const task of encryptTasks) {
      await task();
    }
  }

  install() {
    this._install(this._encryptFiles.bind(this));
  }

  uninstall() {
    this._uninstall(this._encryptFiles.bind(this));
  }
}

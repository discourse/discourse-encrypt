import { hasTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { Promise } from "rsvp";
import { bufferToBase64 } from "discourse/plugins/discourse-encrypt/lib/base64";
import { UploadPreProcessorPlugin } from "discourse/lib/uppy-plugin-base";
import { HUGE_FILE_THRESHOLD_BYTES } from "discourse/mixins/uppy-upload";
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
    const file = this._getFile(fileId);

    if (file.size > HUGE_FILE_THRESHOLD_BYTES) {
      return this._emitError(
        file,
        "The provided file is too large to upload to an encrypted message."
      );
    }

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
      this._consoleDebug(
        "Composer is not being used in an encrypted context, skipping all files."
      );
      return this._skipAll(fileIds, true);
    }

    const encryptPromises = fileIds.map((fileId) => this._encryptFile(fileId));
    return Promise.all(encryptPromises);
  }

  install() {
    this._install(this._encryptFiles.bind(this));
  }

  uninstall() {
    this._uninstall(this._encryptFiles.bind(this));
  }
}

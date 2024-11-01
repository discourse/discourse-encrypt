import { lookupCachedUploadUrl } from "pretty-text/upload-short-url";
import { ajax } from "discourse/lib/ajax";
import { base64ToBuffer } from "discourse/plugins/discourse-encrypt/lib/base64";
import { getTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { decrypt } from "discourse/plugins/discourse-encrypt/lib/protocol";
import { downloadEncryptedFile } from "discourse/plugins/discourse-encrypt/lib/uploads";

const UPLOAD_REGEX = /\[(.+)\]\((upload:\/\/\w{27}.encrypted)\)/g;

export default class PermanentTopicDecrypter {
  topicId;
  logCallback;

  constructor(topicId, logCallback) {
    this.topicId = topicId;
    this.log = logCallback;
  }

  async run() {
    try {
      this.log("Starting decryption...");

      const topicId = this.topicId;

      this.log("Fetching raw topic data...");
      const encryptedData = await ajax(
        `/encrypt/data_for_decryption.json?topic_id=${topicId}`
      );

      this.log("Loading topic encrypting key...");
      const topicKey = await getTopicKey(topicId);

      this.log("Decrypting title...");
      const decryptedTitle = (await decrypt(topicKey, encryptedData.title)).raw;

      const decryptedPosts = {};
      const decryptedPostPromises = [];

      this.log("Queuing posts for decryption...");
      for (const [id, post] of Object.entries(encryptedData.posts)) {
        const promise = decrypt(topicKey, post)
          .then((decryptedPost) => (decryptedPosts[id] = decryptedPost.raw))
          .catch((error) => {
            throw new Error(`Unable to decrypt post ${id}: ${error}`);
          });
        decryptedPostPromises.push(promise);
      }

      this.log("Waiting for posts to decrypt...");
      await Promise.all(decryptedPostPromises);

      this.log("Checking for encrypted uploads...");
      for (let [id, post] of Object.entries(decryptedPosts)) {
        for (const [, rawMetadata, shortUrl] of [
          ...post.matchAll(UPLOAD_REGEX),
        ]) {
          this.log(`  Found ${shortUrl} in post ${id}...`);
          const metadata = rawMetadata.split("|");

          const type = metadata
            .find((m) => m.startsWith("type="))
            ?.split("=")?.[1];
          if (!type) {
            throw new Error(`Could not determine type of upload ${shortUrl}`);
          }

          const key = metadata
            .find((m) => m.startsWith("key="))
            ?.split("=")?.[1];
          if (!key) {
            throw new Error(`Could not determine key of upload ${shortUrl}`);
          }

          const urlData = lookupCachedUploadUrl(shortUrl);

          const url = urlData.short_path;
          if (!url) {
            throw new Error(`Could not find full URL for upload ${shortUrl}`);
          }

          const keyPromise = new Promise((resolve, reject) => {
            window.crypto.subtle
              .importKey(
                "raw",
                base64ToBuffer(key),
                { name: "AES-GCM", length: 256 },
                true,
                ["encrypt", "decrypt"]
              )
              .then(resolve, reject);
          });

          this.log(`    Downloading and decrypting ${shortUrl}...`);
          const decryptedDownloadedFile = await downloadEncryptedFile(
            url,
            keyPromise,
            { type }
          );
          this.log(`    Re-uploading ${shortUrl}...`);
          const newShortUrl = await this.uploadBlob(
            decryptedDownloadedFile.blob,
            decryptedDownloadedFile.name.replace(".encrypted", "")
          );
          this.log(`    Uploaded as ${newShortUrl}.`);

          post = post.replace(shortUrl, newShortUrl);
        }

        decryptedPosts[id] = post;
      }

      this.log(`Updating topic with decrypted data...`);
      await ajax("/encrypt/complete_decryption.json", {
        type: "POST",
        data: {
          topic_id: topicId,
          title: decryptedTitle,
          posts: decryptedPosts,
        },
      });

      this.log(`Done!`);
      return true;
    } catch (e) {
      this.log(`Error: ${e}`);
      throw e;
    }
  }

  async uploadBlob(blob, filename) {
    const formData = new FormData();
    formData.append("files[]", blob, filename);
    formData.append("upload_type", "composer");

    const result = await ajax("/uploads.json", {
      type: "POST",
      data: formData,
      processData: false,
      contentType: false,
    });

    return result.short_url;
  }
}

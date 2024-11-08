import { tracked } from "@glimmer/tracking";
import {
  lookupCachedUploadUrl,
  lookupUncachedUploadUrls,
} from "pretty-text/upload-short-url";
import { ajax } from "discourse/lib/ajax";
import { base64ToBuffer } from "discourse/plugins/discourse-encrypt/lib/base64";
import { getTopicKey } from "discourse/plugins/discourse-encrypt/lib/discourse";
import { decrypt } from "discourse/plugins/discourse-encrypt/lib/protocol";
import { downloadEncryptedFile } from "discourse/plugins/discourse-encrypt/lib/uploads";

const UPLOAD_REGEX = /\[([^\]]+)\]\((upload:\/\/\w{27}.encrypted)\)/g;

export default class PermanentTopicDecrypter {
  @tracked logContent = "";
  @tracked success = false;
  @tracked error = false;
  @tracked running = false;
  @tracked topicTitle;

  topicId;

  constructor(topicId) {
    this.topicId = topicId;
  }

  log(msg) {
    this.logContent += `${msg}\n`;
  }

  async retryOnRateLimit(callback, attemptNumber = 1) {
    try {
      return await callback();
    } catch (e) {
      if (e.jqXHR && e.jqXHR.status === 429 && attemptNumber < 3) {
        const retryAfterHeader = e.jqXHR.getResponseHeader("Retry-After");
        const retryAfter = retryAfterHeader
          ? parseInt(retryAfterHeader, 10)
          : 10;

        this.log(
          `Rate limited (attempt: ${attemptNumber}), retrying in ${retryAfter} seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
        return this.retryOnRateLimit(callback, attemptNumber + 1);
      }
      throw e;
    }
  }

  async run() {
    try {
      this.running = true;
      this.log("Starting decryption...");

      const topicId = this.topicId;

      this.log("Fetching raw topic data...");
      const encryptedData = await this.retryOnRateLimit(() =>
        ajax(`/encrypt/data_for_decryption.json?topic_id=${topicId}`)
      );

      this.log("Loading topic encrypting key...");
      const topicKey = await getTopicKey(topicId);

      this.log("Decrypting title...");
      const decryptedTitle = (await decrypt(topicKey, encryptedData.title)).raw;
      this.topicTitle = decryptedTitle;

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

      const shortUrls = [];
      for (let [, post] of Object.entries(decryptedPosts)) {
        for (const [, , shortUrl] of [...post.matchAll(UPLOAD_REGEX)]) {
          shortUrls.push(shortUrl);
        }
      }
      if (shortUrls.length > 0) {
        this.log(`Fetching full URLs for ${shortUrls.length} uploads...`);
        await this.retryOnRateLimit(() =>
          lookupUncachedUploadUrls(shortUrls, ajax)
        );
      }

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

          this.log("  Looking up full upload URL...");
          const urlData = await lookupCachedUploadUrl(shortUrl);

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
          const decryptedDownloadedFile = await this.retryOnRateLimit(() =>
            downloadEncryptedFile(url, keyPromise, { type })
          );
          this.log(`    Re-uploading ${shortUrl}...`);
          const newShortUrl = await this.retryOnRateLimit(() =>
            this.uploadBlob(
              decryptedDownloadedFile.blob,
              decryptedDownloadedFile.name?.replace(".encrypted", "")
            )
          );
          this.log(`    Uploaded as ${newShortUrl}.`);

          post = post.replace(shortUrl, newShortUrl);
        }

        decryptedPosts[id] = post;
      }

      this.log("Updating topic with decrypted data...");
      await this.retryOnRateLimit(() =>
        ajax("/encrypt/complete_decryption.json", {
          type: "POST",
          data: {
            topic_id: topicId,
            title: decryptedTitle,
            posts: decryptedPosts,
          },
        })
      );

      this.log("Done!");
      this.success = true;
      return true;
    } catch (e) {
      this.log(`Error: ${e}`);
      this.error = true;
      throw e;
    } finally {
      this.running = false;
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

import { isImage } from "discourse/lib/uploads";
import { Promise } from "rsvp";

export function getMetadata(file, siteSettings) {
  if (!isImage(file.name)) {
    return Promise.resolve({ original_filename: file.name });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = window.URL.createObjectURL(file);
  }).then((img) => {
    const ratio = Math.min(
      siteSettings.max_image_width / img.width,
      siteSettings.max_image_height / img.height
    );

    return {
      original_filename: file.name,
      url: img.src,
      width: img.width,
      height: img.height,
      thumbnail_width: Math.floor(img.width * ratio),
      thumbnail_height: Math.floor(img.height * ratio),
    };
  });
}

export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function generateUploadKey() {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ])
      .then(resolve, reject);
  });
}

export function downloadEncryptedFile(url, keyPromise, opts) {
  opts = opts || {};

  const downloadPromise = new Promise((resolve, reject) => {
    let req = new XMLHttpRequest();
    req.open("GET", url, true);
    req.responseType = "arraybuffer";
    req.onload = function () {
      let filename = req.getResponseHeader("Content-Disposition");
      if (filename) {
        // Requires Access-Control-Expose-Headers: Content-Disposition.
        filename = filename.match(/filename="(.*?)"/)[1];
      }
      resolve({ buffer: req.response, filename });
    };
    req.onerror = reject;
    req.send();
  });

  return Promise.all([keyPromise, downloadPromise]).then(([key, download]) => {
    const iv = download.buffer.slice(0, 12);
    const content = download.buffer.slice(12);

    return new Promise((resolve, reject) => {
      window.crypto.subtle
        .decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, content)
        .then(resolve, reject);
    }).then((buffer) => ({
      blob: new Blob([buffer], { type: opts.type || "application/x-binary" }),
      name: download.filename,
    }));
  });
}

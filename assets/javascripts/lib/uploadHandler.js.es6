import { isImage } from "discourse/lib/uploads";

export function fetchDataPromise(file, uploadsUrl) {
  if (!isImage(file.name)) {
    return Promise.resolve({ original_filename: file.name });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = err => reject(err);
    img.src = window.URL.createObjectURL(file);
    uploadsUrl[file.name] = img.src;
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
  });
}

export function fetchDecryptedPromise(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = err => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function fetchKeyPromise() {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt"
      ])
      .then(resolve, reject);
  });
}

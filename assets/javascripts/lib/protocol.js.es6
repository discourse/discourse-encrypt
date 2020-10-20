import {
  base64ToBuffer,
  bufferToBase64,
} from "discourse/plugins/discourse-encrypt/lib/base64";
import { useLocalStorage } from "discourse/plugins/discourse-encrypt/lib/database";
import {
  decrypt as decryptV0,
  encrypt as encryptV0,
  exportIdentity as exportIdentityV0,
  generateIdentity as generateIdentityV0,
  importIdentity as importIdentityV0,
} from "discourse/plugins/discourse-encrypt/lib/protocol_v0";
import {
  decrypt as decryptV1,
  encrypt as encryptV1,
  exportIdentity as exportIdentityV1,
  generateIdentity as generateIdentityV1,
  importIdentity as importIdentityV1,
  verify as verifyV1,
} from "discourse/plugins/discourse-encrypt/lib/protocol_v1";
import { Promise } from "rsvp";

/**
 * @var {Number} ENCRYPT_PROTOCOL_VERSION Current protocol version.
 */
export const ENCRYPT_PROTOCOL_VERSION = 1;

/*
 * Identity management
 */

/**
 * Generates a user identity.
 *
 * @return {Promise}
 */
export function generateIdentity(version) {
  version = version || ENCRYPT_PROTOCOL_VERSION;

  let promise = Promise.reject();
  if (version === 0) {
    promise = generateIdentityV0().then((id) => ({
      encryptPublic: id.publicKey,
      encryptPrivate: id.privateKey,
    }));
  } else if (version === 1) {
    promise = generateIdentityV1();
  }

  return promise.then((id) => {
    id.version = version;
    return id;
  });
}

/**
 * Exports a user identity. If a passphrase is given, then the result will be
 * encrypted.
 *
 * @param {Object} identity
 * @param {String} passphrase
 *
 * @return {Promise<String | { public: String, private: String }>}
 */
export function exportIdentity(identity, passphrase) {
  let promise = Promise.reject();
  if (identity.version === 0) {
    promise = exportIdentityV0(
      {
        publicKey: identity.encryptPublic,
        privateKey: identity.encryptPrivate,
      },
      passphrase
    );
  } else if (identity.version === 1) {
    promise = exportIdentityV1(identity, passphrase);
  }

  return promise.then((exported) => ({
    public: identity.version + "$" + exported.public,
    private: identity.version + "$" + exported.private,
  }));
}

/**
 * Imports a user identity.
 *
 * @param {Object} identity
 * @param {String} passphrase
 * @param {Boolean} extractable
 *
 * @return {Promise}
 */
export function importIdentity(identity, passphrase, extractable) {
  // HACK: Since paper keys can be generated at any time, keys must be
  // extractable at all times (the same behaviour required in Safari).
  extractable = !!extractable || useLocalStorage || true;

  const sep = identity.indexOf("$");
  const version = parseInt(identity.substr(0, sep), 10);
  identity = identity.substr(sep + 1);

  let promise = Promise.reject();
  if (version === 0) {
    promise = importIdentityV0(identity, passphrase, extractable).then(
      (id) => ({
        encryptPublic: id.publicKey,
        encryptPrivate: id.privateKey,
      })
    );
  } else if (version === 1) {
    promise = importIdentityV1(identity, passphrase, extractable);
  }

  return promise.then((id) => {
    id.version = version;
    return id;
  });
}

/*
 * Encryption, decryption and verification
 */

/**
 * Encrypts an object.
 *
 * @param {CryptoKey} key
 * @param {String|Object} data
 * @param {{ includeUploads: Boolean,
 *           signKey: CryptoKey,
 *           version: Number }} opts
 *
 * @return {Promise<String>}
 */
export function encrypt(key, data, opts) {
  // Build extra information that will be appended to the ciphertext. This
  // extra information is _not_ encrypted and it is required for various
  // features.
  //
  // For example, links to uploads must be visible, otherwise the server will
  // attempt to remove orphaned uploads.
  let extra = "";

  if (opts && opts.includeUploads) {
    const uploads = data.raw.match(/upload:\/\/[A-Za-z0-9\.]+/g);
    if (uploads) {
      extra += "\n" + uploads.map((upload) => `[](${upload})`).join();
    }
  }

  const version = (opts && opts.version) || ENCRYPT_PROTOCOL_VERSION;

  let promise = Promise.reject();
  if (version === 0) {
    promise = encryptV0(key, typeof data === "object" ? data.raw : data);
  } else if (version === 1) {
    promise = encryptV1(key, opts && opts.signKey, data);
  }

  return promise.then((ciphertext) => version + "$" + ciphertext + extra);
}

/**
 * Decrypts a message.
 *
 * @param {CryptoKey} key
 * @param {String} ciphertext
 *
 * @return {Promise<Object>}
 */
export function decrypt(key, ciphertext) {
  ciphertext = ciphertext.split("\n")[0];

  const sep = ciphertext.indexOf("$");
  const version = parseInt(ciphertext.substr(0, sep), 10);
  ciphertext = ciphertext.substr(sep + 1);

  if (version === 0) {
    return decryptV0(key, ciphertext).then((plaintext) => ({
      raw: plaintext,
    }));
  } else if (version === 1) {
    return decryptV1(key, ciphertext);
  }
}

/**
 * Verifies the integrity and signature of a message.
 *
 * @param {CryptoKey} key
 * @param {String|Object} plaintext
 * @param {String} ciphertext
 */
export function verify(key, plaintext, ciphertext) {
  ciphertext = ciphertext.split("\n")[0];

  const sep = ciphertext.indexOf("$");
  const version = parseInt(ciphertext.substr(0, sep), 10);
  ciphertext = ciphertext.substr(sep + 1);

  if (version === 0) {
    return Promise.resolve(null);
  } else if (version === 1) {
    return verifyV1(key, plaintext, ciphertext);
  }
}

/*
 * Key management
 */

/**
 * Generates a symmetric key used to encrypt topic keys.
 *
 * @return {Promise<CryptoKey>}
 */
export function generateKey() {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt",
      ])
      .then(resolve, reject);
  });
}

/**
 * Exports and wraps a symmetric key.
 *
 * @param {CryptoKey} key
 * @param {CryptoKey} publicKey
 *
 * @return {Promise<String>}
 */
export function exportKey(key, publicKey) {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .wrapKey("raw", key, publicKey, {
        name: "RSA-OAEP",
        hash: { name: "SHA-256" },
      })
      .then((wrapped) => bufferToBase64(wrapped))
      .then(resolve, reject);
  });
}

/**
 * Unwraps and imports a symmetric key.
 *
 * @param {CryptoKey} key
 * @param {CryptoKey} privateKey
 *
 * @return {Promise<CryptoKey>}
 */
export function importKey(key, privateKey) {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .unwrapKey(
        "raw",
        base64ToBuffer(key),
        privateKey,
        { name: "RSA-OAEP", hash: { name: "SHA-256" } },
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      )
      .then(resolve, reject);
  });
}

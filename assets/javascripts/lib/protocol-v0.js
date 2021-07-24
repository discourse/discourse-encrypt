import {
  base64ToBuffer,
  bufferToBase64,
} from "discourse/plugins/discourse-encrypt/lib/base64";
import { Promise } from "rsvp";

/**
 * Converts a string to a bytes array.
 *
 * @param {String} str
 *
 * @return {Uint16Array}
 */
export function _stringToBuffer(str) {
  let buffer = new ArrayBuffer(str.length * 2);
  let array = new Uint16Array(buffer);
  for (let i = 0; i < str.length; ++i) {
    array[i] = str.charCodeAt(i);
  }
  return buffer;
}

/**
 * Converts a bytes array to a string.
 *
 * @param {Uint16Array} buffer
 *
 * @return {String}
 */
export function _bufferToString(buffer) {
  return new TextDecoder("UTF-16").decode(buffer);
}

/**
 * Exports a public key.
 *
 * @param {CryptoKey} publicKey
 *
 * @return {Promise<String>}
 */
export function _exportPublicKey(publicKey) {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .exportKey("jwk", publicKey)
      .then((jwk) => bufferToBase64(_stringToBuffer(JSON.stringify(jwk))))
      .then(resolve, reject);
  });
}

/**
 * Imports a public key.
 *
 * @param {String} publicKey
 * @param {Array<String>} usages
 * @param {Boolean} extractable
 *
 * @return {Promise<CryptoKey>}
 */
export function _importPublicKey(publicKey, usages, extractable) {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .importKey(
        "jwk",
        JSON.parse(_bufferToString(base64ToBuffer(publicKey))),
        { name: "RSA-OAEP", hash: { name: "SHA-256" } },
        extractable,
        usages ? usages : ["encrypt", "wrapKey"]
      )
      .then(resolve, reject);
  });
}

/**
 * Exports a private key to a string, but encrypts it first.
 *
 * @param {CryptoKey} privateKey
 * @param {CryptoKey} key         Key used to encrypt `privateKey`.
 *
 * @return {Promise<String>}
 */
export function _exportPrivateKey(privateKey, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .wrapKey("jwk", privateKey, key, { name: "AES-GCM", iv })
      .then((buffer) => bufferToBase64(iv) + bufferToBase64(buffer))
      .then(resolve, reject);
  });
}

/**
 * Imports a private key.
 *
 * @param {CryptoKey} privateKey
 * @param {CryptoKey} key         Key used to decrypt `privateKey`.
 * @param {Boolean}   extractable Whether imported key can be further exported or not.
 *
 * @return {Promise<CryptoKey>}
 */
export function _importPrivateKey(privateKey, key, extractable) {
  const iv = base64ToBuffer(privateKey.substring(0, 16));
  const wrapped = base64ToBuffer(privateKey.substring(16));
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .unwrapKey(
        "jwk",
        wrapped,
        key,
        { name: "AES-GCM", iv },
        { name: "RSA-OAEP", hash: { name: "SHA-256" } },
        extractable,
        ["decrypt", "unwrapKey"]
      )
      .then(resolve, reject);
  });
}

/*
 * Key generation
 */

export function _getSalt() {
  return bufferToBase64(window.crypto.getRandomValues(new Uint8Array(16)));
}

export function _getPassphraseKey(passphrase, salt) {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .importKey(
        "raw",
        _stringToBuffer(passphrase),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      )
      .then((key) =>
        window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: base64ToBuffer(salt),
            iterations: 128000,
            hash: "SHA-256",
          },
          key,
          { name: "AES-GCM", length: 256 },
          false,
          ["wrapKey", "unwrapKey"]
        )
      )
      .then(resolve, reject);
  });
}

export function generateIdentity() {
  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 4096,
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          hash: { name: "SHA-256" },
        },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
      )
      .then((keyPair) => ({
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
      }))
      .then(resolve, reject);
  });
}

export function exportIdentity(identity, passphrase) {
  if (passphrase) {
    const salt = _getSalt();
    return Promise.all([
      _exportPublicKey(identity.publicKey),
      _getPassphraseKey(passphrase, salt).then((key) =>
        _exportPrivateKey(identity.privateKey, key)
      ),
    ]).then(([publicKey, privateKey]) => ({
      public: publicKey,
      private: publicKey + "$" + privateKey + "$" + salt,
    }));
  } else {
    return Promise.all([
      _exportPublicKey(identity.publicKey),
      _exportPublicKey(identity.privateKey),
    ]).then(([publicKey, privateKey]) => ({
      public: publicKey,
      private: publicKey + "$" + privateKey,
    }));
  }
}

export function importIdentity(identity, passphrase, extractable) {
  if (passphrase) {
    const [publicStr, privateStr, salt] = identity.split("$");
    return Promise.all([
      _importPublicKey(publicStr, null, extractable),
      _getPassphraseKey(passphrase, salt).then((key) =>
        _importPrivateKey(privateStr, key, extractable)
      ),
    ]).then(([publicKey, privateKey]) => ({ publicKey, privateKey }));
  } else {
    const [publicStr, privateStr] = identity.split("$");
    return Promise.all([
      _importPublicKey(publicStr, null, extractable),
      privateStr
        ? _importPublicKey(privateStr, ["decrypt", "unwrapKey"], extractable)
        : undefined,
    ]).then(([publicKey, privateKey]) => ({ publicKey, privateKey }));
  }
}

/*
 * Encryption, decryption and verification
 */

export function encrypt(key, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const buffer = _stringToBuffer(plaintext);

  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .encrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, buffer)
      .then((encrypted) => bufferToBase64(iv) + bufferToBase64(encrypted))
      .then(resolve, reject);
  });
}

export function decrypt(key, ciphertext) {
  const iv = base64ToBuffer(ciphertext.substring(0, 16));
  const encrypted = base64ToBuffer(ciphertext.substring(16));

  return new Promise((resolve, reject) => {
    window.crypto.subtle
      .decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encrypted)
      .then((buffer) => _bufferToString(buffer))
      .then(resolve, reject);
  });
}

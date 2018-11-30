import {
  base64ToBuffer,
  bufferToBase64
} from "discourse/plugins/discourse-encrypt/lib/base64";

import {
  stringToBuffer,
  bufferToString,
  hexToBuffer
} from "discourse/plugins/discourse-encrypt/lib/buffers";

import { isSafari } from "discourse/plugins/discourse-encrypt/lib/keys_db";

/**
 * Salt used in generating passphrase keys.
 *
 * The salt must be a string of 16-bytes in hex format.
 *
 * @var String
 */
const PASSPHRASE_SALT = "e85c53e7f119d41fd7895cdc9d7bb9dd"; // TODO

/*
 * Utilities
 * =========
 */

/**
 * Exports a key to a buffer.
 *
 * It does this by exporting it first to JWK, then to a string and finally to a
 * buffer.
 *
 * @param key
 *
 * @return A promise of a buffer.
 */
function exportKeyToBuffer(key) {
  return window.crypto.subtle
    .exportKey("jwk", key)
    .then(jwk => stringToBuffer(JSON.stringify(jwk)));
}

/*
 * User keypairs
 * =============
 */

/**
 * Generates a cryptographically secure key pair.
 *
 * @return Array A tuple of a public and private key.
 */
export function generateKeyPair() {
  return window.crypto.subtle
    .generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 4096,
        publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
        hash: { name: "SHA-256" }
      },
      true,
      ["encrypt", "decrypt"]
    )
    .then(keyPair => [keyPair.publicKey, keyPair.privateKey]);
}

/**
 * Exports a public key.
 *
 * @param publicKey
 *
 * @return String
 */
export function exportPublicKey(publicKey) {
  return window.crypto.subtle
    .exportKey("jwk", publicKey)
    .then(jwk => bufferToBase64(stringToBuffer(JSON.stringify(jwk))));
}

/**
 * Imports a public key.
 *
 * @param publicKey
 *
 * @return CryptoKey
 */
export function importPublicKey(publicKey) {
  return window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(bufferToString(base64ToBuffer(publicKey))),
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" }
    },
    true,
    ["encrypt"]
  );
}

/**
 * Exports a private key to a string, but encrypts it first.
 *
 * @param privateKey
 * @param key         Key used to encrypt `privateKey`.
 *
 * @return String
 */
export function exportPrivateKey(privateKey, key) {
  return exportKeyToBuffer(privateKey)
    .then(buffer => {
      const iv = window.crypto.getRandomValues(new Uint8Array(16));
      const encrypted = window.crypto.subtle.encrypt(
        { name: "AES-CBC", iv: iv },
        key,
        buffer
      );

      return Promise.all([iv, encrypted]);
    })
    .then(([iv, buffer]) => bufferToBase64(iv) + bufferToBase64(buffer));
}

/**
 * Imports a private key.
 *
 * @param privateKey
 * @param key         Key used to decrypt `privateKey`.
 * @param extractable Whether imported key can be further exported or not.
 *
 * @return CryptoKey
 */
export function importPrivateKey(privateKey, key, extractable) {
  const iv = base64ToBuffer(privateKey.substring(0, 24));
  const encrypted = base64ToBuffer(privateKey.substring(24));

  return window.crypto.subtle
    .decrypt({ name: "AES-CBC", iv: iv }, key, encrypted)
    .then(jwkBuffer =>
      window.crypto.subtle.importKey(
        "jwk",
        JSON.parse(bufferToString(jwkBuffer)),
        {
          name: "RSA-OAEP",
          hash: { name: "SHA-256" }
        },
        isSafari || extractable,
        ["decrypt"]
      )
    );
}

/*
 * Passphrase keys
 * ===============
 */

/**
 * Generates a key out of a passphrase, used to encrypt the private key of a
 * user's key pair.
 *
 * @return Promise A promise of a key.
 */
export function generatePassphraseKey(passphrase) {
  return window.crypto.subtle
    .importKey("raw", stringToBuffer(passphrase), { name: "PBKDF2" }, false, [
      "deriveBits",
      "deriveKey"
    ])
    .then(key =>
      window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: hexToBuffer(PASSPHRASE_SALT),
          iterations: 100,
          hash: "SHA-256"
        },
        key,
        {
          name: "AES-CBC",
          length: 256
        },
        false,
        ["encrypt", "decrypt"]
      )
    );
}

/*
 * Conversation keys
 * =================
 */

/**
 * Generates a symmetric key used to encrypt conversation keys.
 *
 * @return Promise A promise of a key.
 */
export function generateKey() {
  return window.crypto.subtle.generateKey(
    {
      name: "AES-CBC",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
  );
}

/**
 * Exports a symmetric key, but encrypts it first.
 *
 * @param key
 * @param userKey   Key used to encrypt `key`.
 *
 * @return String
 */
export function exportKey(key, userKey) {
  return exportKeyToBuffer(key)
    .then(buffer =>
      window.crypto.subtle.encrypt(
        {
          name: "RSA-OAEP",
          hash: { name: "SHA-256" }
        },
        userKey,
        buffer
      )
    )
    .then(encrypted => bufferToBase64(encrypted));
}

/**
 * Imports a symmetric key.
 *
 * @param key
 * @param userKey   Key used to decrypt `key`.
 *
 * @return CryptoKey
 */
export function importKey(key, userKey) {
  return window.crypto.subtle
    .decrypt(
      {
        name: "RSA-OAEP",
        hash: { name: "SHA-256" }
      },
      userKey,
      base64ToBuffer(key)
    )
    .then(jwk =>
      window.crypto.subtle.importKey(
        "jwk",
        JSON.parse(bufferToString(jwk)),
        {
          name: "AES-CBC",
          length: 256
        },
        true,
        ["encrypt", "decrypt"]
      )
    );
}

/**
 * Encrypts a message with a symmetric key.
 *
 * @param key
 * @param plaintext
 *
 * @return String
 */
export function encrypt(key, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(16));
  const buffer = stringToBuffer(plaintext);

  return window.crypto.subtle
    .encrypt({ name: "AES-CBC", iv: iv }, key, buffer)
    .then(encrypted => bufferToBase64(iv) + bufferToBase64(encrypted));
}

/**
 * Decrypt a message with a symmetric key.
 *
 * @param key
 * @param ciphertext
 *
 * @return String
 */
export function decrypt(key, ciphertext) {
  const iv = base64ToBuffer(ciphertext.substring(0, 24));
  const encrypted = base64ToBuffer(ciphertext.substring(24));

  return window.crypto.subtle
    .decrypt({ name: "AES-CBC", iv: iv }, key, encrypted)
    .then(buffer => bufferToString(buffer));
}

/**
 * Encrypts a message with a RSA public key.
 *
 * @param key
 * @param plaintext
 *
 * @return String
 */
export function rsaEncrypt(key, plaintext) {
  const buffer = stringToBuffer(plaintext);

  return window.crypto.subtle
    .encrypt({ name: "RSA-OAEP", hash: { name: "SHA-256" } }, key, buffer)
    .then(encrypted => bufferToBase64(encrypted));
}

/**
 * Decrypts a message with a RSA public key.
 *
 * @param key
 * @param ciphertext
 *
 * @return String
 */
export function rsaDecrypt(key, ciphertext) {
  const encrypted = stringToBuffer(ciphertext);

  return window.crypto.subtle
    .decrypt({ name: "RSA-OAEP", hash: { name: "SHA-256" } }, key, encrypted)
    .then(buffer => bufferToString(buffer));
}

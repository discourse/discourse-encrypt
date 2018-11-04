import {
  base64ToBuffer,
  bufferToBase64
} from "discourse/plugins/discourse-encrypt/lib/base64";

import {
  stringToBuffer,
  bufferToString,
  hexToBuffer
} from "discourse/plugins/discourse-encrypt/lib/buffers";

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
export async function exportPrivateKey(privateKey, key) {
  /** @var Insecure buffer containing the private key. */
  const buffer = await exportKeyToBuffer(privateKey);

  /** @var Random initialization vector for AES-CBC. */
  const iv = window.crypto.getRandomValues(new Uint8Array(16));

  /** @var Encrypted buffer containing private key. */
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv },
    key,
    buffer
  );

  // The Base64 IV should have a constant length of 24 bytes.
  return bufferToBase64(iv) + bufferToBase64(encryptedBuffer);
}

/**
 * Imports a private key.
 *
 * @param privateKey
 * @param key         Key used to decrypt `privateKey`.
 *
 * @return CryptoKey
 */
export async function importPrivateKey(privateKey, key) {
  /** @var Initialization vector for AES-CBC. */
  const iv = base64ToBuffer(privateKey.substring(0, 24));

  /** @var Encrypted buffer containing private key. */
  const encryptedBuffer = base64ToBuffer(privateKey.substring(24));

  /** @var Insecure serialization of private key. */
  const jwkBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv },
    key,
    encryptedBuffer
  );

  return await window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(bufferToString(jwkBuffer)),
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" }
    },
    true,
    ["decrypt"]
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
export async function exportKey(key, userKey) {
  /** @var Insecure buffer containing the private key. */
  const buffer = await exportKeyToBuffer(key);

  /** @var Encrypted buffer containing private key. */
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" }
    },
    userKey,
    buffer
  );

  // The Base64 IV should have a constant length of 24 bytes.
  return bufferToBase64(encryptedBuffer);
}

/**
 * Imports a symmetric key.
 *
 * @param key
 * @param userKey   Key used to decrypt `key`.
 *
 * @return CryptoKey
 */
export async function importKey(key, userKey) {
  /** @var Encrypted buffer containing private key. */
  const encryptedBuffer = base64ToBuffer(key);

  /** @var Insecure serialization of private key. */
  const jwk = await window.crypto.subtle.decrypt(
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" }
    },
    userKey,
    encryptedBuffer
  );

  return await window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(bufferToString(jwk)),
    {
      name: "AES-CBC",
      length: 256
    },
    true,
    ["encrypt", "decrypt"]
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
export async function encrypt(key, plaintext) {
  /** @var Initialization vector for AES-CBC. */
  const iv = window.crypto.getRandomValues(new Uint8Array(16));

  /** @var Insecure buffer containing the message. */
  const buffer = stringToBuffer(plaintext);

  /** @var Encrypted buffer containing message. */
  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-CBC", iv: iv },
    key,
    buffer
  );

  return bufferToBase64(iv) + bufferToBase64(encryptedBuffer);
}

/**
 * Decrypt a message with a symmetric key.
 *
 * @param key
 * @param ciphertext
 *
 * @return String
 */
export async function decrypt(key, ciphertext) {
  /** @var Initialization vector for AES-CBC. */
  const iv = base64ToBuffer(ciphertext.substring(0, 24));

  /** @var Encrypted buffer containing message. */
  const encryptedBuffer = base64ToBuffer(ciphertext.substring(24));

  /** @var Insecure buffer containing the message. */
  const buffer = await window.crypto.subtle.decrypt(
    { name: "AES-CBC", iv: iv },
    key,
    encryptedBuffer
  );

  return bufferToString(buffer);
}

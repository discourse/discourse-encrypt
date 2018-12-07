import {
  base64ToBuffer,
  bufferToBase64
} from "discourse/plugins/discourse-encrypt/lib/base64";

import {
  stringToBuffer,
  bufferToString
} from "discourse/plugins/discourse-encrypt/lib/buffers";

import { isSafari } from "discourse/plugins/discourse-encrypt/lib/keys_db";

/*
 * User keypairs
 * =============
 */

/**
 * Generates a cryptographically secure key pair.
 *
 * @return Ember.RSVP.Promise<[CryptoKey, CryptoKey]> A promise of a tuple of a public and
 *                                         private key.
 */
export function generateKeyPair() {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .generateKey(
        {
          name: "RSA-OAEP",
          modulusLength: 4096,
          publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
          hash: { name: "SHA-256" }
        },
        true,
        ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
      )
      .then(keyPair => [keyPair.publicKey, keyPair.privateKey])
      .then(resolve, reject);
  });
}

/**
 * Exports a public key.
 *
 * @param publicKey
 *
 * @return Ember.RSVP.Promise<String>
 */
export function exportPublicKey(publicKey) {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .exportKey("jwk", publicKey)
      .then(jwk => bufferToBase64(stringToBuffer(JSON.stringify(jwk))))
      .then(resolve, reject);
  });
}

/**
 * Imports a public key.
 *
 * @param publicKey
 *
 * @return Ember.RSVP.Promise<CryptoKey>
 */
export function importPublicKey(publicKey) {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .importKey(
        "jwk",
        JSON.parse(bufferToString(base64ToBuffer(publicKey))),
        { name: "RSA-OAEP", hash: { name: "SHA-256" } },
        true,
        ["encrypt", "wrapKey"]
      )
      .then(resolve, reject);
  });
}

/**
 * Exports a private key to a string, but encrypts it first.
 *
 * @param privateKey
 * @param key         Key used to encrypt `privateKey`.
 *
 * @return Ember.RSVP.Promise<String>
 */
export function exportPrivateKey(privateKey, key) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .wrapKey("jwk", privateKey, key, { name: "AES-GCM", iv })
      .then(buffer => bufferToBase64(iv) + bufferToBase64(buffer))
      .then(resolve, reject);
  });
}

/**
 * Imports a private key.
 *
 * @param privateKey
 * @param key         Key used to decrypt `privateKey`.
 * @param extractable Whether imported key can be further exported or not.
 *
 * @return Ember.RSVP.Promise<CryptoKey>
 */
export function importPrivateKey(privateKey, key, extractable) {
  const iv = base64ToBuffer(privateKey.substring(0, 16));
  const wrapped = base64ToBuffer(privateKey.substring(16));
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .unwrapKey(
        "jwk",
        wrapped,
        key,
        { name: "AES-GCM", iv },
        { name: "RSA-OAEP", hash: { name: "SHA-256" } },
        isSafari || extractable,
        ["decrypt", "unwrapKey"]
      )
      .then(resolve, reject);
  });
}

/**
 * Encrypts a message with a RSA public key.
 *
 * @param key
 * @param plaintext
 *
 * @return Ember.RSVP.Promise<String>
 */
export function rsaEncrypt(key, plaintext) {
  const buffer = stringToBuffer(plaintext);

  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .encrypt({ name: "RSA-OAEP", hash: { name: "SHA-256" } }, key, buffer)
      .then(encrypted => bufferToBase64(encrypted))
      .then(resolve, reject);
  });
}

/**
 * Decrypts a message with a RSA public key.
 *
 * @param key
 * @param ciphertext
 *
 * @return Ember.RSVP.Promise<String>
 */
export function rsaDecrypt(key, ciphertext) {
  const encrypted = base64ToBuffer(ciphertext);

  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .decrypt({ name: "RSA-OAEP", hash: { name: "SHA-256" } }, key, encrypted)
      .then(buffer => bufferToString(buffer))
      .then(resolve, reject);
  });
}

/*
 * Passphrase keys
 * ===============
 */

/**
 * Generates a random passphrase salt.
 *
 * @return String
 */
export function generateSalt() {
  return bufferToBase64(window.crypto.getRandomValues(new Uint8Array(16)));
}

/**
 * Generates a key out of a passphrase, used to encrypt the private key of a
 * user's key pair.
 *
 * @param passphrase
 * @param salt
 *
 * @return Ember.RSVP.Promise<CryptoKey>
 */
export function generatePassphraseKey(passphrase, salt) {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .importKey("raw", stringToBuffer(passphrase), { name: "PBKDF2" }, false, [
        "deriveBits",
        "deriveKey"
      ])
      .then(key =>
        window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: base64ToBuffer(salt),
            iterations: 128000,
            hash: "SHA-256"
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

/*
 * Topic keys
 * ==========
 */

/**
 * Generates a symmetric key used to encrypt topic keys.
 *
 * @return Ember.RSVP.Promise<CryptoKey>
 */
export function generateKey() {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .generateKey({ name: "AES-GCM", length: 256 }, true, [
        "encrypt",
        "decrypt"
      ])
      .then(resolve, reject);
  });
}

/**
 * Exports a symmetric key, but wraps (encrypts) it first.
 *
 * @param key
 * @param publicKey   Key used to wrap the symmetric key.
 *
 * @return Ember.RSVP.Promise<String>
 */
export function exportKey(key, publicKey) {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .wrapKey("raw", key, publicKey, {
        name: "RSA-OAEP",
        hash: { name: "SHA-256" }
      })
      .then(wrapped => bufferToBase64(wrapped))
      .then(resolve, reject);
  });
}

/**
 * Imports a symmetric key, but unwraps (decrypts) it first.
 *
 * @param key
 * @param privateKey  Key used to unwrap the symmetric key.
 *
 * @return Ember.RSVP.Promise<CryptoKey>
 */
export function importKey(key, privateKey) {
  return new Ember.RSVP.Promise((resolve, reject) => {
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

/**
 * Encrypts a message with a symmetric key.
 *
 * @param key
 * @param plaintext
 *
 * @return Ember.RSVP.Promise<String>
 */
export function encrypt(key, plaintext) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const buffer = stringToBuffer(plaintext);

  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .encrypt({ name: "AES-GCM", iv: iv, tagLength: 128 }, key, buffer)
      .then(encrypted => bufferToBase64(iv) + bufferToBase64(encrypted))
      .then(resolve, reject);
  });
}

/**
 * Decrypt a message with a symmetric key.
 *
 * @param key
 * @param ciphertext
 *
 * @return Ember.RSVP.Promise<String>
 */
export function decrypt(key, ciphertext) {
  const iv = base64ToBuffer(ciphertext.substring(0, 16));
  const encrypted = base64ToBuffer(ciphertext.substring(16));

  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .decrypt({ name: "AES-GCM", iv: iv, tagLength: 128 }, key, encrypted)
      .then(buffer => bufferToString(buffer))
      .then(resolve, reject);
  });
}

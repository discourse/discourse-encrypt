import {
  base64ToBuffer,
  bufferToBase64
} from "discourse/plugins/discourse-encrypt/lib/base64";

/**
 * @var {TextEncoder} textEncoder
 */
const textEncoder = new TextEncoder();

/**
 * @var {TextDecoder} textDecoder
 */
const textDecoder = new TextDecoder();

/*
 * Key generation
 */

function getPassphraseKey(passphrase, salt) {
  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .importKey(
        "raw",
        textEncoder.encode(passphrase),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
      )
      .then(key =>
        window.crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt,
            iterations: 128000,
            hash: "SHA-256"
          },
          key,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        )
      )
      .then(resolve, reject);
  });
}

function plaintextToBuffer(plaintext) {
  return textEncoder.encode(
    typeof plaintext === "object"
      ? JSON.stringify(plaintext, Object.keys(plaintext).sort())
      : JSON.stringify(plaintext)
  );
}

export function generateIdentity() {
  const encryptKeyPromise = window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: "SHA-256" }
    },
    true,
    ["encrypt", "decrypt", "wrapKey", "unwrapKey"]
  );

  const signKeyPromise = window.crypto.subtle.generateKey(
    {
      name: "RSA-PSS",
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: { name: "SHA-256" }
    },
    true,
    ["sign", "verify"]
  );

  return Ember.RSVP.Promise.all([encryptKeyPromise, signKeyPromise]).then(
    ([encryptKey, signKey]) => ({
      encryptPublic: encryptKey.publicKey,
      encryptPrivate: encryptKey.privateKey,
      signPublic: signKey.publicKey,
      signPrivate: signKey.privateKey
    })
  );
}

export function exportIdentity(identity, passphrase) {
  const identityPromise = Ember.RSVP.Promise.all([
    window.crypto.subtle.exportKey("jwk", identity.encryptPublic),
    window.crypto.subtle.exportKey("jwk", identity.encryptPrivate),
    window.crypto.subtle.exportKey("jwk", identity.signPublic),
    window.crypto.subtle.exportKey("jwk", identity.signPrivate)
  ]).then(([encryptPublic, encryptPrivate, signPublic, signPrivate]) => ({
    encryptPublic,
    encryptPrivate,
    signPublic,
    signPrivate
  }));

  const publicPromise = identityPromise.then(exported =>
    bufferToBase64(
      textEncoder.encode(
        JSON.stringify({
          encryptPublic: exported.encryptPublic,
          signPublic: exported.signPublic
        })
      )
    )
  );

  let privatePromise;
  if (passphrase) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    privatePromise = Ember.RSVP.Promise.all([
      getPassphraseKey(passphrase, salt),
      identityPromise
    ])
      .then(([key, exported]) =>
        window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv, tagLength: 128 },
          key,
          textEncoder.encode(JSON.stringify(exported))
        )
      )
      .then(
        exported =>
          bufferToBase64(salt) + bufferToBase64(iv) + bufferToBase64(exported)
      );
  } else {
    privatePromise = identityPromise.then(exported =>
      bufferToBase64(textEncoder.encode(JSON.stringify(exported)))
    );
  }

  return Ember.RSVP.Promise.all([publicPromise, privatePromise]).then(
    ([publicIdentity, privateIdentity]) => ({
      public: publicIdentity,
      private: privateIdentity
    })
  );
}

export function importIdentity(identity, passphrase, extractable) {
  let decrypted;

  if (passphrase) {
    const salt = base64ToBuffer(identity.substring(0, 24));
    const iv = base64ToBuffer(identity.substring(24, 40));
    const encrypted = base64ToBuffer(identity.substring(40));

    decrypted = getPassphraseKey(passphrase, salt).then(key =>
      window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv, tagLength: 128 },
        key,
        encrypted
      )
    );
  } else {
    decrypted = Ember.RSVP.Promise.resolve(base64ToBuffer(identity));
  }

  return decrypted.then(exported => {
    identity = JSON.parse(textDecoder.decode(exported));
    return Ember.RSVP.Promise.all([
      window.crypto.subtle.importKey(
        "jwk",
        identity.encryptPublic,
        { name: "RSA-OAEP", hash: { name: "SHA-256" } },
        !!extractable,
        ["encrypt", "wrapKey"]
      ),
      identity.encryptPrivate
        ? window.crypto.subtle.importKey(
            "jwk",
            identity.encryptPrivate,
            { name: "RSA-OAEP", hash: { name: "SHA-256" } },
            !!extractable,
            ["decrypt", "unwrapKey"]
          )
        : undefined,
      window.crypto.subtle.importKey(
        "jwk",
        identity.signPublic,
        { name: "RSA-PSS", hash: { name: "SHA-256" } },
        !!extractable,
        ["verify"]
      ),
      identity.signPrivate
        ? window.crypto.subtle.importKey(
            "jwk",
            identity.signPrivate,
            { name: "RSA-PSS", hash: { name: "SHA-256" } },
            !!extractable,
            ["sign"]
          )
        : undefined
    ]).then(([encryptPublic, encryptPrivate, signPublic, signPrivate]) => ({
      encryptPublic,
      encryptPrivate,
      signPublic,
      signPrivate
    }));
  });
}

/*
 * Encryption, decryption and verification
 */

export function encrypt(key, signKey, plaintext) {
  let plaintextPromise = signKey
    ? window.crypto.subtle
        .sign(
          { name: "RSA-PSS", saltLength: 32 },
          signKey,
          plaintextToBuffer(plaintext)
        )
        .then(signature => {
          plaintext.signature = bufferToBase64(signature);
          return plaintext;
        })
    : Ember.RSVP.Promise.resolve(plaintext);

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  return new Ember.RSVP.Promise((resolve, reject) => {
    plaintextPromise
      .then(unencrypted =>
        window.crypto.subtle.encrypt(
          { name: "AES-GCM", iv, tagLength: 128 },
          key,
          plaintextToBuffer(unencrypted)
        )
      )
      .then(encrypted => bufferToBase64(iv) + bufferToBase64(encrypted))
      .then(resolve, reject);
  });
}

export function decrypt(key, ciphertext) {
  const iv = base64ToBuffer(ciphertext.substring(0, 16));
  const encrypted = base64ToBuffer(ciphertext.substring(16));

  return new Ember.RSVP.Promise((resolve, reject) => {
    window.crypto.subtle
      .decrypt({ name: "AES-GCM", iv, tagLength: 128 }, key, encrypted)
      .then(buffer => JSON.parse(textDecoder.decode(buffer)))
      .then(resolve, reject);
  });
}

export function verify(key, plaintext) {
  const { signature } = plaintext;
  delete plaintext.signature;

  return new Ember.RSVP.Promise(resolve => {
    window.crypto.subtle
      .verify(
        { name: "RSA-PSS", saltLength: 32 },
        key,
        base64ToBuffer(signature),
        plaintextToBuffer(plaintext)
      )
      .then(isValid => (isValid ? resolve(true) : resolve(false)))
      .catch(() => resolve(false));
  });
}

/**
 * Name of IndexedDb used for storing keypairs.
 */
export const DB_NAME = "discourse-encrypt";

/*
 * Checks if this is running in Apple's Safari.
 *
 * Safari's implementation of IndexedDb cannot store CryptoKeys, so local
 * storage is used instead.
 *
 * Moreover, the Discourse Hub app uses `SFSafariViewController` which does not
 * have a persistent storage for IndexedDb.
 *
 * TODO: Remove `isSafari`, `exportKey` and `importKey` if Safari was fixed.
 *         - https://bugs.webkit.org/show_bug.cgi?id=177350
 *         - https://bugs.webkit.org/show_bug.cgi?id=182972
 */
export const isSafari =
  !!navigator.userAgent.match(/Version\/(\d+).+?Safari/) ||
  !!navigator.userAgent.match(/Discourse\/.*Darwin/);

/**
 * Exports a public key.
 *
 * @param key
 *
 * @return String
 */
function exportKey(key) {
  return window.crypto.subtle
    .exportKey("jwk", key)
    .then(jwk => JSON.stringify(jwk));
}

/**
 * Imports a public key.
 *
 * @param key
 *
 * @return CryptoKey
 */
function importKey(key, ops) {
  return window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(key),
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" }
    },
    true,
    ops
  );
}

/**
 * Opens plugin's Indexed DB.
 *
 * @return IDBOpenDBRequest
 */
function openIndexedDb(create) {
  let req = window.indexedDB.open(DB_NAME, 1);

  req.onupgradeneeded = evt => {
    if (!create) {
      evt.target.transaction.abort();
      return;
    }

    let db = evt.target.result;
    if (!db.objectStoreNames.contains("keys")) {
      db.createObjectStore("keys", { keyPath: "id", autoIncrement: true });
    }
  };

  return req;
}

/**
 * Save a key pair to plugin's Indexed DB.
 *
 * @param pubKey
 * @param privKey
 *
 * @return Ember.RSVP.Promise
 */
export function saveKeyPairToIndexedDb(pubKey, privKey) {
  if (isSafari) {
    return Ember.RSVP.Promise.all([exportKey(pubKey), exportKey(privKey)]).then(
      ([publicKey, privateKey]) => {
        const keyPairStr = JSON.stringify([publicKey, privateKey]);
        window.localStorage.setItem(DB_NAME, keyPairStr);
        return Ember.RSVP.resolve();
      }
    );
  }

  return Ember.RSVP.Promise.all([pubKey, privKey]).then(
    ([publicKey, privateKey]) =>
      new Ember.RSVP.Promise((resolve, reject) => {
        let req = openIndexedDb(true);

        req.onerror = evt => reject(evt);

        req.onsuccess = evt => {
          let db = evt.target.result;
          let tx = db.transaction("keys", "readwrite");
          let st = tx.objectStore("keys");

          let dataReq = st.add({ publicKey, privateKey });
          dataReq.onsuccess = dataEvt => {
            window.localStorage.setItem(DB_NAME, true);
            resolve(dataEvt);
            db.close();
          };
          dataReq.onerror = dataEvt => reject(dataEvt);
        };
      })
  );
}

/**
 * Gets the last stored key-pair from plugin's IndexedDB.
 *
 * @return Array A tuple consisting of public and private key.
 */
export function loadKeyPairFromIndexedDb() {
  if (isSafari) {
    const keyPair = JSON.parse(window.localStorage.getItem(DB_NAME));
    if (!keyPair) {
      return Ember.RSVP.resolve([undefined, undefined]);
    }
    return Ember.RSVP.Promise.all([
      importKey(keyPair[0], ["encrypt", "wrapKey"]),
      importKey(keyPair[1], ["decrypt", "unwrapKey"])
    ]);
  }

  return new Ember.RSVP.Promise((resolve, reject) => {
    let req = openIndexedDb(false);

    req.onerror = () => resolve();

    req.onsuccess = evt => {
      let db = evt.target.result;
      let tx = db.transaction("keys", "readonly");
      let st = tx.objectStore("keys");

      let dataReq = st.getAll();
      dataReq.onsuccess = dataEvt => {
        resolve(dataEvt.target.result);
        db.close();
      };
      dataReq.onerror = dataEvt => reject(dataEvt);
    };
  }).then(keyPairs => {
    if (!keyPairs || keyPairs.length === 0) {
      return [undefined, undefined];
    }

    let keyPair = keyPairs[keyPairs.length - 1];
    return [keyPair.publicKey, keyPair.privateKey];
  });
}

/**
 * Deletes plugin's IndexedDB and all user keys.
 *
 * @return Ember.RSVP.Promise
 */
export function deleteIndexedDb() {
  window.localStorage.removeItem(DB_NAME);

  if (isSafari) {
    return Ember.RSVP.resolve();
  }

  return new Ember.RSVP.Promise((resolve, reject) => {
    let req = window.indexedDB.deleteDatabase(DB_NAME);

    req.onsuccess = evt => resolve(evt);
    req.onerror = evt => reject(evt);
    req.onblocked = evt => reject(evt);
  });
}

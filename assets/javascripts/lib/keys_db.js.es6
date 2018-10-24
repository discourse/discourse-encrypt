/*
 * Checks if this is running in Apple's Safari.
 *
 * Safari's implementation of IndexedDb cannot store CryptoKeys, so JWK's are
 * used instead.
 *
 * TODO: Remove `isSafari`, `exportKey` and `importKey` if Safari was fixed.
 *         - https://bugs.webkit.org/show_bug.cgi?id=177350
 *         - https://bugs.webkit.org/show_bug.cgi?id=182972
 */
const isSafari = !!navigator.userAgent.match(/Version\/(\d+).+?Safari/);

/**
 * Exports a public key.
 *
 * @param key
 *
 * @return String
 */
export function exportKey(key) {
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
export function importKey(key, op) {
  return window.crypto.subtle.importKey(
    "jwk",
    JSON.parse(key),
    {
      name: "RSA-OAEP",
      hash: { name: "SHA-256" }
    },
    true,
    [op]
  );
}

/**
 * Opens plugin's Indexed DB.
 *
 * @return IDBOpenDBRequest
 */
function openIndexedDb() {
  let req = window.indexedDB.open("discourse-encrypt", 1);

  req.onupgradeneeded = evt => {
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
 * @param publicKey
 * @param privateKey
 *
 * @return Promise
 */
export async function saveKeyPairToIndexedDb(publicKey, privateKey) {
  if (isSafari) {
    publicKey = await exportKey(publicKey);
    privateKey = await exportKey(privateKey);
  }

  return new Promise((resolve, reject) => {
    let req = openIndexedDb();

    req.onerror = evt => reject(evt);

    req.onsuccess = evt => {
      let db = evt.target.result;
      let tx = db.transaction("keys", "readwrite");
      let st = tx.objectStore("keys");

      let dataReq = st.add({ publicKey, privateKey });
      dataReq.onsuccess = dataEvt => resolve(dataEvt);
      dataReq.onerror = dataEvt => console.log("Error saving keys.", dataEvt);
    };
  });
}

/**
 * Loads all key pairs from plugin's IndexedDB.
 *
 * @return Promise
 */
function loadKeyPairsFromIndexedDb() {
  return new Promise((resolve, reject) => {
    let req = openIndexedDb();

    req.onerror = evt => reject(evt);

    req.onsuccess = evt => {
      let db = evt.target.result;
      let tx = db.transaction("keys", "readonly");
      let st = tx.objectStore("keys");

      let dataReq = st.getAll();
      dataReq.onsuccess = dataEvt => resolve(dataEvt.target.result);
      dataReq.onerror = dataEvt => console.log("Error loading keys.", dataEvt);
    };
  });
}

/**
 * Gets the last stored key-pair from plugin's IndexedDB.
 *
 * @return Array A tuple consisting of public and private key.
 */
export async function loadKeyPairFromIndexedDb() {
  const keyPairs = await loadKeyPairsFromIndexedDb();
  if (!keyPairs || keyPairs.length === 0) {
    return [undefined, undefined];
  }

  let keyPair = keyPairs[keyPairs.length - 1];

  if (isSafari) {
    return [
      await importKey(keyPair.publicKey, "encrypt"),
      await importKey(keyPair.privateKey, "decrypt")
    ];
  }

  return [keyPair.publicKey, keyPair.privateKey];
}

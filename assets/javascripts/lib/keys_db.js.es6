/**
 * Opens plugin's Indexed DB.
 *
 * @return IDBOpenDBRequest
 */
function openIndexedDb() {
  let req = window.indexedDB.open("discourse-encrypt");

  req.onupgradeneeded = evt => {
    let db = evt.target.result;
    db.createObjectStore("keys", { keyPath: "id", autoIncrement: true });
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
export function saveKeyPairToIndexedDb(publicKey, privateKey) {
  return new Promise((resolve, reject) => {
    let req = openIndexedDb();

    req.onerror = evt => reject(evt);

    req.onsuccess = evt => {
      let db = evt.target.result;
      let tx = db.transaction("keys", "readwrite");
      let st = tx.objectStore("keys");

      resolve(st.put({ publicKey, privateKey }));
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
  return [keyPair.publicKey, keyPair.privateKey];
}

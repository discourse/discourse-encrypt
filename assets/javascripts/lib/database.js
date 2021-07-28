import { isTesting } from "discourse-common/config/environment";
import {
  exportIdentity,
  importIdentity,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { Promise } from "rsvp";

/**
 * @var {String} DB_NAME Name of IndexedDb used for storing key pairs
 */
export const DB_NAME = "discourse-encrypt";

/**
 * @var {String} DB_VERSION Version of IndexedDb schema user for storing key pairs
 */
export const DB_VERSION = "discourse-encrypt-version";

/**
 * When truthy, it uses local storage instead of IndexedDb to store user
 * identities.
 *
 * @var {Boolean}
 */
export let useLocalStorage = false;

/**
 * Force usage of local storage instead of IndexedDb.
 *
 * @param {Boolean} value Whether to use local storage.
 */
export function setUseLocalStorage(value) {
  if (!isTesting()) {
    throw new Error("`setUseLocalStorage` can be called from tests only");
  }

  useLocalStorage = value;
}

/**
 * IndexedDb API used to store CryptoKey objects securely
 */
export let indexedDb = window.indexedDB;

/**
 * Sets IndexedDb backend
 *
 * @param {Object} value
 */
export function setIndexedDb(value) {
  if (!isTesting()) {
    throw new Error("`setIndexedDb` can be called from tests only");
  }

  indexedDb = value;
}

/**
 * Browser's user agent string
 */
export let userAgent = window.navigator.userAgent;

/**
 * Sets browser's user agent string
 *
 * @param {String} value
 */
export function setUserAgent(value) {
  if (!isTesting()) {
    throw new Error("`setUserAgent` can be called from tests only");
  }

  userAgent = value;
}

/**
 * Warm up IndexedDB to ensure it works normally
 *
 * Used in Safari 14 to work around a bug. indexedDB.open hangs in
 * Safari if used immediately after page was loaded:
 * https://bugs.webkit.org/show_bug.cgi?id=226547
 *
 * @return {Promise<void>}
 */
function initIndexedDb() {
  if (!userAgent.match(/Version\/14.+?Safari/)) {
    return Promise.resolve();
  }

  let interval;
  return new Promise((resolve, reject) => {
    const tryIndexedDb = () => indexedDb.databases().then(resolve, reject);
    interval = setInterval(tryIndexedDb, 100);
    tryIndexedDb();
  }).finally(() => {
    clearInterval(interval);
  });
}

/**
 * Opens plugin's Indexed DB.
 *
 * @param {Boolean} create Whether to create database if missing.
 *
 * @return {IDBOpenDBRequest}
 */
function openDb(create) {
  const req = indexedDb.open(DB_NAME, 1);

  req.onupgradeneeded = (evt) => {
    if (!create) {
      evt.target.transaction.abort();
      return;
    }

    const db = evt.target.result;
    if (!db.objectStoreNames.contains("keys")) {
      db.createObjectStore("keys", { keyPath: "id", autoIncrement: true });
    }
  };

  return req;
}

function saveIdentityToLocalStorage(identity) {
  return exportIdentity(identity).then((exported) => {
    window.localStorage.setItem(DB_NAME, exported.private);
    window.localStorage.setItem(DB_VERSION, identity.version);
  });
}

/**
 * Save a key pair to plugin's Indexed DB.
 *
 * @param {Object} identity
 *
 * @return {Promise}
 */
export function saveDbIdentity(identity) {
  if (useLocalStorage) {
    return saveIdentityToLocalStorage(identity);
  }

  return new Promise((resolve, reject) => {
    const req = openDb(true);
    // eslint-disable-next-line no-unused-vars
    req.onerror = (evt) => {
      saveIdentityToLocalStorage(identity).then(resolve, reject);
    };

    req.onsuccess = (evt) => {
      const db = evt.target.result;
      const tx = db.transaction("keys", "readwrite");
      const st = tx.objectStore("keys");

      const dataReq = st.add(identity);
      dataReq.onsuccess = (dataEvt) => {
        window.localStorage.setItem(DB_NAME, true);
        window.localStorage.setItem(DB_VERSION, identity.version);
        resolve(dataEvt);
        db.close();
      };
      // eslint-disable-next-line no-unused-vars
      dataReq.onerror = (dataEvt) => {
        saveIdentityToLocalStorage(identity).then(resolve, reject);
      };
    };
  });
}

function loadIdentityFromLocalStorage() {
  const exported = window.localStorage.getItem(DB_NAME);
  return exported && exported !== "true"
    ? importIdentity(exported)
    : Promise.reject();
}

/**
 * Gets the last stored key-pair from plugin's IndexedDB.
 *
 * @return {Promise<Object>} A tuple consisting of public and private key.
 */
export function loadDbIdentity() {
  if (useLocalStorage) {
    return loadIdentityFromLocalStorage();
  }

  return initIndexedDb().then(() => {
    return new Promise((resolve, reject) => {
      const req = openDb(false);
      // eslint-disable-next-line no-unused-vars
      req.onerror = (evt) => {
        loadIdentityFromLocalStorage().then(resolve, reject);
      };

      req.onsuccess = (evt) => {
        const db = evt.target.result;
        const tx = db.transaction("keys", "readonly");
        const st = tx.objectStore("keys");

        const dataReq = st.getAll();
        dataReq.onsuccess = (dataEvt) => {
          const identities = dataEvt.target.result;
          db.close();

          if (identities && identities.length > 0) {
            const identity = identities[identities.length - 1];
            resolve(identity);
          } else {
            reject();
          }
        };
        // eslint-disable-next-line no-unused-vars
        dataReq.onerror = (dataEvt) => {
          loadIdentityFromLocalStorage().then(resolve, reject);
        };
      };
    });
  });
}

/**
 * Deletes plugin's IndexedDB and all user keys.
 *
 * @return {Promise}
 */
export function deleteDb() {
  window.localStorage.removeItem(DB_NAME);
  window.localStorage.removeItem(DB_VERSION);

  return initIndexedDb().then(() => {
    return new Promise((resolve) => {
      const req = indexedDb.deleteDatabase(DB_NAME);

      req.onsuccess = (evt) => resolve(evt);
      req.onerror = (evt) => resolve(evt);
      req.onblocked = (evt) => resolve(evt);
    });
  });
}

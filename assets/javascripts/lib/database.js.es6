import {
  exportIdentity,
  importIdentity
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { Promise } from "rsvp";

/**
 * @var {String} DB_NAME Name of IndexedDb used for storing key pairs.
 */
export const DB_NAME = "discourse-encrypt";
export const DB_VERSION = "discourse-encrypt-version";

/**
 * When truthy, it uses local storage instead of IndexedDb to store user
 * identities.
 *
 * @type {Boolean}
 */
export let useLocalStorage = false;

/**
 * Force usage of local storage instead of IndexedDb.
 *
 * @param {Boolean} value Whether to use local storage.
 */
export function setUseLocalStorage(value) {
  useLocalStorage = value;
}

/**
 * Opens plugin's Indexed DB.
 *
 * @param {Boolean} create Whether to create database if missing.
 *
 * @return {IDBOpenDBRequest}
 */
function openDb(create) {
  const req = window.indexedDB.open(DB_NAME, 1);

  req.onupgradeneeded = evt => {
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
  return exportIdentity(identity).then(exported => {
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
  /*
  if (
    !useLocalStorage &&
    Object.values(identity).any(
      key => key instanceof CryptoKey && key.extractable
    )
  ) {
    // eslint-disable-next-line no-console
    console.warn("Saving an extractable key into the database.", identity);
  }
  */

  if (useLocalStorage) {
    return saveIdentityToLocalStorage(identity);
  }

  return new Promise((resolve, reject) => {
    const req = openDb(true);
    // eslint-disable-next-line no-unused-vars
    req.onerror = evt => {
      saveIdentityToLocalStorage(identity).then(resolve, reject);
    };

    req.onsuccess = evt => {
      const db = evt.target.result;
      const tx = db.transaction("keys", "readwrite");
      const st = tx.objectStore("keys");

      const dataReq = st.add(identity);
      dataReq.onsuccess = dataEvt => {
        window.localStorage.setItem(DB_NAME, true);
        window.localStorage.setItem(DB_VERSION, identity.version);
        resolve(dataEvt);
        db.close();
      };
      // eslint-disable-next-line no-unused-vars
      dataReq.onerror = dataEvt => {
        saveIdentityToLocalStorage(identity).then(resolve, reject);
      };
    };
  });
}

function loadIdentityFromLocalStorage() {
  const exported = window.localStorage.getItem(DB_NAME);
  return exported && exported !== "true"
    ? importIdentity(exported)
    : Promise.resolve(null);
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

  return new Promise((resolve, reject) => {
    const req = openDb(false);
    // eslint-disable-next-line no-unused-vars
    req.onerror = evt => {
      loadIdentityFromLocalStorage().then(resolve, reject);
    };

    req.onsuccess = evt => {
      const db = evt.target.result;
      const tx = db.transaction("keys", "readonly");
      const st = tx.objectStore("keys");

      const dataReq = st.getAll();
      dataReq.onsuccess = dataEvt => {
        const identities = dataEvt.target.result;
        db.close();

        if (identities && identities.length > 0) {
          const identity = identities[identities.length - 1];
          resolve(identity);
        }
      };
      // eslint-disable-next-line no-unused-vars
      dataReq.onerror = dataEvt => {
        loadIdentityFromLocalStorage().then(resolve, reject);
      };
    };
  }).then(identity => {
    /*
    if (
      !useLocalStorage &&
      Object.values(identity).any(
        key => key instanceof CryptoKey && key.extractable
      )
    ) {
      // eslint-disable-next-line no-console
      console.warn("Loaded an extractable key from the database.", identity);
    }
    */
    return identity;
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

  return new Promise(resolve => {
    const req = window.indexedDB.deleteDatabase(DB_NAME);

    req.onsuccess = evt => resolve(evt);
    req.onerror = evt => resolve(evt);
    req.onblocked = evt => resolve(evt);
  });
}

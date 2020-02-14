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
 * Checks if this is running in Safari or DiscourseHub app for iOS.
 *
 * Safari's implementation of IndexedDb cannot store `CryptoKey`, so local
 * storage is used instead. Moreover, the DiscourseHub for iOS also uses
 * `SFSafariViewController` which does not have a persistent IndexedDb.
 *
 * @todo Remove this and all usages when Safari is fixed.
 *
 * @see https://bugs.webkit.org/show_bug.cgi?id=177350
 * @see https://bugs.webkit.org/show_bug.cgi?id=182972
 *
 * @type {Boolean}
 */
export let isSafari =
  !!navigator.userAgent.match(/Version\/(\d+).+?Safari/) ||
  !!navigator.userAgent.match(/(iPad|iPhone|iPod)/);

/**
 * Force usage of local storage instead of IndexedDb.
 *
 * @param {Boolean} value Whether to use local storage.
 */
export function useLocalStorage(value) {
  isSafari = value;
}

/**
 * Opens plugin's Indexed DB.
 *
 * @param {Boolean} create Whether to create database if missing.
 *
 * @return {IDBOpenDBRequest}
 */
function openDb(create) {
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
 * @param {Object} identity
 *
 * @return {Promise}
 */
export function saveDbIdentity(identity) {
  /*
  if (
    !isSafari &&
    Object.values(identity).any(
      key => key instanceof CryptoKey && key.extractable
    )
  ) {
    // eslint-disable-next-line no-console
    console.warn("Saving an extractable key into the database.", identity);
  }
  */

  if (isSafari) {
    return exportIdentity(identity).then(exported => {
      window.localStorage.setItem(DB_NAME, exported.private);
      window.localStorage.setItem(DB_VERSION, identity.version);
    });
  }

  return new Promise((resolve, reject) => {
    let req = openDb(true);

    req.onerror = evt => reject(evt);

    req.onsuccess = evt => {
      let db = evt.target.result;
      let tx = db.transaction("keys", "readwrite");
      let st = tx.objectStore("keys");

      let dataReq = st.add(identity);
      dataReq.onsuccess = dataEvt => {
        window.localStorage.setItem(DB_NAME, true);
        window.localStorage.setItem(DB_VERSION, identity.version);
        resolve(dataEvt);
        db.close();
      };
      dataReq.onerror = dataEvt => reject(dataEvt);
    };
  });
}

/**
 * Gets the last stored key-pair from plugin's IndexedDB.
 *
 * @return {Promise<Object>} A tuple consisting of public and private key.
 */
export function loadDbIdentity() {
  if (isSafari) {
    const exported = window.localStorage.getItem(DB_NAME);
    return exported ? importIdentity(exported) : Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    let req = openDb(false);
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
  }).then(identities => {
    if (identities && identities.length > 0) {
      let identity = identities[identities.length - 1];
      /*
      if (
        !isSafari &&
        Object.values(identity).any(
          key => key instanceof CryptoKey && key.extractable
        )
      ) {
        // eslint-disable-next-line no-console
        console.warn("Loaded an extractable key from the database.", identity);
      }
      */
      return identity;
    }

    return null;
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

  if (isSafari) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    let req = window.indexedDB.deleteDatabase(DB_NAME);

    req.onsuccess = evt => resolve(evt);
    req.onerror = evt => resolve(evt);
    req.onblocked = evt => resolve(evt);
  });
}

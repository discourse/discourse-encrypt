import { Promise } from "rsvp";
import { ajax } from "discourse/lib/ajax";
import { isTesting } from "discourse-common/config/environment";
import {
  DB_NAME,
  DB_VERSION,
  loadDbIdentity,
  saveDbIdentity,
} from "discourse/plugins/discourse-encrypt/lib/database";
import { unpackIdentity } from "discourse/plugins/discourse-encrypt/lib/pack";
import { fixPaperKey } from "discourse/plugins/discourse-encrypt/lib/paper-key";
import {
  decrypt,
  exportIdentity,
  generateIdentity,
  importIdentity,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { getCaseInsensitiveObj } from "discourse/plugins/discourse-encrypt/lib/utils";

/*
 * Possible states of the encryption system.
 */

/**
 * @var {Number} ENCRYPT_DISABLED User does not have any generated keys
 */
export const ENCRYPT_DISABLED = 0;

/**
 * @var {Number} ENCRYPT_ENABLED User has keys, but only on server
 */
export const ENCRYPT_ENABLED = 1;

/**
 * @var {Number} ENCRYPT_ACTIVE User has imported server keys into browser
 */
export const ENCRYPT_ACTIVE = 2;

/**
 * @var {Promise<Object>} userIdentity Current user's identity.
 */
let userIdentity;

/**
 * @var {Object} userIdentities Cached user identities.
 */
let userIdentities = getCaseInsensitiveObj();

/**
 * @var {Object} topicKeys Dictionary of all topic keys (topic_id => key).
 */
const topicKeys = {};

/**
 * @var {Object} topicTitles Dictionary of all topic title objects (topic_id => TopicTitle).
 */
const topicTitles = {};

class TopicTitle {
  constructor(topicId, encrypted) {
    this.topicId = topicId;
    this.encrypted = encrypted;
  }

  get promise() {
    if (!this._promise) {
      this._promise = getTopicKey(this.topicId)
        .then((key) => decrypt(key, this.encrypted))
        .then((decrypted) => decrypted.raw)
        .then((result) => (this.result = result));
    }

    return this._promise;
  }
}

export function clearUserIdentities() {
  userIdentities = getCaseInsensitiveObj();
}

/**
 * Resets loaded keys
 */
export function resetEncrypt() {
  if (!isTesting()) {
    throw new Error("`resetEncrypt` can be called from tests only");
  }

  userIdentity = null;

  for (const key in topicKeys) {
    if (topicKeys.hasOwnProperty(key)) {
      delete topicKeys[key];
    }
  }

  for (const key in topicTitles) {
    if (topicTitles.hasOwnProperty(key)) {
      delete topicTitles[key];
    }
  }
}

/**
 * Gets current user's identity from the database and caches it for future
 * usage.
 *
 * @return {Promise}
 */
export function getIdentity() {
  if (!userIdentity) {
    userIdentity = loadDbIdentity();
  }

  return userIdentity;
}

/**
 * Gets users' identities from the server and caches them for future usage
 *
 * @return {Promise}
 */
export function getUserIdentities(usernames) {
  // If some of the user identities are missing, then try to refresh all of
  // the newly requested ones.
  if (usernames.some((username) => !userIdentities[username])) {
    const promise = ajax("/encrypt/user", {
      type: "GET",
      data: { usernames },
    }).then((identities) => getCaseInsensitiveObj(identities));

    usernames.forEach((username) => {
      userIdentities[username] = promise.then((identities) =>
        identities[username]
          ? importIdentity(identities[username])
          : Promise.reject(username)
      );
    });
  }

  return Promise.all(
    usernames.map((username) => userIdentities[username])
  ).then((identities) => {
    const imported = {};
    for (let i = 0; i < usernames.length; ++i) {
      imported[usernames[i]] = identities[i];
    }
    return getCaseInsensitiveObj(imported);
  });
}

/**
 * Puts a topic key into storage.
 *
 * If there is a key in the store already, it will not be overwritten.
 *
 * @param {Number|String} topicId
 * @param {String} key
 */
export function putTopicKey(topicId, key) {
  if (topicId && key) {
    topicKeys[topicId] = key;
  }
}

/**
 * Gets a topic key from storage.
 *
 * @param {Number|String} topicId
 *
 * @return {Promise<CryptoKey>}
 */
export function getTopicKey(topicId) {
  let key = topicKeys[topicId];

  if (!key) {
    return Promise.reject();
  } else if (key instanceof CryptoKey) {
    return Promise.resolve(key);
  } else if (!(key instanceof Promise || key instanceof window.Promise)) {
    topicKeys[topicId] = getIdentity().then((identity) =>
      importKey(key, identity.encryptPrivate)
    );
  }

  return topicKeys[topicId];
}

/**
 * Checks if there is a topic key for a topic.
 *
 * @param {Number|String} topicId
 *
 * @return {Boolean}
 */
export function hasTopicKey(topicId) {
  return !!topicKeys[topicId];
}

/**
 * Puts a topic title into storage.
 *
 * @param {Number|String} topicId
 * @param {String} title
 */
export function putTopicTitle(topicId, title) {
  if (!(topicId && title)) {
    return;
  }
  if (topicTitles[topicId] && topicTitles[topicId].encrypted === title) {
    return;
  }

  topicTitles[topicId] = new TopicTitle(topicId, title);
}

/**
 * Gets a topic title from storage.
 *
 * @param {Number|String} topicId
 *
 * @return {Promise<String>}
 */
export function getTopicTitle(topicId) {
  const title = topicTitles[topicId];
  if (!title) {
    return Promise.reject();
  }
  return title.promise;
}

/**
 * Gets a topic title from storage synchronously, returning null if missing or unresolved
 *
 * @param {Number|String} topicId
 *
 * @return {String|null}
 */
export function syncGetTopicTitle(topicId) {
  const title = topicTitles[topicId];
  if (!title) {
    return null;
  }
  return title.result;
}

/**
 * Checks if there is an encrypted topic title for a topic.
 *
 * @param {Number|String} topicId
 *
 * @return {Boolean}
 */
export function hasTopicTitle(topicId) {
  return !!topicTitles[topicId];
}

/**
 * Returns a promise which resolves when all stored  titles are decrypted
 *
 * @return {Promise}
 */
export function waitForPendingTitles() {
  return Promise.all(
    Object.values(topicTitles)
      .filter((t) => !t.result)
      .map((t) => t.promise)
  );
}

/*
 * Plugin management
 */

/**
 * Gets current encryption status.
 *
 * @param {User} user
 *
 * @return {Number} See `ENCRYPT_DISABLED`, `ENCRYPT_ENABLED` and
 *                  `ENCRYPT_ACTIVE`.
 */
export function getEncryptionStatus(user) {
  if (!user || !user.can_encrypt || !user.encrypt_public) {
    return ENCRYPT_DISABLED;
  }

  if (
    !window.localStorage.getItem(DB_NAME) ||
    !window.localStorage.getItem(DB_VERSION)
  ) {
    return ENCRYPT_ENABLED;
  }

  return ENCRYPT_ACTIVE;
}

export function enableEncrypt(model, exportedIdentity) {
  const identityPromise = exportedIdentity
    ? importIdentity(unpackIdentity(exportedIdentity))
    : generateIdentity();

  const saveIdentityPromise = identityPromise
    .then((identity) => exportIdentity(identity))
    .then((exported) => {
      model.set("encrypt_public", exported.public);
      return ajax("/encrypt/keys", {
        type: "PUT",
        data: {
          public: exported.public,
        },
      });
    });

  const saveDbIdentityPromise = identityPromise.then((identity) =>
    saveDbIdentity(identity)
  );

  return Promise.all([saveIdentityPromise, saveDbIdentityPromise]);
}

/**
 * Attempts at activating encryption on current device.
 *
 * @param {User} currentUser
 * @param {String} passphrase
 *
 * @return {Promise}
 */
export function activateEncrypt(currentUser, passphrase) {
  const privateKeys = JSON.parse(currentUser.encrypt_private);
  let promise = Promise.reject();

  // User may have no private keys if they did not generate any private keys.
  if (!privateKeys) {
    return promise;
  }

  // Importing from a paper key.
  const spacePos = passphrase.indexOf(" ");
  if (spacePos !== -1) {
    const label = "paper_" + passphrase.substr(0, spacePos).toLowerCase();
    if (privateKeys[label]) {
      promise = promise.catch(() =>
        importIdentity(privateKeys[label], fixPaperKey(passphrase))
      );
    }
  }

  // Importing from a device key.
  if (privateKeys["device"]) {
    promise = promise.catch(() =>
      importIdentity(privateKeys["device"], fixPaperKey(passphrase))
    );
  }

  // Importing from a passphrase key.
  if (privateKeys["passphrase"]) {
    promise = promise.catch(() =>
      importIdentity(privateKeys["passphrase"], passphrase)
    );
  }

  return promise.then((identity) => saveDbIdentity(identity));
}

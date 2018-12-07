import {
  exportPublicKey,
  importKey,
  decrypt
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { loadKeyPairFromIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

/**
 * Possible states of the encryption system.
 *
 * @var ENCRYPT_DISABLED User does not have any generated keys
 * @var ENCRYPT_ENABLED User has keys, but only on server
 * @var ENCRYPT_ACTIVE  User has imported server keys into browser
 */
export const ENCRYPT_DISABLED = 0;
export const ENCRYPT_ENABLED = 1;
export const ENCRYPT_ACTIVE = 2;

/**
 * @var User's public key used to encrypt topic keys and drafts for private message.
 */
let publicKey;

/**
 * @var User's private key used to decrypt topic keys.
 */
let privateKey;

/**
 * @var Dictionary of all topic keys (topic_id => key).
 */
const topicKeys = {};

/**
 * @var Dictionary of all encrypted topic titles.
 */
const topicTitles = {};

/**
 * Gets a user's key pair from the database and caches it for future usage.
 *
 * @return Tuple of two public and private CryptoKey.
 */
export function getKeyPair() {
  return loadKeyPairFromIndexedDb().then(keyPair => {
    if (!keyPair || !keyPair[0] || !keyPair[1]) {
      return Ember.RSVP.Promise.reject();
    }

    [publicKey, privateKey] = keyPair;
    return keyPair;
  });
}

/**
 * Gets user's public key.
 *
 * @return CryptoKey
 */
export function getPublicKey() {
  return publicKey
    ? Ember.RSVP.Promise.resolve(publicKey)
    : getKeyPair().then(keyPair => keyPair[0]);
}

/**
 * Gets user's private key.
 *
 * @return CryptoKey
 */
export function getPrivateKey() {
  return privateKey
    ? Ember.RSVP.Promise.resolve(privateKey)
    : getKeyPair().then(keyPair => keyPair[1]);
}

/**
 * Puts a topic key into storage.
 *
 * If there is a key in the store already, it will not be overwritten.
 *
 * @param topicId
 * @param key
 */
export function putTopicKey(topicId, key) {
  if (topicId && key && !topicKeys[topicId]) {
    topicKeys[topicId] = key;
  }
}

/**
 * Gets a topic key from storage.
 *
 * @param topicId
 *
 * @return CryptoKey
 */
export function getTopicKey(topicId) {
  let key = topicKeys[topicId];

  if (!key) {
    return Ember.RSVP.Promise.reject();
  } else if (key instanceof CryptoKey) {
    return Ember.RSVP.Promise.resolve(key);
  } else {
    return getPrivateKey()
      .then(privKey => importKey(key, privKey))
      .then(topicKey => (topicKeys[topicId] = topicKey));
  }
}

/**
 * Checks if there is a topic key for a topic.
 *
 * @param topicId
 *
 * @return Boolean
 */
export function hasTopicKey(topicId) {
  return !!topicKeys[topicId];
}

/**
 * Puts a topic title into storage.
 *
 * @param topicId
 * @param key
 */
export function putTopicTitle(topicId, title) {
  if (topicId && !topicTitles[topicId]) {
    topicTitles[topicId] = title;
  }
}

/**
 * Gets a topic title from storage.
 *
 * @param topicId
 *
 * @return String
 */
export function getTopicTitle(topicId) {
  const title = topicTitles[topicId];
  return getTopicKey(topicId).then(key => decrypt(key, title));
}

/**
 * Checks if there is an encrypted topic title for a topic.
 *
 * @param topicId
 *
 * @return Boolean
 */
export function hasTopicTitle(topicId) {
  return !!topicTitles[topicId];
}

/**
 * Checks the encryption status for current user.
 *
 * @return Integer Encryption status
 */
export function getEncryptionStatus() {
  const user = Discourse.User.current();
  if (!user) {
    return Ember.RSVP.Promise.resolve(ENCRYPT_DISABLED);
  }

  const sPubKey = user.get("custom_fields.encrypt_public_key");
  const sPrvKey = user.get("custom_fields.encrypt_private_key");

  if (!sPubKey || !sPrvKey) {
    return Ember.RSVP.Promise.resolve(ENCRYPT_DISABLED);
  }

  return loadKeyPairFromIndexedDb()
    .then(([cPubKey, cPrvKey]) =>
      Ember.RSVP.Promise.all([
        cPubKey,
        cPrvKey,
        cPubKey ? exportPublicKey(cPubKey) : null
      ])
    )
    .then(([cPubKey, cPrvKey, cPubKeyExported]) => {
      if (cPubKey && cPrvKey && sPubKey === cPubKeyExported) {
        return ENCRYPT_ACTIVE;
      } else {
        return ENCRYPT_ENABLED;
      }
    });
}

/**
 * Sets `isEncryptEnabled` and `isEncryptActive` flags on the given component.
 *
 * This function is preferred because it waits for application events from the
 * encryption system.
 *
 * @param component
 */
export function hideComponentIfDisabled(component) {
  let handler = () => {
    getEncryptionStatus().then(newStatus => {
      component.setProperties({
        isEncryptEnabled: newStatus !== ENCRYPT_DISABLED,
        isEncryptActive: newStatus === ENCRYPT_ACTIVE
      });
    });
  };

  handler();
  component.appEvents.on("encrypt:status-changed", component, handler);

  return handler;
}

import { acceptance } from "helpers/qunit-helpers";
import {
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  generateSalt,
  generatePassphraseKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  loadKeyPairFromIndexedDb,
  saveKeyPairToIndexedDb,
  deleteIndexedDb
} from "discourse/plugins/discourse-encrypt/lib/keys_db";
import {
  ENCRYPT_DISABLED,
  ENCRYPT_ENABLED,
  ENCRYPT_ACTIVE
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import { default as userFixtures } from "fixtures/user_fixtures";

/*
 * Checks if a string is not contained in a string.
 *
 * @param haystack
 * @param needle
 * @param message
 */
QUnit.assert.notContains = function notContains(haystack, needle, message) {
  this.pushResult({
    result: haystack.indexOf(needle) === -1,
    actual: haystack,
    expected: "not to contain " + needle,
    message
  });
};

/**
 * @var Secret passphrase used for testing purposes.
 */
const PASSPHRASE = "curren7U$er.pa$$Phr4se";

/**
 * @var Constant string that is used to check for plaintext leakage.
 */
const PLAINTEXT = "!PL41N73X7!";

/**
 * @var User keys.
 */
const keys = {};

/**
 * @var Global assert instance used to report plaintext leakage.
 */
let globalAssert;

/**
 * Generates a key pair.
 *
 * @param passphrase
 *
 * @return Tuple consisting of public and private key, as CryptoKey and string.
 */
async function getKeyPair(passsphrase) {
  const salt = generateSalt();
  const passphraseKey = await generatePassphraseKey(passsphrase, salt);
  const [publicKey, privateKey] = await generateKeyPair();
  const publicStr = await exportPublicKey(publicKey);
  const privateStr = await exportPrivateKey(privateKey, passphraseKey);
  return [publicKey, privateKey, publicStr, privateStr, salt];
}

/**
 * Sets up encryption.
 */
async function setEncryptionStatus(status) {
  const user = Discourse.User.current();

  // Disable encryption first.
  user.set("custom_fields.encrypt_public_key", null);
  user.set("custom_fields.encrypt_private_key", null);
  try {
    await deleteIndexedDb();
  } catch (e) {}

  if (status === ENCRYPT_DISABLED) {
    return;
  }

  // Enable on server-side.
  const keyPair = await getKeyPair(PASSPHRASE);
  const [publicKey, privateKey, publicStr, privateStr, salt] = keyPair;
  user.set("custom_fields.encrypt_public_key", publicStr);
  user.set("custom_fields.encrypt_private_key", privateStr);
  user.set("custom_fields.encrypt_salt", salt);

  // Setting the appropriate custom fields is not always enough (i.e. if user
  // navigates to preferences).
  /* global server */
  server.get("/u/eviltrout.json", () => {
    const json = userFixtures["/u/eviltrout.json"];
    json.user.can_edit = true;
    json.user.custom_fields = {
      encrypt_public_key: keyPair[2],
      encrypt_private_key: keyPair[3],
      encrypt_salt: keyPair[4]
    };
    return [200, { "Content-Type": "application/json" }, json];
  });

  // Activate on client-side.
  if (status === ENCRYPT_ACTIVE) {
    await saveKeyPairToIndexedDb(publicKey, privateKey);
  }

  // Store key for future use.
  return (keys[user.username] = keyPair);
}

function sleep(time) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), time);
  });
}

acceptance("Encrypt", {
  loggedIn: true,
  settings: { encrypt_enabled: true },

  beforeEach() {
    // Hook `XMLHttpRequest` to search for leaked plaintext.
    XMLHttpRequest.prototype.send_ = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (body && globalAssert) {
        globalAssert.notContains(body, PLAINTEXT, "does not leak plaintext");
      }
      return this.send_(...arguments);
    };
  },

  afterEach() {
    // Restore `XMLHttpRequest`.
    XMLHttpRequest.prototype.send = XMLHttpRequest.prototype.send_;
    delete XMLHttpRequest.prototype.send_;
  },

  pretend(server, helper) {
    server.get("/encrypt/user", request => {
      const response = {};
      request.queryParams["usernames"].forEach(u => (response[u] = keys[u][2]));
      return helper.response(response);
    });
  }
});

test("posting does not leak plaintext", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  globalAssert = assert;
  /* global server */
  server.put("/encrypt/topic", () => {
    return [200, { "Content-Type": "application/json" }, { success: "OK" }];
  });

  const composerActions = selectKit(".composer-actions");

  await visit("/");
  await click("#create-topic");

  await composerActions.expand();
  await composerActions.selectRowByValue("reply_as_private_message");

  await click(".reply-details a");
  await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
  await fillIn(".d-editor-input", `Hello, world! ${PLAINTEXT}`.repeat(42));

  await click("button.create");
  await sleep(3000);

  globalAssert = null;
});

test("enabling works", async assert => {
  await setEncryptionStatus(ENCRYPT_DISABLED);

  let ajaxRequested = false;
  /* global server */
  server.put("/encrypt/keys", () => {
    ajaxRequested = true;
    return [200, { "Content-Type": "application/json" }, { success: "OK" }];
  });

  await visit("/u/eviltrout/preferences");
  await sleep(3000);

  await click(".encrypt button");

  await fillIn(".encrypt #passphrase", PASSPHRASE);
  await fillIn(".encrypt #passphrase2", PASSPHRASE);
  await click(".encrypt button.btn-primary");
  await sleep(3000);

  assert.ok(ajaxRequested, "AJAX request to save keys was made");

  const [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
});

test("activation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ENABLED);

  await visit("/u/eviltrout/preferences");
  await sleep(3000);

  await fillIn(".encrypt #passphrase", PASSPHRASE);
  await click(".encrypt button.btn-primary");
  await sleep(3000);

  const [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
});

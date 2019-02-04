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
import { parsePostData } from "helpers/create-pretender";

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

  // Resetting IndexedDB.
  try {
    await deleteIndexedDb();
  } catch (e) {}

  // Generating a new key pair if enabling or creating a dummy one if disabling.
  const keyPair =
    status !== ENCRYPT_DISABLED
      ? await getKeyPair(PASSPHRASE)
      : [null, null, null, null, null];

  // Overwriting server-side fields.
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

  // Activating encryption on client-side.
  if (status === ENCRYPT_ACTIVE) {
    await saveKeyPairToIndexedDb(publicKey, privateKey);
  }

  // Store key for future use.
  return (keys[user.username] = keyPair);
}

// TODO: Figure out why `await` is not enough.
function sleep(time) {
  return new Promise(resolve => {
    setTimeout(() => resolve(), time);
  });
}

acceptance("Encrypt", {
  loggedIn: true,
  settings: { encrypt_enabled: true, encrypt_groups: "" },

  beforeEach() {
    // Hook `XMLHttpRequest` to search for leaked plaintext.
    XMLHttpRequest.prototype.send_ = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      if (body && globalAssert) {
        globalAssert.notContains(body, PLAINTEXT, "does not leak plaintext");
        globalAssert.notContains(body, PASSPHRASE, "does not leak passphrase");
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
  await sleep(1500);

  await composerActions.expand();
  await composerActions.selectRowByValue("reply_as_private_message");
  await sleep(1500);

  await click(".reply-details a");
  await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
  await fillIn(".d-editor-input", `Hello, world! ${PLAINTEXT}`.repeat(42));

  await click("button.create");
  await sleep(1500);

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
  await sleep(1500);

  await click(".encrypt button");
  await fillIn(".encrypt #passphrase", PASSPHRASE);
  await fillIn(".encrypt #passphrase2", PASSPHRASE);
  await click(".encrypt button.btn-primary");
  await sleep(1500);
  await sleep(1500);

  assert.ok(ajaxRequested, "AJAX request to save keys was made");

  const [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
  await sleep(1500);
});

test("activation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ENABLED);

  await visit("/u/eviltrout/preferences");
  await sleep(1500);

  await fillIn(".encrypt #passphrase", PASSPHRASE);
  await click(".encrypt button.btn-primary");
  await sleep(1500);

  const [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
  await sleep(1500);
});

test("changing passphrase works", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  let ajaxRequested = false;
  /* global server */
  server.put("/encrypt/keys", request => {
    const params = parsePostData(request.requestBody);
    assert.equal(
      params["public_key"],
      keys["eviltrout"][2],
      "old and new public keys match"
    );
    assert.notEqual(
      params["private_key"],
      keys["eviltrout"][3],
      "old and new private keys do not match"
    );
    ajaxRequested = true;
    return [200, { "Content-Type": "application/json" }, { success: "OK" }];
  });

  await visit("/u/eviltrout/preferences");
  await sleep(1500);

  await click(".encrypt button#change");
  await fillIn(".encrypt #oldPassphrase", PASSPHRASE);
  await fillIn(".encrypt #passphrase", "new" + PASSPHRASE + "passphrase");
  await fillIn(".encrypt #passphrase2", "new" + PASSPHRASE + "passphrase");
  await click(".encrypt button.btn-primary");
  await sleep(1500);

  assert.ok(ajaxRequested, "AJAX request to save keys was made");

  const [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
  await sleep(1500);
});

test("deactivation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  await visit("/u/eviltrout/preferences");
  await sleep(1500);

  await click(".encrypt button#deactivate");
  await sleep(1500);

  const [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.equal(publicKey, null);
  assert.equal(privateKey, null);
  await sleep(1500);
});

import { acceptance } from "helpers/qunit-helpers";
import {
  exportPrivateKey,
  exportPublicKey,
  generateKeyPair,
  generateSalt,
  generatePassphraseKey
} from "discourse/plugins/discourse-encrypt/lib/keys";
import { saveKeyPairToIndexedDb } from "discourse/plugins/discourse-encrypt/lib/keys_db";

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
async function setupEncryption() {
  /*
   * Setup current user.
   */
  const keyPair = await getKeyPair(PASSPHRASE);
  const [publicKey, privateKey, publicStr, privateStr] = keyPair;

  // Enable on server-side.
  const user = Discourse.User.current();
  user.set("custom_fields.encrypt_public_key", publicStr);
  user.set("custom_fields.encrypt_private_key", privateStr);

  // Activate on client-side.
  await saveKeyPairToIndexedDb(publicKey, privateKey);

  /*
   * Setup other users.
   */
  keys[user.username] = keyPair;
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

    // TODO: Autocomplete is not available during testing.
    //
    // server.get("/u/search/users", () => {
    //   return helper.response({
    //     users: [
    //       {
    //         username: "codinghorror",
    //         name: "codinghorror",
    //         avatar_template: "/images/avatar.png"
    //       }
    //     ],
    //     groups: []
    //   });
    // });
  }
});

test("posting does not leak plaintext", async assert => {
  globalAssert = assert;
  await setupEncryption();

  const composerActions = selectKit(".composer-actions");

  await visit("/");
  await click("#create-topic");

  await composerActions.expand();
  await composerActions.selectRowByValue("reply_as_private_message");

  // TODO: Autocomplete is not available during testing.
  //
  // await fillIn("#private-message-users", "codinghorror");
  // await click("#private-message-users");
  // await keyEvent("#private-message-users", "keydown", 8);
  // await click(".autocomplete ul li a:first");

  await click(".reply-details a");
  await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
  await fillIn(".d-editor-input", `Hello, world! ${PLAINTEXT}`.repeat(42));

  await click("button.create");

  globalAssert = null;
});

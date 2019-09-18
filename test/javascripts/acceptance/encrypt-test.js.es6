import {
  deleteDb,
  loadDbIdentity,
  saveDbIdentity
} from "discourse/plugins/discourse-encrypt/lib/database";
import EncryptLibDiscourse, {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  ENCRYPT_ENABLED
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  exportIdentity,
  generateIdentity
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { default as userFixtures } from "fixtures/user_fixtures";
import { acceptance, updateCurrentUser } from "helpers/qunit-helpers";
import selectKit from "helpers/select-kit-helper";

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
 * Sets up encryption.
 */
async function setEncryptionStatus(status) {
  const user = Discourse.User.current();

  // Resetting IndexedDB.
  try {
    await deleteDb();
  } catch (e) {}

  // Generating a new key pair if enabling or creating a dummy one if disabling.
  let identity = {};
  let exported = {};
  let exportedPrivate;
  if (status !== ENCRYPT_DISABLED) {
    identity = await generateIdentity();
    exported = await exportIdentity(identity, PASSPHRASE);
    exportedPrivate = JSON.stringify({ passphrase: exported.private });
  }

  // Overwriting server-side fields.
  user.set("custom_fields.encrypt_public", exported.public);
  user.set("custom_fields.encrypt_private", exportedPrivate);

  // Setting the appropriate custom fields is not always enough (i.e. if user
  // navigates to preferences).
  /* global server */
  server.get("/u/eviltrout.json", () => {
    const json = userFixtures["/u/eviltrout.json"];
    json.user.can_edit = true;
    json.user.custom_fields = {
      encrypt_public: exported.public,
      encrypt_private: exportedPrivate
    };
    return [200, { "Content-Type": "application/json" }, json];
  });

  // Activating encryption on client-side.
  if (status === ENCRYPT_ACTIVE) {
    await saveDbIdentity(identity);
  }

  // Store key for future use.
  return (keys[user.username] = identity);
}

// TODO: Figure out why `await` is not enough.
function sleep(time) {
  return new Ember.RSVP.Promise(resolve => setTimeout(resolve, time));
}

acceptance("Encrypt", {
  loggedIn: true,
  settings: { encrypt_enabled: true, encrypt_groups: "" },

  beforeEach() {
    sandbox.stub(EncryptLibDiscourse, "reload");

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

  const composerActions = selectKit(".composer-actions");

  await visit("/");
  await click("#create-topic");
  await composerActions.expand();
  await composerActions.selectRowByValue("reply_as_private_message");
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
  await click(".encrypt button.btn-primary");
  await sleep(1500);
  await sleep(1500);

  assert.ok(ajaxRequested, "AJAX request to save keys was made");

  const identity = await loadDbIdentity();
  assert.ok(identity.encryptPublic instanceof CryptoKey);
  assert.ok(identity.encryptPrivate instanceof CryptoKey);
  assert.ok(identity.signPublic instanceof CryptoKey);
  assert.ok(identity.signPrivate instanceof CryptoKey);
  await sleep(1500);
});

test("activation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ENABLED);

  await visit("/u/eviltrout/preferences");
  await fillIn(".encrypt #passphrase", PASSPHRASE);
  await click(".encrypt button.btn-primary");
  await sleep(1500);

  const identity = await loadDbIdentity();
  assert.ok(identity.encryptPublic instanceof CryptoKey);
  assert.ok(identity.encryptPrivate instanceof CryptoKey);
  assert.ok(identity.signPublic instanceof CryptoKey);
  assert.ok(identity.signPrivate instanceof CryptoKey);
  await sleep(1500);
});

test("deactivation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  await visit("/u/eviltrout/preferences");
  await click(".encrypt button#deactivate");
  await sleep(1500);

  const identity = await loadDbIdentity();
  assert.equal(identity, null);
  await sleep(1500);
});

test("encrypt settings visible only to allowed groups", async assert => {
  await setEncryptionStatus(ENCRYPT_DISABLED);

  await visit("/u/eviltrout/preferences");

  assert.ok(find(".encrypt").text().length > 0, "encrypt settings are visible");

  Discourse.SiteSettings.encrypt_groups = "allowed_group";

  updateCurrentUser({
    groups: [
      Ember.Object.create({
        id: 1,
        name: "not_allowed_group"
      })
    ]
  });

  await visit("/u/eviltrout/preferences");
  assert.ok(
    find(".encrypt").text().length === 0,
    "encrypt settings are not visible"
  );

  updateCurrentUser({
    groups: [
      Ember.Object.create({
        id: 1,
        name: "not_allowed_group"
      }),
      Ember.Object.create({
        id: 2,
        name: "allowed_group"
      })
    ]
  });

  await visit("/u/eviltrout/preferences");
  assert.ok(find(".encrypt").text().length > 0, "encrypt settings are visible");
});

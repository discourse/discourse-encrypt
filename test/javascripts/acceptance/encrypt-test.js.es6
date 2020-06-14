import User from "discourse/models/user";
import {
  deleteDb,
  loadDbIdentity,
  saveDbIdentity
} from "discourse/plugins/discourse-encrypt/lib/database";
import EncryptLibDiscourse, {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  ENCRYPT_ENABLED,
  getEncryptionStatus,
  getIdentity
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  exportIdentity,
  exportKey,
  generateIdentity,
  generateKey
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { NOTIFICATION_TYPES } from "fixtures/concerns/notification-types";
import { default as userFixtures } from "fixtures/user_fixtures";
import { parsePostData } from "helpers/create-pretender";
import { acceptance, updateCurrentUser } from "helpers/qunit-helpers";
import selectKit from "helpers/select-kit-helper";
import { Promise } from "rsvp";

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
 * @var PASSPHRASE Secret passphrase used for testing purposes.
 */
const PASSPHRASE = "curren7U$er.pa$$Phr4se";

/**
 * @var PLAINTEXT Constant string that is used to check for plaintext leakage.
 */
const PLAINTEXT = "!PL41N73X7!";

/**
 * @var keys User keys.
 */
const keys = {};

/**
 * @var globalAssert Global assert instance used to report plaintext leakage.
 */
let globalAssert;

/**
 * @var requests Request URLs intercepted by the leak checker.
 */
let requests = [];

/**
 * Sets up encryption.
 *
 * @param status
 */
async function setEncryptionStatus(status) {
  const user = User.current();

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
  user.set("encrypt_public", exported.public);
  user.set("encrypt_private", exportedPrivate);

  // Setting the appropriate custom fields is not always enough (i.e. if user
  // navigates to preferences).
  /* global server */
  server.get("/u/eviltrout.json", () => {
    const json = userFixtures["/u/eviltrout.json"];
    json.user.can_edit = true;
    json.user.encrypt_public = exported.public;
    json.user.encrypt_private = exportedPrivate;
    return [200, { "Content-Type": "application/json" }, json];
  });

  // Activating encryption on client-side.
  if (status === ENCRYPT_ACTIVE) {
    await saveDbIdentity(identity);
  }

  keys[user.username] = exported.public;
  return identity;
}

/**
 * Executes the given function and waits until current encryption status
 * changes or given waiter becomes true.
 *
 * @param statusOrWaiter
 * @param func
 */
async function wait(statusOrWaiter, func) {
  const waiter =
    typeof statusOrWaiter === "function"
      ? statusOrWaiter
      : () => getEncryptionStatus(User.current()) === statusOrWaiter;

  try {
    Ember.Test.registerWaiter(waiter);
    await func();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Caught exception while waiting: ${e.message}`, e);
  } finally {
    Ember.Test.unregisterWaiter(waiter);
  }
}

acceptance("Encrypt", {
  loggedIn: true,
  settings: { encrypt_enabled: true, encrypt_groups: "" },

  beforeEach() {
    sandbox.stub(EncryptLibDiscourse, "reload");

    // Hook `XMLHttpRequest` to search for leaked plaintext.
    XMLHttpRequest.prototype.send_ = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body) {
      requests.push(this.url);
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
      request.queryParams["usernames"].forEach(u => (response[u] = keys[u]));
      return helper.response(response);
    });

    server.put("/encrypt/post", () => {
      return helper.response({});
    });
  }
});

test("meta: leak checker works", async assert => {
  globalAssert = { notContains: () => assert.ok(true) };

  await visit("/");
  await click("#create-topic");

  requests = [];
  await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
  await fillIn(".d-editor-input", `Hello, world! ${PLAINTEXT}`.repeat(42));
  await wait(
    () => requests.includes("/posts"),
    () => click("button.create")
  );

  globalAssert = null;
});

test("posting does not leak plaintext", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);
  globalAssert = assert;

  /* global server */
  server.get("/u/search/users", () => {
    return [
      200,
      { "Content-Type": "application/json" },
      {
        users: [
          {
            username: "eviltrout",
            name: "eviltrout",
            avatar_template: "/images/avatar.png"
          }
        ]
      }
    ];
  });

  server.post("/posts", request => {
    const body = parsePostData(request.requestBody);
    assert.equal(body.raw, I18n.t("encrypt.encrypted_post"));
    assert.equal(body.title, I18n.t("encrypt.encrypted_topic_title"));
    assert.equal(body.archetype, "private_message");
    assert.equal(body.target_recipients || body.target_usernames, "eviltrout");
    assert.equal(body.draft_key, "new_topic");
    assert.equal(body.is_encrypted, "true");
    assert.ok(body.encrypted_title.startsWith("1$"));
    assert.ok(body.encrypted_raw.startsWith("1$"));
    assert.ok(JSON.parse(body.encrypted_keys).eviltrout);
    return [
      200,
      { "Content-Type": "application/json" },
      { action: "create_post", post: { topic_id: 34 } }
    ];
  });

  const composerActions = selectKit(".composer-actions");

  await visit("/");
  await click("#create-topic");
  await composerActions.expand();
  await composerActions.selectRowByValue("reply_as_private_message");

  if (find('.users-input').text().trim() != "") {
    globalAssert = null;
    throw new Error("Another test is leaking composer state");
  }

  await fillIn("#private-message-users", "admin");
  await keyEvent("#private-message-users", "keydown", 8);
  await keyEvent("#private-message-users", "keydown", 13);

  requests = [];
  await wait(
    () => requests.includes("/draft.json"),
    async () => {
      await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
      await fillIn(".d-editor-input", `Hello, world! ${PLAINTEXT}`.repeat(42));
    }
  );

  requests = [];
  await wait(
    () => requests.includes("/posts") && requests.includes("/encrypt/post"),
    () => click("button.create")
  );

  globalAssert = null;
});

test("new draft for public topic is not encrypted", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  server.post("/draft.json", request => {
    const data = JSON.parse(parsePostData(request.requestBody).data);
    if (data.title) {
      assert.equal(data.title, `Some public message ${PLAINTEXT}`);
    }
    if (data.reply) {
      assert.equal(data.reply, `Hello, world! ${PLAINTEXT}`.repeat(42));
    }
    return [200, { "Content-Type": "application/json" }, {}];
  });

  await visit("/");
  await click("#create-topic");
  await fillIn("#reply-title", `Some public message ${PLAINTEXT}`);
  await fillIn(".d-editor-input", `Hello, world! ${PLAINTEXT}`.repeat(42));

  requests = [];
  await wait(
    () => requests.includes("/draft.json"),
    () => click(".toggler")
  );
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
  await wait(ENCRYPT_ACTIVE, () => click(".encrypt button.btn-primary"));
  assert.ok(ajaxRequested, "AJAX request to save keys was made");

  const identity = await loadDbIdentity();
  assert.ok(identity.encryptPublic instanceof CryptoKey);
  assert.ok(identity.encryptPrivate instanceof CryptoKey);
  assert.ok(identity.signPublic instanceof CryptoKey);
  assert.ok(identity.signPrivate instanceof CryptoKey);
});

test("activation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ENABLED);

  await visit("/u/eviltrout/preferences");
  await fillIn(".encrypt #passphrase", PASSPHRASE);
  await wait(ENCRYPT_ACTIVE, () => click(".encrypt button.btn-primary"));

  const identity = await loadDbIdentity();
  assert.ok(identity.encryptPublic instanceof CryptoKey);
  assert.ok(identity.encryptPrivate instanceof CryptoKey);
  assert.ok(identity.signPublic instanceof CryptoKey);
  assert.ok(identity.signPrivate instanceof CryptoKey);
});

test("deactivation works", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  await visit("/u/eviltrout/preferences");
  await wait(ENCRYPT_ENABLED, () => click(".encrypt button#deactivate"));

  const identity = await loadDbIdentity();
  assert.equal(identity, null);
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

test("user preferences connector works for other users", async assert => {
  /* global server */
  server.get("/u/eviltrout2.json", () => {
    const json = JSON.parse(JSON.stringify(userFixtures["/u/eviltrout.json"]));
    json.user.id += 1;
    json.user.can_edit = true;
    json.user.encrypt_public = "encrypted public identity";
    return [200, { "Content-Type": "application/json" }, json];
  });

  await visit("/u/eviltrout2/preferences");

  assert.ok(
    find(".user-preferences-account-outlet.encrypt")
      .text()
      .trim()
      .indexOf(I18n.t("encrypt.preferences.status_enabled_other")) !== -1
  );
});

test("topic titles in notification panel are decrypted", async assert => {
  await setEncryptionStatus(ENCRYPT_ACTIVE);

  const identity = await getIdentity();
  const topicKey = await generateKey();
  const exportedKey = await exportKey(topicKey, identity.encryptPublic);
  const title = "Top Secret :male_detective:";
  const encryptedTitle = await encrypt(topicKey, { raw: title });

  /* global server */
  server.get("/notifications", () => [
    200,
    { "Content-Type": "application/json" },
    {
      notifications: [
        {
          id: 42,
          user_id: 1,
          notification_type: NOTIFICATION_TYPES.private_message,
          read: false,
          created_at: "2020-01-01T12:12:12.000Z",
          post_number: 1,
          topic_id: 42,
          fancy_title: "A Secret Message",
          slug: "a-secret-message",
          data: {
            topic_title: "A Secret Message",
            original_post_id: 42,
            original_post_type: 1,
            original_username: "foo",
            revision_number: null,
            display_username: "foo"
          },
          encrypted_title: encryptedTitle,
          topic_key: exportedKey
        }
      ],
      total_rows_notifications: 1,
      seen_notification_id: 5,
      load_more_notifications: "/notifications?offset=60&username=dan"
    }
  ]);

  const stub = sandbox.stub(EncryptLibDiscourse, "getTopicTitle");
  stub.returns(Promise.resolve("Top Secret :male_detective:"));

  await visit("/");
  await click(".header-dropdown-toggle.current-user");

  // The plugin debounces the decryption operation to ensure that DOM elements
  // containing encrypted information are displayed.
  // In test environments, because `Ember.run.debounce` is aliased to `Ember.run`.
  await window.Discourse.__container__
    .lookup("service:app-events")
    .trigger("encrypt:status-changed", true);

  assert.equal(
    find(".quick-access-panel span[data-topic-id]").text(),
    "Top Secret "
  );
  assert.equal(find(".quick-access-panel span[data-topic-id] img").length, 1);
});

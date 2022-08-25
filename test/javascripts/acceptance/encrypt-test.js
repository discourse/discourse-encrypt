import { click, fillIn, visit } from "@ember/test-helpers";
import { registerWaiter, unregisterWaiter } from "@ember/test";
import User from "discourse/models/user";
import {
  deleteDb,
  loadDbIdentity,
  saveDbIdentity,
} from "discourse/plugins/discourse-encrypt/lib/database";
import EncryptLibDiscourse, {
  ENCRYPT_ACTIVE,
  ENCRYPT_DISABLED,
  ENCRYPT_ENABLED,
  getEncryptionStatus,
  getIdentity,
  resetEncrypt,
} from "discourse/plugins/discourse-encrypt/lib/discourse";
import {
  encrypt,
  exportIdentity,
  exportKey,
  generateIdentity,
  generateKey,
  importIdentity,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { NOTIFICATION_TYPES } from "discourse/tests/fixtures/concerns/notification-types";
import userFixtures from "discourse/tests/fixtures/user-fixtures";
import pretender, {
  parsePostData,
} from "discourse/tests/helpers/create-pretender";
import {
  acceptance,
  count,
  exists,
  query,
  queryAll,
  updateCurrentUser,
} from "discourse/tests/helpers/qunit-helpers";
import selectKit from "discourse/tests/helpers/select-kit-helper";
import I18n from "I18n";
import QUnit, { test } from "qunit";
import { Promise } from "rsvp";
import sinon from "sinon";
import { cloneJSON } from "discourse-common/lib/object";

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
    message,
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
const PLAINTEXT_TITLE = `A new topic ${PLAINTEXT}`;
const PLAINTEXT_RAW = `Hello, world! ${PLAINTEXT}\n`.repeat(42);

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
  pretender.get("/u/eviltrout.json", () => {
    const json = cloneJSON(userFixtures["/u/eviltrout.json"]);
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
    registerWaiter(waiter);
    await func();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Caught exception while waiting: ${e.message}`, e);
  } finally {
    unregisterWaiter(waiter);
  }
}

function setupEncryptTests(needs) {
  needs.user({ can_encrypt: true });
  needs.settings({ encrypt_pms_default: true });

  needs.hooks.beforeEach(function () {
    sinon.stub(EncryptLibDiscourse, "reload");

    // Hook `XMLHttpRequest` to search for leaked plaintext.
    XMLHttpRequest.prototype.send_ = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      requests.push(this.url);
      if (body && globalAssert) {
        globalAssert.notContains(body, PLAINTEXT, "does not leak plaintext");
        globalAssert.notContains(body, PASSPHRASE, "does not leak passphrase");
      }
      return this.send_(...arguments);
    };

    resetEncrypt();
  });

  needs.hooks.afterEach(function () {
    // Restore `XMLHttpRequest`.
    XMLHttpRequest.prototype.send = XMLHttpRequest.prototype.send_;
    delete XMLHttpRequest.prototype.send_;

    globalAssert = null;
  });

  needs.pretender((server, helper) => {
    pretender.get("/encrypt/user", (request) => {
      const response = {};
      request.queryParams["usernames"].forEach((u) => (response[u] = keys[u]));
      return helper.response(response);
    });

    pretender.get("/encrypt/posts", () => {
      return helper.response({ posts: [], topics: [] });
    });

    pretender.put("/encrypt/post", () => {
      return helper.response({});
    });
  });
}

async function setupEncryptedTopicPretender(server, { identity } = {}) {
  identity = identity || (await getIdentity());
  const topicKey = await generateKey();
  const exportedTopicKey = await exportKey(topicKey, identity.encryptPublic);
  const encryptedTitle = await encrypt(topicKey, { raw: "Top Secret Title" });
  const encryptedRaw = await encrypt(topicKey, { raw: "Top Secret Post" });

  server.get("/t/42.json", () => {
    return [
      200,
      { "Content-Type": "application/json" },
      {
        post_stream: {
          posts: [
            {
              id: 42,
              name: null,
              username: "bar",
              avatar_template:
                "/letter_avatar_proxy/v4/letter/b/000000/{size}.png",
              created_at: "2020-01-01T12:00:00.000Z",
              cooked:
                "<p>This is a secret message with end to end encryption. To view it, you must be invited to this topic.</p>",
              post_number: 1,
              post_type: 1,
              updated_at: "2020-01-01T12:00:00.000Z",
              reply_count: 0,
              reply_to_post_number: null,
              quote_count: 0,
              incoming_link_count: 0,
              reads: 2,
              readers_count: 1,
              score: 0.4,
              yours: false,
              topic_id: 42,
              topic_slug: "a-secret-message",
              display_username: null,
              primary_group_name: null,
              primary_group_flair_url: null,
              primary_group_flair_bg_color: null,
              primary_group_flair_color: null,
              version: 1,
              can_edit: true,
              can_delete: false,
              can_recover: false,
              can_wiki: true,
              read: true,
              user_title: null,
              title_is_group: false,
              bookmarked: false,
              actions_summary: [
                {
                  id: 2,
                  can_act: true,
                },
                {
                  id: 3,
                  can_act: true,
                },
                {
                  id: 4,
                  can_act: true,
                },
                {
                  id: 8,
                  can_act: true,
                },
                {
                  id: 6,
                  can_act: true,
                },
                {
                  id: 7,
                  can_act: true,
                },
              ],
              moderator: false,
              admin: true,
              staff: true,
              user_id: 2,
              hidden: false,
              trust_level: 0,
              deleted_at: null,
              user_deleted: false,
              edit_reason: null,
              can_view_edit_history: true,
              wiki: false,
              reviewable_id: 0,
              reviewable_score_count: 0,
              reviewable_score_pending_count: 0,
              encrypted_raw: encryptedRaw,
            },
          ],
          stream: [42],
        },
        timeline_lookup: [[1, 0]],
        related_messages: [],
        suggested_topics: [],
        id: 42,
        title: "A secret message",
        fancy_title: "A secret message",
        posts_count: 1,
        created_at: "2020-01-01T12:00:00.000Z",
        views: 2,
        reply_count: 0,
        like_count: 0,
        last_posted_at: "2020-01-01T12:00:00.000Z",
        visible: true,
        closed: false,
        archived: false,
        has_summary: false,
        archetype: "private_message",
        slug: "a-secret-message",
        category_id: null,
        word_count: 16,
        deleted_at: null,
        user_id: 2,
        featured_link: null,
        pinned_globally: false,
        pinned_at: null,
        pinned_until: null,
        image_url: null,
        slow_mode_seconds: 0,
        draft: null,
        draft_key: "topic_42",
        draft_sequence: 0,
        posted: false,
        unpinned: null,
        pinned: false,
        current_post_number: 1,
        highest_post_number: 1,
        last_read_post_number: 1,
        last_read_post_id: 42,
        deleted_by: null,
        has_deleted: false,
        actions_summary: [
          {
            id: 4,
            count: 0,
            hidden: false,
            can_act: true,
          },
          {
            id: 8,
            count: 0,
            hidden: false,
            can_act: true,
          },
          {
            id: 7,
            count: 0,
            hidden: false,
            can_act: true,
          },
        ],
        chunk_size: 20,
        bookmarked: false,
        message_archived: false,
        topic_timer: null,
        message_bus_last_id: 3,
        participant_count: 1,
        pm_with_non_human_user: false,
        queued_posts_count: 0,
        show_read_indicator: false,
        requested_group_name: null,
        thumbnails: null,
        slow_mode_enabled_until: null,
        encrypted_title: encryptedTitle,
        topic_key: exportedTopicKey,
        details: {
          can_edit: true,
          notification_level: 3,
          notifications_reason_id: 2,
          can_move_posts: true,
          can_delete: true,
          can_remove_allowed_users: true,
          can_invite_to: true,
          can_invite_via_email: true,
          can_create_post: true,
          can_reply_as_new_topic: true,
          can_flag_topic: true,
          can_convert_topic: true,
          can_review_topic: true,
          can_close_topic: true,
          can_archive_topic: true,
          can_split_merge_topic: true,
          can_edit_staff_notes: true,
          can_toggle_topic_visibility: true,
          can_pin_unpin_topic: true,
          can_moderate_category: true,
          can_remove_self_id: 1,
          participants: [
            {
              id: 2,
              username: "bar",
              name: null,
              avatar_template:
                "/letter_avatar_proxy/v4/letter/b/000000/{size}.png",
              post_count: 1,
              primary_group_name: null,
              primary_group_flair_url: null,
              primary_group_flair_color: null,
              primary_group_flair_bg_color: null,
              admin: true,
              trust_level: 0,
            },
          ],
          allowed_users: [
            {
              id: 1,
              username: "foo",
              name: null,
              avatar_template:
                "/letter_avatar_proxy/v4/letter/f/000000/{size}.png",
            },
            {
              id: 2,
              username: "bar",
              name: null,
              avatar_template:
                "/letter_avatar_proxy/v4/letter/b/000000/{size}.png",
            },
          ],
          created_by: {
            id: 2,
            username: "bar",
            name: null,
            avatar_template:
              "/letter_avatar_proxy/v4/letter/b/000000/{size}.png",
          },
          last_poster: {
            id: 2,
            username: "bar",
            name: null,
            avatar_template:
              "/letter_avatar_proxy/v4/letter/b/000000/{size}.png",
          },
          allowed_groups: [],
        },
        pending_posts: [],
      },
    ];
  });
}

acceptance("Encrypt - disabled", function (needs) {
  setupEncryptTests(needs);

  needs.hooks.beforeEach(async function () {
    await setEncryptionStatus(ENCRYPT_DISABLED);
  });

  test("enabling works", async function (assert) {
    let ajaxRequested = false;
    pretender.put("/encrypt/keys", () => {
      ajaxRequested = true;
      return [200, { "Content-Type": "application/json" }, { success: "OK" }];
    });

    await visit("/u/eviltrout/preferences/security");
    await wait(ENCRYPT_ACTIVE, () => click(".encrypt button.btn-primary"));
    assert.ok(ajaxRequested, "AJAX request to save keys was made");

    const identity = await loadDbIdentity();
    assert.ok(identity.encryptPublic instanceof CryptoKey);
    assert.ok(identity.encryptPrivate instanceof CryptoKey);
    assert.ok(identity.signPublic instanceof CryptoKey);
    assert.ok(identity.signPrivate instanceof CryptoKey);
  });

  test("encrypt settings visible only if user can encrypt", async function (assert) {
    await visit("/u/eviltrout/preferences/security");
    assert.ok(
      query(".encrypt").innerText.trim().length > 0,
      "encrypt settings are visible"
    );

    updateCurrentUser({ can_encrypt: false });

    await visit("/u/eviltrout/preferences");
    await click(".nav-security a");
    assert.strictEqual(
      query(".encrypt").innerText.trim().length,
      0,
      "encrypt settings are not visible"
    );

    updateCurrentUser({ can_encrypt: true });

    await visit("/u/eviltrout/preferences");
    await click(".nav-security a");
    assert.ok(
      query(".encrypt").innerText.trim().length > 0,
      "encrypt settings are visible"
    );
  });

  test("user preferences connector works for other users", async function (assert) {
    pretender.get("/u/eviltrout2.json", () => {
      const json = cloneJSON(userFixtures["/u/eviltrout.json"]);
      json.user.id += 1;
      json.user.can_edit = true;
      json.user.can_encrypt = true;
      json.user.encrypt_public = "encrypted public identity";
      return [200, { "Content-Type": "application/json" }, json];
    });

    await visit("/u/eviltrout2/preferences/security");

    assert.ok(
      query(".user-preferences-security-outlet.encrypt")
        .innerText.trim()
        .includes(I18n.t("encrypt.preferences.status_enabled_other"))
    );
  });
});

acceptance("Encrypt - enabled", function (needs) {
  setupEncryptTests(needs);

  needs.hooks.beforeEach(async function () {
    await setEncryptionStatus(ENCRYPT_ENABLED);
  });

  test("activation works", async function (assert) {
    await visit("/u/eviltrout/preferences/security");
    await fillIn(".encrypt #passphrase", PASSPHRASE);
    await wait(ENCRYPT_ACTIVE, () => click(".encrypt button.btn-primary"));

    const identity = await loadDbIdentity();
    assert.ok(identity.encryptPublic instanceof CryptoKey);
    assert.ok(identity.encryptPrivate instanceof CryptoKey);
    assert.ok(identity.signPublic instanceof CryptoKey);
    assert.ok(identity.signPrivate instanceof CryptoKey);
  });

  test("viewing encrypted topic works when just enabled", async function (assert) {
    globalAssert = assert;

    const identities = JSON.parse(User.current().encrypt_private);
    const identity = await importIdentity(identities["passphrase"], PASSPHRASE);
    await setupEncryptedTopicPretender(pretender, { identity });

    await visit("/t/a-secret-message/42");
    assert.ok(exists(".modal.activate-encrypt-modal"));
  });
});

acceptance("Encrypt - active", function (needs) {
  setupEncryptTests(needs);

  needs.hooks.beforeEach(async function () {
    await setEncryptionStatus(ENCRYPT_ACTIVE);
  });

  test("meta: leak checker works", async function (assert) {
    globalAssert = { notContains: () => assert.ok(true) };

    await visit("/");
    await click("#create-topic");

    requests = [];
    await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
    await fillIn(".d-editor-input", PLAINTEXT_RAW);
    await wait(
      () => requests.includes("/posts"),
      () => click("button.create")
    );
  });

  test("posting does not leak plaintext", async function (assert) {
    globalAssert = assert;

    pretender.get("/u/search/users", () => {
      return [
        200,
        { "Content-Type": "application/json" },
        {
          users: [
            {
              username: "eviltrout",
              name: "eviltrout",
              avatar_template: "/images/avatar.png",
            },
          ],
        },
      ];
    });

    pretender.post("/posts", (request) => {
      const body = parsePostData(request.requestBody);

      assert.strictEqual(body.raw, I18n.t("encrypt.encrypted_post"));
      assert.strictEqual(body.title, I18n.t("encrypt.encrypted_title"));
      assert.strictEqual(body.archetype, "private_message");
      assert.strictEqual(body.target_recipients, "eviltrout");
      assert.strictEqual(body.draft_key, "new_private_message");
      assert.strictEqual(body.is_encrypted, "true");
      assert.ok(body.encrypted_title.startsWith("1$"));
      assert.ok(body.encrypted_raw.startsWith("1$"));
      assert.ok(JSON.parse(body.encrypted_keys).eviltrout);

      return [
        200,
        { "Content-Type": "application/json" },
        { action: "create_post", post: { topic_id: 34 } },
      ];
    });

    await visit("/u/eviltrout/messages");
    await click(".new-private-message");

    // simulate selecting from autocomplete suggestions
    const usersSelector = selectKit("#private-message-users");
    await usersSelector.expand();
    await usersSelector.fillInFilter("evilt");
    await usersSelector.selectRowByValue("eviltrout");

    requests = [];
    await wait(
      () => requests.includes("/drafts.json"),
      async () => {
        await fillIn("#reply-title", `Some hidden message ${PLAINTEXT}`);
        await fillIn(".d-editor-input", PLAINTEXT_RAW);
      }
    );

    requests = [];
    await wait(
      () => requests.includes("/posts") && requests.includes("/encrypt/post"),
      () => click("button.create")
    );
  });

  test("new draft for public topic is not encrypted", async function (assert) {
    let assertedTitle, assertedReply;
    pretender.post("/drafts.json", (request) => {
      const data = JSON.parse(parsePostData(request.requestBody).data);
      if (data.title) {
        assertedTitle = true;
        assert.strictEqual(data.title, PLAINTEXT_TITLE);
      }
      if (data.reply) {
        assertedReply = true;
        assert.strictEqual(data.reply, PLAINTEXT_RAW);
      }
      return [200, { "Content-Type": "application/json" }, {}];
    });

    await visit("/");
    await click("#create-topic");
    await fillIn("#reply-title", PLAINTEXT_TITLE);
    await fillIn(".d-editor-input", PLAINTEXT_RAW);

    await wait(
      () => assertedTitle && assertedReply,
      () => click(".toggler")
    );
  });

  test("draft for new topics is encrypted", async function (assert) {
    let assertedTitle, assertedReply;
    pretender.post("/drafts.json", (request) => {
      const data = JSON.parse(parsePostData(request.requestBody).data);
      if (data.title) {
        assertedTitle = true;
        assert.notStrictEqual(data.title, PLAINTEXT_TITLE);
      }
      if (data.reply) {
        assertedReply = true;
        assert.notStrictEqual(data.reply, PLAINTEXT_RAW);
      }
      return [200, { "Content-Type": "application/json" }, {}];
    });

    await visit("/u/eviltrout/messages");
    await click(".new-private-message");
    await fillIn("#reply-title", PLAINTEXT_TITLE);
    await fillIn(".d-editor-input", PLAINTEXT_RAW);

    await wait(
      () => assertedTitle && assertedReply,
      () => click(".toggler")
    );
  });

  test("draft for replies is encrypted", async function (assert) {
    let assertedReply;
    pretender.post("/drafts.json", (request) => {
      const data = JSON.parse(parsePostData(request.requestBody).data);
      if (data.reply) {
        assertedReply = true;
        assert.notStrictEqual(data.reply, PLAINTEXT_RAW);
      }
      return [200, { "Content-Type": "application/json" }, {}];
    });

    await setupEncryptedTopicPretender(pretender);

    await visit("/t/a-secret-message/42");
    await click(".topic-footer-main-buttons .btn-primary.create");
    await fillIn(".d-editor-input", PLAINTEXT_RAW);

    await wait(
      () => assertedReply,
      () => click(".toggler")
    );
  });

  test("deactivation works", async function (assert) {
    await visit("/u/eviltrout/preferences/security");
    await wait(ENCRYPT_ENABLED, () => click(".encrypt button#deactivate"));

    assert.rejects(loadDbIdentity());
  });

  test("viewing encrypted topic works when active", async function (assert) {
    globalAssert = assert;

    await setupEncryptedTopicPretender(pretender);

    await visit("/t/a-secret-message/42");

    assert.strictEqual(
      query(".fancy-title").innerText.trim(),
      "Top Secret Title"
    );
    assert.strictEqual(query(".cooked").innerText.trim(), "Top Secret Post");
    assert.strictEqual(
      document.title,
      "Top Secret Title - QUnit Discourse Tests"
    );
    assert.ok(exists(".private_message.encrypted"), "encrypted class is added");

    await click(".private_message.encrypted h1[data-topic-id] .edit-topic");

    assert.strictEqual(query("#edit-title").value.trim(), "Top Secret Title");
  });

  test("topic titles in notification panel are decrypted", async function (assert) {
    const identity = await getIdentity();
    const topicKey = await generateKey();
    const exportedKey = await exportKey(topicKey, identity.encryptPublic);
    const title = "Top Secret :male_detective:";
    const encryptedTitle = await encrypt(topicKey, { raw: title });

    pretender.get("/notifications", () => [
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
              display_username: "foo",
            },
            encrypted_title: encryptedTitle,
            topic_key: exportedKey,
          },
        ],
        total_rows_notifications: 1,
        seen_notification_id: 5,
        load_more_notifications: "/notifications?offset=60&username=foo",
      },
    ]);

    const stub = sinon.stub(EncryptLibDiscourse, "syncGetTopicTitle");
    stub.returns("Top Secret :male_detective:");

    const stub2 = sinon.stub(EncryptLibDiscourse, "getTopicTitle");
    stub2.returns(Promise.resolve("Top Secret :male_detective:"));

    const stub3 = sinon.stub(EncryptLibDiscourse, "waitForPendingTitles");
    stub3.returns(Promise.resolve());

    await visit("/");
    await click(".header-dropdown-toggle.current-user");

    assert.strictEqual(
      query(".quick-access-panel span[data-topic-id]").innerText,
      "Top Secret "
    );
    assert.strictEqual(count(".quick-access-panel span[data-topic-id] img"), 1);
  });

  test("topic titles in the notifications tab in the experimental user menu are decrypted", async function (assert) {
    updateCurrentUser({
      redesigned_user_menu_enabled: true,
    });
    const identity = await getIdentity();
    const topicKey = await generateKey();
    const exportedKey = await exportKey(topicKey, identity.encryptPublic);
    const title = "Top Secret <a> :male_detective:";
    const encryptedTitle = await encrypt(topicKey, { raw: title });

    pretender.get("/notifications", () => [
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
              display_username: "secret-mailer",
            },
            encrypted_title: encryptedTitle,
            topic_key: exportedKey,
          },
        ],
        total_rows_notifications: 1,
        seen_notification_id: 5,
        load_more_notifications: "/notifications?offset=60&username=foo",
      },
    ]);

    const stub = sinon.stub(EncryptLibDiscourse, "syncGetTopicTitle");
    stub.returns(title);

    const stub2 = sinon.stub(EncryptLibDiscourse, "getTopicTitle");
    stub2.returns(Promise.resolve(title));

    const stub3 = sinon.stub(EncryptLibDiscourse, "waitForPendingTitles");
    stub3.returns(Promise.resolve());

    await visit("/");
    await click(".header-dropdown-toggle.current-user");

    const notifications = queryAll(
      "#quick-access-all-notifications ul li.notification"
    );

    assert.strictEqual(
      notifications[0].textContent.replace(/\s+/g, " ").trim(),
      "secret-mailer Top Secret <a>",
      "message title in the notifications tab is decrypted and rendered safely"
    );
    const emoji = notifications[0].querySelector(".item-description img.emoji");
    assert.strictEqual(
      emoji.title,
      "male_detective",
      "emoji in encrypted message title in the notifications tab is rendered correctly"
    );
  });

  test("topic titles in the bookmarks tab in the experimental user menu are decrypted", async function (assert) {
    updateCurrentUser({
      redesigned_user_menu_enabled: true,
    });
    const identity = await getIdentity();
    const topicKey = await generateKey();
    const exportedKey = await exportKey(topicKey, identity.encryptPublic);
    const title = "Top Secret <a> :male_detective:";
    const encryptedTitle = await encrypt(topicKey, { raw: title });

    pretender.get("/u/eviltrout/user-menu-bookmarks", () => [
      200,
      { "Content-Type": "application/json" },
      {
        notifications: [],
        bookmarks: [
          {
            id: 18207,
            created_at: "2022-08-25T21:19:09.646Z",
            updated_at: "2022-08-25T21:19:09.646Z",
            name: "",
            reminder_at: null,
            pinned: false,
            title: "A secret message",
            fancy_title: "A secret message",
            excerpt:
              "This is a secret message with end to end encryption. To view it, you must be invited to this topic.",
            bookmarkable_id: 84390,
            bookmarkable_type: "Post",
            bookmarkable_url:
              "https://local.discourse.org/t/a-secret-message/8223/1",
            tags: [],
            tags_descriptions: {},
            topic_id: 8223,
            linked_post_number: 1,
            deleted: false,
            hidden: false,
            category_id: null,
            closed: false,
            archived: false,
            archetype: "private_message",
            highest_post_number: 1,
            bumped_at: "2022-08-25T08:53:01.491Z",
            slug: "a-secret-message",
            encrypted_title: encryptedTitle,
            topic_key: exportedKey,
            user: {
              id: 1500,
              username: "top-sekret-man",
              avatar_template: "/user_avatar/localhost/nat/{size}/515078_2.png",
            },
          },
        ],
      },
    ]);

    const stub = sinon.stub(EncryptLibDiscourse, "syncGetTopicTitle");
    stub.returns(title);

    const stub2 = sinon.stub(EncryptLibDiscourse, "getTopicTitle");
    stub2.returns(Promise.resolve(title));

    const stub3 = sinon.stub(EncryptLibDiscourse, "waitForPendingTitles");
    stub3.returns(Promise.resolve());

    await visit("/");
    await click(".header-dropdown-toggle.current-user");
    await click("#user-menu-button-bookmarks");

    const bookmarks = queryAll("#quick-access-bookmarks ul li.bookmark");

    assert.strictEqual(
      bookmarks[0].textContent.replace(/\s+/g, " ").trim(),
      "top-sekret-man Top Secret <a>",
      "message title in the bookmarks tab is decrypted and rendered safely"
    );
    const emoji = bookmarks[0].querySelector(".item-description img.emoji");
    assert.strictEqual(
      emoji.title,
      "male_detective",
      "emoji in encrypted message title in the bookmarks tab is rendered correctly"
    );
  });

  test("topic titles in the messages tab in the experimental user menu are decrypted", async function (assert) {
    updateCurrentUser({
      redesigned_user_menu_enabled: true,
    });
    const identity = await getIdentity();
    const topicKey = await generateKey();
    const exportedKey = await exportKey(topicKey, identity.encryptPublic);
    const title = "Top Secret <a> :male_detective:";
    const encryptedTitle = await encrypt(topicKey, { raw: title });

    pretender.get("/u/eviltrout/user-menu-private-messages", () => [
      200,
      { "Content-Type": "application/json" },
      {
        notifications: [],
        topics: [
          {
            id: 127,
            title: "A secret message",
            fancy_title: "A secret message",
            slug: "a-secret-message",
            posts_count: 1,
            reply_count: 0,
            highest_post_number: 2,
            image_url: null,
            created_at: "2019-07-26T01:29:24.008Z",
            last_posted_at: "2019-07-26T01:29:24.177Z",
            bumped: true,
            bumped_at: "2019-07-26T01:29:24.177Z",
            unseen: false,
            last_read_post_number: 2,
            unread_posts: 0,
            pinned: false,
            unpinned: null,
            visible: true,
            closed: false,
            archived: false,
            notification_level: 3,
            bookmarked: false,
            bookmarks: [],
            liked: false,
            views: 5,
            like_count: 0,
            has_summary: false,
            archetype: "private_message",
            last_poster_username: "detective",
            category_id: null,
            pinned_globally: false,
            featured_link: null,
            posters: [
              {
                extras: "latest single",
                description: "Original Poster, Most Recent Poster",
                user_id: 13,
                primary_group_id: null,
              },
            ],
            participants: [
              {
                extras: "latest",
                description: null,
                user_id: 13,
                primary_group_id: null,
              },
            ],
            encrypted_title: encryptedTitle,
            topic_key: exportedKey,
          },
        ],
      },
    ]);

    const stub = sinon.stub(EncryptLibDiscourse, "syncGetTopicTitle");
    stub.returns(title);

    const stub2 = sinon.stub(EncryptLibDiscourse, "getTopicTitle");
    stub2.returns(Promise.resolve(title));

    const stub3 = sinon.stub(EncryptLibDiscourse, "waitForPendingTitles");
    stub3.returns(Promise.resolve());

    await visit("/");
    await click(".header-dropdown-toggle.current-user");
    await click("#user-menu-button-messages");

    const messages = queryAll("#quick-access-messages ul li.message");
    assert.strictEqual(messages.length, 1);

    assert.strictEqual(
      messages[0].textContent.replace(/\s+/g, " ").trim(),
      "detective Top Secret <a>",
      "message title in the messages tab is decrypted and rendered safely"
    );
    const emoji = messages[0].querySelector(".item-description img.emoji");
    assert.strictEqual(
      emoji.title,
      "male_detective",
      "emoji in encrypted message title in the messages tab is rendered correctly"
    );
  });

  test("searching in encrypted topic titles", async function (assert) {
    const identity = await getIdentity();
    const topicKey = await generateKey();
    const exportedKey = await exportKey(topicKey, identity.encryptPublic);
    const title = "Top Secret :male_detective:";
    const encryptedTitle = await encrypt(topicKey, { raw: title });

    pretender.get("/search", (request) => {
      return [
        200,
        { "Content-Type": "application/json" },
        {
          posts: [],
          topics: [],
          grouped_search_result: {
            term: request.queryParams.q,
            type_filter: "private_messages",
            post_ids: [],
          },
        },
      ];
    });

    pretender.get("/encrypt/posts", () => {
      return [
        200,
        { "Content-Type": "application/json" },
        {
          success: "OK",
          topics: [
            {
              id: 42,
              title: "A secret message",
              fancy_title: "A secret message",
              slug: "a-secret-message",
              posts_count: 1,
              reply_count: 0,
              highest_post_number: 1,
              created_at: "2021-01-01T12:00:00.000Z",
              last_posted_at: "2021-01-01T12:00:00.000Z",
              bumped: true,
              bumped_at: "2021-01-01T12:00:00.000Z",
              archetype: "private_message",
              unseen: false,
              pinned: false,
              unpinned: null,
              visible: true,
              closed: false,
              archived: false,
              bookmarked: null,
              liked: null,
              category_id: null,
              encrypted_title: encryptedTitle,
              topic_key: exportedKey,
            },
          ],
          posts: [
            {
              id: 42,
              username: "foo",
              avatar_template:
                "/letter_avatar_proxy/v4/letter/f/eada6e/{size}.png",
              created_at: "2021-01-01T12:00:00.000Z",
              like_count: 0,
              post_number: 1,
              topic_id: 42,
            },
            {
              id: 43,
              username: "foo",
              avatar_template:
                "/letter_avatar_proxy/v4/letter/f/eada6e/{size}.png",
              created_at: "2021-01-01T12:00:00.000Z",
              like_count: 0,
              post_number: 2,
              topic_id: 42,
            },
          ],
        },
      ];
    });

    await visit("/search?q=secret+in:personal");
    assert.strictEqual(count(".fps-result"), 1);
    assert.strictEqual(
      query(".fps-result .topic-title").innerText.trim(),
      "Top Secret"
    );

    pretender.get("/search", (request) => {
      return [
        200,
        { "Content-Type": "application/json" },
        {
          posts: [
            {
              id: 42,
              username: "foo",
              avatar_template:
                "/letter_avatar_proxy/v4/letter/f/eada6e/{size}.png",
              created_at: "2021-01-01T12:00:00.000Z",
              like_count: 0,
              blurb:
                'This is a <span class="search-highlight">secret</span> message with end to end encryption. To view it, you must be invited to this topic...',
              post_number: 1,
              topic_title_headline:
                'A <span class="search-highlight">secret</span> message',
              topic_id: 42,
            },
          ],
          topics: [
            {
              id: 42,
              title: "A secret message",
              fancy_title: "A secret message",
              slug: "a-secret-message",
              posts_count: 1,
              reply_count: 0,
              highest_post_number: 1,
              created_at: "2021-01-01T12:00:00.000Z",
              last_posted_at: "2021-01-01T12:00:00.000Z",
              bumped: true,
              bumped_at: "2021-01-01T12:00:00.000Z",
              archetype: "private_message",
              unseen: false,
              last_read_post_number: 1,
              unread: 0,
              new_posts: 0,
              pinned: false,
              unpinned: null,
              visible: true,
              closed: false,
              archived: false,
              notification_level: 3,
              bookmarked: false,
              liked: false,
              category_id: null,
              encrypted_title: encryptedTitle,
              topic_key: exportedKey,
            },
          ],
          users: [],
          categories: [],
          tags: [],
          groups: [],
          grouped_search_result: {
            more_posts: null,
            more_users: null,
            more_categories: null,
            term: request.queryParams.q,
            search_log_id: 42,
            more_full_page_results: null,
            can_create_topic: true,
            error: null,
            type_filter: "private_messages",
            post_ids: [42],
            user_ids: [],
            category_ids: [],
            tag_ids: [],
            group_ids: [],
          },
        },
      ];
    });

    await visit("/search?q=secret++in:personal");
    assert.strictEqual(count(".fps-result"), 1);
    assert.strictEqual(
      query(".fps-result .topic-title").innerText.trim(),
      "Top Secret"
    );
  });

  test("searching works when user has no encrypted topics", async function (assert) {
    pretender.get("/search", (request) => {
      return [
        200,
        { "Content-Type": "application/json" },
        {
          posts: [],
          topics: [],
          grouped_search_result: {
            term: request.queryParams.q,
            type_filter: "private_messages",
            post_ids: [],
          },
        },
      ];
    });

    pretender.get("/encrypt/posts", () => {
      return [
        200,
        { "Content-Type": "application/json" },
        {
          success: "OK",
          topics: [],
          posts: [],
        },
      ];
    });

    await visit("/search?q=nothing+in:personal");
    assert.strictEqual(count(".fps-result"), 0);
  });

  test("searching in bookmarks", async function (assert) {
    const identity = await getIdentity();

    const topicKey = await generateKey();
    const exportedTopicKey = await exportKey(topicKey, identity.encryptPublic);
    const encryptedTitle = await encrypt(topicKey, { raw: "Top Secret Title" });

    const topicKey2 = await generateKey();
    const exportedTopicKey2 = await exportKey(
      topicKey2,
      identity.encryptPublic
    );
    const encryptedTitle2 = await encrypt(topicKey2, { raw: "Not a Secret" });

    pretender.get("/u/eviltrout/bookmarks.json", (request) => {
      if (request.queryParams.q) {
        return [
          200,
          { "Content-Type": "application/json" },
          {
            bookmarks: [],
          },
        ];
      }

      return [
        200,
        { "Content-Type": "application/json" },
        {
          user_bookmark_list: {
            more_bookmarks_url: "/u/eviltrout/bookmarks.json?page=1",
            bookmarks: [
              {
                excerpt: "",
                id: 42,
                created_at: "2020-01-01T12:00:00.000Z",
                updated_at: "2020-01-01T12:00:00.000Z",
                topic_id: 42,
                linked_post_number: 1,
                bookmarkable_id: 42,
                bookmarkable_type: "Post",
                name: null,
                reminder_at: null,
                pinned: false,
                title: "A secret message",
                fancy_title: "A secret message",
                deleted: false,
                hidden: false,
                category_id: null,
                closed: false,
                archived: false,
                archetype: "private_message",
                highest_post_number: 1,
                bumped_at: "2020-01-01T12:00:00.000Z",
                slug: "a-secret-message",
                post_user_username: "foo",
                post_user_avatar_template:
                  "/letter_avatar_proxy/v4/letter/f/eada6e/{size}.png",
                post_user_name: null,
                encrypted_title: encryptedTitle,
                topic_key: exportedTopicKey,
              },
              {
                excerpt: "",
                id: 43,
                created_at: "2020-01-01T12:00:00.000Z",
                updated_at: "2020-01-01T12:00:00.000Z",
                topic_id: 43,
                linked_post_number: 1,
                bookmarkable_id: 43,
                bookmarkable_type: "Post",
                name: null,
                reminder_at: null,
                pinned: false,
                title: "A secret message",
                fancy_title: "A secret message",
                deleted: false,
                hidden: false,
                category_id: null,
                closed: false,
                archived: false,
                archetype: "private_message",
                highest_post_number: 1,
                bumped_at: "2020-01-01T12:00:00.000Z",
                slug: "a-secret-message",
                post_user_username: "foo",
                post_user_avatar_template:
                  "/letter_avatar_proxy/v4/letter/f/eada6e/{size}.png",
                post_user_name: null,
                encrypted_title: encryptedTitle2,
                topic_key: exportedTopicKey2,
              },
            ],
          },
        },
      ];
    });

    await visit("/u/eviltrout/activity/bookmarks");
    await visit("/u/eviltrout/activity/bookmarks"); // extra wait

    assert.strictEqual(count(".bookmark-list-item"), 2);
    assert.strictEqual(
      queryAll(".bookmark-list-item .title")[0].innerText.trim(),
      "Top Secret Title"
    );
    assert.strictEqual(
      queryAll(".bookmark-list-item .title")[1].innerText.trim(),
      "Not a Secret"
    );

    await visit("/");
    await visit("/u/eviltrout/activity/bookmarks?q=Top");

    assert.strictEqual(count(".bookmark-list-item"), 1);
    assert.strictEqual(
      queryAll(".bookmark-list-item .title")[0].innerText.trim(),
      "Top Secret Title"
    );
  });
});

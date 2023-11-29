import { module, test } from "qunit";
import {
  DB_NAME,
  deleteDb,
  loadDbIdentity,
  saveDbIdentity,
  setUseLocalStorage,
} from "discourse/plugins/discourse-encrypt/lib/database";
import { generateIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";

module("discourse-encrypt:lib:database", function () {
  test("IndexedDB backend", async function (assert) {
    setUseLocalStorage(false);
    await deleteDb();

    assert.rejects(loadDbIdentity());

    await generateIdentity().then((id) => saveDbIdentity(id));
    assert.true(window.localStorage.getItem(DB_NAME).length > 0);

    const identity = await loadDbIdentity();
    assert.true(identity.encryptPublic instanceof CryptoKey);
    assert.true(identity.encryptPrivate instanceof CryptoKey);
    assert.true(identity.signPublic instanceof CryptoKey);
    assert.true(identity.signPrivate instanceof CryptoKey);

    await deleteDb();

    assert.rejects(loadDbIdentity());
    assert.strictEqual(window.localStorage.getItem(DB_NAME), null);
  });

  test("Web Storage (localStorage) backend", async function (assert) {
    setUseLocalStorage(true);
    await deleteDb();

    assert.rejects(loadDbIdentity());

    await generateIdentity().then((id) => saveDbIdentity(id));
    assert.true(window.localStorage.getItem(DB_NAME).length > 0);

    const identity = await loadDbIdentity();
    assert.true(identity.encryptPublic instanceof CryptoKey);
    assert.true(identity.encryptPrivate instanceof CryptoKey);
    assert.true(identity.signPublic instanceof CryptoKey);
    assert.true(identity.signPrivate instanceof CryptoKey);

    await deleteDb();

    assert.rejects(loadDbIdentity());
    assert.strictEqual(window.localStorage.getItem(DB_NAME), null);
  });
});

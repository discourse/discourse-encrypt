import { generateIdentity } from "discourse/plugins/discourse-encrypt/lib/protocol";
import {
  DB_NAME,
  setUseLocalStorage,
  deleteDb,
  loadDbIdentity,
  saveDbIdentity,
} from "discourse/plugins/discourse-encrypt/lib/database";

QUnit.module("discourse-encrypt:lib:database");

test("IndexedDB backend", async (assert) => {
  setUseLocalStorage(false);
  await deleteDb();

  let identity = await loadDbIdentity();
  assert.equal(identity, null);

  await generateIdentity().then((id) => saveDbIdentity(id));
  assert.ok(window.localStorage.getItem(DB_NAME));

  identity = await loadDbIdentity();
  assert.ok(identity.encryptPublic instanceof CryptoKey);
  assert.ok(identity.encryptPrivate instanceof CryptoKey);
  assert.ok(identity.signPublic instanceof CryptoKey);
  assert.ok(identity.signPrivate instanceof CryptoKey);

  await deleteDb();

  identity = await loadDbIdentity();
  assert.equal(identity, null);
  assert.equal(window.localStorage.getItem(DB_NAME), null);
});

test("Web Storage (localStorage) backend", async (assert) => {
  setUseLocalStorage(true);
  await deleteDb();

  let identity = await loadDbIdentity();
  assert.equal(identity, null);

  await generateIdentity().then((id) => saveDbIdentity(id));
  assert.ok(window.localStorage.getItem(DB_NAME));

  identity = await loadDbIdentity();
  assert.ok(identity.encryptPublic instanceof CryptoKey);
  assert.ok(identity.encryptPrivate instanceof CryptoKey);
  assert.ok(identity.signPublic instanceof CryptoKey);
  assert.ok(identity.signPrivate instanceof CryptoKey);

  await deleteDb();

  identity = await loadDbIdentity();
  assert.equal(identity, null);
  assert.equal(window.localStorage.getItem(DB_NAME), null);
});

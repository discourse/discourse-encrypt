import { module, test } from "qunit";
import {
  exportIdentity,
  generateIdentity,
  importIdentity,
} from "discourse/plugins/discourse-encrypt/lib/protocol-v1";

module("discourse-encrypt:lib:protocol_v1", function () {
  test("generateIdentity", async function (assert) {
    const { encryptPublic, encryptPrivate, signPublic, signPrivate } =
      await generateIdentity();

    assert.true(encryptPublic instanceof CryptoKey);
    assert.true(encryptPrivate instanceof CryptoKey);
    assert.true(signPublic instanceof CryptoKey);
    assert.true(signPrivate instanceof CryptoKey);
  });

  test("exportIdentity & importIdentity", async function (assert) {
    const identity = await generateIdentity();

    let exported = await exportIdentity(identity);
    let imported = await importIdentity(exported.private);
    assert.true(imported.encryptPublic instanceof CryptoKey);
    assert.true(imported.encryptPrivate instanceof CryptoKey);
    assert.true(imported.signPublic instanceof CryptoKey);
    assert.true(imported.signPrivate instanceof CryptoKey);
    imported = await importIdentity(exported.public);
    assert.true(imported.encryptPublic instanceof CryptoKey);
    assert.strictEqual(imported.encryptPrivate, undefined);
    assert.true(imported.signPublic instanceof CryptoKey);
    assert.strictEqual(imported.signPrivate, undefined);

    exported = await exportIdentity(identity, "test");
    imported = await importIdentity(exported.private, "test");
    assert.true(imported.encryptPublic instanceof CryptoKey);
    assert.true(imported.encryptPrivate instanceof CryptoKey);
    assert.true(imported.signPublic instanceof CryptoKey);
    assert.true(imported.signPrivate instanceof CryptoKey);
    imported = await importIdentity(exported.public);
    assert.true(imported.encryptPublic instanceof CryptoKey);
    assert.strictEqual(imported.encryptPrivate, undefined);
    assert.true(imported.signPublic instanceof CryptoKey);
    assert.strictEqual(imported.signPrivate, undefined);
  });
});

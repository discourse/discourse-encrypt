import {
  exportIdentity,
  generateIdentity,
  importIdentity,
} from "discourse/plugins/discourse-encrypt/lib/protocol-v1";
import { module, test } from "qunit";

module("discourse-encrypt:lib:protocol_v1", function () {
  test("generateIdentity", async function (assert) {
    const { encryptPublic, encryptPrivate, signPublic, signPrivate } =
      await generateIdentity();

    assert.ok(encryptPublic instanceof CryptoKey);
    assert.ok(encryptPrivate instanceof CryptoKey);
    assert.ok(signPublic instanceof CryptoKey);
    assert.ok(signPrivate instanceof CryptoKey);
  });

  test("exportIdentity & importIdentity", async function (assert) {
    const identity = await generateIdentity();

    let exported = await exportIdentity(identity);
    let imported = await importIdentity(exported.private);
    assert.ok(imported.encryptPublic instanceof CryptoKey);
    assert.ok(imported.encryptPrivate instanceof CryptoKey);
    assert.ok(imported.signPublic instanceof CryptoKey);
    assert.ok(imported.signPrivate instanceof CryptoKey);
    imported = await importIdentity(exported.public);
    assert.ok(imported.encryptPublic instanceof CryptoKey);
    assert.equal(imported.encryptPrivate, null);
    assert.ok(imported.signPublic instanceof CryptoKey);
    assert.equal(imported.signPrivate, null);

    exported = await exportIdentity(identity, "test");
    imported = await importIdentity(exported.private, "test");
    assert.ok(imported.encryptPublic instanceof CryptoKey);
    assert.ok(imported.encryptPrivate instanceof CryptoKey);
    assert.ok(imported.signPublic instanceof CryptoKey);
    assert.ok(imported.signPrivate instanceof CryptoKey);
    imported = await importIdentity(exported.public);
    assert.ok(imported.encryptPublic instanceof CryptoKey);
    assert.equal(imported.encryptPrivate, null);
    assert.ok(imported.signPublic instanceof CryptoKey);
    assert.equal(imported.signPrivate, null);
  });
});

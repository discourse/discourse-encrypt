import {
  decrypt,
  encrypt,
  exportKey,
  generateIdentity,
  generateKey,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";
import { module, test } from "qunit";

module("discourse-encrypt:lib:protocol", function () {
  test("generateKey", async function (assert) {
    const key = await generateKey();
    assert.ok(key instanceof CryptoKey);
  });

  test("exportKey & importKey", async function (assert) {
    const { encryptPublic, encryptPrivate } = await generateIdentity();
    const key = await generateKey();
    const exported = await exportKey(key, encryptPublic);
    assert.ok((await importKey(exported, encryptPrivate)) instanceof CryptoKey);
  });

  test("encrypt & decrypt", async function (assert) {
    const key = await generateKey();
    const plaintext = "this is a message";
    const cipherText = await encrypt(key, plaintext);

    assert.equal(plaintext, await decrypt(key, cipherText));
  });
});

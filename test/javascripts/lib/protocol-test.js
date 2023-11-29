import { module, test } from "qunit";
import {
  decrypt,
  encrypt,
  exportKey,
  generateIdentity,
  generateKey,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";

module("discourse-encrypt:lib:protocol", function () {
  test("generateKey", async function (assert) {
    const key = await generateKey();
    assert.true(key instanceof CryptoKey);
  });

  test("exportKey & importKey", async function (assert) {
    const { encryptPublic, encryptPrivate } = await generateIdentity();
    const key = await generateKey();
    const exported = await exportKey(key, encryptPublic);
    assert.true(
      (await importKey(exported, encryptPrivate)) instanceof CryptoKey
    );
  });

  test("encrypt & decrypt", async function (assert) {
    const key = await generateKey();
    const plaintext = "this is a message";
    const ciphertext = await encrypt(key, plaintext);

    assert.strictEqual(plaintext, await decrypt(key, ciphertext));
  });
});

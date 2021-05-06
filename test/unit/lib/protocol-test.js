import {
  decrypt,
  encrypt,
  exportKey,
  generateIdentity,
  generateKey,
  importKey,
} from "discourse/plugins/discourse-encrypt/lib/protocol";

QUnit.module("discourse-encrypt:lib:protocol");

test("generateKey", async (assert) => {
  const key = await generateKey();
  assert.ok(key instanceof CryptoKey);
});

test("exportKey & importKey", async (assert) => {
  const { encryptPublic, encryptPrivate } = await generateIdentity();
  const key = await generateKey();
  const exported = await exportKey(key, encryptPublic);
  assert.ok((await importKey(exported, encryptPrivate)) instanceof CryptoKey);
});

test("encrypt & decrypt", async (assert) => {
  const key = await generateKey();
  const plaintext = "this is a message";
  const ciphertext = await encrypt(key, plaintext);

  assert.equal(plaintext, await decrypt(key, ciphertext));
});

import {
  generateKeyPair,
  exportPublicKey,
  importPublicKey,
  exportPrivateKey,
  importPrivateKey,
  rsaEncrypt,
  rsaDecrypt,
  generateSalt,
  generatePassphraseKey,
  generateKey,
  exportKey,
  importKey,
  encrypt,
  decrypt
} from "discourse/plugins/discourse-encrypt/lib/keys";

QUnit.module("discourse-encrypt:lib:keys");

test("generateKeyPair", async assert => {
  const [publicKey, privateKey] = await generateKeyPair();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
});

test("exportPublicKey & importPublicKey", async assert => {
  const publicKey = (await generateKeyPair())[0];
  const exported = await exportPublicKey(publicKey);
  assert.ok((await importPublicKey(exported)) instanceof CryptoKey);
});

test("exportPrivateKey & importPrivateKey", async assert => {
  const key = await generatePassphraseKey("passphrase", generateSalt());
  const privateKey = (await generateKeyPair())[1];
  const exported = await exportPrivateKey(privateKey, key);
  assert.ok((await importPrivateKey(exported, key)) instanceof CryptoKey);
});

test("rsaEncrypt & rsaDecrypt", async assert => {
  const [publicKey, privateKey] = await generateKeyPair();
  const plaintext = "this is a message";
  const ciphertext = await rsaEncrypt(publicKey, plaintext);
  const plaintext2 = await rsaDecrypt(privateKey, ciphertext);
  assert.equal(plaintext, plaintext2);
});

test("generateSalt", async assert => {
  assert.equal(24, generateSalt().length);
});

test("generatePassphraseKey", async assert => {
  const key = await generatePassphraseKey("passphrase", generateSalt());
  assert.ok(key instanceof CryptoKey);
});

test("generateKey", async assert => {
  const key = await generateKey();
  assert.ok(key instanceof CryptoKey);
});

test("exportKey & importKey", async assert => {
  const [publicKey, privateKey] = await generateKeyPair();
  const key = await generateKey();
  const exported = await exportKey(key, publicKey);
  assert.ok((await importKey(exported, privateKey)) instanceof CryptoKey);
});

test("encrypt & decrypt", async assert => {
  const key = await generateKey();
  const plaintext = "this is a message";
  const ciphertext = await encrypt(key, plaintext);

  /*
   * Length of ciphertext is computed as sum:
   *   - input length (UTF-16, input size = output size for AES-GCM)
   *   - tag length is 128-bits
   *   - IV has 12 bytes
   *
   * Base64 is used for encoding, so every 3 bytes become 4 bytes.
   */
  let length =
    4 * Math.ceil((plaintext.length * 2 + 128 / 8) / 3) + // base64(tag + ciphertext).length
    4 * Math.ceil(12 / 3); // base64(iv).length
  assert.equal(ciphertext.length, length);

  const plaintext2 = await decrypt(key, ciphertext);
  assert.equal(plaintext, plaintext2);
});

import { generateKeyPair } from "discourse/plugins/discourse-encrypt/lib/keys";
import {
  saveKeyPairToIndexedDb,
  loadKeyPairFromIndexedDb,
  deleteIndexedDb
} from "discourse/plugins/discourse-encrypt/lib/keys_db";

QUnit.module("discourse-encrypt:lib:keys_db");

test("Indexed Database API", async assert => {
  try {
    await deleteIndexedDb();
  } catch (e) {}

  let publicKey, privateKey;

  [publicKey, privateKey] = await loadKeyPairFromIndexedDb();

  assert.equal(null, publicKey);
  assert.equal(null, privateKey);

  [publicKey, privateKey] = await generateKeyPair();
  await saveKeyPairToIndexedDb(publicKey, privateKey);

  [publicKey, privateKey] = await loadKeyPairFromIndexedDb();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);

  try {
    await deleteIndexedDb();
  } catch (e) {}
});

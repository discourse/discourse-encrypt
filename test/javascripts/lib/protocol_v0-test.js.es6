import {
  _stringToBuffer,
  _bufferToString,
  _exportPublicKey,
  _importPublicKey,
  _exportPrivateKey,
  _importPrivateKey,
  _getSalt,
  _getPassphraseKey,
  generateIdentity,
} from "discourse/plugins/discourse-encrypt/lib/protocol_v0";

QUnit.module("discourse-encrypt:lib:protocol_v0");

test("string to buffer", (assert) => {
  let check = (actual, expected) =>
    assert.arrayEqual(new Uint16Array(_stringToBuffer(actual)), expected);

  check("", []);
  check("A", [0x41]);
  check("AB", [0x41, 0x42]);
  check("ABC", [0x41, 0x42, 0x43]);
  check("ABCD", [0x41, 0x42, 0x43, 0x44]);
});

test("buffer to string", (assert) => {
  let check = (actual, expected) =>
    assert.equal(_bufferToString(new Uint16Array(actual)), expected);

  check([], "");
  check([0x41], "A");
  check([0x41, 0x42], "AB");
  check([0x41, 0x42, 0x43], "ABC");
  check([0x41, 0x42, 0x43, 0x44], "ABCD");
});

test("buffer to string to buffer", (assert) => {
  const array = [];
  for (let i = 0; i < 32; ++i) {
    const expected = new Uint16Array(array);
    assert.arrayEqual(
      new Uint16Array(_stringToBuffer(_bufferToString(expected))),
      expected
    );
    array.push(i);
  }
});

test("_exportPublicKey & _importPublicKey", async (assert) => {
  const { publicKey } = await generateIdentity();
  const exported = await _exportPublicKey(publicKey);
  assert.ok((await _importPublicKey(exported)) instanceof CryptoKey);
});

test("_exportPrivateKey & _importPrivateKey", async (assert) => {
  const key = await _getPassphraseKey("passphrase", _getSalt());
  const { privateKey } = await generateIdentity();
  const exported = await _exportPrivateKey(privateKey, key);
  assert.ok((await _importPrivateKey(exported, key)) instanceof CryptoKey);
});

test("_getPassphraseKey", async (assert) => {
  const key = await _getPassphraseKey("passphrase", _getSalt());
  assert.ok(key instanceof CryptoKey);
});

test("_getSalt", async (assert) => {
  assert.equal(24, _getSalt().length);
});

test("generateIdentity", async (assert) => {
  const { publicKey, privateKey } = await generateIdentity();
  assert.ok(publicKey instanceof CryptoKey);
  assert.ok(privateKey instanceof CryptoKey);
});

/*
 * Checks if two array-like objects are equal.
 *
 * @param haystack
 * @param needle
 * @param message
 */
QUnit.assert.arrayEqual = function (actual, expected) {
  if (actual.length !== expected.length) {
    this.pushResult({
      result: false,
      actual: actual.length,
      expected: expected.length,
      message: "array lengths are not equal",
    });

    return;
  }

  let result = true;

  for (let i = 0; i < actual.length; ++i) {
    if (actual[i] !== expected[i]) {
      result = false;
      this.pushResult({
        result,
        actual: actual[i],
        expected: expected[i],
        message: `index ${i} mismatches`,
      });
    }
  }

  if (result) {
    this.pushResult({
      result,
      actual: actual,
      expected: expected,
      message: "arrays match",
    });
  }
};

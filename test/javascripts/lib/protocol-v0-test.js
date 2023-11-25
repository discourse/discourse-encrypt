import {
  _bufferToString,
  _exportPrivateKey,
  _exportPublicKey,
  _getPassphraseKey,
  _getSalt,
  _importPrivateKey,
  _importPublicKey,
  _stringToBuffer,
  generateIdentity,
} from "discourse/plugins/discourse-encrypt/lib/protocol-v0";
import QUnit, { module, test } from "qunit";

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
      actual,
      expected,
      message: "arrays match",
    });
  }
};

module("discourse-encrypt:lib:protocol_v0", function () {
  test("string to buffer", function (assert) {
    let check = (actual, expected) =>
      assert.arrayEqual(new Uint16Array(_stringToBuffer(actual)), expected);

    check("", []);
    check("A", [0x41]);
    check("AB", [0x41, 0x42]);
    check("ABC", [0x41, 0x42, 0x43]);
    check("ABCD", [0x41, 0x42, 0x43, 0x44]);
  });

  test("buffer to string", function (assert) {
    let check = (actual, expected) =>
      assert.strictEqual(_bufferToString(new Uint16Array(actual)), expected);

    check([], "");
    check([0x41], "A");
    check([0x41, 0x42], "AB");
    check([0x41, 0x42, 0x43], "ABC");
    check([0x41, 0x42, 0x43, 0x44], "ABCD");
  });

  test("buffer to string to buffer", function (assert) {
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

  test("_exportPublicKey & _importPublicKey", async function (assert) {
    const { publicKey } = await generateIdentity();
    const exported = await _exportPublicKey(publicKey);
    assert.true((await _importPublicKey(exported)) instanceof CryptoKey);
  });

  test("_exportPrivateKey & _importPrivateKey", async function (assert) {
    const key = await _getPassphraseKey("passphrase", _getSalt());
    const { privateKey } = await generateIdentity();
    const exported = await _exportPrivateKey(privateKey, key);
    assert.true((await _importPrivateKey(exported, key)) instanceof CryptoKey);
  });

  test("_getPassphraseKey", async function (assert) {
    const key = await _getPassphraseKey("passphrase", _getSalt());
    assert.true(key instanceof CryptoKey);
  });

  test("_getSalt", async function (assert) {
    assert.strictEqual(_getSalt().length, 24);
  });

  test("generateIdentity", async function (assert) {
    const { publicKey, privateKey } = await generateIdentity();
    assert.true(publicKey instanceof CryptoKey);
    assert.true(privateKey instanceof CryptoKey);
  });
});

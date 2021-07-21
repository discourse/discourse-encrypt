import {
  base64ToBuffer,
  bufferToBase64,
} from "discourse/plugins/discourse-encrypt/lib/base64";
import { test } from "qunit";

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
      message: "array lengths are equal",
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
        message: `index ${i} matches`,
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

QUnit.module("discourse-encrypt:lib:base64");

test("base64 to buffer", (assert) => {
  let check = (actual, expected) =>
    assert.arrayEqual(base64ToBuffer(actual), expected);

  check("", []);
  check("QQ==", [0x41]);
  check("QUI=", [0x41, 0x42]);
  check("QUJD", [0x41, 0x42, 0x43]);
  check("QUJDRA==", [0x41, 0x42, 0x43, 0x44]);
});

test("buffer to base64", (assert) => {
  let check = (actual, expected) =>
    assert.equal(bufferToBase64(new Uint8Array(actual)), expected);

  check([], "");
  check([0x41], "QQ==");
  check([0x41, 0x42], "QUI=");
  check([0x41, 0x42, 0x43], "QUJD");
  check([0x41, 0x42, 0x43, 0x44], "QUJDRA==");
});

test("buffer to base64 to buffer", (assert) => {
  const array = [];
  for (let i = 0; i < 32; ++i) {
    const buffer = new Uint8Array(array);
    assert.arrayEqual(base64ToBuffer(bufferToBase64(buffer)), buffer);
    array.push(i);
  }
});

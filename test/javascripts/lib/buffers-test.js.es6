import {
  stringToBuffer,
  bufferToString
} from "discourse/plugins/discourse-encrypt/lib/buffers";

/*
 * Checks if two array-like objects are equal.
 *
 * @param haystack
 * @param needle
 * @param message
 */
QUnit.assert.arrayEqual = function(actual, expected) {
  if (actual.length !== expected.length) {
    this.pushResult({
      result: false,
      actual: actual.length,
      expected: expected.length,
      message: "array lengths are equal"
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
        message: `index ${i} matches`
      });
    }
  }

  if (result) {
    this.pushResult({
      result,
      actual: actual,
      expected: expected,
      message: "arrays match"
    });
  }
};

QUnit.module("discourse-encrypt:lib:buffers");

test("string to buffer", assert => {
  let check = (actual, expected) =>
    assert.arrayEqual(new Uint16Array(stringToBuffer(actual)), expected);

  check("", []);
  check("A", [0x41]);
  check("AB", [0x41, 0x42]);
  check("ABC", [0x41, 0x42, 0x43]);
  check("ABCD", [0x41, 0x42, 0x43, 0x44]);
});

test("buffer to string", assert => {
  let check = (actual, expected) =>
    assert.equal(bufferToString(new Uint16Array(actual)), expected);

  check([], "");
  check([0x41], "A");
  check([0x41, 0x42], "AB");
  check([0x41, 0x42, 0x43], "ABC");
  check([0x41, 0x42, 0x43, 0x44], "ABCD");
});

test("buffer to string to buffer", assert => {
  const array = [];
  for (let i = 0; i < 32; ++i) {
    const expected = new Uint16Array(array);
    assert.arrayEqual(
      new Uint16Array(stringToBuffer(bufferToString(expected))),
      expected
    );
    array.push(i);
  }
});

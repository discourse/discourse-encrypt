/*
 * Checks if a string is not contained in a string.
 *
 * @param haystack
 * @param needle
 * @param message
 */
QUnit.assert.notContains = function(haystack, needle, message) {
  this.pushResult({
    result: haystack.indexOf(needle) === -1,
    actual: haystack,
    expected: "not to contain " + needle,
    message
  });
};

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

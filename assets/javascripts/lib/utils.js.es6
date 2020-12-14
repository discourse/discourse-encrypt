/**
 * Wraps an object in a proxy which makes lookups case insensitive.
 *
 * @param {Object} object
 * @return {Proxy}
 */
export function getCaseInsensitiveObj(object) {
  object = object || {};
  return new Proxy(object, {
    get(obj, key) {
      if (obj[key]) {
        return obj[key];
      }

      key = key.toLowerCase();
      key = Object.keys(obj).find((k) => key === k.toLowerCase());
      return obj[key];
    },
  });
}

/**
 * Creates a new object containing a subset of the boject keys.
 *
 * @param {Object} obj
 * @param {Array<String>} keys
 *
 * @return {Object}
 */
export function filterObjectKeys(obj, keys) {
  const newObj = {};

  keys.forEach((key) => {
    if (key in obj) {
      newObj[key] = obj[key];
    }
  });

  return newObj;
}

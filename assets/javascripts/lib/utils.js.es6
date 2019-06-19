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

  keys.forEach(key => {
    if (key in obj) {
      newObj[key] = obj[key];
    }
  });

  return newObj;
}

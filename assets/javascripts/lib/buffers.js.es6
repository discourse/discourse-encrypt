/**
 * Converts a Unicode string to an `ArrayBuffer`.
 *
 * @param string
 *
 * @return
 */
export function stringToBuffer(string) {
  let buffer = new ArrayBuffer(string.length * 2);
  let array = new Uint16Array(buffer);
  for (let i = 0; i < string.length; ++i) {
    array[i] = string.charCodeAt(i);
  }
  return buffer;
}

/**
 * Converts an `ArrayBuffer` to a Unicode string.
 *
 * @param string
 *
 * @return
 */
export function bufferToString(buffer) {
  return new TextDecoder("UTF-16").decode(buffer);
}

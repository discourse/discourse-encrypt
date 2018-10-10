/**
 * Alphabet of Base64 encoding.
 */
const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";

/**
 * Converts a Base64 string to an `ArrayBuffer`.
 *
 * @param str
 *
 * @return
 */
export function base64ToBuffer(str) {
  let length = str.length;
  while (str.charAt(length - 1) === "=") {
    --length;
  }
  length = Math.floor((length / 4) * 3);

  let ret = new Uint8Array(length);

  for (let i = 0, j = 0; i < length; i += 3) {
    let enc1 = BASE64.indexOf(str.charAt(j++));
    let enc2 = BASE64.indexOf(str.charAt(j++));
    let enc3 = BASE64.indexOf(str.charAt(j++));
    let enc4 = BASE64.indexOf(str.charAt(j++));

    ret[i] = (enc1 << 2) | (enc2 >> 4);
    if (enc3 != 64) ret[i + 1] = ((enc2 & 15) << 4) | (enc3 >> 2);
    if (enc4 != 64) ret[i + 2] = ((enc3 & 3) << 6) | enc4;
  }

  return ret;
}

/**
 * Converts an `ArrayBuffer` to a Base64 string.
 *
 * @param buffer
 *
 * @return
 */
export function bufferToBase64(buffer) {
  let ret = "";

  let bytes = new Uint8Array(buffer);
  let length = bytes.byteLength - (bytes.byteLength % 3);

  for (let i = 0; i < length; i = i + 3) {
    let bits = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    let enc1 = (bits >> 18) & 63;
    let enc2 = (bits >> 12) & 63;
    let enc3 = (bits >> 6) & 63;
    let enc4 = bits & 63;
    ret += BASE64[enc1] + BASE64[enc2] + BASE64[enc3] + BASE64[enc4];
  }

  length = bytes.byteLength;

  if (length % 3 === 1) {
    let bits = bytes[length - 1];
    let enc1 = (bits >> 2) & 63;
    let enc2 = (bits << 4) & 63;
    ret += BASE64[enc1] + BASE64[enc2] + "==";
  } else if (length % 3 === 2) {
    let bits = (bytes[length - 2] << 8) | bytes[length - 1];
    let enc1 = (bits >> 10) & 63;
    let enc2 = (bits >> 4) & 63;
    let enc3 = (bits << 2) & 63;
    ret += BASE64[enc1] + BASE64[enc2] + BASE64[enc3] + "=";
  }

  return ret;
}

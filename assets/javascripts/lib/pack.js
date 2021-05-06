/*
 * Useful variables for key import and export format.
 */

export const PACKED_KEY_COLUMNS = 71;
export const PACKED_KEY_HEADER =
  "============== BEGIN EXPORTED DISCOURSE ENCRYPT KEY PAIR ==============";
export const PACKED_KEY_FOOTER =
  "=============== END EXPORTED DISCOURSE ENCRYPT KEY PAIR ===============";

export function packIdentity(identity) {
  const segments = [];
  segments.push(PACKED_KEY_HEADER);
  for (let i = 0, len = identity.length; i < len; i += PACKED_KEY_COLUMNS) {
    segments.push(identity.substr(i, PACKED_KEY_COLUMNS));
  }
  segments.push(PACKED_KEY_FOOTER);
  return segments.join("\n");
}

export function unpackIdentity(identity) {
  let ret = identity
    .replace(PACKED_KEY_HEADER, "")
    .replace(PACKED_KEY_FOOTER, "")
    .split(/\s+/)
    .map((x) => x.trim())
    .join("");

  // Backwards compatibility pre-refactoring.
  const PACKED_KEY_SEPARATOR =
    "-----------------------------------------------------------------------";
  if (ret.indexOf(PACKED_KEY_SEPARATOR) !== -1) {
    ret = "0$" + ret.split(PACKED_KEY_SEPARATOR).join("$");
  }

  return ret;
}

export function getPackedPlaceholder() {
  return (
    PACKED_KEY_HEADER +
    "\n" +
    (".".repeat(PACKED_KEY_COLUMNS) + "\n").repeat(3) +
    PACKED_KEY_FOOTER
  );
}

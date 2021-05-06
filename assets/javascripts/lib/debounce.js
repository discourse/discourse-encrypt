import { debounce } from "@ember/runloop";

let debounceFunction = debounce;

try {
  debounceFunction = require("discourse-common/lib/debounce").default;
} catch (_) {}

// TODO: Remove this file and use discouseDebounce after the 2.7 release.
export default debounceFunction;

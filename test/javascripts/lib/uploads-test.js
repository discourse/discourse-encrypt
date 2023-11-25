import { base64ToBuffer } from "discourse/plugins/discourse-encrypt/lib/base64";
import { getMetadata } from "discourse/plugins/discourse-encrypt/lib/uploads";
import { module, test } from "qunit";

const TEST_IMG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const SITE_SETTINGS = { max_image_width: 100, max_image_height: 100 };

module("discourse-encrypt:lib:uploadHandler", function () {
  test("getMetadata - image file", async function (assert) {
    const file = new File([base64ToBuffer(TEST_IMG_BASE64)], "test.png", {
      type: "image/png",
    });
    const data = await getMetadata(file, SITE_SETTINGS);
    assert.strictEqual(data.original_filename, "test.png");
    assert.strictEqual(data.width, 1);
    assert.strictEqual(data.height, 1);
    assert.strictEqual(data.thumbnail_width, 1);
    assert.strictEqual(data.thumbnail_height, 1);
    assert.true(data.url.length > 0);
  });

  test("getMetadata - other file", async function (assert) {
    const file = new File(["test"], "test.txt", { type: "text/plain" });
    const data = await getMetadata(file, SITE_SETTINGS);
    assert.strictEqual(data.original_filename, "test.txt");
  });
});

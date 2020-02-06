import { getMetadata } from "discourse/plugins/discourse-encrypt/lib/uploads";

QUnit.module("discourse-encrypt:lib:uploadHander");

let testImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("getMetadata - image file", async assert => {
  let uploadsUrl = {};
  let file = new File([window.atob(testImageBase64)], "test.png", {
    type: "image/png",
    encoding: "utf-8"
  });

  // suppress the image onerror, it is not important
  getMetadata(file, uploadsUrl).catch(() => null);
  assert.ok(
    uploadsUrl[file.name],
    "it loads the image and adds it to uploadsUrl"
  );
});

test("getMetadata - other file", async assert => {
  let uploadsUrl = {};
  let file = new File(["test"], "test.txt", { type: "text/plain" });

  getMetadata(file, uploadsUrl).then(result => {
    assert.equal(result.original_filename, "test.txt");
  });
});

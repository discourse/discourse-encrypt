import { fetchDataPromise } from "discourse/plugins/discourse-encrypt/lib/uploadHandler";

QUnit.module("discourse-encrypt:lib:uploadHander");

let testImageBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("fetchDataPromise - image file", async assert => {
  let uploadsUrl = {};
  let file = new File([window.atob(testImageBase64)], "test.png", {
    type: "image/png",
    encoding: "utf-8"
  });

  // suppress the image onerror, it is not important
  fetchDataPromise(file, uploadsUrl).catch(e => console.log(e));
  assert.ok(
    uploadsUrl[file.name],
    "it loads the image and adds it to uploadsUrl"
  );
});

test("fetchDataPromise - other file", async assert => {
  let uploadsUrl = {};
  let file = new File(["test"], "test.txt", { type: "text/plain" });

  fetchDataPromise(file, uploadsUrl).then(result => {
    assert.equal(result.original_filename, "test.txt");
  });
});

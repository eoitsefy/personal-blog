import assert from "node:assert/strict";
import test from "node:test";
import { fitImage, imagePreviewUrl } from "./preview";

test("image previews only open safe HTTP or relative image URLs", () => {
  for (const url of ["/uploads/image.png", "https://images.example.test/a.jpg", "../picture.webp", "//images.example.test/a.png"]) {
    assert.equal(imagePreviewUrl(url), url);
  }
  for (const url of [undefined, "", "javascript:alert(1)", "data:image/svg+xml,test", "blob:https://example.test/id", "https://user:pass@example.test/a.jpg", "file:///secret", "java\nscript:x", "\\example.test", "#part", "?image=1"]) {
    assert.equal(imagePreviewUrl(url), null);
  }
});

test("image previews fit portrait and landscape without distorting or upscaling", () => {
  assert.deepEqual(fitImage(2000, 1000, 320, 500), { width: 320, height: 160 });
  assert.deepEqual(fitImage(1000, 2000, 320, 500), { width: 250, height: 500 });
  assert.deepEqual(fitImage(100, 50, 320, 500), { width: 100, height: 50 });
  assert.equal(fitImage(0, 100, 320, 500), null);
  assert.equal(fitImage(100, 100, NaN, 500), null);
});

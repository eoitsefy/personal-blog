import assert from "node:assert/strict";
import test from "node:test";
import { unplacedPostImages } from "./post-images";

test("attached images are visible without Markdown, but body references are not duplicated", () => {
  const image = { url: "/uploads/one.png", kind: "IMAGE", originalName: "one.png" };
  const other = { ...image, url: "/uploads/two.png" };
  assert.deepEqual(unplacedPostImages("Text only", [image, image, other]), [image, other]);
  assert.deepEqual(unplacedPostImages(`![one](${image.url})`, [image, other]), [other]);
  assert.deepEqual(unplacedPostImages(`[photo]: ${image.url}`, [image]), []);
  assert.deepEqual(unplacedPostImages("", [{ ...image, kind: "AUDIO" }, { ...image, url: "javascript:alert(1)" }]), []);
});

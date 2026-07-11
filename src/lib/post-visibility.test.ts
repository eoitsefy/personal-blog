import assert from "node:assert/strict";
import test from "node:test";
import { isPublishedPost } from "./post-visibility";

test("published posts are publicly visible", () => {
  assert.equal(isPublishedPost({ status: "PUBLISHED" }), true);
});

test("drafts and missing posts are rejected", () => {
  assert.equal(isPublishedPost({ status: "DRAFT" }), false);
  assert.equal(isPublishedPost(null), false);
});

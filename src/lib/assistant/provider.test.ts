import assert from "node:assert/strict";
import test from "node:test";
import { parseGroundedAnswer } from "./provider";

test("provider citations are constrained to supplied evidence IDs", () => {
  assert.deepEqual(parseGroundedAnswer({ answer: "来自文章。", sourceIds: ["allowed", "draft", "allowed"] }, new Set(["allowed"])), {
    answer: "来自文章。", sourceIds: ["allowed"],
  });
});

test("provider answers without a valid citation are rejected", () => {
  assert.throws(() => parseGroundedAnswer({ answer: "没有来源", sourceIds: ["invented"] }, new Set(["allowed"])), /provider_sources_invalid/);
});

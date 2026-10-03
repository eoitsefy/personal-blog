import assert from "node:assert/strict";
import test from "node:test";
import { DraftKeySchema, EditorStateSchema, editorState, insertMarkdownAtSelection, parseLocalWorkingCopy, SaveWorkingCopySchema } from "./editor-state";
import { CreatePostInputSchema, UpdatePostInputSchema } from "./validators/post";

const state = editorState({ title: "", slug: "", excerpt: "", contentMd: "", category: "", tags: [], assetIds: [], placeIds: [], status: "DRAFT" });

test("working copies allow unfinished articles without allowing publishing through the post schema", () => {
  assert.equal(EditorStateSchema.safeParse(state).success, true);
  assert.equal(CreatePostInputSchema.safeParse(state.form).success, false);
  assert.equal(SaveWorkingCopySchema.safeParse({ state, version: 0, baseUpdatedAt: null }).success, true);
});
test("working-copy data and concurrency tokens are bounded", () => {
  assert.equal(EditorStateSchema.safeParse({ ...state, unexpected: "secret" }).success, false);
  assert.equal(EditorStateSchema.safeParse({ ...state, form: { ...state.form, contentMd: "a".repeat(200_001) } }).success, false);
  assert.equal(SaveWorkingCopySchema.safeParse({ state, version: -1, baseUpdatedAt: null }).success, false);
  assert.equal(UpdatePostInputSchema.safeParse({ title: "Title", expectedUpdatedAt: "invalid" }).success, false);
  assert.equal(DraftKeySchema.safeParse("../other-user").success, false);
  assert.equal(DraftKeySchema.safeParse("new").success, true);
});
test("window draft recovery rejects expired, malformed and oversized records", () => {
  const now = Date.now();
  const record = { state, savedAt: now, version: 3, baseUpdatedAt: null };
  assert.deepEqual(parseLocalWorkingCopy(JSON.stringify(record), now), record);
  assert.equal(parseLocalWorkingCopy(JSON.stringify(record), now + 8 * 86400_000), null);
  assert.equal(parseLocalWorkingCopy("invalid", now), null);
  assert.equal(parseLocalWorkingCopy("x".repeat(300_001), now), null);
});
test("media Markdown replaces the selected text and clamps stale cursor positions", () => {
  assert.equal(insertMarkdownAtSelection("abc def", "![图](/uploads/a.png)", 4, 7), "abc ![图](/uploads/a.png)");
  assert.equal(insertMarkdownAtSelection("abc", "x", 99), "abcx");
  assert.equal(insertMarkdownAtSelection("abc", "x", -1, -2), "xabc");
});

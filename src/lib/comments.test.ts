import test from "node:test";
import assert from "node:assert/strict";
import { CommentContentSchema, CommentReportReasonSchema, commentAuthorLabel, commentRateLimitKey } from "./comments";

test("comment validation normalizes line endings and whitespace", () => {
  const parsed = CommentContentSchema.parse("  第一行\r\n第二行  ");
  assert.equal(parsed, "第一行\n第二行");
});

test("comment validation rejects unsafe, link-heavy and repetitive content", () => {
  assert.equal(CommentContentSchema.safeParse("<script>alert(1)</script>").success, false);
  assert.equal(CommentContentSchema.safeParse("https://a.test https://b.test https://c.test").success, false);
  assert.equal(CommentContentSchema.safeParse("哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈哈").success, false);
});

test("comment reports are bounded and author labels do not expose email", () => {
  assert.equal(CommentReportReasonSchema.parse("  垃圾   广告 "), "垃圾 广告");
  assert.equal(commentAuthorLabel({ id: "cmabcdefghijkl", role: "USER" }), "读者·IJKL");
  assert.equal(commentAuthorLabel({ id: "admin", role: "ADMIN" }), "博主");
});

test("comment rate keys bind address and user without retaining either", () => {
  const first = commentRateLimitKey(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.1" } }), "user-1");
  const second = commentRateLimitKey(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.2" } }), "user-1");
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
});

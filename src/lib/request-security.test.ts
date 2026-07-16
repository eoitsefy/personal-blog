import assert from "node:assert/strict";
import test from "node:test";
import { readJsonMutation, validateJsonMutation, validateMutationOrigin } from "./request-security";

test("same-origin JSON mutations are accepted", () => {
  const request = new Request("https://eastherphil.cn/api/admin/posts", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://eastherphil.cn" },
    body: "{}",
  });
  assert.equal(validateJsonMutation(request), null);
});

test("cross-origin mutations and oversized JSON are rejected", () => {
  const foreign = new Request("https://eastherphil.cn/api/admin/posts", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  });
  assert.equal(validateMutationOrigin(foreign)?.status, 403);

  const oversized = new Request("https://eastherphil.cn/api/admin/posts", {
    method: "POST",
    headers: { "content-type": "application/json", "content-length": "9000" },
    body: "{}",
  });
  assert.equal(validateJsonMutation(oversized, 1024)?.status, 413);
});

test("actual body size and malformed JSON are rejected", async () => {
  const oversized = new Request("https://eastherphil.cn/api/admin/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "x".repeat(100) }),
  });
  assert.equal((await readJsonMutation(oversized, 20)).ok, false);

  const malformed = new Request("https://eastherphil.cn/api/admin/posts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-json}",
  });
  const result = await readJsonMutation(malformed);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.status, 400);
});

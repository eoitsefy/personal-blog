import assert from "node:assert/strict";
import test from "node:test";
import { getClientAddress, readJsonMutation, validateJsonMutation, validateMutationOrigin } from "./request-security";

test("client address trusts the reverse-proxy address rather than a spoofed first hop", () => {
  assert.equal(getClientAddress(new Request("https://example.test", { headers: {
    "x-forwarded-for": "198.51.100.99, 203.0.113.10",
  } })), "203.0.113.10");
  assert.equal(getClientAddress(new Request("https://example.test", { headers: {
    "x-real-ip": "203.0.113.20",
    "x-forwarded-for": "198.51.100.99",
  } })), "203.0.113.20");
});

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

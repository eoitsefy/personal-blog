import assert from "node:assert/strict";
import test from "node:test";
import { isAdmin } from "./auth";

test("preview authorization rejects anonymous requests", async () => {
  const previousToken = process.env.ADMIN_SESSION_TOKEN;
  process.env.ADMIN_SESSION_TOKEN = "test-admin-session";

  try {
    assert.equal(await isAdmin(new Request("https://example.test/api/preview/posts/draft")), false);
  } finally {
    if (previousToken === undefined) delete process.env.ADMIN_SESSION_TOKEN;
    else process.env.ADMIN_SESSION_TOKEN = previousToken;
  }
});

test("preview authorization accepts the configured admin session", async () => {
  const previousToken = process.env.ADMIN_SESSION_TOKEN;
  process.env.ADMIN_SESSION_TOKEN = "test-admin-session";

  try {
    const request = new Request("https://example.test/api/preview/posts/draft", {
      headers: { cookie: "admin_session=test-admin-session" },
    });
    assert.equal(await isAdmin(request), true);
  } finally {
    if (previousToken === undefined) delete process.env.ADMIN_SESSION_TOKEN;
    else process.env.ADMIN_SESSION_TOKEN = previousToken;
  }
});

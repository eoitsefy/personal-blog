import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SESSION_COOKIE_NAME,
  parseCookie,
  signAdminSession,
  verifyAdminSession,
} from "./auth";

test("admin sessions are signed and verified", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-unit-tests";

  try {
    const token = signAdminSession({ userId: "admin-1", role: "ADMIN" });
    assert.deepEqual(verifyAdminSession(token), { userId: "admin-1", role: "ADMIN" });
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("invalid or tampered sessions are rejected", () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-unit-tests";

  try {
    assert.equal(verifyAdminSession("not-a-token"), null);
    const token = signAdminSession({ userId: "admin-1", role: "ADMIN" });
    assert.equal(verifyAdminSession(`${token}tampered`), null);
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});

test("cookie parsing reads the admin session safely", () => {
  const cookies = parseCookie(`theme=dark; ${ADMIN_SESSION_COOKIE_NAME}=signed%20token`);
  assert.equal(cookies[ADMIN_SESSION_COOKIE_NAME], "signed token");
  assert.equal(cookies.theme, "dark");
});

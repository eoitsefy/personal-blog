import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_SESSION_COOKIE_NAME,
  createSessionToken,
  hashSessionToken,
  isSessionToken,
  parseCookie,
} from "./auth";

test("opaque session tokens have sufficient entropy and stable hashes", () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(isSessionToken(first), true);
  assert.equal(isSessionToken(`${first}tampered`), false);
  assert.equal(isSessionToken(undefined), false);
  assert.notEqual(first, second);
  assert.match(hashSessionToken(first), /^[a-f0-9]{64}$/);
  assert.equal(hashSessionToken(first), hashSessionToken(first));
  assert.notEqual(hashSessionToken(first), hashSessionToken(`${first}tampered`));
});

test("cookie parsing reads the database session safely", () => {
  const cookies = parseCookie(`theme=dark; ${ADMIN_SESSION_COOKIE_NAME}=opaque%20token`);
  assert.equal(cookies[ADMIN_SESSION_COOKIE_NAME], "opaque token");
  assert.equal(cookies.theme, "dark");
});

test("malformed cookie encoding does not break request parsing", () => {
  const cookies = parseCookie(`${ADMIN_SESSION_COOKIE_NAME}=%E0%A4%A; ignored`);
  assert.equal(cookies[ADMIN_SESSION_COOKIE_NAME], "%E0%A4%A");
});

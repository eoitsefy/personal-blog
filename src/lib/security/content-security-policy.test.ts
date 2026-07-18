import assert from "node:assert/strict";
import test from "node:test";
import { buildContentSecurityPolicy } from "./content-security-policy";

test("production CSP permits AMap bootstrap without widening script origins", () => {
  const policy = buildContentSecurityPolicy(false);

  assert.match(
    policy,
    /script-src 'self' 'unsafe-inline' 'unsafe-eval' https:\/\/webapi\.amap\.com/,
  );
  assert.doesNotMatch(policy, /script-src[^;]*\*/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /upgrade-insecure-requests/);
});

test("development CSP adds local websocket connections only", () => {
  const policy = buildContentSecurityPolicy(true);

  assert.match(policy, /connect-src[^;]* ws: wss:/);
  assert.doesNotMatch(policy, /upgrade-insecure-requests/);
});


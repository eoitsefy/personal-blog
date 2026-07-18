import assert from "node:assert/strict";
import test from "node:test";
import { getMapHealthSummary, getPublicMapRuntimeConfig } from "./config";

test("map integration is disabled unless AMap is explicitly selected", () => {
  assert.deepEqual(getPublicMapRuntimeConfig({}), {
    enabled: false,
    provider: "none",
    apiKey: null,
    apiVersion: "2.0",
    serviceHostPath: "/_AMapService",
    reason: "provider_disabled",
  });
});

test("AMap requires a bounded browser key", () => {
  assert.equal(getPublicMapRuntimeConfig({ MAP_PROVIDER: "amap" }).reason, "missing_key");
  assert.equal(
    getPublicMapRuntimeConfig({ MAP_PROVIDER: "amap", AMAP_JS_API_KEY: "bad key" }).reason,
    "invalid_key",
  );
});

test("public AMap config never exposes a security code", () => {
  const config = getPublicMapRuntimeConfig({
    MAP_PROVIDER: " AMap ",
    AMAP_JS_API_KEY: "0123456789abcdef0123456789abcdef",
    // A security code is deliberately not part of the accepted environment type.
    AMAP_SECURITY_JSCODE: "must-never-be-public",
  } as { MAP_PROVIDER: string; AMAP_JS_API_KEY: string });
  assert.equal(config.enabled, true);
  assert.equal(config.apiKey, "0123456789abcdef0123456789abcdef");
  assert.equal(JSON.stringify(config).includes("must-never-be-public"), false);
  assert.deepEqual(getMapHealthSummary({ MAP_PROVIDER: "amap", AMAP_JS_API_KEY: "0123456789abcdef0123456789abcdef" }), {
    provider: "amap",
    enabled: true,
    reason: null,
  });
});

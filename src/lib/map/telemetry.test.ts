import assert from "node:assert/strict";
import test from "node:test";
import { MapClientEventSchema, MapEventRateLimiter } from "./telemetry";

test("map telemetry accepts bounded operational data without coordinates or messages", () => {
  assert.equal(MapClientEventSchema.safeParse({ provider: "amap", kind: "map_ready", pointCount: 4, omittedCount: 0, durationMs: 120 }).success, true);
  assert.equal(MapClientEventSchema.safeParse({ provider: "amap", kind: "map_ready", pointCount: 4, durationMs: 120, latitude: 30.1 }).success, false);
});

test("map telemetry rate limiter resets after its fixed window", () => {
  const limiter = new MapEventRateLimiter(2, 1_000, 2);
  assert.equal(limiter.allow("visitor", 0), true);
  assert.equal(limiter.allow("visitor", 1), true);
  assert.equal(limiter.allow("visitor", 2), false);
  assert.equal(limiter.allow("visitor", 1_000), true);
});

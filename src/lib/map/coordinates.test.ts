import assert from "node:assert/strict";
import test from "node:test";
import {
  chunkForAmapConversion,
  findNearestMapPoint,
  getAmapConversionType,
  type PublicMapPoint,
} from "./coordinates";

test("coordinate systems map to the supported AMap conversion sources", () => {
  assert.equal(getAmapConversionType("GCJ02"), null);
  assert.equal(getAmapConversionType("WGS84"), "gps");
  assert.equal(getAmapConversionType("BD09"), "baidu");
});

test("coordinate conversions never exceed the AMap forty-point request limit", () => {
  const batches = chunkForAmapConversion(Array.from({ length: 85 }, (_, index) => index));
  assert.deepEqual(batches.map((batch) => batch.length), [40, 40, 5]);
  assert.throws(() => chunkForAmapConversion([1], 41), RangeError);
});

test("non-cluster markers resolve their public point from the documented marker position", () => {
  const basePoint: PublicMapPoint = {
    id: "one",
    slug: "one",
    name: "One",
    locationLabel: "One",
    privacy: "EXACT",
    coordinateSystem: "GCJ02",
    latitude: 30,
    longitude: 120,
  };
  const points = [
    { ...basePoint, lnglat: [120, 30] as [number, number] },
    { ...basePoint, id: "two", slug: "two", lnglat: [121, 31] as [number, number] },
  ];

  assert.equal(findNearestMapPoint(points, 120.01, 30.01)?.id, "one");
  assert.equal(findNearestMapPoint(points, 120.99, 30.99)?.id, "two");
  assert.equal(findNearestMapPoint([], 120, 30), null);
});

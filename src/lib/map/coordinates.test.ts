import assert from "node:assert/strict";
import test from "node:test";
import { chunkForAmapConversion, getAmapConversionType } from "./coordinates";

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

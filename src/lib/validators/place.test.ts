import assert from "node:assert/strict";
import test from "node:test";
import { CreatePlaceInputSchema } from "./place";

const base = {
  name: "日常散步地点",
  slug: "daily-walk",
  summary: "",
  locationLabel: "杭州市",
  latitude: 30.123456,
  longitude: 120.654321,
  privacy: "HIDDEN" as const,
  coordinateSystem: "GCJ02" as const,
  coordinateSource: "手工记录",
  occurredAt: "",
  coverAssetId: "",
};

test("private place accepts bounded internal coordinates", () => {
  assert.equal(CreatePlaceInputSchema.safeParse(base).success, true);
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, latitude: 91 }).success, false);
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, longitude: -181 }).success, false);
});

test("approximate place requires different explicit public coordinates", () => {
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, privacy: "APPROXIMATE" }).success, false);
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, privacy: "APPROXIMATE", publicLatitude: base.latitude, publicLongitude: base.longitude }).success, false);
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, privacy: "APPROXIMATE", publicLatitude: 30.1, publicLongitude: 120.6 }).success, true);
});

test("city-only place keeps a public label without requiring public coordinates", () => {
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, privacy: "CITY_ONLY" }).success, true);
  assert.equal(CreatePlaceInputSchema.safeParse({ ...base, privacy: "CITY_ONLY", locationLabel: "" }).success, false);
});

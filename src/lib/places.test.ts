import assert from "node:assert/strict";
import test from "node:test";
import { serializePublicPlace } from "./places";

const base = {
  id: "place-1",
  slug: "quiet-road",
  name: "安静小路",
  summary: "一段日常记录",
  locationLabel: "杭州市",
  latitude: 30.123456,
  longitude: 120.654321,
  publicLatitude: 30.1,
  publicLongitude: 120.6,
  coordinateSystem: "GCJ02" as const,
  occurredAt: null,
  coverAsset: null,
};

test("hidden places never serialize", () => {
  assert.equal(serializePublicPlace({ ...base, privacy: "HIDDEN" }), null);
});

test("approximate places expose only the explicit public coordinates", () => {
  const place = serializePublicPlace({ ...base, privacy: "APPROXIMATE" });
  assert.deepEqual(place?.coordinates, { latitude: 30.1, longitude: 120.6 });
  assert.equal(JSON.stringify(place).includes("30.123456"), false);
  assert.equal(JSON.stringify(place).includes("120.654321"), false);
});

test("city-only places expose a label without coordinates", () => {
  const place = serializePublicPlace({ ...base, privacy: "CITY_ONLY" });
  assert.equal(place?.locationLabel, "杭州市");
  assert.equal(place?.coordinates, null);
});

test("exact places expose their stored coordinates", () => {
  const place = serializePublicPlace({ ...base, privacy: "EXACT" });
  assert.deepEqual(place?.coordinates, { latitude: 30.123456, longitude: 120.654321 });
});

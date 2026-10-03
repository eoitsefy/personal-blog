import assert from "node:assert/strict";
import test from "node:test";
import { fitPublicPoints, focusPublicPoint, getInitialMapPoint, getMapFitPadding, getNeighborhoodMapOptions, getPlaceZoom, type PositionedPublicPoint } from "./viewport";

const point: PositionedPublicPoint = {
  id: "first", slug: "first", name: "地点", locationLabel: "地区", privacy: "EXACT",
  coordinateSystem: "GCJ02", isFeatured: false, latitude: 31.23, longitude: 121.47,
  lnglat: [121.47, 31.23],
};

function mapSpy() {
  const calls: unknown[][] = [];
  return { calls,
    setZoomAndCenter: (...args: unknown[]) => { calls.push(["focus", ...args]); },
    setFitView: (...args: unknown[]) => { calls.push(["fit", ...args]); },
  };
}

test("neighborhood view starts at a featured place, or the first visible place", () => {
  const featured = { ...point, id: "featured", isFeatured: true };
  assert.equal(getInitialMapPoint([point, featured]), featured);
  assert.equal(getInitialMapPoint([point]), point);
  assert.equal(getInitialMapPoint([]), null);
});

test("precise places show buildings, roads and POIs at a neighborhood zoom", () => {
  const options = getNeighborhoodMapOptions(point);
  assert.equal(options.zoom, 17);
  assert.deepEqual(options.center, point.lnglat);
  assert.deepEqual(options.features, ["bg", "road", "building", "point"]);
  assert.equal(options.mapStyle, "amap://styles/normal");
  assert.equal(options.showLabel, true);
  assert.equal(options.resizeEnable, true);
});

test("approximate places retain a regional view using only their public coordinates", () => {
  const approximate: PositionedPublicPoint = { ...point, privacy: "APPROXIMATE", lnglat: [121.5, 31.2] };
  assert.equal(getPlaceZoom(approximate), 11);
  const map = mapSpy();
  focusPublicPoint(map, approximate);
  assert.deepEqual(map.calls, [["focus", 11, [121.5, 31.2], true]]);
});

test("single-point fit does not fall back to a country-wide cluster view", () => {
  const map = mapSpy();
  fitPublicPoints(map, [point], []);
  assert.deepEqual(map.calls, [["focus", 17, point.lnglat, true]]);
});

test("all-points view fits explicit overlays, including coincident and distant points", () => {
  const map = mapSpy();
  const overlays = [{ marker: 1 }, { marker: 2 }];
  fitPublicPoints(map, [point, { ...point, id: "second", lnglat: [102.71, 25.04] }], overlays);
  assert.deepEqual(map.calls, [["fit", overlays, true, [96, 96, 96, 96], 17]]);
  const regionalMap = mapSpy();
  fitPublicPoints(regionalMap, [point, { ...point, id: "second", privacy: "APPROXIMATE" }], overlays);
  assert.equal(regionalMap.calls[0][4], 11);
});

test("empty map never attempts to fit an undefined set of cluster overlays", () => {
  const map = mapSpy();
  fitPublicPoints(map, [], []);
  assert.deepEqual(map.calls, []);
});

test("map fit padding adapts to phone portrait and landscape containers", () => {
  assert.deepEqual(getMapFitPadding({ width: 294, height: 300 }), [60, 60, 44, 44]);
  assert.deepEqual(getMapFitPadding({ width: 720, height: 240 }), [48, 48, 96, 96]);
  assert.deepEqual(getMapFitPadding({ width: 1280, height: 600 }), [96, 96, 96, 96]);
  const map = mapSpy();
  const overlays = [{ marker: 1 }, { marker: 2 }];
  fitPublicPoints(map, [point, { ...point, id: "second", privacy: "APPROXIMATE" }], overlays, { width: 294, height: 300 });
  assert.deepEqual(map.calls, [["fit", overlays, true, [60, 60, 44, 44], 11]]);
});

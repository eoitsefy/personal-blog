import type { PublicMapPoint } from "./coordinates";

export type PositionedPublicPoint = PublicMapPoint & { lnglat: [number, number] };

export function getInitialMapPoint<T extends PublicMapPoint>(points: T[]): T | null {
  return points.find((point) => point.isFeatured) ?? points[0] ?? null;
}

export function getPlaceZoom(point: Pick<PublicMapPoint, "privacy">) {
  // Never present a rounded public coordinate as a precise building location.
  return point.privacy === "EXACT" ? 17 : 11;
}

export function getNeighborhoodMapOptions(point: PositionedPublicPoint) {
  return {
    viewMode: "2D",
    center: point.lnglat,
    zoom: getPlaceZoom(point),
    mapStyle: "amap://styles/normal",
    features: ["bg", "road", "building", "point"],
    showLabel: true,
    showBuildingBlock: true,
    resizeEnable: true,
  };
}

type ViewportMap = {
  setZoomAndCenter(zoom: number, center: [number, number], immediately: boolean): void;
  setFitView(overlays: unknown[], immediately: boolean, avoid: number[], maximumZoom: number): void;
};

export function focusPublicPoint(map: ViewportMap, point: PositionedPublicPoint) {
  map.setZoomAndCenter(getPlaceZoom(point), point.lnglat, true);
}

export function getMapFitPadding(size?: { width: number; height: number }) {
  // Keep enough usable area on phones instead of reserving 192px on each axis.
  const horizontal = size ? Math.min(96, Math.max(24, Math.floor(size.width * 0.15))) : 96;
  const vertical = size ? Math.min(96, Math.max(24, Math.floor(size.height * 0.2))) : 96;
  // AMap's order is top, bottom, left, right.
  return [vertical, vertical, horizontal, horizontal];
}

export function fitPublicPoints(map: ViewportMap, points: PositionedPublicPoint[], overlays: unknown[], size?: { width: number; height: number }) {
  if (points.length === 0) return;
  if (points.length === 1) {
    focusPublicPoint(map, points[0]);
    return;
  }
  // Cluster markers are asynchronous and are not a reliable source for setFitView().
  // Always pass explicit markers built from the already-sanitized, converted points.
  map.setFitView(overlays, true, getMapFitPadding(size), Math.min(...points.map(getPlaceZoom)));
}

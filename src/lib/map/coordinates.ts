import type { CoordinateSystem } from "@prisma/client";

export const AMAP_CONVERSION_BATCH_SIZE = 40;

export type PublicMapPoint = {
  id: string;
  slug: string;
  name: string;
  locationLabel: string;
  privacy: "EXACT" | "APPROXIMATE";
  coordinateSystem: CoordinateSystem;
  latitude: number;
  longitude: number;
};

export function getAmapConversionType(
  coordinateSystem: CoordinateSystem,
): "gps" | "baidu" | null {
  if (coordinateSystem === "WGS84") return "gps";
  if (coordinateSystem === "BD09") return "baidu";
  return null;
}

export function chunkForAmapConversion<T>(items: T[], size = AMAP_CONVERSION_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1 || size > AMAP_CONVERSION_BATCH_SIZE) {
    throw new RangeError(`AMap conversion batch size must be between 1 and ${AMAP_CONVERSION_BATCH_SIZE}`);
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

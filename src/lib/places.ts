import type { CoordinateSystem, PlacePrivacy, Prisma } from "@prisma/client";

export const ADMIN_PLACE_PAGE_SIZE = 20;

type DecimalLike = number | string | Prisma.Decimal;

export type PublicPlaceSource = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  locationLabel: string;
  latitude: DecimalLike;
  longitude: DecimalLike;
  publicLatitude: DecimalLike | null;
  publicLongitude: DecimalLike | null;
  privacy: PlacePrivacy;
  coordinateSystem: CoordinateSystem;
  occurredAt: Date | null;
  coverAsset?: { url: string; originalName: string | null } | null;
};

export type PublicPlace = {
  id: string;
  slug: string;
  name: string;
  summary: string | null;
  locationLabel: string;
  privacy: Exclude<PlacePrivacy, "HIDDEN">;
  coordinateSystem: CoordinateSystem;
  coordinates: { latitude: number; longitude: number } | null;
  occurredAt: Date | null;
  cover: { url: string; alt: string } | null;
};

function numberOf(value: DecimalLike) {
  return typeof value === "number" ? value : Number(value.toString());
}

export function serializePublicPlace(place: PublicPlaceSource): PublicPlace | null {
  if (place.privacy === "HIDDEN") return null;

  let coordinates: PublicPlace["coordinates"] = null;
  if (place.privacy === "EXACT") {
    coordinates = { latitude: numberOf(place.latitude), longitude: numberOf(place.longitude) };
  } else if (place.privacy === "APPROXIMATE" && place.publicLatitude !== null && place.publicLongitude !== null) {
    coordinates = { latitude: numberOf(place.publicLatitude), longitude: numberOf(place.publicLongitude) };
  }

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    summary: place.summary,
    locationLabel: place.locationLabel,
    privacy: place.privacy,
    coordinateSystem: place.coordinateSystem,
    coordinates,
    occurredAt: place.occurredAt,
    cover: place.coverAsset ? { url: place.coverAsset.url, alt: place.coverAsset.originalName ?? place.name } : null,
  };
}

export const publicPlaceSelect = {
  id: true,
  slug: true,
  name: true,
  summary: true,
  locationLabel: true,
  latitude: true,
  longitude: true,
  publicLatitude: true,
  publicLongitude: true,
  privacy: true,
  coordinateSystem: true,
  occurredAt: true,
  coverAsset: { select: { url: true, originalName: true } },
} satisfies Prisma.PlaceSelect;

export const publicPlaceWhere = {
  deletedAt: null,
  privacy: { not: "HIDDEN" },
  posts: { some: { post: { status: "PUBLISHED", deletedAt: null } } },
} satisfies Prisma.PlaceWhereInput;

export class InvalidPlaceReferenceError extends Error {}
export class InvalidPlaceCoverError extends Error {}

export async function replacePlaceCover(
  tx: Prisma.TransactionClient,
  previousAssetId: string | null,
  nextAssetId: string | null,
) {
  if (previousAssetId === nextAssetId) return;

  if (nextAssetId) {
    const asset = await tx.asset.findFirst({
      where: { id: nextAssetId, kind: "IMAGE", isPublic: true, deletedAt: null },
      select: { id: true },
    });
    if (!asset) throw new InvalidPlaceCoverError("封面必须选择媒体库中可用的公开图片");
    await tx.asset.update({ where: { id: nextAssetId }, data: { refCount: { increment: 1 } } });
  }

  if (previousAssetId) {
    await tx.asset.updateMany({
      where: { id: previousAssetId, refCount: { gt: 0 } },
      data: { refCount: { decrement: 1 } },
    });
  }
}

export async function syncPostPlaces(
  tx: Prisma.TransactionClient,
  postId: string,
  placeIds: string[],
) {
  const uniqueIds = [...new Set(placeIds)];
  if (uniqueIds.length > 0) {
    const count = await tx.place.count({ where: { id: { in: uniqueIds }, deletedAt: null } });
    if (count !== uniqueIds.length) throw new InvalidPlaceReferenceError("包含不存在或已删除的地点");
  }

  await tx.postPlace.deleteMany({ where: { postId } });
  if (uniqueIds.length > 0) {
    await tx.postPlace.createMany({ data: uniqueIds.map((placeId) => ({ postId, placeId })) });
  }
}

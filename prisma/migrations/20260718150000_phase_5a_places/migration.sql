-- CreateEnum
CREATE TYPE "PlacePrivacy" AS ENUM ('EXACT', 'APPROXIMATE', 'CITY_ONLY', 'HIDDEN');

-- CreateEnum
CREATE TYPE "CoordinateSystem" AS ENUM ('WGS84', 'GCJ02', 'BD09');

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "locationLabel" TEXT NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "publicLatitude" DECIMAL(9,6),
    "publicLongitude" DECIMAL(9,6),
    "privacy" "PlacePrivacy" NOT NULL DEFAULT 'HIDDEN',
    "coordinateSystem" "CoordinateSystem" NOT NULL DEFAULT 'WGS84',
    "coordinateSource" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "coverAssetId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostPlace" (
    "postId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostPlace_pkey" PRIMARY KEY ("postId","placeId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Place_slug_key" ON "Place"("slug");
CREATE INDEX "Place_deletedAt_updatedAt_idx" ON "Place"("deletedAt", "updatedAt" DESC);
CREATE INDEX "Place_privacy_deletedAt_occurredAt_idx" ON "Place"("privacy", "deletedAt", "occurredAt" DESC);
CREATE INDEX "Place_coverAssetId_idx" ON "Place"("coverAssetId");
CREATE INDEX "PostPlace_placeId_idx" ON "PostPlace"("placeId");

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_coverAssetId_fkey" FOREIGN KEY ("coverAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PostPlace" ADD CONSTRAINT "PostPlace_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostPlace" ADD CONSTRAINT "PostPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

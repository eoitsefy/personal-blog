CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'AUDIO', 'DOCUMENT', 'VIDEO', 'OTHER');

ALTER TABLE "Asset"
  ADD COLUMN "kind" "AssetKind" NOT NULL DEFAULT 'IMAGE',
  ADD COLUMN "durationMs" INTEGER;

CREATE INDEX "Asset_kind_deletedAt_createdAt_idx"
  ON "Asset"("kind", "deletedAt", "createdAt" DESC);

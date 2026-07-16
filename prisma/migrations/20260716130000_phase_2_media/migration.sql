ALTER TABLE "public"."Asset"
ADD COLUMN "originalName" TEXT,
ADD COLUMN "width" INTEGER,
ADD COLUMN "height" INTEGER;

CREATE INDEX "Asset_deletedAt_createdAt_idx"
ON "public"."Asset"("deletedAt", "createdAt" DESC);

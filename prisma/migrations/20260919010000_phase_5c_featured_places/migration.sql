ALTER TABLE "Place"
ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Place_isFeatured_deletedAt_occurredAt_idx"
ON "Place"("isFeatured", "deletedAt", "occurredAt" DESC);

-- Phase 1B: taxonomy and recoverable deletion.
ALTER TABLE "public"."Post"
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "categoryId" TEXT;

CREATE TABLE "public"."Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."PostTag" (
    "postId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostTag_pkey" PRIMARY KEY ("postId", "tagId")
);

CREATE TABLE "public"."LoginThrottle" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "Category_slug_key" ON "public"."Category"("slug");
CREATE INDEX "Category_name_idx" ON "public"."Category"("name");
CREATE UNIQUE INDEX "Tag_slug_key" ON "public"."Tag"("slug");
CREATE INDEX "Tag_name_idx" ON "public"."Tag"("name");
CREATE INDEX "PostTag_tagId_idx" ON "public"."PostTag"("tagId");
CREATE INDEX "Post_categoryId_status_publishedAt_idx" ON "public"."Post"("categoryId", "status", "publishedAt" DESC);
CREATE INDEX "Post_deletedAt_updatedAt_idx" ON "public"."Post"("deletedAt", "updatedAt" DESC);
CREATE INDEX "LoginThrottle_updatedAt_idx" ON "public"."LoginThrottle"("updatedAt");

ALTER TABLE "public"."Post"
ADD CONSTRAINT "Post_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."PostTag"
ADD CONSTRAINT "PostTag_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "public"."Post"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "public"."PostTag"
ADD CONSTRAINT "PostTag_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

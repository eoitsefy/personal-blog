CREATE TYPE "AiUsageStatus" AS ENUM (
  'SUCCESS',
  'NO_EVIDENCE',
  'RATE_LIMITED',
  'BUDGET_EXHAUSTED',
  'PROVIDER_ERROR',
  'TIMEOUT'
);

CREATE TABLE "AiContentChunk" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "contentVersion" TEXT NOT NULL,
  "heading" TEXT,
  "chunkIndex" INTEGER NOT NULL,
  "content" TEXT NOT NULL,
  "embedding" JSONB,
  "embeddingModel" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiContentChunk_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiUsage" (
  "requestId" TEXT NOT NULL,
  "actorKeyHash" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "promptVersion" TEXT NOT NULL,
  "status" "AiUsageStatus" NOT NULL,
  "latencyMs" INTEGER NOT NULL,
  "inputUnits" INTEGER NOT NULL DEFAULT 0,
  "outputUnits" INTEGER NOT NULL DEFAULT 0,
  "retrievalCount" INTEGER NOT NULL DEFAULT 0,
  "sourcePostIds" JSONB NOT NULL,
  "errorCategory" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("requestId")
);

CREATE TABLE "AiRateLimit" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "blockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiRateLimit_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "AiBudgetUsage" (
  "periodKey" TEXT NOT NULL,
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  "inputUnits" INTEGER NOT NULL DEFAULT 0,
  "outputUnits" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiBudgetUsage_pkey" PRIMARY KEY ("periodKey")
);

CREATE UNIQUE INDEX "AiContentChunk_postId_chunkIndex_key" ON "AiContentChunk"("postId", "chunkIndex");
CREATE INDEX "AiContentChunk_postId_contentVersion_idx" ON "AiContentChunk"("postId", "contentVersion");
CREATE INDEX "AiContentChunk_embeddingModel_idx" ON "AiContentChunk"("embeddingModel");
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt" DESC);
CREATE INDEX "AiUsage_actorKeyHash_createdAt_idx" ON "AiUsage"("actorKeyHash", "createdAt" DESC);
CREATE INDEX "AiUsage_status_createdAt_idx" ON "AiUsage"("status", "createdAt" DESC);
CREATE INDEX "AiRateLimit_updatedAt_idx" ON "AiRateLimit"("updatedAt");

ALTER TABLE "AiContentChunk"
  ADD CONSTRAINT "AiContentChunk_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

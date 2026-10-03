CREATE TABLE "PostWorkingCopy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "postId" TEXT,
    "payload" JSONB NOT NULL,
    "baseUpdatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostWorkingCopy_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PostRevision" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostWorkingCopy_userId_key_key" ON "PostWorkingCopy"("userId", "key");
CREATE INDEX "PostWorkingCopy_postId_idx" ON "PostWorkingCopy"("postId");
CREATE INDEX "PostRevision_postId_createdAt_idx" ON "PostRevision"("postId", "createdAt" DESC);
ALTER TABLE "PostWorkingCopy" ADD CONSTRAINT "PostWorkingCopy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostWorkingCopy" ADD CONSTRAINT "PostWorkingCopy_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostRevision" ADD CONSTRAINT "PostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

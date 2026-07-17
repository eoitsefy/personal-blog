CREATE TYPE "UserTokenType" AS ENUM ('INVITE', 'PASSWORD_RESET');

CREATE TABLE "UserToken" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "type" "UserTokenType" NOT NULL,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");
CREATE INDEX "UserToken_email_type_usedAt_expiresAt_idx"
  ON "UserToken"("email", "type", "usedAt", "expiresAt");
CREATE INDEX "UserToken_userId_type_usedAt_expiresAt_idx"
  ON "UserToken"("userId", "type", "usedAt", "expiresAt");
CREATE INDEX "UserToken_createdById_createdAt_idx"
  ON "UserToken"("createdById", "createdAt" DESC);

ALTER TABLE "UserToken"
  ADD CONSTRAINT "UserToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserToken"
  ADD CONSTRAINT "UserToken_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

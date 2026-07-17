CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE role NOT IN ('USER', 'ADMIN')) THEN
    RAISE EXCEPTION 'Cannot migrate unknown User.role values to UserRole';
  END IF;
END
$$;

ALTER TABLE "User"
  ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE role = 'ADMIN' AND "emailVerifiedAt" IS NULL;

ALTER TABLE "User" ALTER COLUMN role DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN role TYPE "UserRole"
  USING role::text::"UserRole";
ALTER TABLE "User" ALTER COLUMN role SET DEFAULT 'USER';

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx"
  ON "UserSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

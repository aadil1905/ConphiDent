ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "lockedUntil" TIMESTAMP(3);

CREATE INDEX "User_phone_idx" ON "User"("phone");

CREATE TABLE "AuthChallenge" (
  "id" TEXT NOT NULL,
  "userId" INTEGER,
  "purpose" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuthChallenge_recipient_purpose_createdAt_idx" ON "AuthChallenge"("recipient", "purpose", "createdAt");
CREATE INDEX "AuthChallenge_userId_purpose_expiresAt_idx" ON "AuthChallenge"("userId", "purpose", "expiresAt");
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SecurityRateLimit" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "subjectHash" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SecurityRateLimit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecurityRateLimit_scope_subjectHash_key" ON "SecurityRateLimit"("scope", "subjectHash");
CREATE INDEX "SecurityRateLimit_windowStart_idx" ON "SecurityRateLimit"("windowStart");

-- Operational drafts are intentionally separate from canonical tenant data.
-- They hold only encrypted-session-protected, non-secret wizard progress.
CREATE TABLE "PlatformProvisioningDraft" (
    "id" TEXT NOT NULL,
    "ownerUserId" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformProvisioningDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformProvisioningDraft_ownerUserId_updatedAt_idx"
ON "PlatformProvisioningDraft"("ownerUserId", "updatedAt");

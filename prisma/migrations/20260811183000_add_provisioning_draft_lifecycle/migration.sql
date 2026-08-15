-- Backward-compatible lifecycle metadata keeps draft state outside mutable JSON.
ALTER TABLE "PlatformProvisioningDraft"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "currentStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "discardedAt" TIMESTAMP(3);

CREATE INDEX "PlatformProvisioningDraft_ownerUserId_status_updatedAt_idx"
ON "PlatformProvisioningDraft"("ownerUserId", "status", "updatedAt");

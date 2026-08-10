ALTER TABLE "User" ADD COLUMN "platformRole" TEXT;

CREATE TABLE "PlatformOnboarding" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "stage" TEXT NOT NULL DEFAULT 'TENANT_CREATED',
  "ownerId" INTEGER,
  "targetGoLiveAt" TIMESTAMP(3),
  "blockers" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformOnboarding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PlatformOnboarding_clinicId_key" ON "PlatformOnboarding"("clinicId");
CREATE INDEX "PlatformOnboarding_stage_targetGoLiveAt_idx" ON "PlatformOnboarding"("stage", "targetGoLiveAt");
CREATE INDEX "PlatformOnboarding_ownerId_stage_idx" ON "PlatformOnboarding"("ownerId", "stage");

CREATE TABLE "PlatformSupportTicket" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER,
  "requester" TEXT,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "assignedTo" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "resolvedAt" TIMESTAMP(3),
  CONSTRAINT "PlatformSupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformSupportTicket_status_priority_updatedAt_idx" ON "PlatformSupportTicket"("status", "priority", "updatedAt");
CREATE INDEX "PlatformSupportTicket_clinicId_status_idx" ON "PlatformSupportTicket"("clinicId", "status");
CREATE INDEX "PlatformSupportTicket_assignedTo_status_idx" ON "PlatformSupportTicket"("assignedTo", "status");

CREATE TABLE "PlatformNotification" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "title" TEXT NOT NULL,
  "detail" TEXT,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformNotification_readAt_severity_createdAt_idx" ON "PlatformNotification"("readAt", "severity", "createdAt");
CREATE INDEX "PlatformNotification_clinicId_createdAt_idx" ON "PlatformNotification"("clinicId", "createdAt");

CREATE TABLE "PlatformInternalNote" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformInternalNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformInternalNote_clinicId_createdAt_idx" ON "PlatformInternalNote"("clinicId", "createdAt");
CREATE INDEX "PlatformInternalNote_authorId_createdAt_idx" ON "PlatformInternalNote"("authorId", "createdAt");
ALTER TABLE "PlatformInternalNote" ADD CONSTRAINT "PlatformInternalNote_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformTask" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER,
  "assigneeId" INTEGER,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "dueAt" TIMESTAMP(3),
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformTask_status_priority_dueAt_idx" ON "PlatformTask"("status", "priority", "dueAt");
CREATE INDEX "PlatformTask_clinicId_status_idx" ON "PlatformTask"("clinicId", "status");
CREATE INDEX "PlatformTask_assigneeId_status_idx" ON "PlatformTask"("assigneeId", "status");
ALTER TABLE "PlatformTask" ADD CONSTRAINT "PlatformTask_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PlatformAnnouncement" (
  "id" SERIAL NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "targetType" TEXT NOT NULL DEFAULT 'ALL_CLINICS',
  "targetClinicId" INTEGER,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endsAt" TIMESTAMP(3),
  "dismissible" BOOLEAN NOT NULL DEFAULT true,
  "createdById" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAnnouncement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlatformAnnouncement_targetType_startsAt_endsAt_idx" ON "PlatformAnnouncement"("targetType", "startsAt", "endsAt");
CREATE INDEX "PlatformAnnouncement_targetClinicId_startsAt_idx" ON "PlatformAnnouncement"("targetClinicId", "startsAt");

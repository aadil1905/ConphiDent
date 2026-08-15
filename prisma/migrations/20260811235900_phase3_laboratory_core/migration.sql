-- Phase 3 is additive. Existing laboratory cases and legacy statuses remain readable.
-- Keep this migration rerunnable because its first production attempt stopped on a
-- legacy duplicate index after the additive columns had already been created.
BEGIN;

ALTER TABLE "Laboratory"
  ADD COLUMN IF NOT EXISTS "legalName" TEXT,
  ADD COLUMN IF NOT EXISTS "technicians" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "supportedServices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "materials" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "pickupSchedule" TEXT,
  ADD COLUMN IF NOT EXISTS "deliverySchedule" TEXT,
  ADD COLUMN IF NOT EXISTS "priceList" JSONB,
  ADD COLUMN IF NOT EXISTS "taxInformation" TEXT,
  ADD COLUMN IF NOT EXISTS "preferredCommunication" TEXT NOT NULL DEFAULT 'SECURE_LINK',
  ADD COLUMN IF NOT EXISTS "integrationType" TEXT NOT NULL DEFAULT 'SECURE_PORTAL',
  ADD COLUMN IF NOT EXISTS "qualityScore" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "remakeRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "onTimeDeliveryRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "dataProcessingNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "dataProcessingAcceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Laboratory_qualityScore_check') THEN
    ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_qualityScore_check" CHECK ("qualityScore" IS NULL OR ("qualityScore" >= 0 AND "qualityScore" <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Laboratory_remakeRate_check') THEN
    ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_remakeRate_check" CHECK ("remakeRate" IS NULL OR ("remakeRate" >= 0 AND "remakeRate" <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Laboratory_onTimeDeliveryRate_check') THEN
    ALTER TABLE "Laboratory" ADD CONSTRAINT "Laboratory_onTimeDeliveryRate_check" CHECK ("onTimeDeliveryRate" IS NULL OR ("onTimeDeliveryRate" >= 0 AND "onTimeDeliveryRate" <= 100));
  END IF;
END $$;

ALTER TABLE "LabCase"
  ADD COLUMN IF NOT EXISTS "publicId" TEXT,
  ADD COLUMN IF NOT EXISTS "patientSafeIdentifier" TEXT,
  ADD COLUMN IF NOT EXISTS "treatmentPlanItemId" INTEGER,
  ADD COLUMN IF NOT EXISTS "appointmentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "approvedById" INTEGER,
  ADD COLUMN IF NOT EXISTS "restorationType" TEXT,
  ADD COLUMN IF NOT EXISTS "patientAppointmentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "expectedCompletionAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
  ADD COLUMN IF NOT EXISTS "anatomicalScope" TEXT,
  ADD COLUMN IF NOT EXISTS "shadeSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "marginDesign" TEXT,
  ADD COLUMN IF NOT EXISTS "ponticDesign" TEXT,
  ADD COLUMN IF NOT EXISTS "implantSystem" TEXT,
  ADD COLUMN IF NOT EXISTS "implantComponents" TEXT,
  ADD COLUMN IF NOT EXISTS "materialBatchDetails" TEXT,
  ADD COLUMN IF NOT EXISTS "requestedStages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "pickupRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pickupInstructions" TEXT,
  ADD COLUMN IF NOT EXISTS "previousCaseReference" TEXT,
  ADD COLUMN IF NOT EXISTS "approvalStatement" TEXT,
  ADD COLUMN IF NOT EXISTS "reworkChargeable" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "reworkResponsibility" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "firstViewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "acceptedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dispatchCarrier" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatchTrackingNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "dispatchNotes" TEXT,
  ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "fittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

UPDATE "LabCase"
SET
  "publicId" = COALESCE("publicId", 'lab_' || md5(random()::text || clock_timestamp()::text || "id"::text)),
  "patientSafeIdentifier" = COALESCE("patientSafeIdentifier", 'case_' || md5(random()::text || clock_timestamp()::text || "patientId"::text || "id"::text))
WHERE "publicId" IS NULL OR "patientSafeIdentifier" IS NULL;

ALTER TABLE "LabCase"
  ALTER COLUMN "publicId" SET NOT NULL,
  ALTER COLUMN "patientSafeIdentifier" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "LabCase_publicId_key" ON "LabCase"("publicId");
CREATE UNIQUE INDEX IF NOT EXISTS "LabCase_idempotencyKey_key" ON "LabCase"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "LabCase_clinicId_appointmentId_status_idx" ON "LabCase"("clinicId", "appointmentId", "status");
CREATE INDEX IF NOT EXISTS "LabCase_clinicId_treatmentPlanItemId_idx" ON "LabCase"("clinicId", "treatmentPlanItemId");
CREATE INDEX IF NOT EXISTS "LabCase_clinicId_publicId_idx" ON "LabCase"("clinicId", "publicId");
CREATE INDEX IF NOT EXISTS "LabCase_clinicId_labId_status_dueDate_idx" ON "LabCase"("clinicId", "labId", "status", "dueDate");

ALTER TABLE "LabCase"
  ADD CONSTRAINT "LabCase_treatmentPlanItemId_fkey" FOREIGN KEY ("treatmentPlanItemId") REFERENCES "TreatmentPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LabCase_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LabCase_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LabCaseEvent"
  ADD COLUMN "actorType" TEXT NOT NULL DEFAULT 'CLINIC',
  ADD COLUMN "actorUserId" INTEGER,
  ADD COLUMN "portalAccessId" TEXT,
  ADD COLUMN "fromStatus" TEXT,
  ADD COLUMN "toStatus" TEXT,
  ADD COLUMN "metadata" JSONB,
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "LabCaseEvent_idempotencyKey_key" ON "LabCaseEvent"("idempotencyKey");

CREATE TABLE "LabPortalAccess" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "laboratoryId" INTEGER NOT NULL,
  "labCaseId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenCiphertext" TEXT NOT NULL,
  "contactName" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastViewedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabPortalAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabPortalAccess_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabPortalAccess_laboratoryId_fkey" FOREIGN KEY ("laboratoryId") REFERENCES "Laboratory"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabPortalAccess_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LabPortalAccess_tokenHash_key" ON "LabPortalAccess"("tokenHash");
CREATE INDEX "LabPortalAccess_clinicId_labCaseId_expiresAt_idx" ON "LabPortalAccess"("clinicId", "labCaseId", "expiresAt");
CREATE INDEX "LabPortalAccess_laboratoryId_revokedAt_idx" ON "LabPortalAccess"("laboratoryId", "revokedAt");

ALTER TABLE "LabCaseEvent"
  ADD CONSTRAINT "LabCaseEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "LabCaseEvent_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "LabPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LabCaseMessage" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "labCaseId" INTEGER NOT NULL,
  "authorType" TEXT NOT NULL,
  "authorUserId" INTEGER,
  "portalAccessId" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'MESSAGE',
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabCaseMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabCaseMessage_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabCaseMessage_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LabCaseMessage_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LabCaseMessage_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "LabPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LabCaseMessage_clinicId_labCaseId_createdAt_idx" ON "LabCaseMessage"("clinicId", "labCaseId", "createdAt");

CREATE TABLE "LabCaseAttachment" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "labCaseId" INTEGER NOT NULL,
  "messageId" TEXT,
  "uploadedByUserId" INTEGER,
  "portalAccessId" TEXT,
  "category" TEXT NOT NULL DEFAULT 'DOCUMENT',
  "storageKey" TEXT NOT NULL,
  "blobUrl" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "scanStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabCaseAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabCaseAttachment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabCaseAttachment_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LabCaseAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "LabCaseMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LabCaseAttachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LabCaseAttachment_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "LabPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LabCaseAttachment_clinicId_labCaseId_sha256_key" ON "LabCaseAttachment"("clinicId", "labCaseId", "sha256");
CREATE INDEX "LabCaseAttachment_clinicId_labCaseId_createdAt_idx" ON "LabCaseAttachment"("clinicId", "labCaseId", "createdAt");

CREATE TABLE "LabCaseImagingStudy" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "labCaseId" INTEGER NOT NULL,
  "imagingStudyId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL DEFAULT 'REFERENCE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabCaseImagingStudy_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabCaseImagingStudy_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabCaseImagingStudy_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LabCaseImagingStudy_imagingStudyId_fkey" FOREIGN KEY ("imagingStudyId") REFERENCES "ImagingStudy"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LabCaseImagingStudy_labCaseId_imagingStudyId_key" ON "LabCaseImagingStudy"("labCaseId", "imagingStudyId");
CREATE INDEX "LabCaseImagingStudy_clinicId_labCaseId_idx" ON "LabCaseImagingStudy"("clinicId", "labCaseId");

CREATE TABLE "LabDeliveryAttempt" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "labCaseId" INTEGER NOT NULL,
  "portalAccessId" TEXT,
  "whatsappOutboxId" INTEGER,
  "channel" TEXT NOT NULL,
  "endpointMasked" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "idempotencyKey" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LabDeliveryAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "LabDeliveryAttempt_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "LabDeliveryAttempt_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LabDeliveryAttempt_portalAccessId_fkey" FOREIGN KEY ("portalAccessId") REFERENCES "LabPortalAccess"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LabDeliveryAttempt_whatsappOutboxId_fkey" FOREIGN KEY ("whatsappOutboxId") REFERENCES "ScheduledWhatsAppMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LabDeliveryAttempt_idempotencyKey_key" ON "LabDeliveryAttempt"("idempotencyKey");
CREATE UNIQUE INDEX "LabDeliveryAttempt_whatsappOutboxId_key" ON "LabDeliveryAttempt"("whatsappOutboxId");
CREATE INDEX "LabDeliveryAttempt_clinicId_status_createdAt_idx" ON "LabDeliveryAttempt"("clinicId", "status", "createdAt");
CREATE INDEX "LabDeliveryAttempt_labCaseId_createdAt_idx" ON "LabDeliveryAttempt"("labCaseId", "createdAt");

COMMIT;

-- Phase 1 clinical core: tenant-safe records, stable encounters, FDI dentition,
-- append-only findings, lifecycle metadata, and patient timeline events.

ALTER TABLE "Patient"
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archiveReason" TEXT,
  ADD COLUMN "archivedByUserId" INTEGER;

ALTER TABLE "Invoice"
  ADD COLUMN "clinicId" INTEGER,
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "voidedAt" TIMESTAMP(3),
  ADD COLUMN "voidReason" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "clinicId" INTEGER,
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'POSTED',
  ADD COLUMN "reversedAt" TIMESTAMP(3),
  ADD COLUMN "reversalReason" TEXT,
  ADD COLUMN "recordedByUserId" INTEGER;

ALTER TABLE "ClinicalRecord"
  ADD COLUMN "clinicId" INTEGER,
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "providerId" INTEGER,
  ADD COLUMN "authorId" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "signedAt" TIMESTAMP(3),
  ADD COLUMN "enteredInErrorAt" TIMESTAMP(3),
  ADD COLUMN "enteredInErrorReason" TEXT,
  ADD COLUMN "supersedesId" INTEGER;

ALTER TABLE "DentalChartEntry"
  ADD COLUMN "clinicId" INTEGER,
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "authorId" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'CURRENT',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'CLINICAL_WORKSPACE',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "TreatmentPlan"
  ADD COLUMN "clinicId" INTEGER,
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "providerId" INTEGER,
  ADD COLUMN "authorId" INTEGER,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;

ALTER TABLE "Prescription"
  ADD COLUMN "clinicId" INTEGER,
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "providerId" INTEGER,
  ADD COLUMN "authorId" INTEGER,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "issuedAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "supersedesId" INTEGER;

ALTER TABLE "LabCase"
  ADD COLUMN "encounterId" INTEGER,
  ADD COLUMN "providerId" INTEGER,
  ADD COLUMN "authorId" INTEGER,
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancellationReason" TEXT;
ALTER TABLE "LabCase" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "AuditLog"
  ADD COLUMN "patientId" INTEGER,
  ADD COLUMN "actorRole" TEXT,
  ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'SUCCESS',
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'APPLICATION',
  ADD COLUMN "correlationId" TEXT,
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "beforeState" JSONB,
  ADD COLUMN "afterState" JSONB;

CREATE TABLE "Encounter" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "appointmentId" INTEGER,
  "providerId" INTEGER,
  "locationId" INTEGER,
  "chairId" INTEGER,
  "createdById" INTEGER,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "source" TEXT NOT NULL DEFAULT 'CLINIC',
  "completedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DentitionAssessment" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "encounterId" INTEGER NOT NULL,
  "stage" TEXT NOT NULL,
  "suggestedStage" TEXT,
  "ageMonths" INTEGER,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "confirmedById" INTEGER NOT NULL,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "correctionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DentitionAssessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientTooth" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "dentition" TEXT NOT NULL,
  "fdiCode" TEXT,
  "kind" TEXT NOT NULL DEFAULT 'STANDARD',
  "customLabel" TEXT,
  "adjacentFdiCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientTooth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DentalFinding" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "encounterId" INTEGER NOT NULL,
  "patientToothId" INTEGER NOT NULL,
  "toothCodeSnapshot" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "condition" TEXT NOT NULL,
  "surfaces" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "authorId" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'CLINICAL_WORKSPACE',
  "signedAt" TIMESTAMP(3),
  "correctionReason" TEXT,
  "supersedesId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DentalFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatientTimelineEvent" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "encounterId" INTEGER,
  "actorId" INTEGER,
  "eventType" TEXT NOT NULL,
  "objectType" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "source" TEXT NOT NULL DEFAULT 'APPLICATION',
  "idempotencyKey" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientTimelineEvent_pkey" PRIMARY KEY ("id")
);

-- Backfill tenant ownership before enforcing required clinic IDs.
UPDATE "Invoice" i SET "clinicId" = p."clinicId" FROM "Patient" p WHERE p."id" = i."patientId";
UPDATE "ClinicalRecord" r SET "clinicId" = p."clinicId", "status" = 'FINAL', "signedAt" = r."updatedAt" FROM "Patient" p WHERE p."id" = r."patientId";
UPDATE "DentalChartEntry" d SET "clinicId" = p."clinicId" FROM "Patient" p WHERE p."id" = d."patientId";
UPDATE "TreatmentPlan" t SET "clinicId" = p."clinicId" FROM "Patient" p WHERE p."id" = t."patientId";
UPDATE "Prescription" r SET "clinicId" = p."clinicId", "status" = 'ISSUED', "issuedAt" = r."prescribedOn" FROM "Patient" p WHERE p."id" = r."patientId";
UPDATE "Payment" p SET "clinicId" = i."clinicId" FROM "Invoice" i WHERE i."id" = p."invoiceId";

ALTER TABLE "Invoice" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Payment" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "ClinicalRecord" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "DentalChartEntry" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "TreatmentPlan" ALTER COLUMN "clinicId" SET NOT NULL;
ALTER TABLE "Prescription" ALTER COLUMN "clinicId" SET NOT NULL;

-- Each historical completed appointment becomes one stable encounter.
INSERT INTO "Encounter" (
  "clinicId", "patientId", "appointmentId", "providerId", "locationId", "chairId",
  "occurredAt", "status", "source", "completedAt", "createdAt", "updatedAt"
)
SELECT a."clinicId", a."patientId", a."id", a."providerId", a."locationId", a."chairId",
       a."appointmentDate", 'COMPLETED', 'APPOINTMENT', a."appointmentDate", a."createdAt", CURRENT_TIMESTAMP
FROM "Appointment" a
WHERE a."patientId" IS NOT NULL AND a."status" = 'Completed';

UPDATE "ClinicalRecord" r SET "encounterId" = (
  SELECT e."id" FROM "Encounter" e
  WHERE e."patientId" = r."patientId" AND e."clinicId" = r."clinicId"
    AND (e."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = (r."visitDate" AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY e."occurredAt", e."id" LIMIT 1
);
UPDATE "DentalChartEntry" d SET "encounterId" = (
  SELECT e."id" FROM "Encounter" e
  WHERE e."patientId" = d."patientId" AND e."clinicId" = d."clinicId"
    AND (e."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = (d."visitDate" AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY e."occurredAt", e."id" LIMIT 1
);
UPDATE "TreatmentPlan" t SET "encounterId" = (
  SELECT e."id" FROM "Encounter" e
  WHERE e."patientId" = t."patientId" AND e."clinicId" = t."clinicId"
    AND (e."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = (COALESCE(t."visitDate", t."createdAt") AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY e."occurredAt", e."id" LIMIT 1
);
UPDATE "Prescription" r SET "encounterId" = (
  SELECT e."id" FROM "Encounter" e
  WHERE e."patientId" = r."patientId" AND e."clinicId" = r."clinicId"
    AND (e."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = (r."prescribedOn" AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY e."occurredAt", e."id" LIMIT 1
);
UPDATE "Invoice" i SET "encounterId" = (
  SELECT e."id" FROM "Encounter" e
  WHERE e."patientId" = i."patientId" AND e."clinicId" = i."clinicId"
    AND (e."occurredAt" AT TIME ZONE 'Asia/Kolkata')::date = (i."issueDate" AT TIME ZONE 'Asia/Kolkata')::date
  ORDER BY e."occurredAt", e."id" LIMIT 1
);
UPDATE "Payment" p SET "encounterId" = i."encounterId" FROM "Invoice" i WHERE i."id" = p."invoiceId";
UPDATE "LabCase" l SET "encounterId" = t."encounterId" FROM "TreatmentPlan" t WHERE t."id" = l."treatmentPlanId";

-- Seed a canonical patient-tooth identity for every valid historical FDI code.
INSERT INTO "PatientTooth" ("clinicId", "patientId", "dentition", "fdiCode")
SELECT DISTINCT p."clinicId", x."patientId",
  CASE WHEN LEFT(x."fdiCode", 1) IN ('5','6','7','8') THEN 'PRIMARY' ELSE 'PERMANENT' END,
  x."fdiCode"
FROM (
  SELECT "patientId", "toothNumber" AS "fdiCode" FROM "DentalChartEntry"
  UNION
  SELECT t."patientId", tt."toothNumber" AS "fdiCode"
  FROM "TreatmentPlanTooth" tt JOIN "TreatmentPlan" t ON t."id" = tt."treatmentPlanId"
) x
JOIN "Patient" p ON p."id" = x."patientId"
WHERE x."fdiCode" ~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
;

INSERT INTO "PatientTimelineEvent" (
  "clinicId", "patientId", "encounterId", "eventType", "objectType", "objectId",
  "title", "summary", "source", "idempotencyKey", "occurredAt"
)
SELECT e."clinicId", e."patientId", e."id", 'ENCOUNTER_COMPLETED', 'Encounter', e."id"::text,
       'Clinical encounter completed', 'Migrated from completed appointment history', 'MIGRATION',
       'encounter-migration-' || e."id"::text, e."occurredAt"
FROM "Encounter" e
;

-- Replace legacy cascade-delete paths with clinical retention boundaries.
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_patientId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_invoiceId_fkey";
ALTER TABLE "ClinicalRecord" DROP CONSTRAINT IF EXISTS "ClinicalRecord_patientId_fkey";
ALTER TABLE "DentalChartEntry" DROP CONSTRAINT IF EXISTS "DentalChartEntry_patientId_fkey";
ALTER TABLE "TreatmentPlan" DROP CONSTRAINT IF EXISTS "TreatmentPlan_patientId_fkey";
ALTER TABLE "Prescription" DROP CONSTRAINT IF EXISTS "Prescription_patientId_fkey";
ALTER TABLE "LabCase" DROP CONSTRAINT IF EXISTS "LabCase_patientId_fkey";
ALTER TABLE "LabCase" DROP CONSTRAINT IF EXISTS "LabCase_clinicId_fkey";

DROP INDEX IF EXISTS "Invoice_invoiceNumber_key";
DROP INDEX IF EXISTS "Patient_clinicId_createdAt_idx";

CREATE UNIQUE INDEX "Invoice_clinicId_invoiceNumber_key" ON "Invoice"("clinicId", "invoiceNumber");
CREATE UNIQUE INDEX "Encounter_appointmentId_key" ON "Encounter"("appointmentId");
CREATE UNIQUE INDEX "DentitionAssessment_encounterId_version_key" ON "DentitionAssessment"("encounterId", "version");
CREATE UNIQUE INDEX "PatientTooth_patientId_dentition_fdiCode_key" ON "PatientTooth"("patientId", "dentition", "fdiCode");
CREATE UNIQUE INDEX "PatientTimelineEvent_idempotencyKey_key" ON "PatientTimelineEvent"("idempotencyKey");

CREATE INDEX "Patient_clinicId_archivedAt_createdAt_idx" ON "Patient"("clinicId", "archivedAt", "createdAt");
CREATE INDEX "Invoice_clinicId_status_issueDate_idx" ON "Invoice"("clinicId", "status", "issueDate");
CREATE INDEX "Invoice_encounterId_idx" ON "Invoice"("encounterId");
CREATE INDEX "Payment_clinicId_status_paidAt_idx" ON "Payment"("clinicId", "status", "paidAt");
CREATE INDEX "Payment_encounterId_idx" ON "Payment"("encounterId");
CREATE INDEX "ClinicalRecord_clinicId_status_visitDate_idx" ON "ClinicalRecord"("clinicId", "status", "visitDate");
CREATE INDEX "ClinicalRecord_encounterId_status_idx" ON "ClinicalRecord"("encounterId", "status");
CREATE INDEX "DentalChartEntry_clinicId_encounterId_idx" ON "DentalChartEntry"("clinicId", "encounterId");
CREATE INDEX "TreatmentPlan_clinicId_status_updatedAt_idx" ON "TreatmentPlan"("clinicId", "status", "updatedAt");
CREATE INDEX "TreatmentPlan_encounterId_idx" ON "TreatmentPlan"("encounterId");
CREATE INDEX "Prescription_clinicId_status_prescribedOn_idx" ON "Prescription"("clinicId", "status", "prescribedOn");
CREATE INDEX "Prescription_encounterId_idx" ON "Prescription"("encounterId");
CREATE INDEX "Prescription_supersedesId_idx" ON "Prescription"("supersedesId");
CREATE INDEX "Encounter_clinicId_patientId_occurredAt_idx" ON "Encounter"("clinicId", "patientId", "occurredAt");
CREATE INDEX "Encounter_clinicId_status_occurredAt_idx" ON "Encounter"("clinicId", "status", "occurredAt");
CREATE INDEX "DentitionAssessment_clinicId_patientId_confirmedAt_idx" ON "DentitionAssessment"("clinicId", "patientId", "confirmedAt");
CREATE INDEX "PatientTooth_clinicId_patientId_fdiCode_idx" ON "PatientTooth"("clinicId", "patientId", "fdiCode");
CREATE INDEX "DentalFinding_clinicId_patientId_encounterId_status_idx" ON "DentalFinding"("clinicId", "patientId", "encounterId", "status");
CREATE INDEX "DentalFinding_patientToothId_status_createdAt_idx" ON "DentalFinding"("patientToothId", "status", "createdAt");
CREATE INDEX "DentalFinding_supersedesId_idx" ON "DentalFinding"("supersedesId");
CREATE INDEX "PatientTimelineEvent_clinicId_patientId_occurredAt_idx" ON "PatientTimelineEvent"("clinicId", "patientId", "occurredAt");
CREATE INDEX "PatientTimelineEvent_encounterId_occurredAt_idx" ON "PatientTimelineEvent"("encounterId", "occurredAt");
CREATE INDEX "AuditLog_clinicId_patientId_createdAt_idx" ON "AuditLog"("clinicId", "patientId", "createdAt");
CREATE INDEX "AuditLog_correlationId_idx" ON "AuditLog"("correlationId");
CREATE INDEX "LabCase_encounterId_idx" ON "LabCase"("encounterId");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClinicalRecord" ADD CONSTRAINT "ClinicalRecord_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "ClinicalRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DentalChartEntry" ADD CONSTRAINT "DentalChartEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalChartEntry" ADD CONSTRAINT "DentalChartEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalChartEntry" ADD CONSTRAINT "DentalChartEntry_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DentalChartEntry" ADD CONSTRAINT "DentalChartEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TreatmentPlan" ADD CONSTRAINT "TreatmentPlan_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "Prescription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ClinicProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_chairId_fkey" FOREIGN KEY ("chairId") REFERENCES "ClinicChair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DentitionAssessment" ADD CONSTRAINT "DentitionAssessment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentitionAssessment" ADD CONSTRAINT "DentitionAssessment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentitionAssessment" ADD CONSTRAINT "DentitionAssessment_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentitionAssessment" ADD CONSTRAINT "DentitionAssessment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientTooth" ADD CONSTRAINT "PatientTooth_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientTooth" ADD CONSTRAINT "PatientTooth_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_patientToothId_fkey" FOREIGN KEY ("patientToothId") REFERENCES "PatientTooth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DentalFinding" ADD CONSTRAINT "DentalFinding_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "DentalFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientTimelineEvent" ADD CONSTRAINT "PatientTimelineEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientTimelineEvent" ADD CONSTRAINT "PatientTimelineEvent_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatientTimelineEvent" ADD CONSTRAINT "PatientTimelineEvent_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "Encounter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PatientTimelineEvent" ADD CONSTRAINT "PatientTimelineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

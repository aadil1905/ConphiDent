CREATE TABLE "Laboratory" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "technicianName" TEXT,
  "phone" TEXT,
  "whatsapp" TEXT,
  "email" TEXT,
  "address" TEXT,
  "gstNumber" TEXT,
  "services" TEXT,
  "defaultTurnaroundDays" INTEGER,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Laboratory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Laboratory_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "LabCase" ADD COLUMN "labId" INTEGER;

-- The unique key must exist before the historic-directory upsert below.
CREATE UNIQUE INDEX "Laboratory_clinicId_name_key" ON "Laboratory"("clinicId", "name");

-- Preserve historical case names while creating a deduplicated directory per clinic.
INSERT INTO "Laboratory" ("clinicId", "name", "phone", "whatsapp", "technicianName", "createdAt", "updatedAt")
SELECT DISTINCT "clinicId", "labName", "labPhone", "labWhatsapp", "technicianName", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "LabCase"
WHERE "labName" <> ''
ON CONFLICT ("clinicId", "name") DO NOTHING;

UPDATE "LabCase" AS lab_case
SET "labId" = laboratory."id"
FROM "Laboratory" AS laboratory
WHERE laboratory."clinicId" = lab_case."clinicId"
  AND laboratory."name" = lab_case."labName";

ALTER TABLE "LabCase"
  ADD CONSTRAINT "LabCase_labId_fkey" FOREIGN KEY ("labId") REFERENCES "Laboratory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Laboratory_clinicId_active_name_idx" ON "Laboratory"("clinicId", "active", "name");
CREATE INDEX "LabCase_clinicId_labId_status_dueDate_idx" ON "LabCase"("clinicId", "labId", "status", "dueDate");

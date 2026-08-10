-- A lead can be converted only by linking it to a canonical patient record.
-- This preserves attribution while preventing duplicate patient creation.
ALTER TABLE "Lead" ADD COLUMN "patientId" INTEGER;

-- Phone is unique per clinic for both records, so this is a safe tenant-scoped
-- backfill for already converted leads and historic overlaps.
UPDATE "Lead" AS lead
SET "patientId" = patient."id"
FROM "Patient" AS patient
WHERE lead."clinicId" = patient."clinicId"
  AND lead."phone" = patient."phone";

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Lead_clinicId_patientId_idx" ON "Lead"("clinicId", "patientId");

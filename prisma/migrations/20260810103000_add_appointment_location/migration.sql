-- Additive only. Do not apply this migration from local development against production.
ALTER TABLE "Appointment" ADD COLUMN "locationId" INTEGER;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ClinicLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "Appointment" appointment SET "locationId" = location."id"
FROM "ClinicLocation" location
WHERE location."clinicId" = appointment."clinicId" AND location."isPrimary" = true AND appointment."locationId" IS NULL;
CREATE INDEX "Appointment_clinicId_locationId_appointmentDate_appointmentTime_idx" ON "Appointment"("clinicId", "locationId", "appointmentDate", "appointmentTime");

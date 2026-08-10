-- Connect the existing phone-based workflow to its canonical patient/lead records.
-- All new foreign keys are nullable so historic data remains valid.
ALTER TABLE "WhatsAppConversation" ADD COLUMN "patientId" INTEGER;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "leadId" INTEGER;

ALTER TABLE "FollowUpTask" ADD COLUMN "patientId" INTEGER;
ALTER TABLE "FollowUpTask" ADD COLUMN "assignedUserId" INTEGER;
ALTER TABLE "FollowUpTask" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "FollowUpTask" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "FollowUpTask" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "FollowUpTask" ADD COLUMN "outcome" TEXT;
ALTER TABLE "FollowUpTask" ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FollowUpTask" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

-- Backfill only within the same clinic boundary; duplicate historical phone data
-- intentionally remains unlinked for staff review rather than choosing arbitrarily.
UPDATE "WhatsAppConversation" AS conversation
SET "patientId" = patient."id"
FROM "Patient" AS patient
WHERE conversation."clinicId" = patient."clinicId"
  AND conversation."phone" = patient."phone";

UPDATE "WhatsAppConversation" AS conversation
SET "leadId" = lead."id"
FROM "Lead" AS lead
WHERE conversation."clinicId" = lead."clinicId"
  AND conversation."phone" = lead."phone";

UPDATE "FollowUpTask" AS task
SET "patientId" = patient."id"
FROM "Patient" AS patient
WHERE task."clinicId" = patient."clinicId"
  AND task."phone" = patient."phone";

ALTER TABLE "WhatsAppConversation"
  ADD CONSTRAINT "WhatsAppConversation_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConversation"
  ADD CONSTRAINT "WhatsAppConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask"
  ADD CONSTRAINT "FollowUpTask_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpTask"
  ADD CONSTRAINT "FollowUpTask_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WhatsAppConversation_clinicId_patientId_lastMessageAt_idx" ON "WhatsAppConversation"("clinicId", "patientId", "lastMessageAt");
CREATE INDEX "WhatsAppConversation_clinicId_leadId_lastMessageAt_idx" ON "WhatsAppConversation"("clinicId", "leadId", "lastMessageAt");
CREATE INDEX "FollowUpTask_clinicId_patientId_status_scheduledFor_idx" ON "FollowUpTask"("clinicId", "patientId", "status", "scheduledFor");
CREATE INDEX "FollowUpTask_clinicId_assignedUserId_status_scheduledFor_idx" ON "FollowUpTask"("clinicId", "assignedUserId", "status", "scheduledFor");
CREATE INDEX "FollowUpTask_clinicId_sourceType_sourceId_idx" ON "FollowUpTask"("clinicId", "sourceType", "sourceId");

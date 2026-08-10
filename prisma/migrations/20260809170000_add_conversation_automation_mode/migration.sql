-- A conversation may be handled by automation, a staff member, or paused.
-- Default existing threads to automation so the migration preserves behavior.
ALTER TABLE "WhatsAppConversation"
  ADD COLUMN "automationMode" TEXT NOT NULL DEFAULT 'BOT_ACTIVE';

CREATE INDEX "WhatsAppConversation_clinicId_automationMode_lastMessageAt_idx"
  ON "WhatsAppConversation"("clinicId", "automationMode", "lastMessageAt");

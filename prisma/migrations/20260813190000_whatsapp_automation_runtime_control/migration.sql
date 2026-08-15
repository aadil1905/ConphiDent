-- A tenant has one authoritative runtime switch for each automation trigger.
-- The deployment preflight must stop if legacy duplicates exist so an operator
-- can review them rather than silently discarding configuration.
CREATE UNIQUE INDEX "WhatsAppAutomation_clinicId_trigger_key"
ON "WhatsAppAutomation"("clinicId", "trigger");

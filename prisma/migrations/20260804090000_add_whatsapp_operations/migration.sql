ALTER TABLE "ClinicWhatsAppConnection"
  ADD COLUMN "verifiedName" TEXT,
  ADD COLUMN "businessName" TEXT,
  ADD COLUMN "qualityRating" TEXT,
  ADD COLUMN "messagingLimit" TEXT,
  ADD COLUMN "webhookVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE TABLE "WhatsAppConnectionLog" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "connectionId" INTEGER,
  "event" TEXT NOT NULL,
  "detail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConnectionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppConnectionLog_clinicId_createdAt_idx" ON "WhatsAppConnectionLog"("clinicId", "createdAt");
CREATE INDEX "WhatsAppConnectionLog_connectionId_createdAt_idx" ON "WhatsAppConnectionLog"("connectionId", "createdAt");
ALTER TABLE "WhatsAppConnectionLog" ADD CONSTRAINT "WhatsAppConnectionLog_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppConnectionLog" ADD CONSTRAINT "WhatsAppConnectionLog_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "ClinicWhatsAppConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "WhatsAppTemplate" (
  "id" SERIAL NOT NULL, "clinicId" INTEGER NOT NULL, "name" TEXT NOT NULL, "language" TEXT NOT NULL DEFAULT 'en', "category" TEXT, "status" TEXT NOT NULL DEFAULT 'DRAFT', "providerId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppTemplate_clinicId_name_language_key" ON "WhatsAppTemplate"("clinicId", "name", "language");
CREATE INDEX "WhatsAppTemplate_clinicId_status_idx" ON "WhatsAppTemplate"("clinicId", "status");
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WhatsAppAutomation" (
  "id" SERIAL NOT NULL, "clinicId" INTEGER NOT NULL, "name" TEXT NOT NULL, "trigger" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true, "templateId" INTEGER, "configuration" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAutomation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppAutomation_clinicId_enabled_idx" ON "WhatsAppAutomation"("clinicId", "enabled");
ALTER TABLE "WhatsAppAutomation" ADD CONSTRAINT "WhatsAppAutomation_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage"
  ADD COLUMN "deliveryStatus" TEXT NOT NULL DEFAULT 'QUEUED',
  ADD COLUMN "statusUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "failureReason" TEXT;

CREATE INDEX "WhatsAppMessage_providerMessageId_idx" ON "WhatsAppMessage"("providerMessageId");

CREATE TABLE "ScheduledWhatsAppMessage" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "phone" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "messageType" TEXT NOT NULL DEFAULT 'TEXT',
  "scheduledAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "lastAttemptAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "providerMessageId" TEXT,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScheduledWhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledWhatsAppMessage_clinicId_status_scheduledAt_idx"
  ON "ScheduledWhatsAppMessage"("clinicId", "status", "scheduledAt");
CREATE INDEX "ScheduledWhatsAppMessage_clinicId_phone_createdAt_idx"
  ON "ScheduledWhatsAppMessage"("clinicId", "phone", "createdAt");
ALTER TABLE "ScheduledWhatsAppMessage"
  ADD CONSTRAINT "ScheduledWhatsAppMessage_clinicId_fkey"
  FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

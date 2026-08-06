ALTER TABLE "WhatsAppMessage" ADD COLUMN "providerMessageId" TEXT;

CREATE UNIQUE INDEX "WhatsAppMessage_providerMessageId_key"
ON "WhatsAppMessage"("providerMessageId");

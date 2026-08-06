CREATE TABLE "ClinicWhatsAppConnection" (
    "id" SERIAL NOT NULL,
    "clinicId" INTEGER NOT NULL,
    "wabaId" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "businessId" TEXT,
    "displayPhoneNumber" TEXT,
    "tokenCiphertext" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "tokenTag" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastVerifiedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    CONSTRAINT "ClinicWhatsAppConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClinicWhatsAppConnection_clinicId_key" ON "ClinicWhatsAppConnection"("clinicId");
CREATE UNIQUE INDEX "ClinicWhatsAppConnection_wabaId_key" ON "ClinicWhatsAppConnection"("wabaId");
CREATE UNIQUE INDEX "ClinicWhatsAppConnection_phoneNumberId_key" ON "ClinicWhatsAppConnection"("phoneNumberId");
CREATE INDEX "ClinicWhatsAppConnection_phoneNumberId_idx" ON "ClinicWhatsAppConnection"("phoneNumberId");
CREATE INDEX "ClinicWhatsAppConnection_wabaId_idx" ON "ClinicWhatsAppConnection"("wabaId");

ALTER TABLE "ClinicWhatsAppConnection" ADD CONSTRAINT "ClinicWhatsAppConnection_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

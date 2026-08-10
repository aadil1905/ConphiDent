ALTER TABLE "Clinic" ADD COLUMN "gstin" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "invoicePrefix" TEXT NOT NULL DEFAULT 'INV';
ALTER TABLE "Clinic" ADD COLUMN "receiptPrefix" TEXT NOT NULL DEFAULT 'RCT';
ALTER TABLE "Clinic" ADD COLUMN "invoiceFooter" TEXT;
ALTER TABLE "Clinic" ADD COLUMN "paymentDetails" TEXT;

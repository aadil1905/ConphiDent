-- Enterprise laboratory & inventory extensions. Historical base records remain untouched.
ALTER TABLE "InventoryItem"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "barcode" TEXT,
  ADD COLUMN "brand" TEXT,
  ADD COLUMN "storageLocation" TEXT,
  ADD COLUMN "maximumQuantity" INTEGER,
  ADD COLUMN "sellingPrice" INTEGER,
  ADD COLUMN "gstPercent" INTEGER,
  ADD COLUMN "vendorId" INTEGER;

CREATE TABLE "Vendor" (
  "id" SERIAL NOT NULL, "clinicId" INTEGER NOT NULL, "name" TEXT NOT NULL,
  "gstNumber" TEXT, "contactName" TEXT, "phone" TEXT, "whatsapp" TEXT, "email" TEXT, "address" TEXT,
  "outstanding" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Vendor_clinicId_name_key" ON "Vendor"("clinicId", "name");
CREATE INDEX "Vendor_clinicId_active_idx" ON "Vendor"("clinicId", "active");
CREATE INDEX "InventoryItem_vendorId_idx" ON "InventoryItem"("vendorId");
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LabCase"
  ADD COLUMN "orderNumber" TEXT,
  ADD COLUMN "teeth" TEXT,
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "treatingDoctor" TEXT,
  ADD COLUMN "assistant" TEXT,
  ADD COLUMN "technicianName" TEXT,
  ADD COLUMN "labPhone" TEXT,
  ADD COLUMN "labWhatsapp" TEXT,
  ADD COLUMN "shade" TEXT,
  ADD COLUMN "material" TEXT,
  ADD COLUMN "marginType" TEXT,
  ADD COLUMN "occlusionNotes" TEXT,
  ADD COLUMN "biteNotes" TEXT,
  ADD COLUMN "attachments" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "parentCaseId" INTEGER,
  ADD COLUMN "reworkReason" TEXT,
  ADD COLUMN "reworkCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deliveredAt" TIMESTAMP(3);
CREATE INDEX "LabCase_clinicId_parentCaseId_idx" ON "LabCase"("clinicId", "parentCaseId");
ALTER TABLE "LabCase" ADD CONSTRAINT "LabCase_parentCaseId_fkey" FOREIGN KEY ("parentCaseId") REFERENCES "LabCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "LabCaseEvent" (
  "id" SERIAL NOT NULL, "clinicId" INTEGER NOT NULL, "labCaseId" INTEGER NOT NULL, "type" TEXT NOT NULL,
  "notes" TEXT, "actorName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabCaseEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LabCaseEvent_labCaseId_createdAt_idx" ON "LabCaseEvent"("labCaseId", "createdAt");
CREATE INDEX "LabCaseEvent_clinicId_createdAt_idx" ON "LabCaseEvent"("clinicId", "createdAt");
ALTER TABLE "LabCaseEvent" ADD CONSTRAINT "LabCaseEvent_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LabCaseEvent" ADD CONSTRAINT "LabCaseEvent_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LabPayment" (
  "id" SERIAL NOT NULL, "clinicId" INTEGER NOT NULL, "labCaseId" INTEGER NOT NULL, "amount" INTEGER NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "invoiceNumber" TEXT, "gstPercent" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'PAID', "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LabPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LabPayment_clinicId_paidAt_idx" ON "LabPayment"("clinicId", "paidAt");
CREATE INDEX "LabPayment_labCaseId_idx" ON "LabPayment"("labCaseId");
ALTER TABLE "LabPayment" ADD CONSTRAINT "LabPayment_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LabPayment" ADD CONSTRAINT "LabPayment_labCaseId_fkey" FOREIGN KEY ("labCaseId") REFERENCES "LabCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

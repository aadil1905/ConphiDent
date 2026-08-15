-- Phase 4 clinical operations and Phase 5 safety/reliability foundation.


ALTER TABLE "Invoice" ADD COLUMN "publicId" TEXT;
UPDATE "Invoice" SET "publicId" = 'inv_' || "id"::text || '_' || substr(md5(random()::text), 1, 16) WHERE "publicId" IS NULL;
ALTER TABLE "Invoice" ALTER COLUMN "publicId" SET NOT NULL;
ALTER TABLE "Invoice" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'TAX_INVOICE';
ALTER TABLE "Invoice" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE "Invoice" ADD COLUMN "subtotalAmount" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "taxAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Invoice" ADD COLUMN "terms" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "immutableSnapshot" JSONB;
ALTER TABLE "Invoice" ADD COLUMN "finalizedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "parentInvoiceId" INTEGER;
CREATE UNIQUE INDEX "Invoice_publicId_key" ON "Invoice"("publicId");
CREATE INDEX "Invoice_clinicId_documentType_issueDate_idx" ON "Invoice"("clinicId", "documentType", "issueDate");
CREATE INDEX "Invoice_parentInvoiceId_idx" ON "Invoice"("parentInvoiceId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "InvoiceLineItem" (
  "id" SERIAL NOT NULL,
  "invoiceId" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" INTEGER NOT NULL,
  "discount" INTEGER NOT NULL DEFAULT 0,
  "taxPercent" INTEGER NOT NULL DEFAULT 0,
  "lineTotal" INTEGER NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "InvoiceLineItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InvoiceLineItem_invoiceId_sortOrder_idx" ON "InvoiceLineItem"("invoiceId", "sortOrder");
ALTER TABLE "InvoiceLineItem" ADD CONSTRAINT "InvoiceLineItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "receiptNumber" TEXT;
ALTER TABLE "Payment" ADD COLUMN "referenceNumber" TEXT;
CREATE UNIQUE INDEX "Payment_clinicId_receiptNumber_key" ON "Payment"("clinicId", "receiptNumber");

ALTER TABLE "User" ADD COLUMN "qualification" TEXT;
ALTER TABLE "User" ADD COLUMN "registrationNumber" TEXT;
ALTER TABLE "User" ADD COLUMN "signatureLabel" TEXT;

ALTER TABLE "Prescription" ADD COLUMN "allergySnapshot" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "patientAgeSnapshot" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "patientSexSnapshot" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "providerNameSnapshot" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "providerQualificationSnapshot" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "providerRegistrationSnapshot" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "issuePlace" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "safetyWarnings" JSONB;
ALTER TABLE "Prescription" ADD COLUMN "signatureStatement" TEXT;
ALTER TABLE "Prescription" ADD COLUMN "signedAt" TIMESTAMP(3);

CREATE TABLE "PrescriptionItem" (
  "id" SERIAL NOT NULL,
  "prescriptionId" INTEGER NOT NULL,
  "genericName" TEXT NOT NULL,
  "brandName" TEXT,
  "formulation" TEXT,
  "strength" TEXT NOT NULL,
  "dosageForm" TEXT NOT NULL,
  "dose" TEXT NOT NULL,
  "doseUnit" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "timing" TEXT,
  "mealRelation" TEXT,
  "startDate" TIMESTAMP(3),
  "duration" TEXT NOT NULL,
  "endDate" TIMESTAMP(3),
  "quantity" TEXT,
  "asNeeded" BOOLEAN NOT NULL DEFAULT false,
  "maxDose" TEXT,
  "indication" TEXT,
  "instructions" TEXT,
  "substitutionAllowed" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrescriptionItem_prescriptionId_sortOrder_idx" ON "PrescriptionItem"("prescriptionId", "sortOrder");
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "Prescription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PrescriptionTemplate" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "diagnosis" TEXT,
  "items" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrescriptionTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PrescriptionTemplate_clinicId_name_key" ON "PrescriptionTemplate"("clinicId", "name");
CREATE INDEX "PrescriptionTemplate_clinicId_active_name_idx" ON "PrescriptionTemplate"("clinicId", "active", "name");

ALTER TABLE "WhatsAppConversation" ADD COLUMN "consentStatus" TEXT NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "WhatsAppConversation" ADD COLUMN "consentPurpose" TEXT;
ALTER TABLE "WhatsAppConversation" ADD COLUMN "consentAt" TIMESTAMP(3);
ALTER TABLE "WhatsAppMessage" ADD COLUMN "actorType" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "triggerType" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "ruleId" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "idempotencyKey" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "patientId" INTEGER;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'CARE_COMMUNICATION';
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "templateName" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "templateLanguage" TEXT;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "templateParameters" JSONB;
ALTER TABLE "ScheduledWhatsAppMessage" ADD COLUMN "dispatchPayloadCiphertext" TEXT;
CREATE UNIQUE INDEX "ScheduledWhatsAppMessage_idempotencyKey_key" ON "ScheduledWhatsAppMessage"("idempotencyKey");
CREATE INDEX "ScheduledWhatsAppMessage_clinicId_sourceType_sourceId_idx" ON "ScheduledWhatsAppMessage"("clinicId", "sourceType", "sourceId");
CREATE INDEX "ScheduledWhatsAppMessage_clinicId_patientId_createdAt_idx" ON "ScheduledWhatsAppMessage"("clinicId", "patientId", "createdAt");

CREATE TABLE "WhatsAppWebhookEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" TEXT NOT NULL,
  "clinicId" INTEGER,
  "phoneNumberId" TEXT,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppWebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppWebhookEvent_providerEventId_key" ON "WhatsAppWebhookEvent"("providerEventId");
CREATE INDEX "WhatsAppWebhookEvent_status_availableAt_idx" ON "WhatsAppWebhookEvent"("status", "availableAt");
CREATE INDEX "WhatsAppWebhookEvent_clinicId_createdAt_idx" ON "WhatsAppWebhookEvent"("clinicId", "createdAt");

CREATE TABLE "WhatsAppConsentEvent" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER,
  "phone" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "actorUserId" INTEGER,
  "evidence" TEXT,
  "correlationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WhatsAppConsentEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WhatsAppConsentEvent_clinicId_phone_createdAt_idx" ON "WhatsAppConsentEvent"("clinicId", "phone", "createdAt");
CREATE INDEX "WhatsAppConsentEvent_clinicId_patientId_purpose_createdAt_idx" ON "WhatsAppConsentEvent"("clinicId", "patientId", "purpose", "createdAt");
CREATE INDEX "WhatsAppConsentEvent_clinicId_status_purpose_idx" ON "WhatsAppConsentEvent"("clinicId", "status", "purpose");

CREATE TABLE "SecureDocumentAccess" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "patientId" INTEGER NOT NULL,
  "documentType" TEXT NOT NULL,
  "documentId" INTEGER NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "firstViewedAt" TIMESTAMP(3),
  "lastViewedAt" TIMESTAMP(3),
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecureDocumentAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SecureDocumentAccess_tokenHash_key" ON "SecureDocumentAccess"("tokenHash");
CREATE INDEX "SecureDocumentAccess_clinicId_documentType_documentId_idx" ON "SecureDocumentAccess"("clinicId", "documentType", "documentId");
CREATE INDEX "SecureDocumentAccess_patientId_createdAt_idx" ON "SecureDocumentAccess"("patientId", "createdAt");
CREATE INDEX "SecureDocumentAccess_expiresAt_revokedAt_idx" ON "SecureDocumentAccess"("expiresAt", "revokedAt");

ALTER TABLE "InventoryItem" ADD COLUMN "gtin" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "manufacturer" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "purchaseUnit" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "unitConversion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "InventoryItem" ADD COLUMN "reorderQuantity" INTEGER;
ALTER TABLE "InventoryItem" ADD COLUMN "leadTimeDays" INTEGER;
ALTER TABLE "InventoryItem" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "InventoryItem_clinicId_sku_idx" ON "InventoryItem"("clinicId", "sku");
CREATE INDEX "InventoryItem_clinicId_barcode_idx" ON "InventoryItem"("clinicId", "barcode");
CREATE INDEX "InventoryItem_clinicId_gtin_idx" ON "InventoryItem"("clinicId", "gtin");

CREATE TABLE "InventoryBatch" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "inventoryItemId" INTEGER NOT NULL,
  "batchNumber" TEXT NOT NULL,
  "serialNumber" TEXT,
  "expiryDate" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "initialQuantity" INTEGER NOT NULL,
  "availableQuantity" INTEGER NOT NULL,
  "unitCost" INTEGER,
  "taxPercent" INTEGER,
  "storageLocation" TEXT,
  "recalledAt" TIMESTAMP(3),
  "recallReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InventoryBatch_clinicId_inventoryItemId_batchNumber_key" ON "InventoryBatch"("clinicId", "inventoryItemId", "batchNumber");
CREATE INDEX "InventoryBatch_clinicId_expiryDate_availableQuantity_idx" ON "InventoryBatch"("clinicId", "expiryDate", "availableQuantity");
CREATE INDEX "InventoryBatch_clinicId_recalledAt_idx" ON "InventoryBatch"("clinicId", "recalledAt");
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'IN';
ALTER TABLE "InventoryMovement" ADD COLUMN "unit" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "batchId" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "reason" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "sourceType" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "sourceId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "sourceDocumentType" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "sourceDocumentId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "storageLocation" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "unitCost" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "actorUserId" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "actorRole" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "approvedById" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "correlationId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "balanceAfter" INTEGER;
CREATE INDEX "InventoryMovement_clinicId_batchId_createdAt_idx" ON "InventoryMovement"("clinicId", "batchId", "createdAt");
CREATE INDEX "InventoryMovement_clinicId_sourceType_sourceId_idx" ON "InventoryMovement"("clinicId", "sourceType", "sourceId");
CREATE INDEX "InventoryMovement_clinicId_correlationId_idx" ON "InventoryMovement"("clinicId", "correlationId");
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "InventoryCycleCount" (
  "id" TEXT NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "storageLocation" TEXT,
  "countedById" INTEGER NOT NULL,
  "approvedById" INTEGER,
  "varianceReason" TEXT,
  "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InventoryCycleCount_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryCycleCount_clinicId_status_countedAt_idx" ON "InventoryCycleCount"("clinicId", "status", "countedAt");

CREATE TABLE "InventoryCycleCountLine" (
  "id" SERIAL NOT NULL,
  "cycleCountId" TEXT NOT NULL,
  "inventoryItemId" INTEGER NOT NULL,
  "batchId" INTEGER,
  "expectedQuantity" INTEGER NOT NULL,
  "countedQuantity" INTEGER NOT NULL,
  "variance" INTEGER NOT NULL,
  CONSTRAINT "InventoryCycleCountLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InventoryCycleCountLine_cycleCountId_idx" ON "InventoryCycleCountLine"("cycleCountId");
CREATE INDEX "InventoryCycleCountLine_inventoryItemId_idx" ON "InventoryCycleCountLine"("inventoryItemId");
ALTER TABLE "InventoryCycleCountLine" ADD CONSTRAINT "InventoryCycleCountLine_cycleCountId_fkey" FOREIGN KEY ("cycleCountId") REFERENCES "InventoryCycleCount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProcedureConsumptionTemplate" (
  "id" SERIAL NOT NULL,
  "clinicId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "procedureName" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProcedureConsumptionTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcedureConsumptionTemplate_clinicId_name_key" ON "ProcedureConsumptionTemplate"("clinicId", "name");
CREATE INDEX "ProcedureConsumptionTemplate_clinicId_active_procedureName_idx" ON "ProcedureConsumptionTemplate"("clinicId", "active", "procedureName");

CREATE TABLE "ProcedureConsumptionTemplateItem" (
  "id" SERIAL NOT NULL,
  "templateId" INTEGER NOT NULL,
  "inventoryItemId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unit" TEXT NOT NULL,
  CONSTRAINT "ProcedureConsumptionTemplateItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProcedureConsumptionTemplateItem_templateId_inventoryItemId_key" ON "ProcedureConsumptionTemplateItem"("templateId", "inventoryItemId");
ALTER TABLE "ProcedureConsumptionTemplateItem" ADD CONSTRAINT "ProcedureConsumptionTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProcedureConsumptionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill every legacy stock position into a traceable opening batch and ledger balance.
INSERT INTO "InventoryBatch" ("clinicId", "inventoryItemId", "batchNumber", "expiryDate", "receivedAt", "initialQuantity", "availableQuantity", "unitCost", "storageLocation", "updatedAt")
SELECT "clinicId", "id", COALESCE(NULLIF("batchNumber", ''), 'OPENING-' || "id"::text), "expiryDate", "createdAt", "quantity", "quantity", "costPerUnit", "storageLocation", CURRENT_TIMESTAMP
FROM "InventoryItem"
WHERE "quantity" > 0
ON CONFLICT ("clinicId", "inventoryItemId", "batchNumber") DO NOTHING;

INSERT INTO "InventoryMovement" ("inventoryItemId", "clinicId", "quantityChange", "type", "direction", "unit", "batchId", "reason", "sourceType", "sourceId", "storageLocation", "unitCost", "balanceAfter", "recordedBy", "createdAt")
SELECT i."id", i."clinicId", i."quantity", 'OPENING_BALANCE', 'IN', i."unit", b."id", 'Phase 4 ledger opening balance', 'MIGRATION', '20260812010000', i."storageLocation", i."costPerUnit", i."quantity", 'System migration', CURRENT_TIMESTAMP
FROM "InventoryItem" i JOIN "InventoryBatch" b ON b."inventoryItemId" = i."id" AND b."clinicId" = i."clinicId"
WHERE i."quantity" > 0;

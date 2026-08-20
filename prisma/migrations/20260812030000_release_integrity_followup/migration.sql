-- Release integrity follow-up. This migration is additive and safe after the
-- already-deployed Phase 4/5 migration.
BEGIN;

-- Correct legacy movement direction using the signed movement quantity. The
-- opening-balance rows created by Phase 4 are positive and remain inbound.
UPDATE "InventoryMovement"
SET "direction" = CASE WHEN "quantityChange" < 0 THEN 'OUT' ELSE 'IN' END
WHERE "direction" IS DISTINCT FROM CASE WHEN "quantityChange" < 0 THEN 'OUT' ELSE 'IN' END;

-- A version can have at most one direct successor. This prevents concurrent
-- clinical/prescription corrections from branching the signed record chain.
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicalRecord_supersedesId_key"
  ON "ClinicalRecord"("supersedesId");
CREATE UNIQUE INDEX IF NOT EXISTS "Prescription_supersedesId_key"
  ON "Prescription"("supersedesId");
CREATE UNIQUE INDEX IF NOT EXISTS "DentalFinding_supersedesId_key"
  ON "DentalFinding"("supersedesId");
CREATE UNIQUE INDEX IF NOT EXISTS "ImagingReport_supersedesId_key"
  ON "ImagingReport"("supersedesId");

-- Tenant-bearing child records must agree with their owning patient's/item's
-- clinic even if a caller bypasses the application layer.
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_clinicId_id_key" ON "Patient"("clinicId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "User_clinicId_id_key" ON "User"("clinicId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_clinicId_id_key" ON "InventoryItem"("clinicId", "id");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryBatch_clinicId_id_key" ON "InventoryBatch"("clinicId", "id");

ALTER TABLE "WhatsAppConsentEvent" ADD CONSTRAINT "WhatsAppConsentEvent_clinic_patient_fkey"
  FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SecureDocumentAccess" ADD CONSTRAINT "SecureDocumentAccess_clinic_patient_fkey"
  FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledWhatsAppMessage" ADD CONSTRAINT "ScheduledWhatsAppMessage_clinic_patient_fkey"
  FOREIGN KEY ("clinicId", "patientId") REFERENCES "Patient"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_clinic_item_fkey"
  FOREIGN KEY ("clinicId", "inventoryItemId") REFERENCES "InventoryItem"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_clinic_item_fkey"
  FOREIGN KEY ("clinicId", "inventoryItemId") REFERENCES "InventoryItem"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_clinic_batch_fkey"
  FOREIGN KEY ("clinicId", "batchId") REFERENCES "InventoryBatch"("clinicId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Defensive database invariants. Application transactions remain responsible
-- for the corresponding ledger and audit rows.
ALTER TABLE "InventoryItem" DROP CONSTRAINT IF EXISTS "InventoryItem_quantity_nonnegative";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_quantity_nonnegative" CHECK ("quantity" >= 0) NOT VALID;
ALTER TABLE "InventoryItem" VALIDATE CONSTRAINT "InventoryItem_quantity_nonnegative";

ALTER TABLE "InventoryBatch" DROP CONSTRAINT IF EXISTS "InventoryBatch_quantities_valid";
ALTER TABLE "InventoryBatch" ADD CONSTRAINT "InventoryBatch_quantities_valid" CHECK ("initialQuantity" >= 0 AND "availableQuantity" >= 0 AND "availableQuantity" <= "initialQuantity") NOT VALID;
ALTER TABLE "InventoryBatch" VALIDATE CONSTRAINT "InventoryBatch_quantities_valid";

ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_direction_matches_quantity";
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_direction_matches_quantity" CHECK (
  ("direction" = 'IN' AND "quantityChange" >= 0) OR
  ("direction" = 'OUT' AND "quantityChange" <= 0)
) NOT VALID;
ALTER TABLE "InventoryMovement" VALIDATE CONSTRAINT "InventoryMovement_direction_matches_quantity";

ALTER TABLE "Payment" DROP CONSTRAINT IF EXISTS "Payment_amount_positive";
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK ("amount" > 0) NOT VALID;
ALTER TABLE "Payment" VALIDATE CONSTRAINT "Payment_amount_positive";

ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_amounts_nonnegative";
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amounts_nonnegative" CHECK (
  "totalAmount" >= 0 AND "discountAmount" >= 0 AND "taxAmount" >= 0 AND
  ("subtotalAmount" IS NULL OR "subtotalAmount" >= 0)
) NOT VALID;
ALTER TABLE "Invoice" VALIDATE CONSTRAINT "Invoice_amounts_nonnegative";

COMMIT;

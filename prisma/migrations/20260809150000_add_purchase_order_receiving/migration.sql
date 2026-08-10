ALTER TABLE "PurchaseOrder" ADD COLUMN "vendorId" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN "expectedDelivery" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN "receivedAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "receivedQuantity" INTEGER NOT NULL DEFAULT 0;

-- Match historical supplier names only within the owning clinic.
UPDATE "PurchaseOrder" AS purchase_order
SET "vendorId" = vendor."id"
FROM "Vendor" AS vendor
WHERE purchase_order."clinicId" = vendor."clinicId"
  AND purchase_order."supplier" = vendor."name";

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PurchaseOrder_clinicId_vendorId_status_idx" ON "PurchaseOrder"("clinicId", "vendorId", "status");

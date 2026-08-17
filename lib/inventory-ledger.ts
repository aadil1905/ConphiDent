import "server-only";

import { randomUUID } from "crypto";
import type { Db } from "@/lib/prisma";
import {
  assertInventoryBatchReceivable,
  canonicalBatchNumber,
  inventoryReceiptMovement,
  selectUsableBatchesFefo,
} from "@/lib/inventory-core";

type LedgerActor = { id: number; fullName: string; role: string };

export type StockMovementType =
  | "OPENING_BALANCE"
  | "PURCHASE_RECEIPT"
  | "TREATMENT_USAGE"
  | "MANUAL_ADJUSTMENT"
  | "TRANSFER"
  | "VENDOR_RETURN"
  | "PATIENT_RETURN"
  | "EXPIRY"
  | "DAMAGE"
  | "RECALL"
  | "WASTE"
  | "CORRECTION";

export async function receiveInventoryBatch(tx: Db, input: {
  clinicId: number;
  inventoryItemId: number;
  quantity: number;
  batchNumber?: string | null;
  expiryDate?: Date | null;
  unitCost?: number | null;
  taxPercent?: number | null;
  storageLocation?: string | null;
  actor: LedgerActor;
  sourceType: string;
  sourceId: string;
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  reason?: string;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Receipt quantity must be a positive whole number.");
  const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, clinicId: input.clinicId, active: true, archivedAt: null } });
  if (!item) throw new Error("Inventory item was not found in this clinic.");
  const batchNumber = canonicalBatchNumber(input.batchNumber, item.id);
  const batchKey = { clinicId_inventoryItemId_batchNumber: { clinicId: input.clinicId, inventoryItemId: item.id, batchNumber } };
  let batch = await tx.inventoryBatch.findUnique({ where: batchKey });
  if (batch) {
    assertInventoryBatchReceivable(batch, batchNumber);
    const claim = await tx.inventoryBatch.updateMany({
      where: { id: batch.id, clinicId: input.clinicId, inventoryItemId: item.id, recalledAt: null },
      data: { initialQuantity: { increment: input.quantity }, availableQuantity: { increment: input.quantity }, expiryDate: input.expiryDate || undefined, unitCost: input.unitCost ?? undefined, taxPercent: input.taxPercent ?? undefined, storageLocation: input.storageLocation || undefined, archivedAt: null },
    });
    if (!claim.count) {
      const latest = await tx.inventoryBatch.findUnique({ where: batchKey });
      if (latest) assertInventoryBatchReceivable(latest, batchNumber);
      throw new Error("Batch changed while receiving stock. Review its current status and retry.");
    }
    batch = await tx.inventoryBatch.findUnique({ where: batchKey });
    if (!batch) throw new Error("Batch changed while receiving stock. Review its current status and retry.");
  } else {
    batch = await tx.inventoryBatch.create({
      data: { clinicId: input.clinicId, inventoryItemId: item.id, batchNumber, expiryDate: input.expiryDate || null, initialQuantity: input.quantity, availableQuantity: input.quantity, unitCost: input.unitCost ?? item.costPerUnit, taxPercent: input.taxPercent ?? item.gstPercent, storageLocation: input.storageLocation || item.storageLocation },
    });
  }
  const updated = await tx.inventoryItem.update({ where: { id: item.id }, data: { quantity: { increment: input.quantity }, costPerUnit: input.unitCost ?? undefined, batchNumber, expiryDate: input.expiryDate || undefined, storageLocation: input.storageLocation || undefined } });
  const movement = inventoryReceiptMovement(input.sourceType, input.reason);
  await tx.inventoryMovement.create({ data: { inventoryItemId: item.id, clinicId: input.clinicId, batchId: batch.id, quantityChange: input.quantity, direction: "IN", unit: item.unit, type: movement.type, reason: movement.reason, sourceType: input.sourceType, sourceId: input.sourceId, sourceDocumentType: input.sourceDocumentType, sourceDocumentId: input.sourceDocumentId, storageLocation: input.storageLocation || item.storageLocation, unitCost: input.unitCost ?? item.costPerUnit, actorUserId: input.actor.id, actorRole: input.actor.role, correlationId: randomUUID(), balanceAfter: updated.quantity, recordedBy: input.actor.fullName } });
  return { item: updated, batch };
}

export async function consumeInventoryFefo(tx: Db, input: {
  clinicId: number;
  inventoryItemId: number;
  quantity: number;
  type: Exclude<StockMovementType, "OPENING_BALANCE" | "PURCHASE_RECEIPT">;
  reason: string;
  actor: LedgerActor;
  patientId?: number | null;
  treatmentPlanId?: number | null;
  sourceType?: string | null;
  sourceId?: string | null;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error("Consumption quantity must be a positive whole number.");
  const item = await tx.inventoryItem.findFirst({ where: { id: input.inventoryItemId, clinicId: input.clinicId, active: true, archivedAt: null } });
  if (!item || item.quantity < input.quantity) throw new Error("Insufficient stock. Negative stock is blocked.");
  const expiryCutoff = new Date();
  const batches = selectUsableBatchesFefo(await tx.inventoryBatch.findMany({ where: { clinicId: input.clinicId, inventoryItemId: item.id, availableQuantity: { gt: 0 }, recalledAt: null, archivedAt: null, OR: [{ expiryDate: null }, { expiryDate: { gte: expiryCutoff } }] }, orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }] }), expiryCutoff);
  if (batches.reduce((sum, batch) => sum + batch.availableQuantity, 0) < input.quantity) throw new Error("The batch ledger does not contain enough usable stock.");
  const itemClaim = await tx.inventoryItem.updateMany({ where: { id: item.id, clinicId: input.clinicId, quantity: { gte: input.quantity } }, data: { quantity: { decrement: input.quantity } } });
  if (!itemClaim.count) throw new Error("Stock changed while saving. Review the latest balance and retry.");
  const correlationId = randomUUID();
  let remaining = input.quantity;
  let runningBalance = item.quantity;
  for (const batch of batches) {
    if (!remaining) break;
    const used = Math.min(remaining, batch.availableQuantity);
    const claim = await tx.inventoryBatch.updateMany({ where: { id: batch.id, clinicId: input.clinicId, availableQuantity: { gte: used }, recalledAt: null, archivedAt: null, OR: [{ expiryDate: null }, { expiryDate: { gte: expiryCutoff } }] }, data: { availableQuantity: { decrement: used } } });
    if (!claim.count) throw new Error("A batch changed while saving. Retry to apply FEFO safely.");
    runningBalance -= used;
    await tx.inventoryMovement.create({ data: { inventoryItemId: item.id, clinicId: input.clinicId, batchId: batch.id, quantityChange: -used, direction: "OUT", unit: item.unit, type: input.type, reason: input.reason, patientId: input.patientId || null, treatmentPlanId: input.treatmentPlanId || null, sourceType: input.sourceType || null, sourceId: input.sourceId || null, storageLocation: batch.storageLocation || item.storageLocation, unitCost: batch.unitCost ?? item.costPerUnit, actorUserId: input.actor.id, actorRole: input.actor.role, correlationId, balanceAfter: runningBalance, recordedBy: input.actor.fullName } });
    remaining -= used;
  }
  return { balance: runningBalance, correlationId };
}

export async function reconcileInventoryQuantity(tx: Db, clinicId: number, inventoryItemId: number) {
  const aggregate = await tx.inventoryBatch.aggregate({ where: { clinicId, inventoryItemId, recalledAt: null, archivedAt: null }, _sum: { availableQuantity: true } });
  const quantity = aggregate._sum.availableQuantity || 0;
  await tx.inventoryItem.updateMany({ where: { id: inventoryItemId, clinicId }, data: { quantity } });
  return quantity;
}

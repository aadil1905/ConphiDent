export function canonicalBatchNumber(value: string | null | undefined, itemId: number) {
  const clean = value?.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "-");
  return clean || `UNBATCHED-${itemId}`;
}

type FefoBatch = {
  id: number;
  expiryDate: Date | null;
  receivedAt: Date;
};

type UsableFefoBatch = FefoBatch & {
  availableQuantity: number;
  recalledAt: Date | null;
  archivedAt: Date | null;
};

export function assertInventoryBatchReceivable(batch: { recalledAt: Date | null }, batchNumber: string) {
  if (batch.recalledAt) {
    throw new Error(`Batch ${batchNumber} is recalled and cannot receive additional stock. Use a new batch number.`);
  }
}

export function inventoryReceiptMovement(sourceType: string, reason?: string) {
  if (sourceType === "OPENING") {
    return { type: "OPENING_BALANCE" as const, reason: "Opening stock entered by authorized inventory staff" };
  }
  if (sourceType === "MANUAL_ADJUSTMENT") {
    return { type: "MANUAL_ADJUSTMENT" as const, reason: reason || "Authorized manual stock increase" };
  }
  return { type: "PURCHASE_RECEIPT" as const, reason: "Batch received against purchase order" };
}

export function sortBatchesFefo<T extends FefoBatch>(batches: T[]) {
  return [...batches].sort((left, right) => {
    if (left.expiryDate && right.expiryDate) return left.expiryDate.getTime() - right.expiryDate.getTime() || left.receivedAt.getTime() - right.receivedAt.getTime() || left.id - right.id;
    if (left.expiryDate) return -1;
    if (right.expiryDate) return 1;
    return left.receivedAt.getTime() - right.receivedAt.getTime() || left.id - right.id;
  });
}

export function selectUsableBatchesFefo<T extends UsableFefoBatch>(batches: T[], at = new Date()) {
  const cutoff = at.getTime();
  return sortBatchesFefo(batches.filter((batch) => (
    batch.availableQuantity > 0
    && !batch.recalledAt
    && !batch.archivedAt
    && (!batch.expiryDate || batch.expiryDate.getTime() >= cutoff)
  )));
}

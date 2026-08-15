"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/permissions";
import { consumeInventoryFefo, receiveInventoryBatch, reconcileInventoryQuantity } from "@/lib/inventory-ledger";

const operationsPath = "/dashboard/operations";
const clean = (formData: FormData, name: string) => String(formData.get(name) || "").normalize("NFKC").trim();
const optionalDate = (value: string) => value ? new Date(`${value}T12:00:00.000Z`) : null;
const positiveInt = (value: FormDataEntryValue | null, fallback = 0) => Math.max(fallback, Math.trunc(Number(value) || 0));

function refreshOperations() {
  revalidatePath(operationsPath);
}

export async function addInventoryItemAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const name = clean(formData, "name");
  if (name.length < 2) throw new Error("Enter an inventory item name.");
  const openingQuantity = positiveInt(formData.get("quantity"));
  const existing = await prisma.inventoryItem.findUnique({ where: { clinicId_name: { clinicId: user.clinicId, name } }, select: { id: true } });
  if (existing && openingQuantity) throw new Error("Opening stock can only be entered once. Use an audited adjustment or purchase receipt for an existing item.");
  const expiryDate = optionalDate(clean(formData, "expiryDate"));
  const costPerUnit = positiveInt(formData.get("costPerUnit")) || null;
  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.upsert({
      where: { clinicId_name: { clinicId: user.clinicId, name } },
      create: {
        clinicId: user.clinicId, name, category: clean(formData, "category") || "Clinical supplies", unit: clean(formData, "unit") || "units",
        purchaseUnit: clean(formData, "purchaseUnit") || null, unitConversion: positiveInt(formData.get("unitConversion"), 1), quantity: 0,
        reorderLevel: positiveInt(formData.get("reorderLevel")), reorderQuantity: positiveInt(formData.get("reorderQuantity")) || null,
        leadTimeDays: positiveInt(formData.get("leadTimeDays")) || null, costPerUnit, supplier: clean(formData, "supplier") || null,
        sku: clean(formData, "sku") || null, barcode: clean(formData, "barcode") || null, gtin: clean(formData, "gtin") || null,
        brand: clean(formData, "brand") || null, manufacturer: clean(formData, "manufacturer") || null, storageLocation: clean(formData, "storageLocation") || null,
        gstPercent: positiveInt(formData.get("gstPercent")) || null, batchNumber: clean(formData, "batchNumber") || null, expiryDate,
      },
      update: {
        category: clean(formData, "category") || "Clinical supplies", unit: clean(formData, "unit") || "units", purchaseUnit: clean(formData, "purchaseUnit") || null,
        unitConversion: positiveInt(formData.get("unitConversion"), 1), reorderLevel: positiveInt(formData.get("reorderLevel")), reorderQuantity: positiveInt(formData.get("reorderQuantity")) || null,
        leadTimeDays: positiveInt(formData.get("leadTimeDays")) || null, costPerUnit, supplier: clean(formData, "supplier") || null,
        sku: clean(formData, "sku") || null, barcode: clean(formData, "barcode") || null, gtin: clean(formData, "gtin") || null,
        brand: clean(formData, "brand") || null, manufacturer: clean(formData, "manufacturer") || null, storageLocation: clean(formData, "storageLocation") || null,
        gstPercent: positiveInt(formData.get("gstPercent")) || null, active: true, archivedAt: null,
      },
    });
    if (openingQuantity) await receiveInventoryBatch(tx, { clinicId: user.clinicId, inventoryItemId: item.id, quantity: openingQuantity, batchNumber: clean(formData, "batchNumber"), expiryDate, unitCost: costPerUnit, taxPercent: item.gstPercent, storageLocation: item.storageLocation, actor: user, sourceType: "OPENING", sourceId: `item:${item.id}` });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: existing ? "INVENTORY_ITEM_UPDATED" : "INVENTORY_ITEM_CREATED", entityType: "INVENTORY_ITEM", entityId: String(item.id), outcome: "SUCCESS", source: "OPERATIONS", correlationId: randomUUID(), afterState: { name: item.name, sku: item.sku, unit: item.unit, reorderLevel: item.reorderLevel } } });
  });
  refreshOperations();
}

export async function adjustInventoryAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const id = Number(formData.get("id"));
  const adjustment = Math.trunc(Number(formData.get("adjustment")) || 0);
  const confirmed = formData.get("confirmed") === "1";
  const reason = "Stock adjustment after user confirmation";
  if (!confirmed || !Number.isInteger(id) || adjustment === 0) throw new Error("Enter a non-zero adjustment and confirm the stock change.");
  await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({ where: { id, clinicId: user.clinicId, active: true, archivedAt: null } });
    if (!item) throw new Error("Inventory item not found.");
    if (adjustment > 0) {
      await receiveInventoryBatch(tx, { clinicId: user.clinicId, inventoryItemId: item.id, quantity: adjustment, batchNumber: clean(formData, "batchNumber"), expiryDate: optionalDate(clean(formData, "expiryDate")), actor: user, sourceType: "MANUAL_ADJUSTMENT", sourceId: `adjustment:${randomUUID()}`, reason });
    } else {
      await consumeInventoryFefo(tx, { clinicId: user.clinicId, inventoryItemId: item.id, quantity: Math.abs(adjustment), type: "MANUAL_ADJUSTMENT", reason, actor: user, sourceType: "MANUAL_ADJUSTMENT", sourceId: `adjustment:${randomUUID()}` });
    }
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "INVENTORY_ADJUSTED", entityType: "INVENTORY_ITEM", entityId: String(item.id), reason, source: "OPERATIONS", correlationId: randomUUID(), afterState: { adjustment } } });
  });
  refreshOperations();
}

export async function recordInventoryUsageAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const id = Number(formData.get("id"));
  const quantity = positiveInt(formData.get("quantity"), 1);
  const patientId = Number(formData.get("patientId")) || null;
  const treatmentPlanId = Number(formData.get("treatmentPlanId")) || null;
  const reason = clean(formData, "notes") || "Authorized clinical consumption";
  if (!Number.isInteger(id)) throw new Error("Select an inventory item.");
  if (patientId && !await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true } })) throw new Error("Patient not found in this clinic.");
  if (treatmentPlanId && !patientId) throw new Error("Select the patient linked to this treatment plan.");
  if (treatmentPlanId && !await prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, clinicId: user.clinicId, patientId: patientId || undefined }, select: { id: true } })) throw new Error("Treatment plan not found for this patient.");
  await prisma.$transaction(async (tx) => {
    const result = await consumeInventoryFefo(tx, { clinicId: user.clinicId, inventoryItemId: id, quantity, type: "TREATMENT_USAGE", reason, actor: user, patientId, treatmentPlanId, sourceType: "TREATMENT", sourceId: treatmentPlanId ? String(treatmentPlanId) : null });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId, actorRole: user.role, action: "INVENTORY_CONSUMED", entityType: "INVENTORY_ITEM", entityId: String(id), detail: `${quantity} unit(s) consumed using FEFO`, reason, source: "OPERATIONS", correlationId: result.correlationId } });
  });
  refreshOperations();
}

export async function createPurchaseOrderAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const inventoryItemId = Number(formData.get("inventoryItemId"));
  const quantity = positiveInt(formData.get("quantity"), 1);
  const supplier = clean(formData, "supplier");
  const item = Number.isInteger(inventoryItemId) ? await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, clinicId: user.clinicId, active: true, archivedAt: null }, select: { id: true } }) : null;
  if (!item || supplier.length < 2) throw new Error("Select an item and enter a vendor.");
  const vendor = await prisma.vendor.upsert({ where: { clinicId_name: { clinicId: user.clinicId, name: supplier } }, create: { clinicId: user.clinicId, name: supplier }, update: { active: true } });
  const order = await prisma.purchaseOrder.create({ data: { clinicId: user.clinicId, supplier: vendor.name, vendorId: vendor.id, status: "ORDERED", notes: clean(formData, "notes") || null, expectedDelivery: optionalDate(clean(formData, "expectedDelivery")), createdBy: user.fullName, items: { create: { inventoryItemId, quantity } } } });
  await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "PURCHASE_ORDER_CREATED", entityType: "PURCHASE_ORDER", entityId: String(order.id), source: "OPERATIONS", correlationId: randomUUID(), afterState: { supplier, inventoryItemId, quantity } } });
  refreshOperations();
}

export async function receivePurchaseOrderItemAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const purchaseOrderItemId = Number(formData.get("purchaseOrderItemId"));
  const requested = positiveInt(formData.get("receivedQuantity"), 1);
  if (!Number.isInteger(purchaseOrderItemId)) throw new Error("Select a purchase order line.");
  await prisma.$transaction(async (tx) => {
    const line = await tx.purchaseOrderItem.findFirst({ where: { id: purchaseOrderItemId, purchaseOrder: { clinicId: user.clinicId, status: { notIn: ["CANCELLED", "CLOSED"] } } }, include: { purchaseOrder: true, inventoryItem: true } });
    if (!line) throw new Error("Purchase order line not found.");
    const quantity = Math.min(requested, line.quantity - line.receivedQuantity);
    if (quantity <= 0) throw new Error("This purchase order line is already fully received.");
    const claim = await tx.purchaseOrderItem.updateMany({ where: { id: line.id, receivedQuantity: line.receivedQuantity }, data: { receivedQuantity: { increment: quantity } } });
    if (!claim.count) throw new Error("Receipt changed while saving. Review and retry.");
    await receiveInventoryBatch(tx, { clinicId: user.clinicId, inventoryItemId: line.inventoryItemId, quantity, batchNumber: clean(formData, "batchNumber"), expiryDate: optionalDate(clean(formData, "expiryDate")), unitCost: positiveInt(formData.get("unitCost")) || null, taxPercent: line.inventoryItem.gstPercent, storageLocation: clean(formData, "storageLocation") || line.inventoryItem.storageLocation, actor: user, sourceType: "PURCHASE_ORDER", sourceId: String(line.purchaseOrderId), sourceDocumentType: "PURCHASE_ORDER", sourceDocumentId: String(line.purchaseOrderId) });
    const rows = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: line.purchaseOrderId }, select: { quantity: true, receivedQuantity: true } });
    const allReceived = rows.every((row) => row.receivedQuantity >= row.quantity);
    await tx.purchaseOrder.update({ where: { id: line.purchaseOrderId }, data: { status: allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", receivedAt: allReceived ? new Date() : null } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "PURCHASE_ORDER_RECEIVED", entityType: "PURCHASE_ORDER", entityId: String(line.purchaseOrderId), detail: `${quantity} ${line.inventoryItem.unit} received`, source: "OPERATIONS", correlationId: randomUUID() } });
  });
  refreshOperations();
}

export async function recallInventoryBatchAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const batchId = Number(formData.get("batchId"));
  const confirmed = formData.get("confirmed") === "1";
  const reason = "Batch recalled after user confirmation";
  if (!confirmed || !Number.isInteger(batchId)) throw new Error("Select and confirm the batch recall.");
  await prisma.$transaction(async (tx) => {
    const batch = await tx.inventoryBatch.findFirst({ where: { id: batchId, clinicId: user.clinicId, recalledAt: null }, include: { inventoryItem: true } });
    if (!batch) throw new Error("Active batch not found.");
    await tx.inventoryBatch.update({ where: { id: batch.id }, data: { recalledAt: new Date(), recallReason: reason } });
    await reconcileInventoryQuantity(tx, user.clinicId, batch.inventoryItemId);
    await tx.inventoryMovement.create({ data: { inventoryItemId: batch.inventoryItemId, clinicId: user.clinicId, batchId: batch.id, quantityChange: -batch.availableQuantity, direction: "OUT", unit: batch.inventoryItem.unit, type: "RECALL", reason, sourceType: "BATCH_RECALL", sourceId: String(batch.id), actorUserId: user.id, actorRole: user.role, correlationId: randomUUID(), recordedBy: user.fullName } });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "INVENTORY_BATCH_RECALLED", entityType: "INVENTORY_BATCH", entityId: String(batch.id), reason, source: "OPERATIONS", correlationId: randomUUID(), beforeState: { availableQuantity: batch.availableQuantity }, afterState: { availableQuantity: 0, recalled: true } } });
  });
  refreshOperations();
}

export async function saveConsumptionTemplateAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const name = clean(formData, "templateName");
  const procedureName = clean(formData, "procedureName");
  const inventoryItemId = Number(formData.get("inventoryItemId"));
  const quantity = positiveInt(formData.get("quantity"), 1);
  if (name.length < 3 || procedureName.length < 3 || !Number.isInteger(inventoryItemId)) throw new Error("Enter the template, procedure, stock item, and suggested quantity.");
  const item = await prisma.inventoryItem.findFirst({ where: { id: inventoryItemId, clinicId: user.clinicId, active: true, archivedAt: null }, select: { id: true, unit: true } });
  if (!item) throw new Error("Inventory item not found.");
  const template = await prisma.procedureConsumptionTemplate.upsert({ where: { clinicId_name: { clinicId: user.clinicId, name } }, create: { clinicId: user.clinicId, name, procedureName }, update: { procedureName, active: true } });
  await prisma.procedureConsumptionTemplateItem.upsert({ where: { templateId_inventoryItemId: { templateId: template.id, inventoryItemId: item.id } }, create: { templateId: template.id, inventoryItemId: item.id, quantity, unit: item.unit }, update: { quantity, unit: item.unit } });
  await prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "CONSUMPTION_TEMPLATE_REVIEWED", entityType: "PROCEDURE_CONSUMPTION_TEMPLATE", entityId: String(template.id), source: "OPERATIONS", afterState: { name, procedureName, inventoryItemId, quantity } } });
  refreshOperations();
}

export async function applyConsumptionTemplateAction(formData: FormData) {
  const user = await requirePermission("manageInventory");
  const templateId = Number(formData.get("templateId"));
  const patientId = Number(formData.get("patientId"));
  const treatmentPlanId = Number(formData.get("treatmentPlanId")) || null;
  const reason = "Template consumption after user confirmation";
  const confirmed = formData.get("confirmActualConsumption") === "1";
  if (!confirmed || !Number.isInteger(templateId) || !Number.isInteger(patientId)) throw new Error("Select the template and patient, then confirm actual consumption.");
  if (!await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true } })) throw new Error("Patient not found.");
  if (treatmentPlanId && !await prisma.treatmentPlan.findFirst({ where: { id: treatmentPlanId, clinicId: user.clinicId, patientId }, select: { id: true } })) throw new Error("Treatment plan does not belong to this patient.");
  await prisma.$transaction(async (tx) => {
    const template = await tx.procedureConsumptionTemplate.findFirst({ where: { id: templateId, clinicId: user.clinicId, active: true }, include: { items: true } });
    if (!template?.items.length) throw new Error("Consumption template is empty or inactive.");
    const correlationId = randomUUID();
    for (const item of template.items) await consumeInventoryFefo(tx, { clinicId: user.clinicId, inventoryItemId: item.inventoryItemId, quantity: item.quantity, type: "TREATMENT_USAGE", reason, actor: user, patientId, treatmentPlanId, sourceType: "CONSUMPTION_TEMPLATE", sourceId: String(template.id) });
    await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId, actorRole: user.role, action: "CONSUMPTION_TEMPLATE_CONFIRMED", entityType: "PROCEDURE_CONSUMPTION_TEMPLATE", entityId: String(template.id), detail: `${template.name} applied after staff confirmation`, reason, source: "OPERATIONS", correlationId } });
  });
  refreshOperations();
}

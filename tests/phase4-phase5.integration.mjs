import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { assertInventoryBatchReceivable, canonicalBatchNumber, inventoryReceiptMovement, selectUsableBatchesFefo, sortBatchesFefo } from "../lib/inventory-core.ts";
import { allergySummaryFrom, medicationSummary, patientAge, prescriptionWarnings } from "../lib/prescription-core.ts";
import { canonicalWhatsAppPhone } from "../lib/phone.ts";
import { consumeRateLimit } from "../lib/rate-limit.ts";
import { normalizeWhatsAppWebhook } from "../lib/whatsapp-webhook.ts";

const root = process.cwd();
const source = (path) => readFileSync(`${root}/${path}`, "utf8");
const medicine = (overrides = {}) => ({ genericName: "Amoxicillin", strength: "500 mg", dosageForm: "Tablet", dose: "1", doseUnit: "tablet", route: "Oral", frequency: "Twice daily", duration: "5 days", ...overrides });

test("batch identifiers are canonical and stable", () => assert.equal(canonicalBatchNumber(" lot 42 a ", 7), "LOT-42-A"));
test("missing lot gets a traceable non-empty batch identifier", () => assert.equal(canonicalBatchNumber("", 7), "UNBATCHED-7"));
test("FEFO sorts earlier expiry before later expiry", () => { const rows = sortBatchesFefo([{ id: 2, expiryDate: new Date("2031-01-01"), receivedAt: new Date("2029-01-01") }, { id: 1, expiryDate: new Date("2030-01-01"), receivedAt: new Date("2029-02-01") }]); assert.deepEqual(rows.map((row) => row.id), [1, 2]); });
test("FEFO keeps non-expiring stock behind expiring stock", () => { const rows = sortBatchesFefo([{ id: 1, expiryDate: null, receivedAt: new Date("2028-01-01") }, { id: 2, expiryDate: new Date("2032-01-01"), receivedAt: new Date("2029-01-01") }]); assert.deepEqual(rows.map((row) => row.id), [2, 1]); });
test("FEFO uses receipt order as deterministic tie-break", () => { const expiryDate = new Date("2032-01-01"); const rows = sortBatchesFefo([{ id: 2, expiryDate, receivedAt: new Date("2029-02-01") }, { id: 1, expiryDate, receivedAt: new Date("2029-01-01") }]); assert.deepEqual(rows.map((row) => row.id), [1, 2]); });
test("FEFO excludes expired, recalled, archived, and empty batches", () => {
  const receivedAt = new Date("2029-01-01T00:00:00.000Z");
  const active = { availableQuantity: 2, recalledAt: null, archivedAt: null, receivedAt };
  const rows = selectUsableBatchesFefo([
    { ...active, id: 1, expiryDate: new Date("2030-01-01T09:59:59.999Z") },
    { ...active, id: 2, expiryDate: new Date("2030-01-02T00:00:00.000Z") },
    { ...active, id: 3, expiryDate: null, recalledAt: new Date("2029-12-01T00:00:00.000Z") },
    { ...active, id: 4, expiryDate: null, archivedAt: new Date("2029-12-01T00:00:00.000Z") },
    { ...active, id: 5, expiryDate: null, availableQuantity: 0 },
    { ...active, id: 6, expiryDate: null },
  ], new Date("2030-01-01T10:00:00.000Z"));
  assert.deepEqual(rows.map((row) => row.id), [2, 6]);
});
test("receiving a recalled batch fails with a safe instruction", () => {
  assert.throws(
    () => assertInventoryBatchReceivable({ recalledAt: new Date("2030-01-01T00:00:00.000Z") }, "LOT-42"),
    /recalled.*new batch number/i,
  );
  assert.doesNotThrow(() => assertInventoryBatchReceivable({ recalledAt: null }, "LOT-43"));
});
test("positive manual adjustments retain their audited movement type and reason", () => {
  assert.deepEqual(inventoryReceiptMovement("MANUAL_ADJUSTMENT", "Corrected verified physical count"), {
    type: "MANUAL_ADJUSTMENT",
    reason: "Corrected verified physical count",
  });
});
test("inventory ledger guards expiry at selection and atomic claim and never clears recall", () => {
  const ledger = source("lib/inventory-ledger.ts");
  assert.ok(ledger.match(/expiryDate: \{ gte: expiryCutoff \}/g).length >= 2);
  assert.match(ledger, /assertInventoryBatchReceivable\(batch, batchNumber\)/);
  assert.doesNotMatch(ledger, /recalledAt:\s*null,\s*recallReason:\s*null/);
});
test("patient age respects whether the birthday occurred", () => { assert.equal(patientAge(new Date("2000-08-13"), new Date("2030-08-12")), 29); assert.equal(patientAge(new Date("2000-08-12"), new Date("2030-08-12")), 30); });
test("structured medication summary retains dosing semantics", () => assert.match(medicationSummary([medicine({ mealRelation: "After food" })]), /Amoxicillin 500 mg Tablet — 1 tablet · Oral · Twice daily — After food — 5 days/));
test("duplicate medicine and strength is warned", () => assert.ok(prescriptionWarnings({ items: [medicine(), medicine()] }).some((warning) => warning.includes("duplicate"))));
test("recorded allergy token conflicts are warned", () => assert.ok(prescriptionWarnings({ items: [medicine()], allergies: "Allergic to amoxicillin" }).some((warning) => warning.includes("Allergy conflict"))));
test("a class allergy is caught when the molecule prescribed is not the word on file", () => {
  // The file says "penicillin"; the script says amoxicillin. This is the most
  // common allergy interaction in dentistry and a plain word match misses it.
  const warnings = prescriptionWarnings({ items: [medicine()], allergies: "Penicillin" });
  assert.ok(warnings.some((warning) => warning.includes("Allergy conflict")), "penicillin allergy must flag amoxicillin");
});
test("class allergies are caught however they were written down", () => {
  const cases = [
    ["penicillins", { genericName: "Ampicillin" }],
    ["PCN allergy", { genericName: "Cloxacillin" }],
    ["sulpha drugs", { genericName: "Cotrimoxazole" }],
    ["NSAIDs", { genericName: "Diclofenac" }],
    ["Aspirin", { genericName: "Ibuprofen" }],
    ["lignocaine", { genericName: "Articaine" }],
    ["Metronidazole", { genericName: "Tinidazole" }],
    ["erythromycin", { genericName: "Azithromycin" }],
  ];
  for (const [allergies, override] of cases) {
    const warnings = prescriptionWarnings({ items: [medicine(override)], allergies });
    assert.ok(warnings.some((w) => w.includes("requires review")), `${allergies} -> ${override.genericName} must warn`);
  }
});
test("an allergy on an older note still counts when today's note left the field blank", () => {
  // Newest first, and whoever wrote today's note did not fill the field in.
  const records = [{ drugAllergies: null }, { drugAllergies: "Penicillin" }, { drugAllergies: "" }];
  const allergies = allergySummaryFrom(records, null);
  assert.ok(allergies?.includes("Penicillin"));
  assert.ok(prescriptionWarnings({ items: [medicine()], allergies }).some((w) => w.includes("requires review")));
});
test("a patient with nothing recorded anywhere produces no allergy text", () => {
  assert.equal(allergySummaryFrom([{ drugAllergies: null }, { drugAllergies: "  " }], null), null);
  assert.equal(allergySummaryFrom([], ""), null);
});
test("penicillin allergy flags cephalosporins as a possible cross-reaction", () => {
  const warnings = prescriptionWarnings({ items: [medicine({ genericName: "Cephalexin" })], allergies: "Penicillin" });
  assert.ok(warnings.some((warning) => warning.includes("cross-react")));
});
test("an unrelated medicine does not warn, so the acknowledgement still means something", () => {
  for (const genericName of ["Metronidazole", "Paracetamol"]) {
    assert.deepEqual(prescriptionWarnings({ items: [medicine({ genericName })], allergies: "Penicillin" }), []);
  }
  assert.deepEqual(prescriptionWarnings({ items: [medicine()], allergies: "Nil known" }), []);
  assert.deepEqual(prescriptionWarnings({ items: [medicine()], allergies: "" }), []);
});
test("paediatric age produces dose review caution", () => assert.ok(prescriptionWarnings({ items: [medicine()], age: 7 }).some((warning) => warning.includes("Paediatric"))));
test("older adult age produces medication review caution", () => assert.ok(prescriptionWarnings({ items: [medicine()], age: 70 }).some((warning) => warning.includes("Older adult"))));
test("PRN medicine without maximum is warned", () => assert.ok(prescriptionWarnings({ items: [medicine({ asNeeded: true })] }).some((warning) => warning.includes("maximum"))));
test("prescription allergy lookups read the patient's intake answers deterministically", () => {
  // This asserted "current FINAL clinical records" until the notes feature was
  // removed. The requirement it encoded outlived the source it named: the
  // allergy that goes onto a prescription must come from one place, in one
  // fixed order, so two prescriptions written a second apart cannot disagree.
  // That place is now the patient's own intake answers.
  const prescriptionSurfaces = [
    "app/api/prescriptions/route.ts",
    "app/api/prescriptions/[id]/route.ts",
    "app/dashboard/prescriptions/new/page.tsx",
    "app/dashboard/prescriptions/[id]/edit/page.tsx",
  ];
  for (const path of prescriptionSurfaces) {
    const contents = source(path);
    assert.match(contents, /intakeRequests:\s*\{\s*where:\s*\{\s*drugAllergies:\s*\{\s*not:\s*null\s*\}\s*\}/);
    assert.match(contents, /orderBy:\s*\[\s*\{\s*completedAt:\s*"desc"\s*\},\s*\{\s*id:\s*"desc"\s*\}\s*\]/);
    assert.doesNotMatch(contents, /clinicalRecord/i);
  }
});
test("Indian mobile numbers normalize to WhatsApp E.164 digits", () => assert.equal(canonicalWhatsAppPhone("98765 43210"), "919876543210"));
test("invalid WhatsApp numbers are rejected", () => assert.equal(canonicalWhatsAppPhone("123"), null));
test("rate limiter permits the bounded window and then rejects", () => { const key = `test-${Date.now()}`; assert.equal(consumeRateLimit(key, 2, 60_000, 1).allowed, true); assert.equal(consumeRateLimit(key, 2, 60_000, 2).allowed, true); assert.equal(consumeRateLimit(key, 2, 60_000, 3).allowed, false); });
test("webhook normalizer retains every entry, message, and status", () => { const events = normalizeWhatsAppWebhook({ entry: [{ changes: [{ value: { metadata: { phone_number_id: "one" }, messages: [{ id: "m1" }, { id: "m2" }] } }] }, { changes: [{ value: { metadata: { phone_number_id: "two" }, statuses: [{ id: "m3", status: "delivered" }] } }] }] }); assert.equal(events.length, 2); assert.equal(events.flatMap((event) => event.messages).length, 2); assert.equal(events.flatMap((event) => event.statuses).length, 1); });
test("imaging picker does not expose a browse list before search", () => { const picker = source("components/imaging/PatientSearchSelect.tsx"); assert.match(picker, /query\.trim\(\)\.length >= 2/); assert.doesNotMatch(picker, /initialOptions/); });
// Phase B folded /xrays into Patient 360, and the profile later became one
// vertical page: every former tab renders as an anchored section, so the
// X-rays live in the always-present Files section and the old route's
// ?tab=Files link scrolls to it.
test("Patient 360 carries the patient's X-rays in its Files section", () => {
  const page = source("app/dashboard/patients/[id]/page.tsx");
  assert.match(page, /imagingStudy\.findMany/);
  assert.match(page, /id="Files"/);
  assert.match(page, /ScrollToSection/);
  assert.match(source("app/dashboard/patients/[id]/xrays/page.tsx"), /tab=Files/);
});
test("production schedules durable WhatsApp workers", () => { const vercel = JSON.parse(source("vercel.json")); assert.deepEqual(vercel.crons.map((cron) => cron.path).sort(), ["/api/cron/booking-reminders", "/api/cron/follow-ups", "/api/cron/whatsapp-outbox", "/api/cron/whatsapp-outbox/inbox"]); });
test("disconnected WhatsApp connections cannot send outbound", () => assert.match(source("lib/whatsapp.ts"), /disconnectedAt: null/));
test("secure document messages are atomic, patient-consented, encrypted, and idempotent", () => { const delivery = source("lib/secure-whatsapp.ts"); assert.match(delivery, /idempotencyKey = `\$\{input\.sourceType\.toLowerCase\(\)\}:/); assert.match(delivery, /patientId: input\.patientId, phone/); assert.match(delivery, /secureDocumentAccess\.updateMany/); assert.match(delivery, /dispatchPayloadCiphertext: encryptSecureDispatchPayload/); assert.match(delivery, /TransactionIsolationLevel\.Serializable/); assert.doesNotMatch(delivery, /content: content/); });
test("same-bucket secure resend rotates the revoked link and encrypted payload", () => {
  const delivery = source("lib/secure-whatsapp.ts");
  const existingStart = delivery.indexOf("if (existing) {");
  const newDeliveryStart = delivery.indexOf("if (needsConsentGrant) {", existingStart + 1);
  const existingBranch = delivery.slice(existingStart, newDeliveryStart);
  assert.ok(existingStart >= 0 && newDeliveryStart > existingStart);
  assert.match(existingBranch, /secureDocumentAccess\.updateMany/);
  assert.match(existingBranch, /createSecureDocumentLink/);
  assert.match(existingBranch, /dispatchPayloadCiphertext: encryptSecureDispatchPayload/);
  for (const resetField of ["lastAttemptAt: null", "sentAt: null", "providerMessageId: null", "cancelledAt: null"]) assert.match(existingBranch, new RegExp(resetField));
  assert.match(existingBranch, /may already have succeeded/i);
});
test("sensitive WhatsApp outbox delivery rechecks current consent and service window", () => { const worker = source("lib/scheduled-whatsapp.ts"); assert.match(worker, /latestConsent\?\.status !== "GRANTED"/); assert.match(worker, /serviceWindowOpen/); assert.match(worker, /sendTemplateMessage/); });
test("secure bearer payload is redacted after delivery and uncertain outcomes never auto-retry", () => { const worker = source("lib/scheduled-whatsapp.ts"); const provider = source("lib/whatsapp.ts"); assert.match(worker, /dispatchPayloadCiphertext: null/); assert.match(worker, /WhatsAppDeliveryUncertainError/); assert.match(provider, /automatic resend is blocked/); assert.doesNotMatch(provider, /for \(let attempt/); });
test("all inventory mutations require inventory permission", () => { const actions = source("app/dashboard/operations/actions.ts"); assert.doesNotMatch(actions, /requireUser\(/); assert.ok(actions.match(/requirePermission\("manageInventory"\)/g).length >= 8); });
test("AUDITOR role is read-only and receives audit/export access", () => { const permissions = source("lib/permissions.ts"); assert.match(permissions, /"AUDITOR"/); assert.match(permissions, /viewAudit: \["OWNER", "ADMINISTRATOR", "AUDITOR"\]/); assert.doesNotMatch(permissions, /manageClinical: \[[^\]]*AUDITOR/); });
test("Phase 4 schema includes governed clinical and financial records", () => { const schema = source("prisma/schema.prisma"); for (const model of ["InventoryBatch", "InventoryCycleCount", "PrescriptionItem", "PrescriptionTemplate", "InvoiceLineItem", "WhatsAppWebhookEvent", "WhatsAppConsentEvent", "SecureDocumentAccess"]) assert.match(schema, new RegExp(`model ${model}`)); });
test("webhook processing uses an inbox and iterates every normalized message", () => { const webhook = source("app/api/webhook/route.ts"); const inbox = source("lib/whatsapp-webhook-inbox.ts"); assert.match(webhook, /for \(const \{ event, clinicId, phoneNumberId \} of routedEvents\)/); assert.match(webhook, /for \(const wrapper of event\.messages\)/); assert.match(webhook, /persistWhatsAppMessageWebhookEvent/); assert.match(inbox, /whatsAppWebhookEvent\.upsert/); });

const testUrl = process.env.TEST_DATABASE_URL;
function safeTestUrl(value) { if (!value) return false; try { const url = new URL(value); return url.protocol.startsWith("postgres") && /test/i.test(url.pathname) && url.username !== "user" && url.password !== "password"; } catch { return false; } }
const databaseEnabled = safeTestUrl(testUrl);
const prisma = databaseEnabled ? new PrismaClient({ datasourceUrl: testUrl }) : null;
const prefix = `phase45-${Date.now()}`;
let clinic; let otherClinic; let user; let patient; let item;

before(async () => { if (!prisma) return; clinic = await prisma.clinic.create({ data: { name: prefix, slug: prefix } }); otherClinic = await prisma.clinic.create({ data: { name: `${prefix}-other`, slug: `${prefix}-other` } }); user = await prisma.user.create({ data: { clinicId: clinic.id, fullName: "Phase 4 Dentist", email: `${prefix}@example.test`, passwordHash: "test-only", role: "DENTIST" } }); patient = await prisma.patient.create({ data: { clinicId: clinic.id, fullName: "Phase 4 Patient", phone: `8${String(Date.now()).slice(-9)}`, dateOfBirth: new Date("1990-01-01") } }); item = await prisma.inventoryItem.create({ data: { clinicId: clinic.id, name: `${prefix}-gloves`, quantity: 8, unit: "pieces" } }); });
after(async () => { if (!prisma) return; await prisma.secureDocumentAccess.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.scheduledWhatsAppMessage.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.invoiceLineItem.deleteMany({ where: { invoice: { clinicId: { in: [clinic.id, otherClinic.id] } } } }); await prisma.payment.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.invoice.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.prescriptionItem.deleteMany({ where: { prescription: { clinicId: { in: [clinic.id, otherClinic.id] } } } }); await prisma.prescription.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.inventoryMovement.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.inventoryBatch.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.inventoryItem.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.patient.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.user.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } }); await prisma.clinic.deleteMany({ where: { id: { in: [clinic.id, otherClinic.id] } } }); await prisma.$disconnect(); });

test("inventory batch queries remain tenant scoped", { skip: !databaseEnabled }, async () => { const batch = await prisma.inventoryBatch.create({ data: { clinicId: clinic.id, inventoryItemId: item.id, batchNumber: `${prefix}-lot`, initialQuantity: 8, availableQuantity: 8 } }); assert.equal(await prisma.inventoryBatch.findFirst({ where: { id: batch.id, clinicId: otherClinic.id } }), null); });
test("atomic negative-stock guard rejects an excessive decrement", { skip: !databaseEnabled }, async () => { const claim = await prisma.inventoryItem.updateMany({ where: { id: item.id, clinicId: clinic.id, quantity: { gte: 9 } }, data: { quantity: { decrement: 9 } } }); assert.equal(claim.count, 0); assert.equal((await prisma.inventoryItem.findUnique({ where: { id: item.id } })).quantity, 8); });
test("structured prescription graph is retained and tenant isolated", { skip: !databaseEnabled }, async () => { const prescription = await prisma.prescription.create({ data: { clinicId: clinic.id, patientId: patient.id, authorId: user.id, medicines: medicationSummary([medicine()]), status: "ISSUED", signedAt: new Date(), medicationItems: { create: { ...medicine(), sortOrder: 0 } } }, include: { medicationItems: true } }); assert.equal(prescription.medicationItems.length, 1); assert.equal(await prisma.prescription.findFirst({ where: { id: prescription.id, clinicId: otherClinic.id } }), null); });
test("billing document persists immutable snapshot and exact line graph", { skip: !databaseEnabled }, async () => { const invoice = await prisma.invoice.create({ data: { clinicId: clinic.id, patientId: patient.id, invoiceNumber: `${prefix}-INV`, documentType: "TAX_INVOICE", subtotalAmount: 1000, taxAmount: 180, totalAmount: 1180, finalizedAt: new Date(), immutableSnapshot: { totalAmount: 1180 }, lineItems: { create: { description: "Clinical service", quantity: 1, unitPrice: 1000, taxPercent: 18, lineTotal: 1180 } } }, include: { lineItems: true } }); assert.equal(invoice.lineItems[0].lineTotal, 1180); assert.equal(invoice.immutableSnapshot.totalAmount, 1180); });
test("outbox idempotency prevents duplicate clinical delivery", { skip: !databaseEnabled }, async () => { const key = `${prefix}-delivery`; await prisma.scheduledWhatsAppMessage.create({ data: { clinicId: clinic.id, phone: "919999999999", content: "secure link", scheduledAt: new Date(), idempotencyKey: key } }); await assert.rejects(() => prisma.scheduledWhatsAppMessage.create({ data: { clinicId: clinic.id, phone: "919999999999", content: "duplicate", scheduledAt: new Date(), idempotencyKey: key } }), (error) => error?.code === "P2002"); });
test("secure document token cannot cross tenant ownership", { skip: !databaseEnabled }, async () => { const invoice = await prisma.invoice.findFirst({ where: { clinicId: clinic.id, invoiceNumber: `${prefix}-INV` } }); const access = await prisma.secureDocumentAccess.create({ data: { clinicId: clinic.id, patientId: patient.id, documentType: "INVOICE", documentId: invoice.id, tokenHash: `${prefix}-hash`, expiresAt: new Date(Date.now()+60_000) } }); assert.equal(await prisma.secureDocumentAccess.findFirst({ where: { id: access.id, clinicId: otherClinic.id } }), null); });

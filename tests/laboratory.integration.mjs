import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allowedLabTransitions, canTransitionLabCase, labDelayThreatensAppointment, labOrderIssues, sniffLabAttachment } from "../lib/laboratory-core.ts";
import { decryptLabPortalToken, encryptLabPortalToken, generateLabPortalToken, hashLabPortalToken, labAttachmentAccessSignature, validLabAttachmentAccessSignature } from "../lib/laboratory-access-core.ts";

test("clinic and laboratory state machines reject backward and terminal transitions", () => {
  assert.equal(canTransitionLabCase("DRAFT", "APPROVED", "CLINIC"), true);
  assert.equal(canTransitionLabCase("DRAFT", "ACCEPTED", "LAB"), false);
  assert.equal(canTransitionLabCase("VIEWED", "ACCEPTED", "LAB"), true);
  assert.equal(canTransitionLabCase("ACCEPTED", "DRAFT", "CLINIC"), false);
  assert.equal(canTransitionLabCase("COMPLETED", "REWORK", "CLINIC"), false);
  assert.deepEqual(allowedLabTransitions("READY", "LAB"), ["DISPATCHED"]);
  assert.equal(canTransitionLabCase("STAGE_REVIEW", "READY", "LAB"), false);
  assert.equal(canTransitionLabCase("STAGE_REVIEW", "IN_PRODUCTION", "CLINIC"), true);
});

test("approval readiness requires clinical responsibility and a tooth or appliance scope", () => {
  const base = { caseType: "Crown", laboratoryId: 1, dueDate: new Date(), material: "Zirconia", treatingDoctor: "Dr Test" };
  assert.match(labOrderIssues({ ...base }).join(" "), /tooth numbers|scope/i);
  assert.deepEqual(labOrderIssues({ ...base, teeth: "11" }), []);
  assert.deepEqual(labOrderIssues({ ...base, anatomicalScope: "Full upper denture" }), []);
});

test("appointment risk closes only after clinically meaningful delivery states", () => {
  const now = new Date("2026-08-11T08:00:00.000Z");
  const soon = new Date("2026-08-12T08:00:00.000Z");
  assert.equal(labDelayThreatensAppointment({ status: "IN_PRODUCTION", appointmentAt: soon, now }), true);
  assert.equal(labDelayThreatensAppointment({ status: "READY", appointmentAt: soon, now }), false);
  assert.equal(labDelayThreatensAppointment({ status: "IN_PRODUCTION", requiredAt: new Date("2026-08-10T08:00:00.000Z"), now }), true);
});

test("portal tokens are high entropy, stored hashed, and recoverable only with authenticated encryption", () => {
  const secret = "test-only-secret-that-is-at-least-thirty-two-characters";
  const token = generateLabPortalToken();
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.match(hashLabPortalToken(token), /^[a-f0-9]{64}$/);
  const encrypted = encryptLabPortalToken(secret, token);
  assert.notEqual(encrypted.includes(token), true);
  assert.equal(decryptLabPortalToken(secret, encrypted), token);
  assert.throws(() => decryptLabPortalToken(`${secret}-wrong`, encrypted));
});

test("resource signatures bind file, portal/clinic scope, and short expiry", () => {
  const secret = "test-only-secret-that-is-at-least-thirty-two-characters";
  const now = 1_700_000_000;
  const expires = now + 300;
  const supplied = labAttachmentAccessSignature(secret, "file-1", "portal:access-1", expires);
  assert.equal(validLabAttachmentAccessSignature({ secret, attachmentId: "file-1", scope: "portal:access-1", expires, supplied, now }), true);
  assert.equal(validLabAttachmentAccessSignature({ secret, attachmentId: "file-1", scope: "portal:access-2", expires, supplied, now }), false);
  assert.equal(validLabAttachmentAccessSignature({ secret, attachmentId: "file-2", scope: "portal:access-1", expires, supplied, now }), false);
  assert.equal(validLabAttachmentAccessSignature({ secret, attachmentId: "file-1", scope: "portal:access-1", expires, supplied, now: expires }), false);
});

test("attachment validation uses bytes, not filename claims", () => {
  assert.deepEqual(sniffLabAttachment(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), "scan.exe"), { contentType: "image/jpeg", extension: "jpg" });
  assert.equal(sniffLabAttachment(new TextEncoder().encode("not an image"), "photo.jpg"), null);
  assert.deepEqual(sniffLabAttachment(new TextEncoder().encode("solid test\nfacet normal 0 0 0\nendsolid"), "model.stl"), { contentType: "model/stl", extension: "stl" });
});

test("critical lab routes enforce tenant or token scope and avoid patient identity in the portal", () => {
  const root = process.cwd();
  const upload = readFileSync(resolve(root, "app/api/laboratory/cases/[caseId]/attachments/route.ts"), "utf8");
  const attachment = readFileSync(resolve(root, "app/api/laboratory/attachments/[attachmentId]/route.ts"), "utf8");
  const imaging = readFileSync(resolve(root, "app/api/laboratory/imaging/[assetId]/route.ts"), "utf8");
  const portal = readFileSync(resolve(root, "app/lab/cases/[token]/page.tsx"), "utf8");
  assert.match(upload, /clinicId = user\.clinicId/);
  assert.match(upload, /resolveLabPortalAccess/);
  assert.match(attachment, /verifyLabAttachmentPath/);
  assert.match(imaging, /labCaseLinks/);
  assert.doesNotMatch(portal, /patient\.fullName|patient\.phone|dateOfBirth/);
  assert.match(portal, /patientSafeIdentifier/);
});

test("delivery, portal view, approval, and rework paths are idempotent or concurrency-claimed", () => {
  const actions = readFileSync(resolve(process.cwd(), "app/dashboard/laboratory/actions.ts"), "utf8");
  const portal = readFileSync(resolve(process.cwd(), "lib/laboratory-portal.ts"), "utf8");
  assert.match(actions, /idempotencyKey/);
  assert.match(actions, /updateMany\(\{ where: \{ id: labCase\.id, clinicId: user\.clinicId, status: labCase\.status/);
  assert.match(actions, /TransactionIsolationLevel\.Serializable/);
  assert.match(actions, /scheduledWhatsAppMessage\.create/);
  assert.match(actions, /No patient name or contact details are included/);
  assert.match(portal, /lastViewedAt: null/);
  assert.match(portal, /lab-viewed:\$\{access\.id\}/);
});

test("phase 3 migration is additive and contains governed lab records", () => {
  const migration = readFileSync(resolve(process.cwd(), "prisma/migrations/20260811235900_phase3_laboratory_core/migration.sql"), "utf8");
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
  for (const name of ["LabPortalAccess", "LabCaseMessage", "LabCaseAttachment", "LabCaseImagingStudy", "LabDeliveryAttempt"]) assert.match(migration, new RegExp(`CREATE TABLE "${name}"`));
  assert.match(migration, /patientSafeIdentifier/);
  assert.match(migration, /LabDeliveryAttempt_idempotencyKey_key/);
  assert.match(migration, /LabDeliveryAttempt_whatsappOutboxId_key/);
});

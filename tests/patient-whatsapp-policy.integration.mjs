import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  followUpWhatsAppPurpose,
  patientSafeFollowUpMessage,
  patientWhatsAppCanQueue,
  patientWhatsAppIdempotencyKey,
} from "../lib/patient-whatsapp-policy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (file) => readFileSync(path.join(root, file), "utf8");

test("patient policy fails closed on missing identity, mismatch, opt-out, and withdrawal", () => {
  const valid = { patientExists: true, phoneMatches: true, conversationOptedOut: false, latestConsentStatus: "GRANTED", consentConfirmed: false };
  assert.equal(patientWhatsAppCanQueue(valid), true);
  assert.equal(patientWhatsAppCanQueue({ ...valid, patientExists: false }), false);
  assert.equal(patientWhatsAppCanQueue({ ...valid, phoneMatches: false }), false);
  assert.equal(patientWhatsAppCanQueue({ ...valid, conversationOptedOut: true }), false);
  assert.equal(patientWhatsAppCanQueue({ ...valid, latestConsentStatus: "WITHDRAWN", consentConfirmed: true }), false);
  assert.equal(patientWhatsAppCanQueue({ ...valid, latestConsentStatus: null, consentConfirmed: false }), false);
  assert.equal(patientWhatsAppCanQueue({ ...valid, latestConsentStatus: null, consentConfirmed: true }), true);
});

test("patient idempotency keys are tenant-bound and validated", () => {
  assert.equal(patientWhatsAppIdempotencyKey(7, "appointment:42:abc12345"), "patient-whatsapp:7:appointment:42:abc12345");
  assert.throws(() => patientWhatsAppIdempotencyKey(0, "appointment:42:abc12345"));
  assert.throws(() => patientWhatsAppIdempotencyKey(7, "short"));
});

test("follow-up purpose mapping and copy avoid financial and clinical detail", () => {
  assert.equal(followUpWhatsAppPurpose("PAYMENT_FOLLOW_UP"), "BILLING_COMMUNICATION");
  assert.equal(followUpWhatsAppPurpose("LABORATORY_FOLLOW_UP"), "LABORATORY_COMMUNICATION");
  assert.equal(followUpWhatsAppPurpose("TREATMENT_FOLLOW_UP"), "CLINICAL_FOLLOW_UP");
  assert.equal(followUpWhatsAppPurpose("RECALL_FOLLOW_UP"), "APPOINTMENT_COMMUNICATION");
  assert.doesNotMatch(patientSafeFollowUpMessage("PAYMENT_FOLLOW_UP", "Patient", "Clinic"), /₹|balance|invoice/i);
  assert.doesNotMatch(patientSafeFollowUpMessage("TREATMENT_FOLLOW_UP", "Patient", "Clinic"), /diagnos|procedure|treatment plan/i);
});

test("named patient-facing paths use the governed queue, never raw transport", () => {
  const targets = ["app/api/whatsapp/send/route.ts", "app/api/patient-intake/route.ts", "app/api/appointments/[id]/self-service/route.ts", "app/api/appointments/[id]/reminder/route.ts", "app/dashboard/follow-ups/actions.ts"];
  for (const file of targets) {
    const value = source(file);
    assert.match(value, /queuePatientWhatsAppMessage/);
    assert.doesNotMatch(value, /sendTextMessage|sendTemplateMessage/);
  }
  assert.match(source("app/api/whatsapp/send/route.ts"), /requireApiFeature\("whatsapp", "sendWhatsApp"\)/);
  assert.match(source("app/dashboard/follow-ups/actions.ts"), /requirePermission\("sendWhatsApp"\)/);
});

test("worker rechecks governed consent and preserves unknown outcomes", () => {
  const worker = source("lib/scheduled-whatsapp.ts");
  assert.match(worker, /isPatientWhatsAppPurpose\(item\.purpose\)/);
  assert.match(worker, /acceptedConsentPurposes\(item\.purpose\)/);
  assert.match(worker, /providerAccepted \|\| error instanceof WhatsAppDeliveryUncertainError/);
  assert.match(worker, /status: exhausted \? "DEAD_LETTER" : "SCHEDULED"/);
});

test("bearer-link flows encrypt payloads and request redacted outbox content", () => {
  assert.match(source("lib/patient-whatsapp.ts"), /encryptSecureDispatchPayload/);
  for (const file of ["app/api/patient-intake/route.ts", "app/api/appointments/[id]/self-service/route.ts", "app/api/appointments/[id]/reminder/route.ts"]) assert.match(source(file), /redactContent: true/);
});

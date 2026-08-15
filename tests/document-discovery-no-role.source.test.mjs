import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("the patient document surface is tenant scoped and not blocked by an old clinic role", async () => {
  const page = await read("app/dashboard/patients/[id]/page.tsx");
  const administrativeSurface = page.slice(
    page.indexOf("if (!canViewClinical)"),
    page.indexOf("const patient = await prisma.patient.findFirst"),
  );

  assert.match(page, /const features = await getFeatureEntitlements\(user\.clinicId\)/);
  assert.match(administrativeSurface, /clinicId: user\.clinicId/);
  assert.match(administrativeSurface, /features\.clinical/);
  assert.match(administrativeSurface, /features\.billing/);
  assert.doesNotMatch(administrativeSurface, /redirect\(/);
  assert.doesNotMatch(administrativeSurface, /canManageBilling|"manageBilling"|"issuePrescription"/);
});

test("prescription and invoice controls remain discoverable behind feature entitlements only", async () => {
  const page = await read("app/dashboard/patients/[id]/page.tsx");

  assert.match(page, /dashboard\/prescriptions\/new\?patientId=/);
  assert.match(page, /dashboard\/prescriptions\/\$\{prescription\.id\}\/edit/);
  assert.match(page, /dashboard\/prescriptions\/\$\{prescription\.id\}\/print/);
  assert.match(page, /SendPrescriptionWhatsAppButton prescriptionId=\{prescription\.id\}/);
  assert.match(page, /dashboard\/billing\/new\?patientId=/);
  assert.match(page, /dashboard\/billing\/\$\{invoice\.id\}\/print/);
  assert.match(page, /SendInvoiceWhatsAppButton invoiceId=\{invoice\.id\}/);
  assert.match(page, /features\.whatsapp \? <SendPrescriptionWhatsAppButton/);
  assert.match(page, /features\.whatsapp \? <SendInvoiceWhatsAppButton/);
});

test("global invoice and prescription search is feature-gated instead of role-gated", async () => {
  const page = await read("app/dashboard/search/page.tsx");

  assert.match(page, /hasFeature\(user\.clinicId, "billing"\)/);
  assert.match(page, /hasFeature\(user\.clinicId, "clinical"\)/);
  assert.match(page, /billing: billingEnabled/);
  assert.match(page, /prescriptions: prescriptionsEnabled/);
  assert.match(page, /allowed\.prescriptions \? prisma\.prescription\.findMany/);
  assert.match(page, /clinicId: user\.clinicId/);
  assert.doesNotMatch(page, /billing: can\(user\.role, "manageBilling"\)/);
  assert.doesNotMatch(page, /allowed\.clinical \? prisma\.prescription\.findMany/);
});

test("issuing a prescription lands on the document that was just created", async () => {
  const form = await read("components/clinical/PrescriptionForm.tsx");
  assert.match(form, /router\.push\(`\/dashboard\/prescriptions\/\$\{body\.id\}\/print`\)/);
  assert.doesNotMatch(form, /router\.push\(`\/dashboard`\)/);
});

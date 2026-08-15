import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { formatPatientAgeSnapshot } from "../lib/prescription-core.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("prescription age snapshots render canonical and legacy records once", () => {
  assert.equal(formatPatientAgeSnapshot("34"), "34 years");
  assert.equal(formatPatientAgeSnapshot("34 years"), "34 years");
  assert.equal(formatPatientAgeSnapshot("1 year"), "1 year");
  assert.equal(formatPatientAgeSnapshot(null), null);
});

test("prescription issuance requires the signed-in practitioner's registration", async () => {
  const [tenant, createRoute, updateRoute, profile, newPage] = await Promise.all([
    read("lib/tenant.ts"),
    read("app/api/prescriptions/route.ts"),
    read("app/api/prescriptions/[id]/route.ts"),
    read("app/dashboard/prescriptions/profile/page.tsx"),
    read("app/dashboard/prescriptions/new/page.tsx"),
  ]);
  assert.match(tenant, /!result\.user\.registrationNumber\?\.trim\(\)/);
  assert.doesNotMatch(tenant, /!result\.user\.clinic\.registrationNumber\?\.trim\(\)/);
  assert.match(createRoute, /providerRegistrationSnapshot: user\.registrationNumber!\.trim\(\)/);
  assert.match(updateRoute, /providerRegistrationSnapshot: user\.registrationNumber!\.trim\(\)/);
  assert.doesNotMatch(createRoute + updateRoute, /providerRegistrationSnapshot:[^\n]*clinic\.registrationNumber/);
  assert.match(profile, /defaultValue=\{user\.registrationNumber \?\? ""\}/);
  assert.doesNotMatch(profile, /clinicFallback/);
  assert.match(newPage, /prescriberReady=\{Boolean\(user\.fullName\.trim\(\) && user\.registrationNumber\?\.trim\(\)\)\}/);
});

test("clinical document workflow is role-neutral and feature-aware", async () => {
  const source = (await Promise.all([
    "app/dashboard/prescriptions/new/page.tsx",
    "app/dashboard/prescriptions/[id]/edit/page.tsx",
    "app/dashboard/prescriptions/[id]/print/page.tsx",
    "app/dashboard/prescriptions/templates/page.tsx",
    "app/dashboard/prescriptions/profile/page.tsx",
    "app/dashboard/prescriptions/profile/actions.ts",
    "app/api/prescriptions/route.ts",
    "app/api/prescriptions/[id]/route.ts",
    "app/api/prescription-templates/route.ts",
    "app/api/prescription-templates/[id]/route.ts",
  ].map(read))).join("\n");
  assert.doesNotMatch(source, /require(?:Api)?Permission\(/);
  assert.match(source, /requireFeature\("clinical"\)/);
  assert.match(source, /requireApiFeature\("clinical"\)/);
  assert.match(source, /requireApiClinicalSigner\("issuePrescription"\)/);
});

test("secure document send requires source entitlement and WhatsApp", async () => {
  const [prescriptionSend, invoiceSend] = await Promise.all([
    read("app/api/prescriptions/[id]/send-whatsapp/route.ts"),
    read("app/api/invoices/[id]/send-whatsapp/route.ts"),
  ]);
  assert.match(prescriptionSend, /requireApiFeatures\(\["clinical", "whatsapp"\]\)/);
  assert.match(invoiceSend, /requireApiFeatures\(\["billing", "whatsapp"\]\)/);
});

test("billing workflow is role-neutral and feature-aware", async () => {
  const source = (await Promise.all([
    "app/dashboard/billing/page.tsx",
    "app/dashboard/billing/new/page.tsx",
    "app/dashboard/billing/[id]/page.tsx",
    "app/dashboard/billing/[id]/print/page.tsx",
    "app/dashboard/billing/[id]/actions.ts",
    "app/dashboard/settings/billing/page.tsx",
    "app/api/invoices/route.ts",
    "app/api/invoices/[id]/payments/route.ts",
  ].map(read))).join("\n");
  assert.doesNotMatch(source, /require(?:Api)?Permission\(/);
  assert.match(source, /requireFeature\("billing"\)/);
  assert.match(source, /requireApiFeature\("billing"\)/);
});

test("immutable billing documents keep their issued accent color", async () => {
  const source = await read("lib/billing-document.ts");
  assert.match(source, /accentColor: frozen \? text\(snapshotClinic\?\.accentColor, "#0e7490"\)!/);
});

test("paid invoices explain why voiding is blocked", async () => {
  const [page, actions] = await Promise.all([
    read("app/dashboard/billing/page.tsx"),
    read("app/dashboard/delete-actions.ts"),
  ]);
  assert.match(page, /Reverse posted payments before voiding/);
  assert.match(actions, /reverse-payments-before-void/);
  assert.match(actions, /requireFeature\("billing"\)/);
});

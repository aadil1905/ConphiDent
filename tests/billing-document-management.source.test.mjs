import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  nextInvoiceNumber,
  normalizeInvoicePrefix,
} from "../lib/invoice-number.ts";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("invoice prefixes are normalized for safe document numbers", () => {
  assert.equal(normalizeInvoicePrefix(" ddw clinic! "), "DDWCLINIC");
  assert.equal(normalizeInvoicePrefix(""), "INV");
  assert.equal(normalizeInvoicePrefix(undefined), "INV");
});

test("invoice sequences are tenant-prefix specific and support legacy padding", () => {
  assert.equal(
    nextInvoiceNumber("DDW", ["DDW-01", "DDW-000009", "OTHER-999999"]),
    "DDW-000010",
  );
  assert.equal(nextInvoiceNumber("SMILE", []), "SMILE-000001");
  assert.equal(
    nextInvoiceNumber("A.B", ["AB-000003", "A.B-999999"]),
    "AB-000004",
  );
});

test("invoice creation owns numbering and freezes the complete clinic identity", async () => {
  const route = await read("app/api/invoices/route.ts");
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /nextInvoiceNumber\(/);
  assert.doesNotMatch(route, /data\.invoiceNumber\.trim/);
  for (const field of [
    "accentColor",
    "invoiceFooter",
    "paymentDetails",
    "invoicePrefix",
    "receiptPrefix",
    "timezone",
  ]) {
    assert.match(route, new RegExp(`${field}: clinic\\.${field}`));
  }
});

test("authenticated clinic users can manage future billing-document identity", async () => {
  const [page, actions] = await Promise.all([
    read("app/dashboard/settings/billing/page.tsx"),
    read("app/dashboard/settings/actions.ts"),
  ]);
  for (const field of [
    "invoicePrefix",
    "receiptPrefix",
    "paymentDetails",
    "invoiceFooter",
  ]) {
    assert.match(page, new RegExp(`name="${field}"`));
    assert.match(actions, new RegExp(field));
  }
  const billingAction = actions.match(/export async function updateBillingIdentityAction[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(page, /requireFeature\("billing"\)/);
  assert.match(billingAction, /requireFeature\("billing"\)/);
  assert.doesNotMatch(billingAction, /requireOwner\(\)/);
});

test("billing workflow has no role-based authorization gates", async () => {
  const files = await Promise.all([
    "app/api/invoices/route.ts",
    "app/api/invoices/[id]/payments/route.ts",
    "app/api/invoices/[id]/send-whatsapp/route.ts",
    "app/dashboard/billing/page.tsx",
    "app/dashboard/billing/new/page.tsx",
    "app/dashboard/billing/[id]/page.tsx",
    "app/dashboard/billing/[id]/actions.ts",
  ].map(read));
  const source = files.join("\n");
  assert.doesNotMatch(source, /require(?:Api)?Permission\(/);
  assert.doesNotMatch(source, /"manageBilling"|"recordPayment"/);
  assert.match(source, /requireApiFeature\("billing"\)/);
  assert.match(source, /requireFeature\("billing"\)/);
  assert.match(source, /requireApiFeatures\(\["billing", "whatsapp"\]\)/);
});

test("billing navigation is visible without a role permission", async () => {
  const sidebar = await read("components/Sidebar.tsx");
  assert.match(sidebar, /href: "\/dashboard\/billing", label: "Revenue", icon: ReceiptIndianRupee, feature: "billing" }/);
  assert.match(sidebar, /href: "\/dashboard\/settings\/billing", label: "Billing settings"/);
  assert.doesNotMatch(sidebar, /href: "\/dashboard\/billing"[^\n]*permission: "manageBilling"/);
});

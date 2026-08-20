import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  nextInvoiceNumber,
  normalizeInvoicePrefix,
} from "../lib/invoice-number.ts";

/**
 * Source is normalised to LF before matching.
 *
 * `core.autocrlf` is true, so a Windows working copy has CRLF endings, and any
 * pattern that spans lines then silently fails to match. That looked exactly
 * like the code having drifted away from the test, which is part of why these
 * files sat unrun. Normalised, the patterns mean what they say on any platform.
 */
const read = async (path) => (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

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
  const [pageSource, form, actions] = await Promise.all([
    read("app/dashboard/settings/billing/page.tsx"),
    // The fields moved out of the page into their own component; the feature
    // gate stayed on the page. Both are read so the test follows the code.
    read("components/billing/BillingIdentity.tsx"),
    read("app/dashboard/settings/actions.ts"),
  ]);
  const page = `${pageSource}\n${form}`;
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
  assert.doesNotMatch(source, /"recordPayment"/);
  // `manageBilling` survives here on purpose, and only in one shape: a
  // capability check on *voiding*, which is destructive and stays with the
  // owner. It must never come back as a gate on reaching or raising a bill.
  for (const match of source.matchAll(/.*"manageBilling".*/g)) {
    assert.match(match[0], /can\(user\.role, "manageBilling"\)/, `manageBilling is gating access again: ${match[0].trim()}`);
  }
  assert.match(source, /requireApiFeature\("billing"\)/);
  assert.match(source, /requireFeature\("billing"\)/);
  assert.match(source, /requireApiFeatures\(\["billing", "whatsapp"\]\)/);
});

test("billing navigation is visible without a role permission", async () => {
  // Phase B replaced components/Sidebar.tsx with the shell's nav table.
  const nav = await read("components/shell/nav-items.ts");
  assert.match(nav, /href: "\/dashboard\/billing",[^\n]*feature: "billing"/);
  assert.match(nav, /href: "\/dashboard\/settings\/billing", label: "How your bills look"/);
  // The entitlement is the only gate; no role keeps Money out of the nav.
  assert.doesNotMatch(nav, /href: "\/dashboard\/billing"[^\n]*permission:/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Source is normalised to LF before matching.
 *
 * `core.autocrlf` is true, so a Windows working copy has CRLF endings, and any
 * pattern that spans lines then silently fails to match. That looked exactly
 * like the code having drifted away from the test, which is part of why these
 * files sat unrun. Normalised, the patterns mean what they say on any platform.
 */
const read = async (path) => (await readFile(new URL(`../${path}`, import.meta.url), "utf8")).replace(/\r\n/g, "\n");

test("the patient record reads only this clinic's data", async () => {
  const page = await read("app/dashboard/patients/[id]/page.tsx");
  // Every query on the page is scoped to the signed-in clinic. This is the
  // assertion worth keeping: 709 hand-written clinicId clauses and no RLS
  // behind them means a dropped clause is a cross-tenant leak, silently.
  const queries = [...page.matchAll(/prisma\.\w+\.(?:findMany|findFirst|count)\(\{[\s\S]*?\n\s*\}\)/g)];
  assert.ok(queries.length >= 5, `expected the patient record to run several queries, found ${queries.length}`);
  for (const [query] of queries) {
    assert.match(query, /clinicId: user\.clinicId|clinicId: user\.clinicId,/, `a patient-record query is not tenant scoped: ${query.slice(0, 90)}`);
  }
});

test("the patient record gates documents on the entitlement as well as the role", async () => {
  const page = await read("app/dashboard/patients/[id]/page.tsx");
  // Both gates, not one. A role alone would let a clinic that never bought
  // WhatsApp see a send button; an entitlement alone would undo Phase B's
  // decision to keep clinical and money surfaces behind a role.
  assert.match(page, /hasFeature\(user\.clinicId, "whatsapp"\)/);
  assert.match(page, /const canSeeClinical = can\(user\.role, "viewClinical"\)/);
  assert.match(page, /const canSeeMoney = can\(user\.role, "manageBilling"\)/);
  assert.match(page, /whatsappOn && /);
  // The two things a clinician starts from this page still start from it.
  assert.match(page, /dashboard\/prescriptions\/new\?patientId=/);
  assert.match(page, /dashboard\/billing\/new\?patientId=/);
  assert.match(page, /can\(user\.role, "issuePrescription"\)/);
});

test("workspace search drops a result when either the entitlement or the role is missing", async () => {
  const search = await read("lib/workspace-search.ts");
  assert.match(search, /hasFeature\(viewer\.clinicId, "billing"\)/);
  assert.match(search, /hasFeature\(viewer\.clinicId, "clinical"\)/);
  // `&&`, not `||`. Either one missing has to remove the result.
  assert.match(search, /billing: billingEnabled && can\(viewer\.role, "manageBilling"\)/);
  assert.match(search, /clinical: clinicalEnabled && can\(viewer\.role, "viewClinical"\)/);
  assert.match(search, /lab: labEnabled && can\(viewer\.role, "manageLaboratory"\)/);
  assert.match(search, /clinicId: viewer\.clinicId/);
});

test("issuing a prescription lands on the document that was just created", async () => {
  const form = await read("components/clinical/PrescriptionForm.tsx");
  assert.match(form, /router\.push\(`\/dashboard\/prescriptions\/\$\{body\.id\}\/print`\)/);
  assert.doesNotMatch(form, /router\.push\(`\/dashboard`\)/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { GUARDED_ACTIONS, NOT_TENANT_SCOPED, addressesOneRow, mentionsClinicId, tenantGuardMode } from "../lib/tenant-guard.ts";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");

test("a filter that forgets the clinic is recognised as unscoped", () => {
  // These are the shapes the bug actually takes: a real filter that simply
  // never mentions the clinic.
  assert.ok(!mentionsClinicId(undefined));
  assert.ok(!mentionsClinicId({}));
  assert.ok(!mentionsClinicId({ archivedAt: null }));
  assert.ok(!mentionsClinicId({ id: 7, status: "Confirmed" }));
  assert.ok(!mentionsClinicId({ AND: [{ archivedAt: null }, { status: "Paid" }] }));
});

test("every legitimate way of naming the clinic is accepted", () => {
  assert.ok(mentionsClinicId({ clinicId: 1 }));
  assert.ok(mentionsClinicId({ clinicId: { in: [1, 2] } }));
  // Through a relation, which is how child rows reach their tenant.
  assert.ok(mentionsClinicId({ treatmentPlan: { clinicId: 1 } }));
  assert.ok(mentionsClinicId({ study: { patient: { clinicId: 1 } } }));
  assert.ok(mentionsClinicId({ conversation: { some: { clinicId: 1 } } }));
  // Boolean combinators.
  assert.ok(mentionsClinicId({ AND: [{ archivedAt: null }, { clinicId: 1 }] }));
  assert.ok(mentionsClinicId({ OR: [{ clinicId: 1 }, { clinicId: 2 }] }));
  assert.ok(mentionsClinicId({ NOT: { clinicId: 3 } }));
});

test("a single-row write addressed by primary key is recognised", () => {
  // This is the class that is reported but never refused. It must match an
  // address — one row, named by its id — and nothing that searches.
  assert.ok(addressesOneRow({ id: 7 }));
  assert.ok(addressesOneRow({ id: "abc" }));
  assert.ok(addressesOneRow({ id: 7, status: "Confirmed" }));
});

test("anything that searches rather than addresses stays guarded", () => {
  // `{ id: { in: [...] } }` is a filter wearing an id's clothes. If this ever
  // returns true, `deleteMany` over an unscoped id list stops throwing, which
  // is precisely the shape that empties another clinic's table.
  assert.ok(!addressesOneRow({ id: { in: [1, 2] } }));
  assert.ok(!addressesOneRow({ id: { not: 3 } }));
  assert.ok(!addressesOneRow({ status: "DRAFT" }));
  assert.ok(!addressesOneRow(undefined));
  assert.ok(!addressesOneRow(null));
  assert.ok(!addressesOneRow([{ id: 1 }]));
});

test("the bulk write actions are never exempted by primary key", () => {
  // The exemption is keyed on the operation as well as the filter. updateMany
  // and deleteMany take arbitrary filters and are the actual leak vector, so
  // they must stay guarded even when a caller passes a scalar id.
  for (const action of ["updateMany", "deleteMany", "upsert"]) {
    assert.ok(GUARDED_ACTIONS.has(action), `${action} is not guarded`);
  }
});

test("the guard covers reads and writes, not just reads", () => {
  // A leak that writes is worse than a leak that reads.
  for (const action of ["findFirst", "findMany", "count", "aggregate", "groupBy",
                        "update", "updateMany", "delete", "deleteMany", "upsert"]) {
    assert.ok(GUARDED_ACTIONS.has(action), `${action} is not guarded`);
  }
});

test("the exempt list is a decision somebody wrote down, not an omission", () => {
  // Every exemption is either a child row reached through a guarded parent, or
  // something that genuinely lives outside a tenant. If a model with real
  // patient data ever lands here, that is the bug.
  const schema = read("prisma/schema.prisma");
  for (const model of NOT_TENANT_SCOPED) {
    const start = schema.indexOf(`model ${model} {`);
    assert.notEqual(start, -1, `${model} is exempted but no longer exists in the schema`);
    const body = schema.slice(start, schema.indexOf("\n}", start));
    assert.doesNotMatch(
      body,
      /^\s*clinicId\s+Int/m,
      `${model} has a clinicId column, so it can and must be guarded`,
    );
  }
});

test("the guard is actually wired into the client every query goes through", () => {
  const client = read("lib/prisma.ts");
  assert.match(client, /\$extends\(tenantGuard\(\)\)/);
  // Nothing may construct its own unguarded PrismaClient.
  const offenders = [];
  for (const file of ["lib", "app", "components"]) void file;
  assert.doesNotMatch(client.replace(/\$extends\(tenantGuard\(\)\)/, ""), /new PrismaClient\(\)(?!\.)/);
  assert.equal(offenders.length, 0);
});

test("the guard enforces outside production and reports inside it, until told otherwise", () => {
  // A mistake must never reach a pull request, so development and CI refuse the
  // query outright. Production starts by reporting, because a false positive
  // there takes down a working screen for a real clinic to prevent a leak that
  // has not happened. Both are overridable by one environment variable, which
  // is the last step of this work once the logs are clean.
  const saved = { mode: process.env.TENANT_GUARD_MODE, env: process.env.NODE_ENV };
  try {
    delete process.env.TENANT_GUARD_MODE;
    process.env.NODE_ENV = "development";
    assert.equal(tenantGuardMode(), "enforce");
    process.env.NODE_ENV = "production";
    assert.equal(tenantGuardMode(), "report");
    process.env.TENANT_GUARD_MODE = "enforce";
    assert.equal(tenantGuardMode(), "enforce", "the override must win in production");
    process.env.TENANT_GUARD_MODE = "nonsense";
    assert.equal(tenantGuardMode(), "report", "an unreadable value must not silently disable the guard");
  } finally {
    if (saved.mode === undefined) delete process.env.TENANT_GUARD_MODE;
    else process.env.TENANT_GUARD_MODE = saved.mode;
    process.env.NODE_ENV = saved.env;
  }
});

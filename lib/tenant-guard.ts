/**
 * The backstop behind 709 hand-written `clinicId:` clauses.
 *
 * Tenancy in this codebase is enforced by remembering to write
 * `clinicId: user.clinicId` into every query. It is written out by hand in
 * hundreds of places, and there was nothing underneath it: forget one clause on
 * one query and that screen quietly serves another clinic's patients. Nothing
 * fails, nothing logs, and the page looks completely normal.
 *
 * This extension turns that silent leak into a loud error. Before any read or
 * write on a tenant-scoped model, it checks that the filter mentions `clinicId`
 * somewhere — directly, through a relation (`{ treatmentPlan: { clinicId } }`),
 * or inside an `AND`/`OR`/`NOT`. If it does not, the query throws instead of
 * returning rows.
 *
 * **It deliberately does not inject the clause itself.** Injecting would need a
 * request-scoped tenant threaded through every path including background jobs
 * and webhooks, and a wrong guess there would write one clinic's data under
 * another's id — a worse failure than the one being fixed. Refusing to run an
 * unscoped query is the conservative half, and it is the half that catches the
 * mistake people actually make.
 *
 * Four ways out, all explicit:
 *
 *  - Models with no `clinicId` column are not tenant-scoped and are skipped.
 *    Child rows (`InvoiceLineItem`, `PrescriptionItem`, …) reach tenancy through
 *    their parent, which is itself guarded.
 *  - `findUnique`/`findUniqueOrThrow` by primary key are allowed, because the
 *    caller cannot express a `clinicId` in a unique filter. Those call sites
 *    must still check ownership on the row they get back.
 *  - `update`/`delete` addressed by primary key are reported but never refused,
 *    for the same reason and at real cost if they were — see SINGLE_ROW_WRITES.
 *    They log as `tenant.unverified-row-write`, which is a backlog to work
 *    through, not an incident.
 *  - Platform administration genuinely works across clinics. It says so with
 *    `crossTenant()`, which is greppable, rather than by omission.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { Prisma } from "@prisma/client";

/** Raised instead of returning rows from an unscoped query. */
export class MissingTenantScopeError extends Error {
  constructor(model: string, action: string) {
    super(
      `${model}.${action} ran without a clinicId filter. Every query on a tenant-scoped `
      + `model must be scoped to one clinic, directly or through a relation. If this query `
      + `is genuinely meant to cross clinics, wrap it in crossTenant() from lib/tenant-guard.`,
    );
    this.name = "MissingTenantScopeError";
  }
}

/**
 * Models with no `clinicId` column of their own. Kept as an explicit list rather
 * than read from the schema at runtime, so adding a tenant-scoped model without
 * a `clinicId` is a decision somebody has to write down here.
 */
export const NOT_TENANT_SCOPED = new Set([
  // Child rows, reached and guarded through their parent.
  "InvoiceLineItem", "TreatmentPlanItem", "TreatmentPlanTooth", "PrescriptionItem",
  "ClinicLocationHours", "ClinicLocationProvider", "ClinicLocationService",
  "LeadActivity", "WhatsAppMessage", "WhatsAppBooking", "InventoryCycleCountLine",
  "ProcedureConsumptionTemplateItem", "PurchaseOrderItem",
  // The tenant itself, and things that exist above or outside any tenant.
  "Clinic", "SubscriptionPlan", "DemoRequest", "PlatformProvisioningDraft",
  "PlatformAnnouncement",
  // Authentication, which has to work before a clinic is known.
  "AuthChallenge", "SecurityRateLimit", "Session", "PasswordResetToken",
]);

/** Operations that read or write rows and therefore need a scope. */
export const GUARDED_ACTIONS = new Set([
  "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy",
  "update", "updateMany", "delete", "deleteMany", "upsert",
]);

/**
 * `findUnique` is exempt: a unique filter cannot carry a `clinicId` unless the
 * model happens to have a composite unique on it. Callers that use it must
 * check the clinic on the row they get back — several already do.
 */
const UNIQUE_ACTIONS = new Set(["findUnique", "findUniqueOrThrow"]);

/**
 * Single-row writes addressed by primary key. Reported, never refused.
 *
 * The same argument that exempts `findUnique` applies to `update` and `delete`
 * by `id`, and it was not carried across. The cost was not theoretical: 57 call
 * sites across 28 files write this way, roughly 47 of them on tenant-scoped
 * models, and every one threw under `enforce`. That is sign-in, invoice void,
 * payment receipting, appointment status, patient archive, prescription and
 * treatment-plan cancellation, lab cases, inventory and the scheduled-WhatsApp
 * dispatcher — i.e. most of the product's write paths.
 *
 * Refusing them is also worse than it looks, because several callers wrap the
 * write in `try/catch` and report "your connection dropped". Enforcing would
 * degrade the clinic behind a misleading error rather than failing loudly.
 *
 * So this class never throws, in either mode, and always reports. The signal
 * that lets these be worked through one by one survives; the clinic keeps
 * working while that happens. Nearly all of them already load the row with a
 * `clinicId` filter and bail before writing, which the guard cannot see.
 *
 * `updateMany` and `deleteMany` are deliberately NOT here: they take arbitrary
 * filters and are the shape that actually leaks across clinics. Nor is
 * `upsert`, which can create a row rather than address an existing one.
 */
const SINGLE_ROW_WRITES = new Set(["update", "delete"]);

/** True when this filter addresses one row by primary key rather than searching. */
export function addressesOneRow(where: unknown): boolean {
  if (!where || typeof where !== "object" || Array.isArray(where)) return false;
  const id = (where as Record<string, unknown>).id;
  // `{ id: { in: [...] } }` is a search, not an address.
  return (typeof id === "number" || typeof id === "string" || typeof id === "bigint");
}

/** True when `clinicId` appears anywhere in this filter, at any depth. */
export function mentionsClinicId(where: unknown, depth = 0): boolean {
  if (!where || typeof where !== "object" || depth > 6) return false;
  if (Array.isArray(where)) return where.some((entry) => mentionsClinicId(entry, depth + 1));
  for (const [key, value] of Object.entries(where as Record<string, unknown>)) {
    if (key === "clinicId") return true;
    // AND / OR / NOT, and relation filters such as { treatmentPlan: { clinicId } }
    // or { some: { clinicId } }, all nest the real condition one level down.
    if (value && typeof value === "object" && mentionsClinicId(value, depth + 1)) return true;
  }
  return false;
}

/**
 * Request-scoped, and it has to be.
 *
 * A module-level flag would lift the guard for *every* query in flight while a
 * platform admin's request ran — including an ordinary clinic request being
 * served concurrently in the same process. That would turn a safety net into an
 * intermittent hole that only opens under load, which is worse than no net at
 * all. `AsyncLocalStorage` scopes the lift to one async call tree.
 */
const crossTenantScope = new AsyncLocalStorage<true>();

/**
 * Runs `work` with the guard lifted, for the places that genuinely span clinics:
 * platform administration, provisioning, and the cron sweeps that fan out over
 * every clinic before scoping to each one.
 *
 * A deliberate marker to grep for. `crossTenant(` should be rare, and every hit
 * should sit somewhere a platform administrator is already authenticated or a
 * cron secret has already been checked.
 */
export function crossTenant<T>(work: () => Promise<T>): Promise<T> {
  return crossTenantScope.run(true, work);
}

/**
 * Lifts the guard for the rest of *this* request, without wrapping anything.
 *
 * Platform administration is cross-tenant by definition — it exists to look at
 * every clinic — and it is spread over a few dozen queries across many files.
 * Wrapping each one would mean the guard's correctness depended on nobody
 * forgetting, which is the exact failure this whole file exists to remove.
 *
 * So it is lifted once, at the authentication boundary
 * (`requirePlatformAdmin`), after the caller has been proven to be a platform
 * administrator and before any query runs. `enterWith` binds the store to the
 * current async context and everything it goes on to await, so it reaches the
 * whole request and nothing outside it. A clinic request being served
 * concurrently in the same process is unaffected.
 */
export function allowCrossTenantForThisRequest() {
  crossTenantScope.enterWith(true);
}

/**
 * `enforce` refuses the query. `report` lets it run and logs it loudly.
 *
 * Enforcing everywhere from the first deploy would be the wrong trade. This
 * guard is new, it sits in front of every query in a 48,000-line application,
 * and the paths hardest to exercise beforehand — platform administration, the
 * cron sweeps, the WhatsApp webhook — are exactly the ones that legitimately
 * cross clinics. A false positive there takes down a working screen for a real
 * clinic, to fix a leak that has not actually happened yet.
 *
 * So: `report` in production until the logs come back clean, `enforce`
 * everywhere else so a mistake cannot reach a pull request. Reporting is not a
 * placebo — an unscoped query goes to `reportError`, which means the webhook,
 * which means somebody knows within seconds. The silence was the whole problem.
 *
 * Flip it with `TENANT_GUARD_MODE=enforce` once a week of traffic has produced
 * no `tenant.unscoped-query` events. That is one environment variable, no
 * deploy of code, and it is the last step of this piece of work.
 *
 * That advice was unreachable as originally written, and this is the correction.
 * `update`/`delete` by primary key used to raise `tenant.unscoped-query` too,
 * from ~47 legitimate call sites, so the "no events" condition could never be
 * met and flipping the flag anyway would have broken sign-in on the first
 * request. Those now report as `tenant.unverified-row-write` and never throw,
 * so `tenant.unscoped-query` means what the sentence above assumes it means:
 * a query that genuinely names no clinic, which is a bug.
 *
 * Watch `tenant.unverified-row-write` separately. It is not an incident — it is
 * the list of single-row writes whose ownership check the guard cannot see. Most
 * already load the row with a `clinicId` filter first; any that do not are a
 * real cross-tenant write waiting to happen, and that is the backlog.
 */
export type TenantGuardMode = "enforce" | "report";

export function tenantGuardMode(): TenantGuardMode {
  const configured = process.env.TENANT_GUARD_MODE;
  if (configured === "enforce" || configured === "report") return configured;
  return process.env.NODE_ENV === "production" ? "report" : "enforce";
}

export function tenantGuard() {
  return Prisma.defineExtension({
    name: "tenant-guard",
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ model, operation, args, query }: any) {
          if (
            !crossTenantScope.getStore()
            && model
            && !NOT_TENANT_SCOPED.has(model)
            && !UNIQUE_ACTIONS.has(operation)
            && GUARDED_ACTIONS.has(operation)
            && !mentionsClinicId(args?.where)
            // An upsert with no `where` match still writes `create`, which
            // carries the clinic on the row itself.
            && !(operation === "upsert" && mentionsClinicId(args?.create))
          ) {
            // A single-row write addressed by primary key is reported in both
            // modes and refused in neither — see SINGLE_ROW_WRITES above for
            // why. It gets its own event name so the two can be told apart in
            // the logs: one is a backlog to work through, the other is a bug.
            const byPrimaryKey =
              SINGLE_ROW_WRITES.has(operation) && addressesOneRow(args?.where);

            if (!byPrimaryKey && tenantGuardMode() === "enforce") {
              throw new MissingTenantScopeError(model, operation);
            }
            // Deliberately not `reportError`: that module is server-only and
            // importing it here would drag the guard into places this file has
            // to stay loadable from. Same JSON shape, same log stream.
            console.error(JSON.stringify({
              event: byPrimaryKey ? "tenant.unverified-row-write" : "tenant.unscoped-query",
              at: new Date().toISOString(),
              model,
              operation,
              stack: new Error().stack?.split("\n").slice(2, 7).join("\n"),
            }));
          }
          return query(args);
        },
      },
    },
  });
}

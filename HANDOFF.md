# Handoff — where to pick up

Branch `phase-b-redesign`. `npm run verify` (18 steps, 161 tests) and
`npm run build` both exit 0.

**Deployed to production on 2026-08-17** (`dpl_C536R6TVN3RPn7Bnhs1R38BjnjAo`).
Verified live: `/api/health` returns `ok` with a 294ms database round-trip,
which is the proof the tenant guard is in the query path and not blocking; all
nine marketing routes and `/login` return 200.

`TENANT_GUARD_MODE` is **unset in production**, so the guard is in `report`
mode — an unscoped query still runs and is logged rather than refused. That was
the intended first deploy. Setting it to `enforce` is the remaining step.

**One migration is written and deliberately NOT applied**, and it destroys data:
`CLINICAL_RECORD_REMOVAL_MIGRATION.sql` in the repository root. Read it before
you go near it — the header explains what leaves with the table.

Read these first, in this order. They hold the reasoning, not just the state:

1. `CLINICAL_AUDIT.md` — Run 0, with the measured baselines every later run is scored against
2. `CLINICAL_MIGRATION_PROPOSAL.md` — the schema change, drafted and deliberately **not** in `prisma/migrations/`
3. `DESIGN_ROADMAP.md` — why the workspace read lighter than the site, and what was done about it

---

## Do not do these without the owner present

- **Apply the migration or the backfill.** The backfill writes *inferred* clinical
  data — whether a legacy crown was *found* in place or *placed* that day — into
  real patient records. The dentist has to agree that mapping. A backup must be
  taken and verified first. Note that `vercel-build` runs `prisma migrate deploy`,
  so a file placed in `prisma/migrations/` applies itself on the next deploy;
  moving the proposal there is the act of approving it.
- **Test chart Undo.** Real write to the production Supabase.
- **Send a prescription on WhatsApp.** Real message to a real patient.
- **Deploy.** Production ships via `vercel deploy` from the working folder and git
  sits behind the live database.

---

## Done since the last handoff

All six were verified against the running app with real clinic data, not only by
tests. New coverage lives in `tests/chart-and-concurrency.integration.mjs`
(`test:chart-concurrency`) and in the six revived `tests/*.source.test.mjs`
(`test:source`), both inside `npm run verify`.

### 1. The chart split — three readers fixed, not two

> Two of the three files below were deleted in section 7. The rule they follow
> still binds `app/api/imaging/comparison-options/route.ts` and anything added
> later, which is why this stays written down.

The rules now live in `lib/dental-chart-core.ts` (pure, tested) with the queries
in `lib/dental-chart.ts`. Nothing else should re-derive them.

- `app/dashboard/clinical-records/[id]/page.tsx` — was "Not tooth-specific" on
  charted visits; now reads both tables.
- `app/api/imaging/comparison-options/route.ts` — legacy procedures are now
  reported. They **cannot be linked**: `ImagingComparison.completedFindingId` is
  a foreign key to `DentalFinding`, so a legacy row has nowhere to point until
  the backfill runs or a second column exists. They appear greyed under
  "Recorded before treatments could be linked", with a line saying to name them
  in the note instead. That is the honest ceiling, not a half-fix.
- **A third reader the last handoff missed**: the notes list
  (`app/dashboard/clinical-records/page.tsx`) showed `—` in the TEETH column for
  a note titled "Tooth 21 - Root canal". It now merges both tables in **one**
  extra query for the whole page (`chartedTeethForVisits`), not one per row.

Known and documented in the module: two notes written on one visit both show
that visit's whole tooth list. A legacy row says nothing about which note it
belonged to, so that is the most the data supports. The backfill is what would
make it finer.

### 2. Appointment concurrency guard — `updatedAt` does not exist

The last handoff said "the model already carries `updatedAt`". **It does not** —
`Appointment` has `createdAt` only, so the suggested fix needed a migration, and
a migration here applies itself on the next deploy.

Instead `appointmentRevision()` in `lib/appointment-revision.ts` derives a token
from the ten editable field values. The edit page sends it, `PATCH
/api/appointments/[id]` recomputes it inside the transaction and returns **409
`STALE_APPOINTMENT`** if it has moved. No schema change, and a save re-writing
identical values is correctly not a conflict.

Verified live: a PATCH with a wrong revision returned 409 and wrote nothing.

The form deliberately does **not** refresh behind the user on a 409. The fields
on screen are still their version, so a silent reload would leave them looking
at the other person's appointment through their own form and saving over it
anyway. The message asks them to reload, which discards their copy.

A request that sends no token is still accepted — it is a collision guard, not a
permission check.

### 3. `"SIGNED"` was a status nothing has ever written

> Overtaken by section 7: the screens and `lib/clinical-record-status.ts` are
> gone with the feature. Kept because the *shape* of the bug is the thing worth
> remembering, and because it is why the removal was a smaller job than it
> looked — most of what these screens showed was already wrong.

Found while chasing the intake gap, and much wider than it. Every writer sets
`DRAFT` → `FINAL`, with `SUPERSEDED` and `ENTERED_IN_ERROR`. Six read sites
compared against `"SIGNED"`, so:

- every signed note in the clinic reported itself as an unsigned draft,
- the notes list's "Signed" filter returned nothing,
- the CSV export's Signed column always said "Not signed",
- the workspace's per-patient badge always said "Note not signed".

Nothing failed loudly, because a string comparison that is never true reads as a
tidy `else`. The vocabulary is now in `lib/clinical-record-status.ts` and nothing
spells a status by hand; a test asserts that.

Confirmed live: the notes archive went from 45 notes all "Unsigned" to
"45 notes on file · 1 still unsigned".

### 4. Intake allergies — the mechanism, and a decision left for the owner

Intake **is** capturing allergies. `app/api/public-intake/[token]/route.ts`
writes `drugAllergies` into a `ClinicalRecord` marked `PATIENT_INTAKE` and left
`DRAFT` until the clinic reviews it. So the reason nothing fires is not that
nobody fills the fields — it is what reads them.

`patientSafety()` now distinguishes provenance, and `SafetyBanner` says
"As the patient reported it at intake. Nobody at the clinic has confirmed it
yet." under a red banner whose allergies come only from an unreviewed intake.

**This decision was overtaken by the removal in section 7** — there are no notes
left to filter, and allergies now come from the intake for both the snapshot and
the banner. Kept for the reasoning, which still applies if the question returns.

The four prescription surfaces filtered allergies to `status: "FINAL"`, and
`tests/phase4-phase5.integration.mjs` asserts it deliberately ("only use current
FINAL clinical records deterministically"). That means a patient who types
"penicillin" into the intake link has it dropped before `prescriptionWarnings`
ever sees it. I widened it, the test caught me, and **I reverted** — the string
is written onto the prescription as `allergySnapshot`, which is a legal record,
and sourcing that from an unreviewed patient form is the dentist's call, not
mine.

What I did instead, which changes no stored record: the **banner** on
`/dashboard/prescriptions/new` reads wider than the snapshot beside it, so the
reported allergy is on screen before anybody prescribes, labelled unconfirmed.

The owner has to decide whether the *warning* should also fire on it. My view:
the warning is a prompt, not a claim, and missing it is the more dangerous
failure — but the snapshot and the warning are fed by one variable today, so
splitting them is the work that decision implies.

### 5. List rows are tappable, and why they were not

`ListLink` in `components/lists/DataList.tsx`, applied to all seven lists. A row
went from a ~20px-tall link inside a 73px row to ~82% of the row width; the rest
is cells holding their own controls, marked `interactive` so they stay their own
targets. Measured in the browser, not assumed.

**The reason every previous attempt would have failed silently**: a global rule
in `globals.css` gave every dashboard link `transform: translateZ(0)`. A
transformed element is a containing block for its absolutely positioned
descendants, so a stretched-link overlay collapses back to the width of the
text — it *looks* applied and does nothing. Row links now carry `data-row-link`
and are excluded from that rule. Anything that tries this again needs to know.

### 6. The six dead test files now run, and one of them was right

`tests/*.source.test.mjs` were run by no npm script. They are now
`npm run test:source`, inside `npm run verify` — 42 assertions.

**Six of the thirteen failures were not drift at all.** `core.autocrlf` is true,
so a Windows working copy has CRLF endings, and every pattern written with `
`
or spanning lines with `[\s\S]*?` silently failed to match. That is
indistinguishable from the code having moved, which is a large part of why
nobody wanted to touch these files. Each one now normalises to LF on read, with
a comment saying why.

**One caught a real regression.** `deleteInvoiceAction` refuses to void an
invoice with posted payments and redirects to
`/dashboard/billing?error=reverse-payments-before-void`. The Phase B rewrite of
that page dropped the code that read the parameter, so the refusal was correct
and completely silent: the dialog closed, the invoice stayed, nothing said why.
The page answers it again, and the test now asserts both halves — either alone
is useless. Verified on screen.

The rest were genuinely stale and are retargeted at the intent that still holds,
each with a comment saying what changed. Two are worth knowing about:

- **The booking form's assertion was inverted.** It required the copy "No future
  configured slots for this date". Booking deliberately stopped dead-ending —
  a day with no configured slots falls back to a free-text time. The test now
  asserts the fallback, so the dead end cannot come back.
- **A policy was abandoned without the test noticing.**
  `document-discovery-no-role.source.test.mjs` was written against "documents
  are discoverable behind feature entitlements only, never a role". The patient
  record and `lib/workspace-search.ts` now gate on **both** the entitlement and
  the viewer's role. I retargeted the file to assert what is true, because the
  change is restrictive rather than permissive — it can hide a button, it cannot
  leak data — and it is consistent across every surface. **Confirm that was
  intended.** If the old policy was right, the fix is in the code, not the test.

Split-shift evening hours also gained their first tests: they were added to
`scheduleInput` with no coverage at all, and the five rules they enforce (both
ends required, after the morning closes, never on a closed day) are now pinned.

### 7. The notes feature was removed, end to end

Aadil asked for it, was shown what `ClinicalRecord` also carried, and confirmed
including the data. So:

**Gone from the code.** `app/dashboard/clinical-records/**` and
`app/api/clinical-records/**`; `ClinicalRecordForm`; `PatientMedicalEditForm`
and `deleteClinicalRecordAction` (both already dead — nothing imported or called
them); the notes CSV export; the "Notes archive" link in Clinical; the notes
card on Patient 360; "Notes on this visit" on the chart page; "Notes still open"
and the signed/unsigned badges in the workspace; the bill-to-note link; the
`ClinicalRecord` model, its five back-relations, `Prescription.clinicalRecordId`
and `clinicalRecordSchema`.

**Deliberately NOT gone: the allergy warning.** Removing notes is not removing
patient safety, and the allergy was only ever *stored* on a note — it is a
standing fact about the person. Every surface that read it off a note now reads
`PatientIntakeRequest.drugAllergies` plus `Patient.medicalNotes`: both
prescription routes, both prescription screens, treatment plans, the chart page
and Patient 360. `prescriptionWarnings` still fires. A test asserts that none of
those seven files mentions `clinicalRecord` again *and* that each still has an
allergy source, so the safety net cannot be quietly cut later.

Consent survives the same way — `PatientIntakeRequest` already held
`consentGiven`, `consentNotes` and both signatures. The intake form was writing
a second copy into a note; only the copy is gone.

**The migration is not in `prisma/migrations/`.** Putting it there applies it on
the next deploy. It drops every note ever written, including any consent
signature taken on a note rather than through the intake link — that is the one
thing with no other home. Back up and verify the backup first.

Verified against the running app: every notes route 404s, and Patient 360, both
prescription screens, treatment plans, the chart page, billing and exports all
still return 200 with the safety banner rendering from its new source.

### 8. Tenant isolation now has a backstop

The largest liability in the codebase was that tenancy lived entirely in 709
hand-written `clinicId:` clauses with nothing underneath them. Forget one and
that screen serves another clinic's patients: nothing fails, nothing logs.

`lib/tenant-guard.ts` is a Prisma client extension every query passes through.
On a clinic-scoped model it requires the filter to name a clinic — directly,
through a relation, or inside an `AND`/`OR`/`NOT`. Proven against the live
database: three unscoped queries refused, six legitimate ones untouched.

Three deliberate limits, all written down in the file:

- **It refuses, it does not inject.** Injecting a tenant needs one threaded
  through webhooks and cron too, and a wrong guess there writes one clinic's
  data under another's id — worse than the bug being fixed.
- **`findUnique` is exempt**, because a unique filter cannot carry a `clinicId`.
  Those callers must still check the clinic on the row they get back.
- **It ships in `report` mode in production.** Enforcing everywhere on the first
  deploy would risk taking a working screen away from a real clinic to prevent
  a leak that has not happened, and the paths hardest to exercise beforehand
  (platform admin, cron, the webhook) are exactly the ones that legitimately
  cross clinics. Reporting is not a placebo — an unscoped query reaches the
  error webhook in seconds. **Set `TENANT_GUARD_MODE=enforce` once a week of
  traffic has produced no `tenant.unscoped-query` events. That is the last step
  of this work.**

Cross-tenant paths are marked rather than exempted by omission:
`requirePlatformAdmin()` lifts the guard once, after proving the caller is a
platform administrator, using `AsyncLocalStorage` so the lift cannot escape the
request — an earlier draft used a module-level counter, which would have opened
a hole for any clinic request served concurrently. The four cron sweeps use
`crossTenant()`, which is greppable.

### 9. A failure can no longer go unnoticed

There were 30 `console.error` calls and no reader, so a 500 at 9pm on a Saturday
was invisible until somebody rang the clinic. `lib/monitoring.ts` reports every
one as a structured JSON line and, when `ERROR_WEBHOOK_URL` is set, POSTs it to
any Slack or Discord incoming webhook. Client-side crashes report through
`/api/client-error`, which is rate-limited and unauthenticated on purpose: the
boundary most worth hearing from is the one that fired because the session
itself broke.

**Never put patient data in an error report.** Identifiers and counts only; the
types enforce the shape and the comment says why.

No hosted SDK, deliberately: that needs an account, a DSN, and a decision about
whether patient data leaves the country — none of which are mine to make for a
clinic. `ERROR_WEBHOOK_URL` gets the signal out of the black hole and leaves
that choice open.

---

## Next, in priority order

1. **Watch for `tenant.unscoped-query` in the logs, then flip the guard.** A
   week of clean traffic, then `TENANT_GUARD_MODE=enforce`. Until that happens
   the isolation work is only half-landed: it reports, it does not refuse.
   Setting `ERROR_WEBHOOK_URL` first is what makes those events reach a person.

2. **Decide the drop migration.** `CLINICAL_RECORD_REMOVAL_MIGRATION.sql` is
   written and unapplied. Until it runs the app ignores the table and the rows
   are still there, so the removal is reversible. Running it is not.

3. **Nothing records that the allergy question was asked.** "No allergies" and
   "nobody asked" are still indistinguishable, because no field stamps when the
   question was put. Needs a `Patient`-level "last confirmed" column, so it is a
   migration and waits with the others.

4. **One structural gap in `npm run verify` remains.** The six orphaned
   source-test files are fixed and wired in, which took it to 156 assertions
   across 17 steps. But the database integration tests still SKIP against
   production, and `verify:security` is still 97 `String.includes()` greps over
   source text rather than behaviour. There is no separate dev database and no
   error monitoring anywhere in the codebase.

5. **The role-gating policy change in `document-discovery-no-role`.** Phase B
   moved the patient record and workspace search onto "entitlement AND role",
   against a test asserting "entitlement only". I retargeted the test, because
   the change is restrictive rather than permissive. Confirm that was intended.

---

## Judgement calls made, so they are not silently reversed

- **The prescription allergy filter was reverted, not overruled.** See section 4.
- **Legacy procedures are shown but not selectable for X-ray comparison.**
  Showing them and letting them be picked would need a schema change; hiding
  them keeps a dropdown that silently omits most of a patient's treatment.
- **Body text raised to 15px against an audit's advice.** It argued 13px suits an
  11-minute appointment. Its own evidence settled it the other way: 124 of 328 13px
  elements also carried `text-text-muted`, so primary and secondary text differed
  only in hue. Tables stayed at 14px, so scanning density is untouched.
- **Treatment plan prices are deliberately NOT re-read from the fee schedule.** A
  plan is a quote given to a patient; the figure the clinician saw and agreed is
  what belongs on the record. Re-reading at save time would change a quote after
  the conversation. The inactive-service hole beside it *was* real and is fixed.
- **Phase 3 of the design roadmap (elevation steps) dropped.** One shadow plus a 1px
  border already reads correctly in both modes, and on the black dark ground shadows
  are invisible anyway. Three steps means 20 per-page judgement calls for a marginal
  gain.
- **`.dashboard-shell` is dead and must stay dead.** 41 rules, no element carries it.
  The *interaction* half was re-pointed to `.clinic-theme`; the rest must not be —
  it would cap the shell including the top bar, force a min-height on every button,
  and hide `[name="reason"]` inputs, which would hide the payment-reversal reason
  field.
- **`--workspace-shadow`, `--workspace-card-border`, `--workspace-shadow-hover` are
  NOT dead.** Nothing in `app/` or `components/` reads them; the `.platform-*` rules
  in `globals.css` do. A grep excluding "platform" makes them look removable.

## Still unverified by a human

- Chart Undo (never run — needs a real write)
- The safety banner's **red** state. No patient has an allergy recorded, so only
  the grey state has ever rendered against real data. The red state and its new
  "not yet confirmed" line are covered by tests, not by eyes.
- An appointment save with a *correct* revision. The rejection path was
  exercised live; accepting one would have written to the shared Supabase, so it
  rests on the unit tests.
- The greyed legacy procedures in the X-ray comparison form. The signed-in
  account has no `signImaging` permission, so `/api/imaging/comparison-options`
  answers 403 and the dropdown could not be seen with real data. The merge
  behind it is unit-tested; the rendering is not.
- Growth queue at tablet width after 51 controls grew to 44px
- Whether the ~8–10% extra vertical height from the type scale hurts any screen
  in the chair

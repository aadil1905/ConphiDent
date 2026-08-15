# Phase 1 clinical core

## Scope

This change makes Patient 360 the primary patient context and adds a governed clinical data foundation without replacing the existing workflows. Existing chart rows remain available as a compatibility projection while new writes also create encounter-linked, versioned records.

## Clinical record graph

`Clinic -> Patient -> Encounter` is the root for visit-scoped data. Encounters can reference an appointment, practitioner, location and chair. The following records now carry direct clinic and encounter ownership where applicable:

- clinical records, dental findings and dentition assessments;
- treatment plans, prescriptions and laboratory cases;
- invoices and payments;
- patient timeline and audit events.

Patient 360 combines encounters, appointments, chart activity, records, plans, prescriptions, laboratory work, billing, WhatsApp activity, follow-ups, signed documents and authorized audit history. Imaging has an explicit empty state and will use the shared repository introduced in Phase 2.

## FDI dentition behavior

- Permanent dentition uses quadrants 1-4 and positions 1-8 (32 teeth).
- Primary dentition uses quadrants 5-8 and positions 1-5 (20 teeth).
- Mixed dentition displays both valid sets.
- Age only suggests a stage: under 6 primary, 6 to under 13 mixed, and 13+ permanent.
- The clinician must confirm the stage. Age never silently determines the chart and every submitted tooth code is validated on the server.

## Record lifecycle rules

- Signed clinical records and dental findings are corrected by a new version; the prior version is retained as superseded.
- Clinical records may be marked entered in error only with a reason.
- Prescriptions are issued, replaced or cancelled; ordinary UI actions do not delete issued history.
- Issued invoices are voided with a reason. Payments are reversed rather than deleted.
- Laboratory cases are cancelled with a reason.
- Patients are archived, not deleted, so their clinical and financial history remains intact.

## Migration and compatibility

Migration `20260811211500_phase1_clinical_core`:

1. Adds lifecycle and tenant columns as nullable.
2. Backfills ownership from the existing patient/invoice graph.
3. Creates historical encounters for completed appointments.
4. Links date-compatible legacy clinical data to encounters.
5. Seeds valid legacy FDI teeth into the patient-tooth registry.
6. Applies required constraints, indexes and restrictive foreign keys only after backfill.

The migration is additive for valid data. It does not discard legacy chart, clinical, prescription, laboratory, invoice or payment rows. Deploy it before application traffic reaches the new build.

## Verification

Local verification commands:

```text
npm run verify
npm run build
```

Database integration cases require a disposable PostgreSQL database whose URL clearly contains `test`. CI now starts PostgreSQL 16, runs `prisma migrate deploy`, and executes the clinical, reliability and provisioning suites.

## Rollback

Application rollback is safe while the additive columns and tables remain. Do not drop the Phase 1 tables during an incident rollback; redeploy the previous application first, preserve new rows, and reconcile forward. A destructive schema rollback requires a verified backup and an explicit data-export plan.

## Deferred by phase boundary

- Imaging repository, matching queue and adapters are Phase 2.
- Full clinic-to-laboratory transmission and portal are Phase 3.
- Structured medication rows, inventory ledger, premium financial documents and complete WhatsApp continuity are Phase 4.
- Full adversarial tenant, performance, accessibility and browser automation coverage is Phase 5.


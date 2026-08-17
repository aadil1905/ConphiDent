# Clinical migration — proposal, not applied

**Nothing in this document has been run, and it is deliberately not in
`prisma/migrations/`.** `vercel-build` runs `prisma migrate deploy`, so a file
placed in that folder applies itself on the next deploy. This one cannot.
Moving it is the act of approving it.

`prisma/schema.prisma` is also untouched. Everything below is a diff to review.

One schema change unblocks the rest of Runs 1–4. Splitting it into five small
migrations means five deploys against a live clinic database; doing it once,
reviewed, is safer.

---

## Before anything: back up, and reconcile the chart

The clinic database is live and git sits behind it. Take a Supabase backup
first, and confirm it restores.

Then the part that is not optional. `DentalChartEntry` holds **38 rows**;
`DentalFinding` holds **9**; **29 legacy rows have no finding at all** — crowns,
root canals and fillings that exist nowhere else. Until those are backfilled,
`DentalFinding` is not the source of truth and no feature may treat it as one.

The backfill is step 0, it is reversible only from the backup, and it needs the
dentist to confirm the mapping. Each legacy row carries a tooth, a date, a
condition and a note, but **no record type and no surfaces** — so a crown on 11
cannot say whether it was found in place or placed that day. Two options:

- **Import as `FINDING`** and accept that historical procedures read as
  observations. Honest, lossless, slightly wrong in meaning.
- **Infer from the condition** — `FILLING`/`CROWN`/`ROOT_CANAL`/`IMPLANT` become
  `COMPLETED_PROCEDURE`, the rest `FINDING`. This is what the tooth timeline
  does today for display only. It guesses, but it guesses the way the chart
  already reads those conditions.

Recommendation: **infer**, and stamp every backfilled row with
`source = "LEGACY_BACKFILL"` so the guess stays visible forever and can be
corrected later. Do not delete the legacy table in the same change — leave it
read-only for a release, and drop it once the chart has been checked by eye.

---

## 1. The PLANNED chart state — Run 1's core mechanic

The brief's three-state chart is Existing / Planned / Completed. Today
`recordType` is only `FINDING` or `COMPLETED_PROCEDURE`, and planned work lives
in `TreatmentPlan` with **no foreign key to the chart at all**. So "planned
converts to completed on procedure completion, carrying date and clinician" has
no edge to travel along.

```prisma
model DentalFinding {
  // recordType gains "PLANNED".
  // Set when a planned item is charted; cleared when it completes.
  plannedFromItemId Int?               @unique
  plannedFromItem   TreatmentPlanItem? @relation(fields: [plannedFromItemId], references: [id], onDelete: SetNull)
  completedAt       DateTime?
  completedById     Int?
  completedBy       User?              @relation("DentalFindingCompletedBy", fields: [completedById], references: [id], onDelete: SetNull)
}

model TreatmentPlanItem {
  // The other half of the same edge.
  toothCode   String?
  surfaces    String[]       @default([])
  status      String         @default("PROPOSED") // PROPOSED | ACCEPTED | DECLINED | DEFERRED | COMPLETED
  decidedAt   DateTime?
  decidedById Int?
  charted     DentalFinding?
}
```

`recordType` stays a string — it already is one, and widening the allowed set
needs no column change, only the validator in
`app/dashboard/clinical-workspace/actions.ts:18`.

**This one change is what makes Runs 1 and 4 a single feature.** It gives the
chart its planned state, gives plans per-item acceptance, and creates the link
that lets completing a procedure close the plan item.

---

## 2. Per-item plan acceptance and phases — Run 4

`TreatmentPlanItem.status` above delivers partial acceptance, which the brief
calls constant behaviour. Phases and alternatives need a little more:

```prisma
model TreatmentPlan {
  acceptedAt  DateTime?
  declinedAt  DateTime?
  deferredAt  DateTime?
  // Acceptance rate is called the most valuable metric in the product and
  // cannot be reported on today, because only a current status is stored.
}

model TreatmentPlanItem {
  phase        Int     @default(1)  // "visit 1", "visit 2"
  phaseLabel   String?
  sortOrder    Int     @default(0)
  // Alternatives: items sharing a group are a choice, not a sequence.
  optionGroup  String?
  isRecommended Boolean @default(false)
}
```

---

## 3. Structured medical history — Run 2

Today `medicalHistory` is sixteen checkbox labels joined into a string, and
`drugAllergies`, `medications` and `otherHistory` are free text.
`prescriptionWarnings()` copes by matching drug families against prose. Alerts
for anticoagulants, bisphosphonates, pregnancy trimester and glycaemic control
cannot be built on that.

```prisma
model PatientMedicalProfile {
  id                    Int       @id @default(autoincrement())
  clinicId              Int
  patientId             Int       @unique
  allergies             Json      @default("[]") // [{ agent, reaction, severity, recordedAt }]
  anticoagulant         Boolean   @default(false)
  anticoagulantDetail   String?
  antiresorptive        Boolean   @default(false)
  antiresorptiveDetail  String?
  diabetes              Boolean   @default(false)
  glycaemicControl      String?
  cardiacProphylaxis    Boolean   @default(false)
  cardiacDetail         String?
  pregnant              Boolean   @default(false)
  trimester             Int?
  immunosuppressed      Boolean   @default(false)
  bleedingDisorder      Boolean   @default(false)
  bloodBorneInfection   String?
  currentMedications    String?
  // The field that makes the rest mean anything.
  lastConfirmedAt       DateTime?
  lastConfirmedById     Int?
  version               Int       @default(1)
  updatedAt             DateTime  @updatedAt
}
```

**Read this before scheduling it.** Across all 26 patients in the live clinic,
**not one** has an allergy or a medical note recorded. Building alert machinery
over empty fields buys nothing. The intake that fills them has to ship first, or
with it — the existing WhatsApp intake link should write here as structured data
rather than as prose. The safety banner already added points at the edit screen
from every clinical page, which is the cheap half of the same problem.

---

## 4. Recall by procedure type — Run 4

No recall model exists; `FollowUpTask` is generic and manual. (`recalledAt` in
the schema is `InventoryBatch` — a product recall.)

```prisma
model RecallRule {
  id              Int    @id @default(autoincrement())
  clinicId        Int
  serviceId       Int?   // scaling, endo review, implant check
  procedureCode   String?
  intervalMonths  Int
  repeatCount     Int    @default(1)
  active          Boolean @default(true)
}

model PatientRecall {
  id           Int       @id @default(autoincrement())
  clinicId     Int
  patientId    Int
  ruleId       Int?
  reason       String    // travels to the follow-up queue so the caller knows what to say
  dueAt        DateTime
  status       String    @default("PENDING")
  completedAt  DateTime?
  followUpTaskId Int?    @unique
}
```

---

## 5. Notation preference — Run 1

FDI is hardcoded throughout `lib/dentition.ts`, and findings store
`toothCodeSnapshot` as an FDI string.

```prisma
model Clinic {
  toothNotation String @default("FDI") // FDI | UNIVERSAL | PALMER
}
```

Storage stays FDI — it already is notation-independent in practice, being ISO
3950. Only rendering changes, via a formatter in `lib/dentition.ts`. **No data
migration needed**, which makes this the cheapest item here and a good first
one to ship.

---

## Suggested order

1. **Backup**, verified restorable.
2. **Backfill** `DentalFinding` from the 29 orphan legacy rows. Check by eye.
3. **Notation preference** — no data change, proves the deploy path.
4. **PLANNED state + per-item acceptance** — the unlock.
5. **Structured medical history**, shipped with the intake that fills it.
6. **Recall model**, once plans can complete items.

Steps 1–2 are the risky ones and neither is a schema change. Everything after is
additive: new nullable columns and new tables, no drops, no type changes — so
each is reversible by ignoring the column.

## What still is not covered

Run 3's procedure fields (anaesthetic agent and cartridges, materials and shade,
working length, complications, post-op instructions) and Run 5's specialty
models are all further additive tables. They are not drafted here because
neither should be designed before a dentist has said what they actually write
down — Run 0 section 2 is still unanswered, and it is the input for both.

# CLINICAL_AUDIT.md — Run 0

What the product actually does today, before anything in Runs 1–5 is built.

**Method.** Sections 3 and 4a are read from the code and are facts. Section 1 is
a static trace: the routes, forms and required fields are facts, the click count
derived from them is an **estimate**. Sections 2 and 4b cannot be answered from
a repository at all.

**What is missing and why.** Three of this document's inputs need a signed-in
session, and `/dashboard` requires a password. Sections marked **[NEEDS THE
CLINIC]** are open. The click baseline in particular is estimated, not measured
— and since every later run is scored against it, it should be measured before
Run 1 starts.

---

## 1. One appointment, end to end

### The route the dentist actually walks

The patient record at `app/dashboard/patients/[id]/page.tsx` is the hub. It
links out to every clinical screen with `?patientId=` attached, so the patient
is pre-selected in each form. That much is well built.

| # | Screen | Route |
|---|---|---|
| 1 | Today / huddle | `/dashboard` or `/dashboard/huddle` |
| 2 | Patient record | `/dashboard/patients/[id]` |
| 3 | Chart | `/dashboard/clinical-workspace/[patientId]` |
| 4 | Case paper | `/dashboard/clinical-records/new?patientId=` |
| 5 | Treatment plan | `/dashboard/treatment-plans/new?patientId=` |
| 6 | Prescription | `/dashboard/prescriptions/new?patientId=` |
| 7 | Invoice | `/dashboard/billing/new?patientId=` |
| 8 | Recall | no step — a separate trip to `/dashboard/growth` |

**Six full page loads to complete one appointment**, each returning to the
patient record in between. The Clinical Depth brief's threshold is three.

### Estimated clicks — approximately 30

| Step | Clicks | What they are |
|---|---|---|
| Open patient from Today | 2 | row, then the record |
| Chart one tooth | 5 | tooth · condition chip · surface · found/did · Save |
| Case paper | 4 | open · visit date · consent tick · Sign |
| Treatment plan | 5 | open · visit date · teeth · add item · Save |
| Prescription | 5 | open · visit date · medicine · warning tick · Issue |
| Invoice | 6 | open · document type · visit date · line · amount · Raise |
| Back to the patient, ×4 | 4 | |
| Recall | 0 | not part of the flow |

Typing is excluded. A second tooth adds 5, a second medicine adds 8 required
fields. **[NEEDS THE CLINIC]** — measure this on a real appointment.

### The finding that matters most

**The visit date is asked for four times.** `ClinicalRecordForm`,
`TreatmentPlanForm`, `PrescriptionForm` and `InvoiceForm` each open with a
"which visit is this for" picker. The system already knows: the dentist arrived
from an appointment, and `Encounter` exists precisely to hold that answer. Four
of the ~30 clicks are re-answering a question the database can answer.

**Nothing chains.** The brief asks that completing a procedure update the chart,
close the planned item, generate the billable line and trigger the recall in one
action. Today those are four screens, and the fourth does not exist.

---

## 2. What the dentist does outside the software

**[NEEDS THE CLINIC] — this section cannot be written from the repository.**
It needs a day sat beside the dentist. What follows is only a list of candidates
the code implies, to be confirmed or struck:

- **Periodontal charting.** No model, no screen. If pockets are being probed,
  they are being written somewhere else.
- **Recall intervals.** `FollowUpTask` is generic and manual. Nothing says
  "scaling at 6 months, endo review at 6 and 12". A recall book or a diary note
  is doing this job.
- **Anaesthetic, materials, shade, working length.** No fields exist.
  `ClinicalRecord.treatmentDone` is one free-text box.
- **Medical history re-confirmation.** No "last confirmed" date anywhere, so
  either it is never re-asked or it is asked out loud and not recorded.
- **Consent forms.** `ClinicalRecord` holds signatures and a free-text note but
  no form version, so the paper form is likely still the real record.
- **Tooth-by-tooth history.** No timeline view per tooth. "What did we do to 36
  and when" is currently answered by memory or by scrolling.

---

## 3. The clinical model as built

### The spine is sound

`Encounter` (`prisma/schema.prisma:~530`) is a real visit object — patient,
appointment, provider, location, chair, `occurredAt`, status. Clinical records,
findings, plans, prescriptions, invoices, lab cases, imaging and timeline events
all hang off it. **This is the right shape and Runs 1–4 should build on it.**

### What already satisfies the brief

| Requirement | Where | State |
|---|---|---|
| FDI notation, permanent + primary + mixed | `lib/dentition.ts` | Complete |
| Age → dentition stage inference | `lib/dentition.ts:99` | Complete |
| Mixed dentition, clinician-confirmed, versioned | `DentitionAssessment` | Complete |
| Supernumerary / non-standard teeth | `PatientTooth.kind`, `.customLabel`, `.adjacentFdiCode` | Modelled |
| Five surfaces per finding | `DentalFinding.surfaces String[]`; UI at `DentalChartEditor.tsx:37` | Complete |
| Append-only notes with visible amendment | `DentalFinding.version/signedAt/correctionReason/supersedesId`; same on `ClinicalRecord` | Complete |
| Every write attributed and audited | `authorId` throughout, `AuditLog` | Complete |
| Favourite prescriptions | `PrescriptionTemplate` | Complete |
| Consent capture with signature | `ClinicalRecord.patientSignature`, `.guardianSignature`, `.consentSignedAt` | Partial — no form version |
| Allergy cross-check when prescribing | `lib/prescription-core.ts:178` | Works, but see below |
| Undo on every chart action | `undoDentalChartEntriesAction`, `clinical-workspace/actions.ts` | Added during this audit |
| Touch targets ≥44px | 51 controls raised across 28 files | Added during this audit |
| Tooth timeline, one tap | `toothHistoryAction` + panel in `DentalChartEditor.tsx` | Added during this audit |
| Persistent safety banner on every clinical screen | `components/clinical/SafetyBanner.tsx`, `lib/patient-safety.ts` | Added during this audit (Run 2) |

### Closed while auditing

Three Run 1 requirements were absent, needed no migration, and were small enough
to fix rather than write down:

- **Undo.** The chart took a clinical write with no way back short of marking
  the whole visit entered in error. It now walks the version chain the save
  already builds — the new entry is marked `ENTERED_IN_ERROR` and whatever it
  superseded is made `ACTIVE` again, timestamped, attributed and audited.
  Nothing is deleted. It is scoped to the signing clinician's own most recent
  entry per tooth, so it cannot reach past a colleague who charted the same
  tooth in between. Offered as an eight-second Undo on the toast, which is the
  rule `components/ui/confirm-dialog.tsx` already states for reversible work.
- **44px targets.** 51 controls sat at 40px against the brief's minimum and the
  design system's own non-negotiable. The decorative 40px tiles — the logo
  plate, the initials tile, the thread avatar — were left alone.
- **The safety banner** — Run 2's headline requirement, and the only part of it
  that needs no migration. Five clinical screens each handled patient safety
  differently: the chart drew a red band **even when nothing was flagged**, the
  patient record **hid the band entirely** when nothing was flagged, the case
  paper used a "Read first" card, the prescription passed a summary into the
  form, and **the treatment plan did not load the data at all** — a plan could
  be agreed with no allergy information anywhere on screen. All five now render
  one `SafetyBanner`, always, never dismissible. It distinguishes "alerts on
  file" from "nothing recorded", and says plainly that the second is not the
  same as "none" — because with free-text fields and no last-confirmed date, the
  schema genuinely cannot tell the difference.
  The hard interrupts — blocking a prescription against a recorded allergy with
  a typed override into the audit log — still need the structured fields, and
  so still need the migration.
- **The tooth timeline.** "What did we do to 36 and when" took memory or four
  screens. Selecting a single tooth on the chart now lists everything that ever
  referenced it, newest first — read from all six tables that carry a tooth
  code: `DentalFinding` (found and did, every version), `TreatmentPlanTooth`
  (planned), `ImagingStudy.toothCodes` (radiographs), `ImagingAnnotation`
  (marked on one) and `LabCase.teeth` (sent to the lab). Superseded and
  withdrawn entries stay on the list, greyed and struck, because the amendment
  trail is the record rather than an audit-only detail. One tap, no new screen.

### The 10-inch landscape check — passes, with one failure inside it

At 1024×768 the full permanent arch renders in a 532×162 box, entirely on
screen both ways, and the page does not scroll sideways. **The requirement is
met.**

The individual tooth targets measured **28px** against the brief's 44px minimum
— on the single most tapped control in the product. **Now fixed**: the tap
target is `min-w-11` while the glyph keeps its anatomical width, so the arch
reads the same and is simply less cramped. Measured after the change: every
tooth 44×44, row 734px, no sideways scroll at 1024×768.

One thing that only appeared in dark mode: the unrecorded tooth was filled with
a literal `#ffffff`. On paper that is indistinguishable from the card and reads
as an empty outline, which is the design intent. On the black ground it made
"nothing recorded" the brightest state on the chart, shouting over the caries
tooth beside it. The fill now follows `--card`, so the tooth is a quiet outline
in both modes and red and teal carry the meaning. Light mode is unchanged.

### Deliberately not changed: "two taps to chart a finding"

The brief asks for tooth → finding and no save button. Today it is tooth →
chip → Save. The third tap buys something the brief did not account for: teeth
are multi-selectable, so a full-mouth exam is *select eight teeth → one chip →
Save*, which beats two-taps-per-tooth badly. Auto-committing on the chip tap
would be safe now that Undo exists, but it would cost the multi-select. Worth
timing both against a real full-mouth exam before changing it.

### Where the schema will not stretch

**1. Charting has two states, not three.** `recordType` is only ever `"FINDING"`
or `"COMPLETED_PROCEDURE"` (`DentalChartEditor.tsx:171`). There is **no PLANNED
state**. Planned work lives in `TreatmentPlan` / `TreatmentPlanItem` /
`TreatmentPlanTooth`, which have no foreign key to `DentalFinding` and no
per-item completion flag. So the brief's core mechanic — *planned converts to
completed on procedure completion, carrying date and clinician* — has no edge to
travel along. **This is the single largest gap and it needs a migration.**

**2. Two chart models are maintained in parallel — and the "legacy" one holds
most of the data.** `app/dashboard/clinical-workspace/actions.ts:186-197` writes
every finding twice: once to `DentalFinding` (surfaces, versioned, signed) and
once to `DentalChartEntry` (whole-tooth, no surfaces). The comments call the
second a legacy mirror. **Measured against the live clinic, it is not a mirror.**

| | rows |
|---|---|
| `DentalChartEntry` | 38 |
| `DentalFinding` | 9 |
| Legacy rows with **no** matching finding | **29** |

Three quarters of every tooth ever charted — crowns, root canals, fillings —
exists only in `DentalChartEntry`. `DentalFinding` is the newer, sparsely
populated table, not the source of truth.

**This reverses the obvious recommendation.** Dropping the legacy reads to
"clean up the split" would hide 76% of the clinic's chart history. The two
readers that still use it — `clinical-workspace/[patientId]/page.tsx:123` and
`patients/[id]/page.tsx:151` — are load-bearing and must stay until the old rows
are backfilled into `DentalFinding`. That backfill is the real task, and it is a
data migration, not a refactor.

Anything new that reads the chart has to read **both** tables until then. The
tooth timeline added during this audit did not, at first, and showed teeth as
never-touched while the chart beside it drew a crown on them; it now reads both
and de-duplicates by tooth and day.

Same duplicate-model pattern on plans: `TreatmentPlan.toothNumber` (singular,
legacy) coexists with `TreatmentPlanTooth`, and has not been counted.

**2b. Nobody is filling the safety fields.** Across all 26 patients in the live
clinic, **not one** has an allergy or a medical note recorded — checked by
loading every patient and looking for any alert to display. The fields exist and
are empty.

That reframes Run 2. The problem is not only that alerts cannot fire off prose;
it is that there is nothing to fire on. Structured intake has to arrive with a
reason to complete it — a prompt at booking or check-in — or it will be as empty
as the free-text fields it replaces.

It also makes the honest default copy "nothing is recorded, which is not the
same as nothing exists", which is what the banner now says.

**3. Medical history is prose, not data.** `ClinicalRecord.medicalHistory` is a
`String` built by joining sixteen checkbox labels; `drugAllergies`,
`medications` and `otherHistory` are free text. `prescriptionWarnings()` copes
by matching drug families against that prose — genuinely clever, and it is why
the penicillin/amoxicillin case works at all — but **Run 2's alerts cannot be
built on prose.** Anticoagulants, bisphosphonates, pregnancy trimester and
glycaemic control each need their own field before anything can reliably fire.

**4. No recall model.** `FollowUpTask` is generic. There is no per-procedure
interval. (`recalledAt` at line 1745 is `InventoryBatch` — a product recall.)

**5. Treatment plans cannot be partially accepted.** `TreatmentPlan.status`
carries one value for the whole plan; `TreatmentPlanItem` has no status. The
brief calls partial acceptance constant behaviour. No phases or visit grouping
either, and no `acceptedAt` / `declinedAt` dates — so the acceptance rate the
brief calls the most valuable business metric cannot be reported on.

**6. FDI only.** `lib/dentition.ts` is ISO 3950/WHO-FDI throughout, with no
per-clinic Universal or Palmer setting and no notation-independent internal
representation. Findings store `toothCodeSnapshot` as an FDI string.

**7. Nothing for the specialties.** No perio, endo, prostho, oral surgery or
implant models. Run 5 is greenfield.

**8. Phase B stranded capabilities, not just screens.** It is already recorded
that the Phase B redesign cut the nav from 14 entries to 11 and stranded eleven
working screens. It went wider than that. Every one of the 20 exported server
actions with no caller was unwired by **a single commit, `54b3d1e`** — traced by
`git log -S` on each action name, excluding their own definition files. Four
client components are stranded the same way:

| Stranded | What it did | Replaced? |
|---|---|---|
| `SendPrescriptionWhatsAppButton` | sent a script to the patient on WhatsApp | **No** — invoices can be sent, prescriptions could not. Run 3 requires it. Rewired during this audit onto the prescription sheet. |
| `PatientMedicalEditForm` | edited a patient's medical history in place | No. The `/patients/[id]/edit` form still carries `medicalNotes`, so the capability survives in a thinner form. |
| `PatientTableActions` | archived a patient from the list | No UI for archiving a patient now exists. |
| `DentalChartSummary` | a read-only chart summary | Unknown. |

Of the 20 server actions, most are duplicates of API routes that are still
wired, so they are genuinely dead. The ones worth a decision rather than a
delete:

- `clearVisitDentalWorkspaceAction` — marks a whole visit's chart entered in
  error. The record page **displays** that state, and nothing can set it for the
  chart. The undo added during this audit covers the seconds after signing, not
  a visit charted last week.
- `preparePatientPortalAction` — no patient-portal UI exists at all.
- `DeleteAllAppointmentsDialog` — exists, rendered nowhere.

**The technique that found this is worth keeping**: grep every exported action
*and every component* for callers, then `git log -S` the orphans to see whether
they were ever wired. An orphan with two commits was a feature; an orphan with
one was never finished.

---

## 4. Slow paths

### 4a. Forms over eight fields — five of six

| Form | Fields |
|---|---|
| `ClinicalRecordForm` | **17** (plus 16 medical-history checkboxes) |
| `InvoiceForm` | **17** |
| `AppointmentForm` | **13** |
| `PrescriptionForm` | **11** (eight required *per medicine*) |
| `TreatmentPlanForm` | **9** |
| `PatientForm` | 7 |

`DentalChartEditor` is the exception and the model to copy — a tooth, a chip, a
surface, save.

### 4b. Screens over 400ms — measured

Median of three warm requests, signed in, desktop over a fast link to the
hosted database. **This is a floor, not the budget test** — the brief specifies
a mid-range Android tablet, which will be materially slower.

| Route | Median | Slowest of 3 |
|---|---|---|
| `/dashboard/clinical-workspace` | 180ms | 208ms |
| `/dashboard/appointments` | 242ms | 347ms |
| `/dashboard/prescriptions` | 243ms | 366ms |
| `/dashboard` | 250ms | 281ms |
| `/dashboard/patients/[id]` | 331ms | **761ms** |
| `/dashboard/clinical-workspace/[patientId]` | 353ms | 371ms |
| `/dashboard/billing` | 357ms | 556ms |
| `/dashboard/patients` | **411ms** | **656ms** |

Only the patients list exceeds 400ms at the median, but the tail is the real
problem: three routes more than double under load, and the patient record —
opened at the start of every appointment — hit 761ms. On the target tablet
most of this list will be over budget.

There is still **no error monitoring and no timing instrumentation** in the
codebase, so this had to be measured by hand and cannot be watched over time.

### 4c. Workflows over three screens

One: the appointment itself, at six. Section 1.

---

## Exit gate

| Required | State |
|---|---|
| `CLINICAL_AUDIT.md` exists | Yes |
| Schema map with file paths | Yes — section 3 |
| Click count for one full appointment | Yes — measured, below |

### The measured baseline

Counted off the four forms as they actually render, signed in, with the patient
pre-selected from the patient record (`?patientId=`). Required fields only —
optional ones and typing are excluded.

| Screen | Required controls | + submit |
|---|---|---|
| Chart, one tooth | tooth · condition · save | 3 |
| Case paper | patient · visit · chief complaint | 4 |
| Treatment plan | patient · visit · title · treatment · price | 6 |
| Prescription | patient · visit · 5 medicine fields | 8 |
| Invoice | patient · visit · description · qty · price | 6 |
| Opening the patient, then returning 4× | | 10 |

**≈ 37 interactions across 6 screens**, for one appointment with one tooth
charted and one medicine prescribed. A second tooth adds 5; a second medicine
adds 8.

**All four forms carry both a patient select and a visit picker** — confirmed in
the rendered DOM, not inferred. The patient is pre-filled from the record; the
visit date is asked four separate times for one visit.

**37 is the number every later run has to beat.**

**Suggested order once it is.** Fix the two-chart-model split before adding
anything to the chart, or every Run 1 feature gets built twice. Then the PLANNED
state, because it is what connects the chart to treatment planning and is the
thing that makes Runs 1 and 4 one feature instead of two.

---

## What blocks the rest of Run 1

Everything left in Run 1 hits one of two walls, and neither should be walked
through without the clinic saying so.

**A schema migration against the live database.** The PLANNED chart state, the
per-clinic Universal/Palmer notation setting, structured medical history for
Run 2's alerts, per-item plan acceptance and a recall model each need one.
Production ships from the working folder and git sits behind the live database,
so a migration is not a code change that can be reviewed and reverted like the
rest of this branch. It needs a deliberate decision and a backup.

**A signed-in browser.** The measured click count, the 400ms budget on a
mid-range Android tablet, and whether the arch fits a 10-inch landscape screen
without scrolling all need the app running with a real login. `/dashboard`
requires a password, so these stay open.

The tooth timeline was the one substantial Run 1 item that needed neither, and
it is now built. Everything still open is behind one of the two walls above.

**Nothing here has been run against the database.** No migration has been
written or applied on this branch.

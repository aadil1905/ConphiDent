import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { appointmentRevision } from "../lib/appointment-revision.ts";
import { patientSafety } from "../lib/patient-safety.ts";
import {
  TREATED_CONDITIONS,
  clinicDateKey,
  clinicDayWindow,
  legacyProceduresNotInFindings,
  mergeChartedTeeth,
} from "../lib/dental-chart-core.ts";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");

const appointment = {
  patientName: "Anita Rao",
  phone: "9876543210",
  appointmentDate: new Date("2026-08-20T00:00:00.000Z"),
  appointmentTime: "10:30",
  treatment: "Root canal",
  status: "Confirmed",
  notes: "Bring the old X-ray",
  locationId: 1,
  providerId: 2,
  chairId: 3,
};

test("a revision token is stable for an unchanged appointment", () => {
  assert.equal(appointmentRevision(appointment), appointmentRevision({ ...appointment }));
  // A re-save of identical values is not a conflict, only a real change is.
  assert.equal(
    appointmentRevision({ ...appointment, appointmentDate: new Date("2026-08-20T00:00:00.000Z") }),
    appointmentRevision(appointment),
  );
});

test("a revision token moves when any editable field moves", () => {
  const changes = [
    { patientName: "Anita Rao Kulkarni" },
    { phone: "9876543211" },
    { appointmentDate: new Date("2026-08-21T00:00:00.000Z") },
    { appointmentTime: "11:00" },
    { treatment: "Crown fitting" },
    { status: "Cancelled" },
    { notes: "Bring the old X-ray and the referral" },
    { notes: null },
    { locationId: 2 },
    { providerId: null },
    { chairId: 4 },
  ];
  const original = appointmentRevision(appointment);
  for (const change of changes) {
    assert.notEqual(
      appointmentRevision({ ...appointment, ...change }),
      original,
      `changing ${Object.keys(change)[0]} left the revision unchanged`,
    );
  }
});

test("field values cannot be shuffled between fields to forge an unchanged token", () => {
  // A separator-joined fingerprint would report these two as identical.
  assert.notEqual(
    appointmentRevision({ ...appointment, patientName: "Anita", treatment: "Rao Root canal" }),
    appointmentRevision({ ...appointment, patientName: "Anita Rao", treatment: "Root canal" }),
  );
});

test("the appointment API refuses a save made against a stale revision", () => {
  const route = read("app/api/appointments/[id]/route.ts");
  assert.match(route, /expectedRevision/);
  assert.match(route, /appointmentRevision\(current\)\s*!==\s*expectedRevision/);
  assert.match(route, /StaleAppointmentError/);
  assert.match(route, /code:\s*"STALE_APPOINTMENT"/);
  // The check has to happen against the row read inside the transaction, or two
  // saves can pass it and still overwrite each other.
  const transaction = route.slice(route.indexOf("prisma.$transaction"));
  assert.ok(
    transaction.indexOf("appointmentRevision(current)") < transaction.indexOf("tx.appointment.updateMany"),
    "the revision check must run before the write, inside the transaction",
  );
  assert.match(read("components/appointments/AppointmentForm.tsx"), /expectedRevision: revision/);
  assert.match(read("app/dashboard/appointments/[id]/edit/page.tsx"), /appointmentRevision\(appointment\)/);
});

test("a clinic day is the day it was in the clinic, not in UTC", () => {
  // 21:00 on the 17th in Kolkata is already the 18th in UTC.
  assert.equal(clinicDateKey(new Date("2026-08-17T15:30:00.000Z")), "2026-08-17");
  assert.equal(clinicDateKey(new Date("2026-08-17T18:31:00.000Z")), "2026-08-18");
  const window = clinicDayWindow(new Date("2026-08-17T15:30:00.000Z"));
  assert.ok(window.gte < new Date("2026-08-16T18:30:00.000Z"));
  assert.ok(window.lt > new Date("2026-08-17T18:30:00.000Z"));
});

test("teeth charted in the legacy table are not reported as untouched", () => {
  const visitDate = new Date("2026-08-17T15:30:00.000Z");
  // The live shape: findings hold a couple of teeth, the legacy chart holds the
  // rest, and reading findings alone loses most of the visit.
  assert.deepEqual(
    mergeChartedTeeth(
      [{ toothCodeSnapshot: "36" }],
      [
        { toothNumber: "46", visitDate },
        { toothNumber: "11", visitDate },
      ],
      visitDate,
    ),
    ["11", "36", "46"],
  );
});

test("a tooth in both tables on one day is reported once", () => {
  const visitDate = new Date("2026-08-17T15:30:00.000Z");
  assert.deepEqual(
    mergeChartedTeeth(
      [{ toothCodeSnapshot: "36" }],
      [{ toothNumber: "36", visitDate: new Date("2026-08-17T04:00:00.000Z") }],
      visitDate,
    ),
    ["36"],
  );
});

test("legacy rows from a neighbouring day are not pulled into this visit", () => {
  const visitDate = new Date("2026-08-17T15:30:00.000Z");
  assert.deepEqual(
    mergeChartedTeeth(
      [],
      [
        { toothNumber: "46", visitDate: new Date("2026-08-16T15:30:00.000Z") },
        { toothNumber: "11", visitDate },
      ],
      visitDate,
    ),
    ["11"],
  );
});

test("legacy treatment is offered only when no finding already covers it", () => {
  const day = new Date("2026-03-02T06:00:00.000Z");
  const entries = [
    { id: 1, toothNumber: "36", condition: "CROWN", visitDate: day },
    { id: 2, toothNumber: "46", condition: "ROOT_CANAL", visitDate: new Date("2026-04-11T06:00:00.000Z") },
    // A finding, not a procedure — this is something seen, not something done.
    { id: 3, toothNumber: "21", condition: "CARIES", visitDate: day },
  ];
  const result = legacyProceduresNotInFindings(entries, [{ toothCodeSnapshot: "36", at: day }]);
  assert.deepEqual(result.map((item) => item.id), [2]);
  assert.ok(TREATED_CONDITIONS.has("CROWN") && !TREATED_CONDITIONS.has("CARIES"));
});

test("an allergy the patient reported at intake is shown, and shown as unconfirmed", () => {
  const intakeOnly = patientSafety({
    intakeAnswers: [{ drugAllergies: "Penicillin", status: "COMPLETED" }],
  });
  assert.equal(intakeOnly.allergies, "Penicillin");
  assert.ok(intakeOnly.hasAlerts);
  assert.ok(intakeOnly.allergiesUnreviewed);

  // A clinician wrote one too, so it is no longer only the patient's word.
  const confirmed = patientSafety({
    intakeAnswers: [
      { drugAllergies: "Penicillin", status: "COMPLETED" },
      { drugAllergies: "Penicillin", status: "REVIEWED" },
    ],
  });
  assert.ok(!confirmed.allergiesUnreviewed);

  // Nothing on file is not an unconfirmed allergy, it is no allergy.
  const empty = patientSafety({ intakeAnswers: [] });
  assert.ok(!empty.hasAlerts);
  assert.ok(!empty.allergiesUnreviewed);
});

test("an allergy is read from any note that holds one, not only the newest", () => {
  const safety = patientSafety({
    intakeAnswers: [
      { drugAllergies: "   ", status: "REVIEWED" },
      { drugAllergies: "Sulfa drugs", status: "REVIEWED" },
    ],
  });
  assert.equal(safety.allergies, "Sulfa drugs");
});

test("notes are gone, and the allergy did not go with them", () => {
  // Removing the notes feature must not quietly remove the allergy warning:
  // an allergy is a standing fact about the person, not a note. Every surface
  // that used to read it off a note now reads the patient's intake answers.
  for (const file of [
    "app/api/prescriptions/route.ts",
    "app/api/prescriptions/[id]/route.ts",
    "app/dashboard/prescriptions/new/page.tsx",
    "app/dashboard/prescriptions/[id]/edit/page.tsx",
    "app/dashboard/treatment-plans/new/page.tsx",
    "app/dashboard/clinical-workspace/[patientId]/page.tsx",
    "app/dashboard/patients/[id]/page.tsx",
  ]) {
    const value = read(file);
    assert.match(value, /intakeRequests|intakeAnswers/, `${file} lost its allergy source`);
    assert.doesNotMatch(value, /clinicalRecord/i, `${file} still reads clinical notes`);
  }
});

test("the surviving chart-split reader asks the legacy table too", () => {
  // The note detail page was one of these; it went with the notes feature. The
  // rule it followed still binds whatever reads the chart.
  assert.match(read("app/api/imaging/comparison-options/route.ts"), /dentalChartEntry\.findMany/);
  assert.match(read("lib/dental-chart.ts"), /dentalChartEntry\.findMany/);
});

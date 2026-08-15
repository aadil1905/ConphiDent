import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  appointmentDateFromKey,
  appointmentDateKey,
  appointmentDayRange,
  clinicDateAtOffset,
  clinicNow,
  isPastClinicSlot,
  parseAppointmentTime,
  parseClinicDate,
  scheduleWindowSlots,
  schedulingResourcesConflict,
} from "../lib/scheduling-core.ts";
import { canonicalWhatsAppPhone } from "../lib/phone.ts";

test("strict date parsing rejects normalized and malformed calendar dates", () => {
  assert.equal(parseClinicDate("2028-02-29").dayOfWeek, 2);
  for (const value of [
    "2027-02-29",
    "2026-02-31",
    "2026-13-01",
    "2026-8-03",
    "03-08-2026",
  ]) {
    assert.throws(() => parseClinicDate(value));
  }
});

test("strict time parsing accepts only valid 24-hour minute keys", () => {
  assert.deepEqual(parseAppointmentTime("23:45"), {
    key: "23:45",
    hour: 23,
    minute: 45,
    totalMinutes: 1425,
  });
  for (const value of ["24:00", "12:60", "9:00", "09:0", "noon"]) {
    assert.throws(() => parseAppointmentTime(value));
  }
});

test("canonical writes and whole-day reads cover legacy midnight and noon rows", () => {
  assert.equal(
    appointmentDateFromKey("2026-08-13").toISOString(),
    "2026-08-13T12:00:00.000Z",
  );
  assert.equal(
    appointmentDateKey(new Date("2026-08-13T00:00:00.000Z")),
    "2026-08-13",
  );
  const range = appointmentDayRange("2026-08-13");
  assert.equal(range.gte.toISOString(), "2026-08-13T00:00:00.000Z");
  assert.equal(range.lt.toISOString(), "2026-08-14T00:00:00.000Z");
  assert.ok(new Date("2026-08-13T00:00:00.000Z") >= range.gte);
  assert.ok(new Date("2026-08-13T12:00:00.000Z") < range.lt);
});

test("clinic-local dates and past-slot checks honor tenant timezone boundaries", () => {
  const instant = new Date("2026-01-01T00:15:00.000Z");
  assert.deepEqual(clinicNow("Asia/Kolkata", instant), {
    date: "2026-01-01",
    time: "05:45",
  });
  assert.deepEqual(clinicNow("America/Los_Angeles", instant), {
    date: "2025-12-31",
    time: "16:15",
  });
  assert.equal(clinicDateAtOffset("America/Los_Angeles", 1, instant), "2026-01-01");
  assert.equal(isPastClinicSlot("2026-01-01", "05:30", "Asia/Kolkata", instant), true);
  assert.equal(isPastClinicSlot("2026-01-01", "05:30", "America/Los_Angeles", instant), false);
  assert.equal(isPastClinicSlot("2026-01-01", "05:45", "Asia/Kolkata", instant), true);
});

test("invalid configured timezones and invalid Date instances fail closed", () => {
  assert.throws(() => clinicNow("Mars/Olympus_Mons", new Date("2026-01-01T00:00:00Z")));
  assert.throws(() => appointmentDateKey(new Date(Number.NaN)));
});

test("split shifts produce deterministic slots without crossing breaks", () => {
  assert.deepEqual(scheduleWindowSlots([
    { openTime: "14:00", closeTime: "16:00", slotMinutes: 30 },
    { openTime: "09:00", closeTime: "10:30", slotMinutes: 30 },
  ]), ["09:00", "09:30", "10:00", "14:00", "14:30", "15:00", "15:30"]);
  assert.throws(() => scheduleWindowSlots([
    { openTime: "09:00", closeTime: "12:00", slotMinutes: 30 },
    { openTime: "11:30", closeTime: "14:00", slotMinutes: 30 },
  ]));
  assert.throws(() => scheduleWindowSlots([
    { openTime: "18:00", closeTime: "09:00", slotMinutes: 30 },
  ]));
  assert.throws(() => scheduleWindowSlots([
    { openTime: "09:00", closeTime: "09:10", slotMinutes: 30 },
  ]));
  assert.throws(() => scheduleWindowSlots([
    { openTime: "09:00", closeTime: "18:00", slotMinutes: 241 },
  ]));
});

test("branch, provider, and chair conflict semantics allow safe parallel care", () => {
  assert.equal(
    schedulingResourcesConflict(
      { locationId: 1 },
      { locationId: 1, providerId: 2, chairId: 3 },
    ),
    true,
  );
  assert.equal(
    schedulingResourcesConflict(
      { locationId: 1, providerId: 2 },
      { locationId: 1 },
    ),
    true,
  );
  assert.equal(
    schedulingResourcesConflict(
      { locationId: 1, providerId: 2 },
      { locationId: 1, providerId: 3 },
    ),
    false,
  );
  assert.equal(
    schedulingResourcesConflict(
      { locationId: 1, providerId: 2 },
      { locationId: 2, providerId: 2 },
    ),
    true,
  );
  assert.equal(
    schedulingResourcesConflict(
      { locationId: 1, chairId: 4 },
      { locationId: 2, chairId: 4 },
    ),
    true,
  );
  assert.equal(
    schedulingResourcesConflict(
      { locationId: 1, providerId: 2, chairId: 4 },
      { locationId: 1, providerId: 3, chairId: 5 },
    ),
    false,
  );
});

test("availability preserves misconfigured, closed, past, and full states", async () => {
  const source = await readFile(new URL("../lib/availability.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!hours\.length\)[\s\S]*status: "MISCONFIGURED"/);
  assert.match(source, /hours\.every\(\(hour\) => hour\.isClosed\)[\s\S]*status: "CLOSED"/);
  assert.match(source, /status: date === current\.date \? "PAST" : "CLOSED"/);
  assert.match(source, /status: slots\.length \? "AVAILABLE" : "FULL"/);
  assert.match(source, /db: LocationAvailabilityReader = prisma/);
});

test("WhatsApp identity normalization is exact and legacy-compatible", () => {
  assert.equal(canonicalWhatsAppPhone("+91 98765 43210"), "919876543210");
  assert.equal(canonicalWhatsAppPhone("09876543210"), "919876543210");
  assert.equal(canonicalWhatsAppPhone("9876543210"), "919876543210");
  assert.equal(canonicalWhatsAppPhone("+1 415 555 2671"), "14155552671");
  assert.equal(canonicalWhatsAppPhone("123"), null);
});

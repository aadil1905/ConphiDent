import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  appointmentDateFromKey,
  scheduleWindowSlots,
} from "../lib/scheduling-core.ts";

/**
 * Source is normalised to LF before matching.
 *
 * `core.autocrlf` is true, so a Windows working copy has CRLF endings, and any
 * pattern that spans lines then silently fails to match. That looked exactly
 * like the code having drifted away from the test, which is part of why these
 * files sat unrun. Normalised, the patterns mean what they say on any platform.
 */
const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const createRoute = read("app/api/appointments/route.ts");
const updateRoute = read("app/api/appointments/[id]/route.ts");
const scheduling = read("lib/appointment-scheduling.ts");
const validation = read("lib/validations.ts");
const form = read("components/appointments/AppointmentForm.tsx");
const newPage = read("app/dashboard/appointments/new/page.tsx");
const editPage = read("app/dashboard/appointments/[id]/edit/page.tsx");
const detailPage = read("app/dashboard/appointments/[id]/page.tsx");
const listPage = read("app/dashboard/appointments/page.tsx");

function functionSource(source, name, nextMarker) {
  const start = source.indexOf(`export async function ${name}`);
  const end = source.indexOf(nextMarker, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextMarker} must follow ${name}`);
  return source.slice(start, end);
}

test("staff resource validation is tenant, branch, hours, and service aware", () => {
  assert.match(scheduling, /clinicLocation\.findFirst\(\{[\s\S]*?clinicId: input\.clinicId,[\s\S]*?active: true,[\s\S]*?requestedLocationId \? \{ id: requestedLocationId \} : \{ isPrimary: true \}/);
  assert.match(scheduling, /clinicProvider\.findFirst\(\{[\s\S]*?id: input\.providerId,[\s\S]*?clinicId: input\.clinicId,[\s\S]*?active: true,[\s\S]*?locations: \{ some: \{ locationId: location\.id \} \}/);
  assert.match(scheduling, /clinicChair\.findFirst\(\{[\s\S]*?id: input\.chairId,[\s\S]*?clinicId: input\.clinicId,[\s\S]*?active: true/);
  assert.match(scheduling, /if \(!location\.hours\.length\)/);
  assert.match(scheduling, /location\.hours\.every\(\(hours\) => hours\.isClosed\)/);
  assert.match(scheduling, /scheduleWindowSlots\(location\.hours\)/);
  assert.match(scheduling, /assignedServices\.length[\s\S]*?location\.clinic\.services/);
  assert.match(scheduling, /Select a service available at the chosen branch/);
});

test("create authenticates before JSON and serializes canonical writes", () => {
  const post = functionSource(createRoute, "POST", "export async function DELETE");
  assert.ok(post.indexOf("requireApiFeature(") < post.indexOf("req.json()"));
  assert.match(post, /requireApiFeature\("appointments", "manageSchedule"\)/);
  assert.match(post, /canonicalPatientPhone\(data\.phone\)/);
  assert.match(post, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(post, /validateAppointmentResources\(\{[\s\S]*?treatment: data\.treatment/);
  assert.match(post, /findScheduleConflict\(\{[\s\S]*?locationId: resources\.locationId/);
  assert.match(post, /const appointmentDate = appointmentDateFromKey\(data\.appointmentDate\)/);
  assert.match(post, /tx\.appointment\.create\(\{[\s\S]*?locationId: resources\.locationId/);
  assert.match(post, /ensureEncounter\(tx/);
  assert.match(post, /isolationLevel: Prisma\.TransactionIsolationLevel\.Serializable/);
  assert.match(post, /error\.code !== "P2034"/);
});

test("PATCH detects actual changes and status-only updates do not relink patients", () => {
  const patch = functionSource(updateRoute, "PATCH", "export async function DELETE");
  assert.ok(patch.indexOf("requireApiFeature(") < patch.indexOf("request.json()"));
  assert.match(patch, /const scheduleChanged = dateKey !== currentDateKey/);
  assert.match(patch, /locationId !== current\.locationId/);
  assert.match(patch, /const reactivated = data\.status !== undefined/);
  assert.match(patch, /if \(scheduleChanged \|\| reactivated\)/);
  assert.match(patch, /excludeAppointmentId: current\.id/);
  assert.match(patch, /data\.patientName !== undefined[\s\S]*?nextPatientName !== current\.patientName/);
  assert.match(patch, /data\.phone !== undefined[\s\S]*?suppliedPhone !== currentCanonicalPhone/);
  assert.doesNotMatch(patch, /identityChanged \|\| !current\.patientId/);
  assert.match(patch, /const patient = identityChanged/);
  assert.match(patch, /patientId: patient\?\.id/);
  assert.match(patch, /providerId: \(scheduleChanged \|\| reactivated\) \? providerId : undefined/);
  assert.match(patch, /tx\.appointment\.updateMany\(\{[\s\S]*?clinicId: user\.clinicId,[\s\S]*?archivedAt: null/);
});

test("appointment pages enforce manageSchedule and preserve inactive current resources", () => {
  for (const page of [newPage, editPage, detailPage]) {
    assert.match(page, /requirePermission\("manageSchedule"\)/);
  }
  // Phase B replaced the raw form on this page with BookAVisit, and moved the
  // branch-hours query behind `bookableSlotsByWeekday`. The intent held: the
  // days offered still come from saved branch hours, reckoned in the clinic's
  // own timezone rather than the server's.
  assert.match(newPage, /bookableSlotsByWeekday\(user\.clinicId\)/);
  assert.match(newPage, /clinicDateAtOffset\(timezone, 0\)/);
  assert.match(newPage, /closedWeekdays/);
  assert.match(scheduling, /export async function bookableSlotsByWeekday/);
  // It reads the branch's own saved hours, from the same primary branch a
  // booking naming no location would land on.
  assert.match(scheduling, /clinicId, active: true, isPrimary: true/);
  assert.match(scheduling, /hours: \{[\s\S]*?dayOfWeek: true, openTime: true, closeTime: true, slotMinutes: true, isClosed: true/);
  assert.match(editPage, /OR: \[[\s\S]*?\{ active: true \}[\s\S]*?appointment\.locationId/);
  assert.match(editPage, /appointment\.providerId \? \[\{ id: appointment\.providerId \}\]/);
  assert.match(editPage, /appointment\.chairId \? \[\{ id: appointment\.chairId \}\]/);
  assert.match(editPage, /active: location\.active/);
  assert.match(editPage, /serviceIds: location\.services\.map/);
});

test("the staff list opens on the day in time order", () => {
  // This replaced "newest first". The list is the day's diary now, so the
  // useful default is chronological, and the sort lives in the shared list
  // query rather than in a page-local string.
  assert.match(listPage, /defaultSort: "when"/);
  assert.match(listPage, /defaultDir: "asc"/);
  assert.match(listPage, /sortKey: "when"/);
});

test("appointment UI derives future slots and branch-aligned resources from saved data", () => {
  assert.deepEqual(scheduleWindowSlots([
    { openTime: "09:00", closeTime: "12:00", slotMinutes: 60 },
    { openTime: "14:00", closeTime: "16:00", slotMinutes: 60 },
  ]), ["09:00", "10:00", "11:00", "14:00", "15:00"]);
  assert.match(form, /function configuredSlots\(/);
  assert.match(form, /hours\.dayOfWeek === dayOfWeek && !hours\.isClosed/);
  assert.match(form, /current \+ hours\.slotMinutes <= close/);
  assert.match(form, /slots\.filter\(\(slot\) => slot > current\.time\)/);
  assert.match(form, /selectedLocation\?\.providerIds\.includes\(provider\.id\)/);
  assert.match(form, /selectedLocation\?\.serviceIds/);
  assert.match(form, /assigned\.includes\(service\.id\)/);
  // The opposite of what this once asserted, and deliberately so: the form used
  // to dead-end with "No future configured slots for this date". A day with no
  // configured slots now falls back to a free-text time so the visit still
  // saves. Asserting the fallback keeps the dead-end from coming back.
  assert.match(form, /selectableTimes\.length \? \(/);
  assert.match(form, /<input\s+type="time"/);
  assert.doesNotMatch(form, /No future configured slots for this date/);
  assert.match(form, /saved\.error \|\| "Failed to save appointment\."/);
});

test("appointment validation caps notes and uses canonical date and time parsers", () => {
  assert.equal(
    appointmentDateFromKey("2026-08-14").toISOString(),
    "2026-08-14T12:00:00.000Z",
  );
  assert.match(validation, /parseClinicDate\(value\)/);
  assert.match(validation, /parseAppointmentTime\(value\)/);
  assert.match(validation, /notes: z\.string\(\)\.max\(5000, "Notes are too long"\)\.optional\(\)/);
});

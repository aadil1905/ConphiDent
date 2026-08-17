import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Source is normalised to LF before matching.
 *
 * `core.autocrlf` is true, so a Windows working copy has CRLF endings, and any
 * pattern that spans lines then silently fails to match. That looked exactly
 * like the code having drifted away from the test, which is part of why these
 * files sat unrun. Normalised, the patterns mean what they say on any platform.
 */
const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8").replace(/\r\n/g, "\n");
const tenantActions = read("app/dashboard/settings/operations/actions.ts");
const platformActions = read("app/platform/clinics/[clinicId]/actions.ts");
const platformPage = read("app/platform/clinics/[clinicId]/page.tsx");

function actionSource(source, name, nextName) {
  const start = source.indexOf(`export async function ${name}`);
  const end = nextName ? source.indexOf(`export async function ${nextName}`, start) : source.length;
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must exist after ${name}`);
  return source.slice(start, end);
}

function compiledScheduleInput(source) {
  const match = source.match(/function scheduleInput\(formData: FormData\) \{[\s\S]*?\n\}/);
  assert.ok(match, "scheduleInput must exist");
  const javascript = match[0].replace("formData: FormData", "formData");
  return Function(`"use strict"; ${javascript}; return scheduleInput;`)();
}

function scheduleForm(values) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, String(value));
  return formData;
}

test("tenant schedule save is authenticated, tenant-derived, transactional, and audited", () => {
  const action = actionSource(tenantActions, "saveHoursAction", "saveWhatsAppCopyAction");
  assert.match(action, /const owner = await requireOwner\(\)/);
  assert.match(action, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(action, /clinicId: owner\.clinicId, active: true, isPrimary: true/);
  assert.match(action, /tx\.clinicHours\.upsert/);
  assert.match(action, /tx\.clinicLocationHours\.upsert/);
  assert.match(action, /tx\.auditLog\.create/);
  assert.doesNotMatch(action, /Number\(formData\.get\("clinicId"\)\)/);
});

test("schedule actions reject malformed times, days, and slot ranges", () => {
  for (const source of [tenantActions, platformActions]) {
    assert.match(source, /\^\(\[01\]\\d\|2\[0-3\]\):\[0-5\]\\d\$/);
    assert.match(source, /!Number\.isInteger\(dayOfWeek\)/);
    assert.match(source, /dayOfWeek < 0/);
    assert.match(source, /dayOfWeek > 6/);
    assert.match(source, /!Number\.isInteger\(slotMinutes\)/);
    assert.match(source, /slotMinutes < 15/);
    assert.match(source, /slotMinutes > 240/);
    assert.match(source, /!isClosed && openTime >= closeTime/);
  }

  // Only the tenant form grew a second session. The platform form did not, so
  // the two are no longer the same shape and are asserted separately.
  for (const source of [tenantActions, platformActions]) {
    const parse = compiledScheduleInput(source);
    const splitShift = source === tenantActions;
    const valid = { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", slotMinutes: 30 };
    assert.deepEqual(
      parse(scheduleForm(valid)),
      splitShift ? { ...valid, isClosed: false, second: null } : { ...valid, isClosed: false },
    );
    assert.equal(parse(scheduleForm({ ...valid, openTime: "9:00" })), null);
    assert.equal(parse(scheduleForm({ ...valid, openTime: "09:00junk" })), null);
    assert.equal(parse(scheduleForm({ ...valid, dayOfWeek: 7 })), null);
    assert.equal(parse(scheduleForm({ ...valid, slotMinutes: 14 })), null);
    assert.equal(parse(scheduleForm({ ...valid, slotMinutes: 241 })), null);
    assert.equal(parse(scheduleForm({ ...valid, slotMinutes: 15.5 })), null);
    assert.equal(parse(scheduleForm({ ...valid, openTime: "18:00", closeTime: "18:00" })), null);
    assert.deepEqual(
      parse(scheduleForm({ ...valid, openTime: "18:00", closeTime: "18:00", isClosed: true })),
      splitShift
        ? { ...valid, openTime: "18:00", closeTime: "18:00", isClosed: true, second: null }
        : { ...valid, openTime: "18:00", closeTime: "18:00", isClosed: true },
    );

    if (!splitShift) continue;
    // The evening session a clinic that shuts for lunch needs. It was added
    // with no test at all, so these are new: both ends required, after the
    // morning closes, and never on a day marked closed.
    // A clinic that shuts for lunch: mornings to 13:00, evenings from 16:00.
    const morning = { ...valid, closeTime: "13:00" };
    const evening = { ...morning, openTime2: "16:00", closeTime2: "20:00" };
    assert.deepEqual(parse(scheduleForm(evening)), {
      ...morning, isClosed: false, second: { openTime: "16:00", closeTime: "20:00" },
    });
    assert.equal(parse(scheduleForm({ ...evening, closeTime2: "" })), null, "an evening with no end is rejected");
    assert.equal(parse(scheduleForm({ ...evening, openTime2: "" })), null, "an evening with no start is rejected");
    assert.equal(parse(scheduleForm({ ...evening, closeTime2: "16:00" })), null, "an evening that ends when it starts is rejected");
    assert.equal(parse(scheduleForm({ ...evening, openTime2: "17:00", closeTime2: "16:30" })), null, "an evening that runs backwards is rejected");
    // 12:00 is before the morning session closes at 13:00, so the two overlap.
    assert.equal(parse(scheduleForm({ ...evening, openTime2: "12:00" })), null, "an evening overlapping the morning is rejected");
    assert.deepEqual(
      parse(scheduleForm({ ...evening, isClosed: true })),
      { ...morning, isClosed: true, second: null },
      "a closed day carries no evening session",
    );
  }
});

test("platform branch mutation reauthorizes and verifies tenant ownership", () => {
  const action = actionSource(platformActions, "saveLocationHoursAction", "saveLocationAssignmentsAction");
  assert.match(action, /const admin = await requirePlatformPermission\("tenant\.update"\)/);
  assert.match(action, /where: \{ id: locationId, clinicId \}/);
  assert.match(action, /if \(!location\) throw new Error\("Branch does not belong to this clinic\."\)/);
  assert.match(action, /tx\.clinicLocationHours\.upsert/);
  assert.match(action, /if \(location\.isPrimary\)/);
  assert.match(action, /tx\.clinicHours\.upsert/);
  assert.match(action, /tx\.auditLog\.create/);
});

test("platform schedule UI exposes closed state and labels fallback rows", () => {
  assert.match(platformPage, /name="isClosed" type="checkbox" value="true"/);
  assert.match(platformPage, /defaultChecked=\{hour\.isClosed\}/);
  assert.match(platformPage, /savedHour \? \(hour\.isClosed \? "Saved · Closed" : "Saved · Open"\) : "Not configured"/);
  assert.match(platformPage, /Amber rows are suggested defaults only until saved/);
  assert.match(platformPage, /max="240"/);
});

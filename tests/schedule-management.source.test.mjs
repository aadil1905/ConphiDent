import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (file) => readFileSync(resolve(process.cwd(), file), "utf8");
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

  for (const source of [tenantActions, platformActions]) {
    const parse = compiledScheduleInput(source);
    const valid = { dayOfWeek: 4, openTime: "09:00", closeTime: "18:00", slotMinutes: 30 };
    assert.deepEqual(parse(scheduleForm(valid)), { ...valid, isClosed: false });
    assert.equal(parse(scheduleForm({ ...valid, openTime: "9:00" })), null);
    assert.equal(parse(scheduleForm({ ...valid, openTime: "09:00junk" })), null);
    assert.equal(parse(scheduleForm({ ...valid, dayOfWeek: 7 })), null);
    assert.equal(parse(scheduleForm({ ...valid, slotMinutes: 14 })), null);
    assert.equal(parse(scheduleForm({ ...valid, slotMinutes: 241 })), null);
    assert.equal(parse(scheduleForm({ ...valid, slotMinutes: 15.5 })), null);
    assert.equal(parse(scheduleForm({ ...valid, openTime: "18:00", closeTime: "18:00" })), null);
    assert.deepEqual(
      parse(scheduleForm({ ...valid, openTime: "18:00", closeTime: "18:00", isClosed: true })),
      { ...valid, openTime: "18:00", closeTime: "18:00", isClosed: true },
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

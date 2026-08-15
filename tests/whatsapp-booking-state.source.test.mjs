import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const booking = await readFile(new URL("lib/booking.ts", root), "utf8");
const appointment = await readFile(new URL("lib/appointment.ts", root), "utf8");
const inbox = await readFile(new URL("lib/whatsapp-webhook-inbox.ts", root), "utf8");

test("booking state is saved before its outbound prompt", () => {
  assert.match(booking, /await updateBooking\(userId, data\);\s*await reply\(\);/);
  assert.doesNotMatch(booking, /Promise\.all\(\[updateBooking\(userId, data\),\s*reply/);
});

test("booking dates are branch-timezone bounded to today through day 44", () => {
  assert.match(booking, /MAX_BOOKING_OFFSET_DAYS = 44/);
  assert.match(booking, /clinicDateAtOffset\(timezone, MAX_BOOKING_OFFSET_DAYS\)/);
  assert.doesNotMatch(booking, /Asia\/Kolkata/);
});

test("services are tenant scoped, branch aware, paginated, and revalidated", () => {
  assert.match(booking, /prisma\.clinicLocationService\.count/);
  assert.match(booking, /clinicId,\s*active: true/);
  assert.match(booking, /locations: \{ some: \{ locationId \} \}/);
  assert.match(booking, /SERVICE_PAGE_SIZE = 8/);
  assert.match(booking, /activeBookableService\(serviceId\)/);
  assert.match(booking, /reason: `SERVICE:\$\{service\.id\}:\$\{service\.name\}`/);
  assert.match(booking, /reason: service!\.name/);
  assert.doesNotMatch(booking, /REASON_NEW_CONSULTATION|REASON_FOLLOW_UP/);
});

test("the verified WhatsApp sender is used automatically and phone entry is never requested", () => {
  assert.match(booking, /const senderPhone = canonicalWhatsAppPhone\(userId\)/);
  assert.match(booking, /phone: senderPhone/);
  assert.doesNotMatch(booking, /validPhone\(input\)/);
  assert.doesNotMatch(booking, /sendTextMessage\(userId, copy\.phone\)/);
});

test("terminal booking states cannot receive abandoned reminders", () => {
  assert.match(booking, /step: \{ in: ACTIVE_BOOKING_STEPS \}/);
  assert.doesNotMatch(
    booking.match(/const ACTIVE_BOOKING_STEPS = \[[\s\S]*?\];/)?.[0] || "",
    /"booked"|"rescheduled"|"cancelled"/,
  );
});

test("durable completion is replay-safe and never reports a false failure", () => {
  assert.match(booking, /wasConfirmationRecorded/);
  assert.match(booking, /\["booked", "rescheduled"\]\.includes\(durable\.step\)\) return/);
  assert.match(booking, /bookingId: booking\.id/);
});

test("patient-confirmed WhatsApp bookings are stored as confirmed appointments", () => {
  assert.match(appointment, /source: "WhatsApp",\s*status: "Confirmed"/);
});

test("stale inbound is persisted and audited, STOP remains honored, and workflow is suppressed", () => {
  const recordIndex = inbox.indexOf("const conversation = await recordInboundMessage");
  const auditIndex = inbox.indexOf("await auditStaleInboundMessage");
  const stopIndex = inbox.indexOf("if (optedOut)");
  const staleIndex = inbox.indexOf("if (stale) return");
  const startIndex = inbox.indexOf("if (requestsOptIn(userMessage))");
  assert.ok(recordIndex >= 0 && recordIndex < auditIndex);
  assert.ok(auditIndex < stopIndex);
  assert.ok(stopIndex < staleIndex);
  assert.ok(staleIndex < startIndex);
  assert.match(inbox, /WHATSAPP_STALE_INBOUND_SUPPRESSED/);
  assert.match(inbox, /providerTimestamp: input\.providerTimestamp\.toISOString\(\)/);
});

test("human takeover suppresses ordinary media automation before its reply", () => {
  const handoffGate = inbox.indexOf('if (!emergency && ["HUMAN_ACTIVE", "HUMAN_ONLY", "PAUSED"]');
  const mediaReply = inbox.indexOf("if (media && !isEmergency(userMessage))");
  assert.ok(handoffGate >= 0 && handoffGate < mediaReply);
});

test("real appointment cancellation is explicit and draft cancellation stays separate", () => {
  assert.match(inbox, /CANCEL_APPOINTMENT_/);
  assert.match(inbox, /cancel my appointment/);
  assert.match(inbox, /await hasBooking\(from\)/);
  assert.match(booking, /step: "cancel_confirm"/);
  assert.match(booking, /CONFIRM_CANCELLATION/);
  assert.match(booking, /cancelAppointmentForWhatsApp/);
});

test("edited WhatsApp copy contains no UTF-8 mojibake markers", () => {
  assert.doesNotMatch(booking, /[Ã ÃƒÃ¢]/);
  assert.doesNotMatch(inbox, /[Ã ÃƒÃ¢]/);
});

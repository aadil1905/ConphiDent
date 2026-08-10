import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";

const testUrl = process.env.TEST_DATABASE_URL;
function isRealTestDatabaseUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol.startsWith("postgres") && url.username !== "user" && url.password !== "password";
  } catch {
    return false;
  }
}
const enabled = isRealTestDatabaseUrl(testUrl);
if (testUrl && !enabled) {
  console.warn("TEST_DATABASE_URL is an example value, so database tests were skipped safely.");
}
const prisma = enabled ? new PrismaClient({ datasourceUrl: testUrl }) : null;
const prefix = `reliability-${Date.now()}`;
let clinic;

async function deleteTestClinic(clinicId) {
  // Clinic-owned appointments deliberately use a restrictive clinic FK. Tests
  // and patients must be removed before deleting their temporary tenant.
  await prisma.appointment.deleteMany({ where: { clinicId } });
  await prisma.patient.deleteMany({ where: { clinicId } });
  await prisma.clinic.delete({ where: { id: clinicId } });
}

before(async () => {
  if (!prisma) return;
  clinic = await prisma.clinic.create({ data: { name: prefix, slug: prefix } });
});

after(async () => {
  if (!prisma || !clinic) return;
  await deleteTestClinic(clinic.id);
  await prisma.$disconnect();
});

test("patient and appointment creation rolls back as one unit", { skip: !enabled }, async () => {
  const phone = "9000000001";
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.patient.create({ data: { clinicId: clinic.id, fullName: "Rollback Patient", phone } });
    throw new Error("simulated appointment failure");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  assert.equal(await prisma.patient.count({ where: { clinicId: clinic.id, phone } }), 0);
});

test("concurrent slot claims cannot both commit under serializable isolation", { skip: !enabled }, async () => {
  const provider = await prisma.clinicProvider.create({ data: { clinicId: clinic.id, name: "Concurrency Dentist" } });
  const appointmentDate = new Date("2030-01-15T12:00:00.000Z");
  const claim = (phone) => prisma.$transaction(async (tx) => {
    const occupied = await tx.appointment.findFirst({ where: { clinicId: clinic.id, providerId: provider.id, appointmentDate, appointmentTime: "10:00", archivedAt: null, status: { notIn: ["Cancelled", "No-show"] } } });
    if (occupied) throw new Error("slot unavailable");
    return tx.appointment.create({ data: { clinicId: clinic.id, providerId: provider.id, patientName: phone, phone, appointmentDate, appointmentTime: "10:00", treatment: "Consultation" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const results = await Promise.allSettled([claim("9000000002"), claim("9000000003")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await prisma.appointment.count({ where: { clinicId: clinic.id, providerId: provider.id, appointmentDate, appointmentTime: "10:00" } }), 1);
});

test("partial payment and invoice status update commit atomically", { skip: !enabled }, async () => {
  const patient = await prisma.patient.create({ data: { clinicId: clinic.id, fullName: "Payment Patient", phone: "9000000004" } });
  const invoice = await prisma.invoice.create({ data: { invoiceNumber: `${prefix}-invoice`, patientId: patient.id, totalAmount: 1000 } });
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({ data: { invoiceId: invoice.id, amount: 400, method: "Cash" } });
    await tx.invoice.update({ where: { id: invoice.id }, data: { status: "Partially Paid" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const saved = await prisma.invoice.findUnique({ where: { id: invoice.id }, include: { payments: true } });
  assert.equal(saved.status, "Partially Paid");
  assert.equal(saved.payments.reduce((sum, payment) => sum + payment.amount, 0), 400);
});

test("failed transaction leaves no partial payment", { skip: !enabled }, async () => {
  const invoice = await prisma.invoice.findUnique({ where: { invoiceNumber: `${prefix}-invoice` }, include: { payments: true } });
  await assert.rejects(prisma.$transaction(async (tx) => {
    await tx.payment.create({ data: { invoiceId: invoice.id, amount: 700, method: "Cash" } });
    throw new Error("payment exceeds outstanding amount");
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }));
  assert.equal(await prisma.payment.count({ where: { invoiceId: invoice.id } }), 1);
});

test("Prisma exposes serializable conflict errors for retry handling", () => {
  const error = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "test" });
  assert.equal(error.code, "P2034");
});

test("clinic A cannot retrieve clinic B patient, appointment, invoice, or payment by ID", { skip: !enabled }, async () => {
  const clinicA = await prisma.clinic.create({ data: { name: `${prefix}-tenant-a`, slug: `${prefix}-tenant-a` } });
  const clinicB = await prisma.clinic.create({ data: { name: `${prefix}-tenant-b`, slug: `${prefix}-tenant-b` } });
  try {
    const patientB = await prisma.patient.create({ data: { clinicId: clinicB.id, fullName: "Clinic B Patient", phone: "9000000091" } });
    const appointmentB = await prisma.appointment.create({ data: { clinicId: clinicB.id, patientId: patientB.id, patientName: patientB.fullName, phone: patientB.phone, appointmentDate: new Date("2030-02-01T00:00:00.000Z"), appointmentTime: "10:00", treatment: "Consultation" } });
    const invoiceB = await prisma.invoice.create({ data: { invoiceNumber: `${prefix}-tenant-b-invoice`, patientId: patientB.id, totalAmount: 1000 } });
    const paymentB = await prisma.payment.create({ data: { invoiceId: invoiceB.id, amount: 100, method: "Cash" } });
    assert.equal(await prisma.patient.findFirst({ where: { id: patientB.id, clinicId: clinicA.id } }), null);
    assert.equal(await prisma.appointment.findFirst({ where: { id: appointmentB.id, clinicId: clinicA.id } }), null);
    assert.equal(await prisma.invoice.findFirst({ where: { id: invoiceB.id, patient: { clinicId: clinicA.id } } }), null);
    assert.equal(await prisma.payment.findFirst({ where: { id: paymentB.id, invoice: { patient: { clinicId: clinicA.id } } } }), null);
  } finally {
    await deleteTestClinic(clinicA.id);
    await deleteTestClinic(clinicB.id);
  }
});

test("branch availability data stays tenant-scoped and supports split shifts", { skip: !enabled }, async () => {
  const clinicA = await prisma.clinic.create({ data: { name: `${prefix}-branch-a`, slug: `${prefix}-branch-a` } });
  const clinicB = await prisma.clinic.create({ data: { name: `${prefix}-branch-b`, slug: `${prefix}-branch-b` } });
  try {
    const locationA = await prisma.clinicLocation.create({ data: { clinicId: clinicA.id, name: "A primary", isPrimary: true, hours: { create: [{ dayOfWeek: 1, openTime: "09:00", closeTime: "12:00", sortOrder: 0 }, { dayOfWeek: 1, openTime: "14:00", closeTime: "18:00", sortOrder: 1 }] } } });
    const locationB = await prisma.clinicLocation.create({ data: { clinicId: clinicB.id, name: "B inactive", active: false, isPrimary: true } });
    assert.equal(await prisma.clinicLocation.findFirst({ where: { id: locationB.id, clinicId: clinicA.id, active: true } }), null);
    const hours = await prisma.clinicLocationHours.findMany({ where: { locationId: locationA.id, dayOfWeek: 1 }, orderBy: { sortOrder: "asc" } });
    assert.deepEqual(hours.map((hour) => [hour.openTime, hour.closeTime]), [["09:00", "12:00"], ["14:00", "18:00"]]);
  } finally {
    await deleteTestClinic(clinicA.id);
    await deleteTestClinic(clinicB.id);
  }
});

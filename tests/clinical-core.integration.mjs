import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  PERMANENT_FDI_CODES,
  PRIMARY_FDI_CODES,
  STANDARD_FDI_CODES,
  calculateAgeMonths,
  dentitionForFdiCode,
  isFdiAllowedForStage,
  isStandardFdiCode,
  suggestDentitionStage,
  toothRowsForStage,
} from "../lib/dentition.ts";

test("WHO/FDI registry contains 32 permanent and 20 primary teeth without duplicates", () => {
  assert.equal(PERMANENT_FDI_CODES.length, 32);
  assert.equal(PRIMARY_FDI_CODES.length, 20);
  assert.equal(STANDARD_FDI_CODES.length, 52);
  assert.equal(new Set(STANDARD_FDI_CODES).size, 52);
  assert.equal(dentitionForFdiCode("11"), "PERMANENT");
  assert.equal(dentitionForFdiCode("51"), "PRIMARY");
  assert.equal(isStandardFdiCode("19"), false);
  assert.equal(isStandardFdiCode("56"), false);
});

test("dentition stage gates FDI codes and mixed dentition displays both sets", () => {
  assert.equal(isFdiAllowedForStage("55", "PRIMARY"), true);
  assert.equal(isFdiAllowedForStage("11", "PRIMARY"), false);
  assert.equal(isFdiAllowedForStage("11", "PERMANENT"), true);
  assert.equal(isFdiAllowedForStage("55", "PERMANENT"), false);
  assert.equal(isFdiAllowedForStage("55", "MIXED"), true);
  assert.equal(isFdiAllowedForStage("11", "MIXED"), true);
  assert.equal(toothRowsForStage("MIXED").flatMap((row) => row.teeth).length, 52);
});

test("age suggests primary, mixed, or permanent without overriding clinician confirmation", () => {
  const reference = "2030-01-01T12:00:00.000Z";
  assert.equal(suggestDentitionStage("2024-01-02T00:00:00.000Z", reference), "PRIMARY");
  assert.equal(suggestDentitionStage("2024-01-01T00:00:00.000Z", reference), "MIXED");
  assert.equal(suggestDentitionStage("2017-01-02T00:00:00.000Z", reference), "MIXED");
  assert.equal(suggestDentitionStage("2017-01-01T00:00:00.000Z", reference), "PERMANENT");
  assert.equal(calculateAgeMonths("2029-12-02T00:00:00.000Z", reference), 0);
  assert.equal(suggestDentitionStage(null, reference), null);
});

const testUrl = process.env.TEST_DATABASE_URL;
function safeTestUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol.startsWith("postgres") && /test/i.test(url.pathname) && url.username !== "user" && url.password !== "password";
  } catch {
    return false;
  }
}
const databaseEnabled = safeTestUrl(testUrl);
const prisma = databaseEnabled ? new PrismaClient({ datasourceUrl: testUrl }) : null;
const prefix = `clinical-core-${Date.now()}`;
let clinic;
let otherClinic;
let user;
let patient;

before(async () => {
  if (!prisma) return;
  clinic = await prisma.clinic.create({ data: { name: prefix, slug: prefix } });
  otherClinic = await prisma.clinic.create({ data: { name: `${prefix}-other`, slug: `${prefix}-other` } });
  user = await prisma.user.create({ data: { clinicId: clinic.id, fullName: "Clinical Test Dentist", email: `${prefix}@example.test`, passwordHash: "not-a-real-login", role: "DENTIST" } });
  patient = await prisma.patient.create({ data: { clinicId: clinic.id, fullName: "FDI Test Patient", phone: `9${String(Date.now()).slice(-9)}`, dateOfBirth: new Date("2019-01-01T00:00:00.000Z") } });
});

after(async () => {
  if (!prisma) return;
  await prisma.patientTimelineEvent.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.auditLog.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.dentalFinding.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.dentitionAssessment.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.patientTooth.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.encounter.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.patient.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.user.deleteMany({ where: { clinicId: { in: [clinic.id, otherClinic.id] } } });
  await prisma.clinic.deleteMany({ where: { id: { in: [clinic.id, otherClinic.id] } } });
  await prisma.$disconnect();
});

test("encounter dentition and append-only finding history stay tenant-scoped", { skip: !databaseEnabled }, async () => {
  const encounter = await prisma.encounter.create({ data: { clinicId: clinic.id, patientId: patient.id, createdById: user.id, occurredAt: new Date(), status: "COMPLETED", source: "IMPORT" } });
  await prisma.dentitionAssessment.create({ data: { clinicId: clinic.id, patientId: patient.id, encounterId: encounter.id, stage: "MIXED", suggestedStage: "MIXED", ageMonths: 91, confirmedById: user.id } });
  const tooth = await prisma.patientTooth.create({ data: { clinicId: clinic.id, patientId: patient.id, dentition: "PRIMARY", fdiCode: "55" } });
  const original = await prisma.dentalFinding.create({ data: { clinicId: clinic.id, patientId: patient.id, encounterId: encounter.id, patientToothId: tooth.id, toothCodeSnapshot: "55", recordType: "FINDING", condition: "CARIES", surfaces: ["O"], authorId: user.id, signedAt: new Date() } });
  await prisma.$transaction([
    prisma.dentalFinding.update({ where: { id: original.id }, data: { status: "SUPERSEDED" } }),
    prisma.dentalFinding.create({ data: { clinicId: clinic.id, patientId: patient.id, encounterId: encounter.id, patientToothId: tooth.id, toothCodeSnapshot: "55", recordType: "FINDING", condition: "WATCH", surfaces: ["O"], authorId: user.id, signedAt: new Date(), version: 2, supersedesId: original.id, correctionReason: "Radiograph review changed assessment" } }),
  ]);

  const history = await prisma.dentalFinding.findMany({ where: { clinicId: clinic.id, patientId: patient.id, patientToothId: tooth.id }, orderBy: { version: "asc" } });
  assert.deepEqual(history.map((item) => [item.version, item.condition, item.status]), [[1, "CARIES", "SUPERSEDED"], [2, "WATCH", "ACTIVE"]]);
  assert.equal(await prisma.dentalFinding.findFirst({ where: { id: history[1].id, clinicId: otherClinic.id } }), null);
  assert.equal(await prisma.dentitionAssessment.findFirst({ where: { encounterId: encounter.id, clinicId: otherClinic.id } }), null);
});

test("archiving a patient retains clinical history", { skip: !databaseEnabled }, async () => {
  await prisma.patient.update({ where: { id: patient.id }, data: { archivedAt: new Date(), archiveReason: "Duplicate patient record retained", archivedByUserId: user.id } });
  assert.equal(await prisma.patient.count({ where: { id: patient.id, clinicId: clinic.id, archivedAt: null } }), 0);
  assert.equal(await prisma.dentalFinding.count({ where: { patientId: patient.id, clinicId: clinic.id } }), 2);
});

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { parseDicomPart10 } from "../lib/dicom.ts";
import { comparisonCompatibility, sniffImagingType } from "../lib/imaging-core.ts";
import { imagingAccessSignature, validImagingAccessSignature } from "../lib/imaging-access-core.ts";
import { createSafeImagingThumbnail } from "../lib/imaging-derivatives.ts";
import sharp from "sharp";

function dicomElement(group, element, vr, raw) {
  const padding = raw.length % 2 ? (vr === "UI" ? "\0" : " ") : "";
  const value = Buffer.from(raw + padding, "ascii");
  const header = Buffer.alloc(8);
  header.writeUInt16LE(group, 0);
  header.writeUInt16LE(element, 2);
  header.write(vr, 4, 2, "ascii");
  header.writeUInt16LE(value.length, 6);
  return Buffer.concat([header, value]);
}

function dicomFixture(transferSyntax = "1.2.840.10008.1.2.1") {
  const preamble = Buffer.alloc(132);
  preamble.write("DICM", 128, "ascii");
  return new Uint8Array(Buffer.concat([
    preamble,
    dicomElement(0x0002, 0x0010, "UI", transferSyntax),
    dicomElement(0x0008, 0x0016, "UI", "1.2.840.10008.5.1.4.1.1.1"),
    dicomElement(0x0008, 0x0018, "UI", "1.2.826.0.1.3680043.10.1000.1"),
    dicomElement(0x0008, 0x0020, "DA", "20260811"),
    dicomElement(0x0008, 0x0050, "SH", "ACC-2026-001"),
    dicomElement(0x0008, 0x0060, "CS", "DX"),
    dicomElement(0x0010, 0x0010, "PN", "TEST^PATIENT"),
    dicomElement(0x0010, 0x0020, "LO", "DICOM-42"),
    dicomElement(0x0010, 0x0030, "DA", "20150102"),
    dicomElement(0x0018, 0x0060, "DS", "70"),
    dicomElement(0x0018, 0x1150, "IS", "125"),
    dicomElement(0x0020, 0x000d, "UI", "1.2.826.0.1.3680043.10.1000.2"),
    dicomElement(0x0020, 0x000e, "UI", "1.2.826.0.1.3680043.10.1000.3"),
    dicomElement(0x0020, 0x0011, "IS", "1"),
    dicomElement(0x0020, 0x0013, "IS", "1"),
  ]));
}

test("controlled import recognizes supported file signatures and rejects extension-only content", () => {
  assert.equal(sniffImagingType(dicomFixture()), "application/dicom");
  assert.equal(sniffImagingType(new Uint8Array([0xff, 0xd8, 0xff, 0x00])), "image/jpeg");
  assert.equal(sniffImagingType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImagingType(new TextEncoder().encode("patient.jpg.exe")), null);
});

test("DICOM Part 10 parsing preserves identity, UID, acquisition, and radiation metadata without reading pixels", () => {
  const metadata = parseDicomPart10(dicomFixture());
  assert.equal(metadata.transferSyntaxUid, "1.2.840.10008.1.2.1");
  assert.equal(metadata.studyInstanceUid, "1.2.826.0.1.3680043.10.1000.2");
  assert.equal(metadata.seriesInstanceUid, "1.2.826.0.1.3680043.10.1000.3");
  assert.equal(metadata.patientId, "DICOM-42");
  assert.equal(metadata.patientBirthDate, "20150102");
  assert.equal(metadata.accessionNumber, "ACC-2026-001");
  assert.equal(metadata.kvp, "70");
  assert.equal(metadata.exposureTimeMs, "125");
});

test("unsupported transfer syntax and malformed non-Part-10 content fail closed", () => {
  assert.throws(() => parseDicomPart10(dicomFixture("1.2.840.10008.1.2.2")), /Big-endian/);
  assert.throws(() => parseDicomPart10(new Uint8Array(132)), /DICOM Part 10/);
});

test("comparison compatibility never implies equivalence across modalities or regions", () => {
  assert.equal(comparisonCompatibility({ modality: "BITEWING", anatomicalRegion: "RIGHT" }, { modality: "PANORAMIC", anatomicalRegion: "RIGHT" }).compatible, false);
  assert.equal(comparisonCompatibility({ modality: "BITEWING", anatomicalRegion: "RIGHT" }, { modality: "BITEWING", anatomicalRegion: "LEFT" }).compatible, false);
  const same = comparisonCompatibility({ modality: "BITEWING", anatomicalRegion: "RIGHT" }, { modality: "BITEWING", anatomicalRegion: "RIGHT" });
  assert.equal(same.compatible, true);
  assert.match(same.note, /geometry may still differ/i);
});

test("short-lived imaging access signatures bind asset, tenant, and expiry", () => {
  const secret = "test-only-secret-that-is-at-least-thirty-two-characters";
  const now = 1_700_000_000;
  const expires = now + 300;
  const supplied = imagingAccessSignature(secret, "asset-1", 10, expires);
  assert.equal(validImagingAccessSignature({ secret, assetId: "asset-1", clinicId: 10, expires, supplied, now }), true);
  assert.equal(validImagingAccessSignature({ secret, assetId: "asset-1", clinicId: 11, expires, supplied, now }), false);
  assert.equal(validImagingAccessSignature({ secret, assetId: "asset-2", clinicId: 10, expires, supplied, now }), false);
  assert.equal(validImagingAccessSignature({ secret, assetId: "asset-1", clinicId: 10, expires, supplied, now: expires }), false);
  assert.equal(validImagingAccessSignature({ secret, assetId: "asset-1", clinicId: 10, expires: now + 601, supplied: imagingAccessSignature(secret, "asset-1", 10, now + 601), now }), false);
});

test("renderable imports receive a bounded derivative while the original bytes remain unchanged", async () => {
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#7dd3fc" } }).png().toBuffer();
  const before = Buffer.from(original);
  const thumbnail = await createSafeImagingThumbnail(original);
  assert.equal(Buffer.compare(original, before), 0);
  assert.ok(thumbnail.width <= 512 && thumbnail.height <= 512);
  assert.equal(thumbnail.data.subarray(0, 3).toString("hex"), "ffd8ff");
  assert.match(thumbnail.sha256, /^[a-f0-9]{64}$/);
});

const testUrl = process.env.TEST_DATABASE_URL;
function safeTestUrl(value) {
  if (!value) return false;
  try { const url = new URL(value); return url.protocol.startsWith("postgres") && /test/i.test(url.pathname) && url.username !== "user" && url.password !== "password"; } catch { return false; }
}
const databaseEnabled = safeTestUrl(testUrl);
const prisma = databaseEnabled ? new PrismaClient({ datasourceUrl: testUrl }) : null;
const prefix = `imaging-${Date.now()}`;
let clinic;
let otherClinic;
let user;
let patient;
let otherPatient;
let source;

before(async () => {
  if (!prisma) return;
  clinic = await prisma.clinic.create({ data: { name: prefix, slug: prefix } });
  otherClinic = await prisma.clinic.create({ data: { name: `${prefix}-other`, slug: `${prefix}-other` } });
  user = await prisma.user.create({ data: { clinicId: clinic.id, fullName: "Imaging Test Dentist", email: `${prefix}@example.test`, passwordHash: "not-a-login", role: "DENTIST" } });
  patient = await prisma.patient.create({ data: { clinicId: clinic.id, fullName: "Imaging Patient", phone: `8${String(Date.now()).slice(-9)}` } });
  otherPatient = await prisma.patient.create({ data: { clinicId: otherClinic.id, fullName: "Other Tenant Patient", phone: `7${String(Date.now()).slice(-9)}` } });
  source = await prisma.imagingSource.create({ data: { clinicId: clinic.id, name: "Test controlled import", adapterType: "MANUAL_DICOM" } });
});

after(async () => {
  if (!prisma) return;
  const clinicIds = [clinic.id, otherClinic.id];
  await prisma.imagingProcessingJob.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingIngestEvent.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingMatchResolution.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingComparison.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingAnnotation.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingReport.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingAsset.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingInstance.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingSeries.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingStudy.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.imagingSource.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.patientTimelineEvent.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.auditLog.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.patient.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.user.deleteMany({ where: { clinicId: { in: clinicIds } } });
  await prisma.clinic.deleteMany({ where: { id: { in: clinicIds } } });
  await prisma.$disconnect();
});

function studyData(overrides = {}) {
  return { clinicId: clinic.id, acquiringOperatorId: user.id, createdById: user.id, sourceId: source.id, sourceType: "MANUAL_DICOM", status: "UNMATCHED", matchStatus: "UNMATCHED", modality: "BITEWING", acquisitionDate: new Date("2026-08-11T08:00:00.000Z"), contentHash: `${prefix}-${crypto.randomUUID()}`, idempotencyKey: `${prefix}-${crypto.randomUUID()}`, ...overrides };
}

test("repository uniqueness and all reads remain tenant-scoped", { skip: !databaseEnabled }, async () => {
  const study = await prisma.imagingStudy.create({ data: studyData({ contentHash: `${prefix}-same-content`, idempotencyKey: `${prefix}-first` }) });
  assert.equal(await prisma.imagingStudy.findFirst({ where: { id: study.id, clinicId: otherClinic.id } }), null);
  await assert.rejects(() => prisma.imagingStudy.create({ data: studyData({ contentHash: `${prefix}-same-content`, idempotencyKey: `${prefix}-second` }) }), (error) => error?.code === "P2002");
});

test("unmatched resolution, signed report correction, and derived comparison preserve history", { skip: !databaseEnabled }, async () => {
  const unmatched = await prisma.imagingStudy.create({ data: studyData({ sourcePatientName: "IMAGING PATIENT", dicomPatientId: "PX-1" }) });
  await prisma.$transaction([
    prisma.imagingStudy.update({ where: { id: unmatched.id }, data: { patientId: patient.id, matchStatus: "CONFIRMED", status: "AVAILABLE", matchReason: "Verified DICOM ID and clinic record" } }),
    prisma.imagingMatchResolution.create({ data: { clinicId: clinic.id, studyId: unmatched.id, patientId: patient.id, resolvedById: user.id, decision: "MANUAL_CONFIRMED", signals: { dicomPatientId: "PX-1" }, reason: "Verified DICOM ID and clinic record" } }),
  ]);
  const first = await prisma.imagingReport.create({ data: { clinicId: clinic.id, studyId: unmatched.id, authorId: user.id, status: "FINAL", findings: "Baseline finding", version: 1, signedAt: new Date() } });
  await prisma.$transaction([
    prisma.imagingReport.update({ where: { id: first.id }, data: { status: "SUPERSEDED" } }),
    prisma.imagingReport.create({ data: { clinicId: clinic.id, studyId: unmatched.id, authorId: user.id, status: "FINAL", findings: "Corrected finding", version: 2, signedAt: new Date(), correctionReason: "Corrected after image review", supersedesId: first.id } }),
  ]);
  const followup = await prisma.imagingStudy.create({ data: studyData({ patientId: patient.id, matchStatus: "CONFIRMED", status: "REVIEWED", acquisitionDate: new Date("2026-08-12T08:00:00.000Z") }) });
  const comparison = await prisma.imagingComparison.create({ data: { clinicId: clinic.id, patientId: patient.id, baselineStudyId: unmatched.id, followupStudyId: followup.id, authorId: user.id, note: "Post-treatment review is stable.", compatibilityNote: "Same modality; geometry may still differ." } });
  const reports = await prisma.imagingReport.findMany({ where: { studyId: unmatched.id }, orderBy: { version: "asc" } });
  assert.deepEqual(reports.map((item) => [item.version, item.status]), [[1, "SUPERSEDED"], [2, "FINAL"]]);
  assert.equal((await prisma.imagingMatchResolution.count({ where: { studyId: unmatched.id, clinicId: clinic.id } })), 1);
  assert.equal((await prisma.imagingComparison.findFirst({ where: { id: comparison.id, clinicId: otherClinic.id } })), null);
  assert.equal((await prisma.imagingStudy.findUnique({ where: { id: unmatched.id } })).contentHash, unmatched.contentHash);
  assert.notEqual(otherPatient.id, patient.id);
});

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiFeature } from "@/lib/tenant";
import { IMAGING_MODALITY_LABELS, type ImagingModality } from "@/lib/imaging";

function date(value: Date) { return value.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" }); }

export async function GET(request: Request) {
  const { user, response } = await requireApiFeature("imaging", "signImaging");
  if (!user) return response!;
  const patientId = Number(new URL(request.url).searchParams.get("patientId"));
  if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "Select a valid patient." }, { status: 400 });
  const patient = await prisma.patient.findFirst({ where: { id: patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true } });
  if (!patient) return NextResponse.json({ error: "The patient is not available in this clinic." }, { status: 404 });
  const [studies, plans, procedures] = await Promise.all([
    prisma.imagingStudy.findMany({ where: { clinicId: user.clinicId, patientId, archivedAt: null, enteredInErrorAt: null }, orderBy: { acquisitionDate: "desc" }, take: 250, select: { id: true, modality: true, acquisitionDate: true, anatomicalRegion: true } }),
    prisma.treatmentPlan.findMany({ where: { clinicId: user.clinicId, patientId, cancelledAt: null }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } }),
    prisma.dentalFinding.findMany({ where: { clinicId: user.clinicId, patientId, status: "ACTIVE", recordType: "COMPLETED_PROCEDURE" }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, toothCodeSnapshot: true, condition: true } }),
  ]);
  return NextResponse.json({
    studies: studies.map((item) => ({ id: item.id, label: `${IMAGING_MODALITY_LABELS[item.modality as ImagingModality] || item.modality.replaceAll("_", " ")} · ${date(item.acquisitionDate)} · ${item.anatomicalRegion || "region not recorded"}` })),
    plans: plans.map((item) => ({ id: item.id, label: item.title })),
    procedures: procedures.map((item) => ({ id: item.id, label: `FDI ${item.toothCodeSnapshot} · ${item.condition.replaceAll("_", " ")}` })),
  });
}

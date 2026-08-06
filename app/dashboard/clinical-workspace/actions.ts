"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const conditions = ["HEALTHY", "CARIES", "FILLING", "CROWN", "ROOT_CANAL", "MISSING", "IMPLANT", "WATCH"];
const conditionLabels: Record<string, string> = {
  HEALTHY: "Healthy",
  CARIES: "Caries",
  FILLING: "Filling",
  CROWN: "Crown",
  ROOT_CANAL: "Root canal",
  MISSING: "Missing",
  IMPLANT: "Implant",
  WATCH: "Watch",
};

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function localDayRange(dayKey: string) {
  const start = new Date(`${dayKey}T00:00:00.000+05:30`);
  const end = new Date(`${dayKey}T23:59:59.999+05:30`);
  return { start, end };
}

function todayKey() {
  return dateKey(new Date());
}

export async function saveDentalChartEntryAction(formData: FormData) {
  formData.set("toothNumbers", String(formData.get("toothNumber") || ""));
  await saveDentalChartEntriesAction(formData);
}

export async function saveDentalChartEntriesAction(formData: FormData) {
  await requireUser();
  const patientId = Number(formData.get("patientId"));
  const toothNumbers = Array.from(new Set(String(formData.get("toothNumbers") || "").split(",").filter(Boolean)));
  const condition = String(formData.get("condition") || "HEALTHY");
  const notes = String(formData.get("notes") || "").trim() || null;
  const visitDateInput = String(formData.get("visitDate") || "").trim();
  const allowNewWorkspace = String(formData.get("allowNewWorkspace") || "") === "1";
  if (
    !Number.isInteger(patientId) ||
    toothNumbers.length === 0 ||
    !conditions.includes(condition) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(visitDateInput)
  ) {
    return;
  }

  const appointmentForVisit = await prisma.appointment.findFirst({
    where: { patientId, status: "Completed", appointmentDate: { gte: localDayRange(visitDateInput).start, lte: localDayRange(visitDateInput).end } },
    select: { appointmentDate: true },
  });
  if (!appointmentForVisit && (!allowNewWorkspace || visitDateInput !== todayKey())) return;

  const { start: visitStart, end: visitEnd } = localDayRange(visitDateInput);
  const visitDate = appointmentForVisit?.appointmentDate ?? localDayRange(visitDateInput).start;

  const [existingChartEntries, existingRecords] = await Promise.all([
    prisma.dentalChartEntry.findMany({ where: { patientId, toothNumber: { in: toothNumbers }, visitDate: { gte: visitStart, lte: visitEnd } } }),
    prisma.clinicalRecord.findMany({
    where: {
      patientId,
      visitDate: { gte: visitStart, lte: visitEnd },
    },
  }),
  ]);
  const chartByTooth = new Map(existingChartEntries.map((entry) => [entry.toothNumber, entry]));
  const recordByTooth = new Map(existingRecords.map((record) => [record.chiefComplaint.match(/^Tooth (\d+) -/)?.[1], record]));
  await prisma.$transaction(toothNumbers.flatMap((toothNumber) => {
    const chartData = { condition, notes, visitDate };
    const recordData = { patientId, visitDate, chiefComplaint: `Tooth ${toothNumber} - ${conditionLabels[condition]}`, diagnosis: conditionLabels[condition], clinicalNotes: notes || `Updated tooth ${toothNumber} in clinical workspace.` };
    const existingChart = chartByTooth.get(toothNumber);
    const existingRecord = recordByTooth.get(toothNumber);
    return [
      existingChart ? prisma.dentalChartEntry.update({ where: { id: existingChart.id }, data: chartData }) : prisma.dentalChartEntry.create({ data: { patientId, toothNumber, ...chartData } }),
      existingRecord ? prisma.clinicalRecord.update({ where: { id: existingRecord.id }, data: recordData }) : prisma.clinicalRecord.create({ data: recordData }),
    ];
  }));
  revalidatePath(`/dashboard/clinical-workspace/${patientId}`);
}

export async function clearVisitDentalWorkspaceAction(formData: FormData) {
  await requireUser();
  const patientId = Number(formData.get("patientId"));
  const visitDateInput = String(formData.get("visitDate") || "").trim();

  if (!Number.isInteger(patientId) || !/^\d{4}-\d{2}-\d{2}$/.test(visitDateInput)) {
    return;
  }

  const completedAppointments = await prisma.appointment.findMany({
    where: { patientId, status: "Completed" },
    select: { appointmentDate: true },
  });
  const hasCompletedVisit = completedAppointments.some(
    (appointment) => dateKey(appointment.appointmentDate) === visitDateInput,
  );
  if (!hasCompletedVisit) return;

  const { start: visitStart, end: visitEnd } = localDayRange(visitDateInput);

  await prisma.dentalChartEntry.deleteMany({
    where: {
      patientId,
      visitDate: { gte: visitStart, lte: visitEnd },
    },
  });

  await prisma.clinicalRecord.deleteMany({
    where: {
      patientId,
      chiefComplaint: { startsWith: "Tooth " },
      visitDate: { gte: visitStart, lte: visitEnd },
    },
  });

  revalidatePath(`/dashboard/clinical-workspace/${patientId}`);
  revalidatePath(`/dashboard/patients/${patientId}`);
}

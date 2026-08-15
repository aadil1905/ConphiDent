import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { treatmentPlanSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";
import { findVisitForDate, localDate } from "@/lib/clinical-appointments";
import { isFdiAllowedForStage, isStandardFdiCode, type DentitionStage } from "@/lib/dentition";
import { ensureEncounter } from "@/lib/encounters";

export async function POST(request: Request) {
  try {
    const { user, response } = await requireApiPermission("manageClinical");
    if (!user) return response;
    const raw = await request.json();
    const dentitionStage = String(raw.dentitionStage || "NOT_ASSESSED") as DentitionStage;
    const data = treatmentPlanSchema.parse(raw);
    if (!data.visitDate) {
      return NextResponse.json(
        { error: "Pick the date this plan belongs to." },
        { status: 400 },
      );
    }
    const visitDate = data.visitDate;
    const patient = await prisma.patient.findFirst({ where: { id: data.patientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true } });
    if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    if (data.serviceId) {
      const service = await prisma.clinicService.findFirst({ where: { id: data.serviceId, clinicId: user.clinicId }, select: { id: true } });
      if (!service) return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }
    for (const item of data.items) {
      if (!item.serviceId) continue;
      const service = await prisma.clinicService.findFirst({ where: { id: item.serviceId, clinicId: user.clinicId }, select: { id: true } });
      if (!service) return NextResponse.json({ error: "One of the selected services was not found." }, { status: 404 });
    }
    // Not gated on status: the plan attaches to whatever visit is on the books
    // that day, and still saves when there is none.
    const appointment = await findVisitForDate(user.clinicId, patient.id, visitDate);

    const price = data.unitPrice === "" || data.unitPrice === undefined
      ? (data.estimatedCost === "" || data.estimatedCost === undefined ? null : data.estimatedCost)
      : data.unitPrice;
    const toothNumbers = Array.from(new Set([...(data.toothNumbers || []), data.toothNumber || ""].map((tooth) => tooth.trim()).filter(Boolean)));
    if (toothNumbers.some((tooth) => !isStandardFdiCode(tooth))) {
      return NextResponse.json({ error: "Use a valid two-digit FDI tooth code." }, { status: 400 });
    }
    if (toothNumbers.length && !["PRIMARY", "MIXED", "PERMANENT"].includes(dentitionStage)) return NextResponse.json({ error: "Confirm the dentition stage before selecting teeth." }, { status: 400 });
    if (toothNumbers.some((tooth) => !isFdiAllowedForStage(tooth, dentitionStage))) return NextResponse.json({ error: "One or more FDI teeth do not match the confirmed dentition stage." }, { status: 400 });
    const plan = await prisma.$transaction(async (tx) => {
      const encounter = await ensureEncounter(tx, { clinicId: user.clinicId, patientId: patient.id, appointmentId: appointment?.id ?? null, providerId: appointment?.providerId ?? null, locationId: appointment?.locationId ?? null, chairId: appointment?.chairId ?? null, createdById: user.id, occurredAt: appointment?.appointmentDate ?? localDate(visitDate), source: appointment ? "APPOINTMENT" : "AD_HOC", status: "COMPLETED" });
      const created = await tx.treatmentPlan.create({ data: {
        clinicId: user.clinicId,
        patientId: patient.id,
        encounterId: encounter.id,
        providerId: appointment?.providerId ?? null,
        authorId: user.id,
        visitDate: localDate(visitDate),
        title: data.title,
        status: data.status,
        serviceId: data.serviceId === "" || data.serviceId === undefined ? null : data.serviceId,
        toothNumber: toothNumbers[0] || null,
        unitPrice: price,
        estimatedCost: data.items.reduce((sum, item) => sum + item.price, 0),
        notes: data.notes || null,
        selectedTeeth: toothNumbers.length ? { create: toothNumbers.map((toothNumber) => ({ toothNumber })) } : undefined,
        items: { create: data.items.map((item) => ({ serviceId: item.serviceId || null, name: item.name, price: item.price })) },
      } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: patient.id, actorRole: user.role, action: "TREATMENT_PLAN_CREATED", entityType: "TREATMENT_PLAN", entityId: String(created.id), detail: `Created treatment plan for encounter #${encounter.id}` } });
      return created;
    });
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation failed.", issues: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not create treatment plan." }, { status: 500 });
  }
}

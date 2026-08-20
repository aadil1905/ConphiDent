import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { treatmentPlanSchema } from "@/lib/validations";
import { ZodError } from "zod";
import { requireApiPermission } from "@/lib/tenant";
import { localDate } from "@/lib/clinical-appointments";
import { isFdiAllowedForStage, isStandardFdiCode, type DentitionStage } from "@/lib/dentition";

async function getId(params: Promise<{ id: string }>) {
  const { id } = await params;
  const value = Number(id);
  return Number.isInteger(value) && value > 0 ? value : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiPermission("manageClinical");
    if (!user) return response;
    const id = await getId(params);
    if (!id) return NextResponse.json({ error: "Invalid plan id." }, { status: 400 });

    const existingPlan = await prisma.treatmentPlan.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null } });
    if (!existingPlan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });

    const raw = await request.json();
    const dentitionStage = String(raw.dentitionStage || "NOT_ASSESSED") as DentitionStage;
    if (raw.confirmed !== true) return NextResponse.json({ error: "Confirm the treatment plan update." }, { status: 400 });
    const { patientId: requestedPatientId, serviceId, toothNumber, toothNumbers, unitPrice, estimatedCost, notes, visitDate, items, ...data } = treatmentPlanSchema.partial().parse(raw);
    if (requestedPatientId) {
      const patient = await prisma.patient.findFirst({ where: { id: requestedPatientId, clinicId: user.clinicId, archivedAt: null }, select: { id: true } });
      if (!patient) return NextResponse.json({ error: "Patient not found." }, { status: 404 });
    }
    if (serviceId) {
      const service = await prisma.clinicService.findFirst({ where: { id: serviceId, clinicId: user.clinicId }, select: { id: true } });
      if (!service) return NextResponse.json({ error: "Service not found." }, { status: 404 });
    }
    if (items) for (const item of items) {
      if (!item.serviceId) continue;
      const service = await prisma.clinicService.findFirst({ where: { id: item.serviceId, clinicId: user.clinicId }, select: { id: true } });
      if (!service) return NextResponse.json({ error: "One of the selected services was not found." }, { status: 404 });
    }


    const selectedToothNumbers = toothNumbers ? Array.from(new Set([...toothNumbers, toothNumber || ""].map((tooth) => tooth.trim()).filter(Boolean))) : undefined;
    if (selectedToothNumbers?.some((tooth) => !isStandardFdiCode(tooth)) || (toothNumber && !isStandardFdiCode(toothNumber))) return NextResponse.json({ error: "Use valid two-digit FDI tooth codes." }, { status: 400 });
    if (selectedToothNumbers?.length && (!["PRIMARY", "MIXED", "PERMANENT"].includes(dentitionStage) || selectedToothNumbers.some((tooth) => !isFdiAllowedForStage(tooth, dentitionStage)))) return NextResponse.json({ error: "Selected FDI teeth do not match the confirmed dentition stage." }, { status: 400 });
    const plan = await prisma.$transaction(async (tx) => {
      const updated = await tx.treatmentPlan.update({ where: { id }, data: {
        ...data,
        visitDate: visitDate ? localDate(visitDate) : undefined,
        serviceId: serviceId === "" ? null : serviceId,
        toothNumber: selectedToothNumbers ? selectedToothNumbers[0] || null : toothNumber === "" ? null : toothNumber,
        unitPrice: unitPrice === "" ? null : unitPrice,
        notes: notes === "" ? null : notes,
        estimatedCost: items ? items.reduce((sum, item) => sum + item.price, 0) : estimatedCost === "" ? null : estimatedCost,
        selectedTeeth: selectedToothNumbers ? { deleteMany: {}, create: selectedToothNumbers.map((toothNumber) => ({ toothNumber })) } : undefined,
        items: items ? { deleteMany: {}, create: items.map((item) => ({ serviceId: item.serviceId || null, name: item.name, price: item.price })) } : undefined,
        version: { increment: 1 },
      } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: updated.patientId, actorRole: user.role, action: "TREATMENT_PLAN_UPDATED", entityType: "TREATMENT_PLAN", entityId: String(updated.id), reason: "Updated after user confirmation", beforeState: { version: existingPlan.version, status: existingPlan.status }, afterState: { version: updated.version, status: updated.status } } });
      return updated;
    });
    return NextResponse.json(plan);
  } catch (error) {
    if (error instanceof ZodError) return NextResponse.json({ error: "Validation failed." }, { status: 400 });
    return NextResponse.json({ error: "Plan not found or could not be updated." }, { status: 404 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const { user, response } = await requireApiPermission("manageClinical");
  if (!user) return response;
  const id = await getId(params);
  if (!id) return NextResponse.json({ error: "Invalid plan id." }, { status: 400 });
  try {
    const body = await request.json().catch(() => ({})) as { confirmed?: unknown };
    if (body.confirmed !== true) return NextResponse.json({ error: "Confirm this action." }, { status: 400 });
    const reason = "Cancelled after user confirmation";
    const plan = await prisma.treatmentPlan.findFirst({ where: { id, clinicId: user.clinicId, cancelledAt: null }, select: { id: true, patientId: true } });
    if (!plan) return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    await prisma.$transaction([
      prisma.treatmentPlan.update({ where: { id: plan.id }, data: { status: "Cancelled", cancelledAt: new Date(), cancellationReason: reason } }),
      prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, patientId: plan.patientId, actorRole: user.role, action: "TREATMENT_PLAN_CANCELLED", entityType: "TREATMENT_PLAN", entityId: String(plan.id), reason } }),
    ]);
    return NextResponse.json({ success: true, cancelled: true });
  } catch {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }
}

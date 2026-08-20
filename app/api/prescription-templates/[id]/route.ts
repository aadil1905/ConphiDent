import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prescriptionTemplateSchema } from "@/lib/prescription-template";
import { requireApiFeature } from "@/lib/tenant";

async function templateId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFeature("clinical");
  if (!user) return response;
  const id = await templateId(params);
  if (!id) return NextResponse.json({ error: "Invalid prescription template." }, { status: 400 });
  const parsed = prescriptionTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a template name and complete every required medication field." }, { status: 400 });
  const existing = await prisma.prescriptionTemplate.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!existing) return NextResponse.json({ error: "Prescription template not found." }, { status: 404 });
  try {
    const template = await prisma.$transaction(async (tx) => {
      const updated = await tx.prescriptionTemplate.update({
        where: { id: existing.id },
        data: { name: parsed.data.name, diagnosis: parsed.data.diagnosis || null, items: parsed.data.items, active: true, reviewedAt: new Date(), reviewedById: user.id },
      });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "PRESCRIPTION_TEMPLATE_UPDATED", entityType: "PRESCRIPTION_TEMPLATE", entityId: String(updated.id), detail: `Structured template ${updated.name} updated and reviewed`, source: "PRESCRIPTION" } });
      return updated;
    });
    return NextResponse.json({ id: template.id, name: template.name });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A template with this name already exists." }, { status: 409 });
    return NextResponse.json({ error: "Could not update prescription template." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, response } = await requireApiFeature("clinical");
  if (!user) return response;
  const id = await templateId(params);
  if (!id) return NextResponse.json({ error: "Invalid prescription template." }, { status: 400 });
  const existing = await prisma.prescriptionTemplate.findFirst({ where: { id, clinicId: user.clinicId } });
  if (!existing) return NextResponse.json({ error: "Prescription template not found." }, { status: 404 });
  if (!existing.active) return NextResponse.json({ success: true, archived: true });
  await prisma.$transaction([
    prisma.prescriptionTemplate.update({ where: { id: existing.id }, data: { active: false } }),
    prisma.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "PRESCRIPTION_TEMPLATE_ARCHIVED", entityType: "PRESCRIPTION_TEMPLATE", entityId: String(existing.id), detail: `Structured template ${existing.name} archived`, source: "PRESCRIPTION" } }),
  ]);
  return NextResponse.json({ success: true, archived: true });
}

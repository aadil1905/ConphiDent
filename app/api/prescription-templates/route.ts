import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiFeature } from "@/lib/tenant";
import { prescriptionTemplateSchema } from "@/lib/prescription-template";

export async function GET() {
  const { user, response } = await requireApiFeature("clinical");
  if (!user) return response;
  const templates = await prisma.prescriptionTemplate.findMany({
    where: { clinicId: user.clinicId },
    select: { id: true, name: true, diagnosis: true, items: true, active: true, reviewedAt: true, updatedAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const { user, response } = await requireApiFeature("clinical");
  if (!user) return response;
  const parsed = prescriptionTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a template name and complete every required medication field." }, { status: 400 });
  try {
    const template = await prisma.$transaction(async (tx) => {
      const saved = await tx.prescriptionTemplate.upsert({ where: { clinicId_name: { clinicId: user.clinicId, name: parsed.data.name } }, create: { clinicId: user.clinicId, name: parsed.data.name, diagnosis: parsed.data.diagnosis || null, items: parsed.data.items, active: true, reviewedAt: new Date(), reviewedById: user.id }, update: { diagnosis: parsed.data.diagnosis || null, items: parsed.data.items, active: true, reviewedAt: new Date(), reviewedById: user.id } });
      await tx.auditLog.create({ data: { clinicId: user.clinicId, userId: user.id, actorRole: user.role, action: "PRESCRIPTION_TEMPLATE_REVIEWED", entityType: "PRESCRIPTION_TEMPLATE", entityId: String(saved.id), detail: `Structured template ${saved.name} reviewed and activated`, source: "PRESCRIPTION" } });
      return saved;
    });
    return NextResponse.json({ id: template.id, name: template.name });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "A template with this name already exists." }, { status: 409 });
    return NextResponse.json({ error: "Could not save prescription template." }, { status: 500 });
  }
}

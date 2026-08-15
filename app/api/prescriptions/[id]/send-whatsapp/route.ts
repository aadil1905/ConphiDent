import { NextResponse } from "next/server";
import { clinicDisplayName } from "@/lib/clinic-config";
import { prisma } from "@/lib/prisma";
import { queueSecureWhatsAppDocument, SecureWhatsAppDeliveryError } from "@/lib/secure-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";
import { requireApiFeatures } from "@/lib/tenant";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiFeatures(["clinical", "whatsapp"]);
    if (!user) return response;
    const prescriptionId = Number((await params).id);
    if (!Number.isInteger(prescriptionId)) return NextResponse.json({ error: "Invalid prescription." }, { status: 400 });
    const body = await request.json().catch(() => ({})) as { consentConfirmed?: unknown };
    const prescription = await prisma.prescription.findFirst({ where: { id: prescriptionId, clinicId: user.clinicId, status: "ISSUED", cancelledAt: null }, include: { patient: true, medicationItems: { select: { id: true }, take: 1 } } });
    if (!prescription) return NextResponse.json({ error: "Issued prescription not found." }, { status: 404 });
    if (!prescription.medicationItems.length && !prescription.medicines.trim()) return NextResponse.json({ error: "This prescription has no medication directions and cannot be sent." }, { status: 409 });
    const outcome = await queueSecureWhatsAppDocument({ clinicId: user.clinicId, clinicName: clinicDisplayName(user.clinic), patientId: prescription.patientId, patientName: prescription.patient.fullName, phone: prescription.patient.phone, documentType: "PRESCRIPTION", documentId: prescription.id, documentLabel: "prescription", purpose: "PRESCRIPTIONS", sourceType: "PRESCRIPTION", actorUserId: user.id, actorRole: user.role, auditAction: "PRESCRIPTION_WHATSAPP_QUEUED", consentConfirmed: body.consentConfirmed === true, preferredTemplateName: process.env.WHATSAPP_PRESCRIPTION_TEMPLATE, preferredTemplateLanguage: process.env.WHATSAPP_PRESCRIPTION_TEMPLATE_LANG || "en", clinicalFooter: "Follow the prescription exactly and contact the clinic if you have questions or a reaction." });
    const delivery = await processScheduledWhatsAppMessages(new Date(), outcome.messageId);
    return NextResponse.json({ success: true, ...outcome, delivery });
  } catch (error) {
    if (error instanceof SecureWhatsAppDeliveryError) return NextResponse.json({ error: error.message }, { status: error.status });
    const correlationId = crypto.randomUUID();
    console.error("Secure prescription delivery failed", { correlationId, error });
    return NextResponse.json({ error: "Could not queue the prescription.", correlationId }, { status: 500 });
  }
}

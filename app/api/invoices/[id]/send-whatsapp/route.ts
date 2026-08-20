import { NextResponse } from "next/server";
import { clinicDisplayName } from "@/lib/clinic-config";
import { prisma } from "@/lib/prisma";
import { queueSecureWhatsAppDocument, SecureWhatsAppDeliveryError } from "@/lib/secure-whatsapp";
import { processScheduledWhatsAppMessages } from "@/lib/scheduled-whatsapp";
import { requireApiFeatures } from "@/lib/tenant";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { user, response } = await requireApiFeatures(["billing", "whatsapp"]);
    if (!user) return response;
    const invoiceId = Number((await context.params).id);
    if (!Number.isInteger(invoiceId)) return NextResponse.json({ error: "Invalid invoice." }, { status: 400 });
    const body = await request.json().catch(() => ({})) as { consentConfirmed?: unknown };
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, clinicId: user.clinicId, voidedAt: null }, include: { patient: true } });
    if (!invoice) return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
    const outcome = await queueSecureWhatsAppDocument({ clinicId: user.clinicId, clinicName: clinicDisplayName(user.clinic), patientId: invoice.patientId, patientName: invoice.patient.fullName, phone: invoice.patient.phone, documentType: "INVOICE", documentId: invoice.id, documentLabel: `${invoice.documentType.replaceAll("_", " ").toLowerCase()} ${invoice.invoiceNumber}`, purpose: "BILLING_DOCUMENTS", sourceType: "INVOICE", actorUserId: user.id, actorRole: user.role, auditAction: "INVOICE_WHATSAPP_QUEUED", consentConfirmed: body.consentConfirmed === true, preferredTemplateName: process.env.WHATSAPP_INVOICE_TEMPLATE, preferredTemplateLanguage: process.env.WHATSAPP_INVOICE_TEMPLATE_LANG || "en" });
    const delivery = await processScheduledWhatsAppMessages(new Date(), outcome.messageId);
    return NextResponse.json({ success: true, ...outcome, delivery });
  } catch (error) {
    if (error instanceof SecureWhatsAppDeliveryError) return NextResponse.json({ error: error.message }, { status: error.status });
    const correlationId = crypto.randomUUID();
    console.error("Secure invoice delivery failed", { correlationId, error });
    return NextResponse.json({ error: "Could not queue the secure invoice link.", correlationId }, { status: 500 });
  }
}

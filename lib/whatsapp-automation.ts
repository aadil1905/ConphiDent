import { prisma } from "@/lib/prisma";

export const INBOUND_AUTOMATION_TRIGGER = "WHATSAPP_INBOUND";
export const INBOUND_AUTOMATION_NAME = "WhatsApp reception and booking";

/**
 * Legacy clinics predate the control row and remain enabled. Once a control
 * row exists, its value is authoritative for the runtime webhook.
 */
export async function isWhatsAppInboundAutomationEnabled(clinicId: number) {
  const automation = await prisma.whatsAppAutomation.findFirst({
    where: { clinicId, trigger: INBOUND_AUTOMATION_TRIGGER },
    orderBy: { id: "asc" },
    select: { enabled: true },
  });
  return automation?.enabled ?? true;
}


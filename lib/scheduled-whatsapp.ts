import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

const activeStatuses = ["SCHEDULED", "FAILED"];

export async function scheduleWhatsAppMessage(input: {
  clinicId: number; phone: string; content: string; scheduledAt: Date; createdByUserId?: number;
}) {
  return prisma.scheduledWhatsAppMessage.create({
    data: { ...input, status: "SCHEDULED" },
  });
}

export async function cancelScheduledWhatsAppMessage(id: number, clinicId: number) {
  return prisma.scheduledWhatsAppMessage.updateMany({
    where: { id, clinicId, status: { in: ["SCHEDULED", "FAILED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

export async function retryScheduledWhatsAppMessage(id: number, clinicId: number) {
  return prisma.scheduledWhatsAppMessage.updateMany({
    where: { id, clinicId, status: "FAILED" },
    data: { status: "SCHEDULED", scheduledAt: new Date(), attempts: 0, failureReason: null },
  });
}

function messageId(result: unknown) {
  if (typeof result !== "object" || result === null || !("messages" in result)) return undefined;
  const messages = result.messages;
  if (!Array.isArray(messages) || typeof messages[0] !== "object" || messages[0] === null || !("id" in messages[0])) return undefined;
  return typeof messages[0].id === "string" ? messages[0].id : undefined;
}

/** Processes a bounded batch so cron invocations remain fast and retry-safe. */
export async function processScheduledWhatsAppMessages(now = new Date()) {
  const due = await prisma.scheduledWhatsAppMessage.findMany({
    where: { status: { in: activeStatuses }, scheduledAt: { lte: now }, attempts: { lt: 3 } },
    orderBy: { scheduledAt: "asc" }, take: 40,
  });
  let sent = 0; let failed = 0;
  for (const item of due) {
    // Claim one row first. A second worker cannot send it after this succeeds.
    const claim = await prisma.scheduledWhatsAppMessage.updateMany({
      where: { id: item.id, status: { in: activeStatuses }, attempts: item.attempts },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastAttemptAt: now },
    });
    if (!claim.count) continue;
    try {
      const result = await sendTextMessage(item.phone, item.content, item.clinicId);
      await prisma.scheduledWhatsAppMessage.update({ where: { id: item.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId: messageId(result), failureReason: null } });
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "WhatsApp provider request failed.";
      const exhausted = item.attempts + 1 >= item.maxAttempts;
      await prisma.scheduledWhatsAppMessage.update({ where: { id: item.id }, data: { status: exhausted ? "FAILED" : "SCHEDULED", failureReason: message, scheduledAt: exhausted ? item.scheduledAt : new Date(Date.now() + 5 * 60_000) } });
      failed += 1;
    }
  }
  return { processed: due.length, sent, failed };
}

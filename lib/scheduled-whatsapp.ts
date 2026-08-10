import { prisma } from "@/lib/prisma";
import { sendTextMessage } from "@/lib/whatsapp";

const activeStatuses = ["SCHEDULED", "FAILED"];
const PROCESSING_TIMEOUT_MS = 10 * 60_000;

export async function scheduleWhatsAppMessage(input: {
  clinicId: number; phone: string; content: string; scheduledAt: Date; createdByUserId?: number;
}) {
  return prisma.scheduledWhatsAppMessage.create({
    data: { ...input, status: "SCHEDULED" },
  });
}

export async function cancelScheduledWhatsAppMessage(id: number, clinicId: number) {
  return prisma.scheduledWhatsAppMessage.updateMany({
    where: { id, clinicId, status: { in: ["SCHEDULED", "FAILED", "DEAD_LETTER"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
}

export async function retryScheduledWhatsAppMessage(id: number, clinicId: number) {
  return prisma.scheduledWhatsAppMessage.updateMany({
    where: { id, clinicId, status: { in: ["FAILED", "DEAD_LETTER"] } },
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
  await prisma.scheduledWhatsAppMessage.updateMany({
    where: { status: "PROCESSING", lastAttemptAt: { lte: new Date(now.getTime() - PROCESSING_TIMEOUT_MS) } },
    data: { status: "SCHEDULED", scheduledAt: now, failureReason: "Recovered after an interrupted worker." },
  });
  const due = await prisma.scheduledWhatsAppMessage.findMany({
    where: { status: { in: activeStatuses }, scheduledAt: { lte: now }, attempts: { lt: 100 } },
    orderBy: { scheduledAt: "asc" }, take: 40,
  });
  let sent = 0; let failed = 0;
  for (const item of due) {
    if (item.attempts >= item.maxAttempts) {
      await prisma.scheduledWhatsAppMessage.updateMany({ where: { id: item.id, status: { in: activeStatuses } }, data: { status: "DEAD_LETTER" } });
      continue;
    }
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
      const nextAttempt = item.attempts + 1;
      const exhausted = nextAttempt >= item.maxAttempts;
      const retryDelay = Math.min(60, 2 ** Math.max(0, nextAttempt - 1) * 5) * 60_000;
      await prisma.scheduledWhatsAppMessage.update({ where: { id: item.id }, data: { status: exhausted ? "DEAD_LETTER" : "SCHEDULED", failureReason: message, scheduledAt: exhausted ? item.scheduledAt : new Date(now.getTime() + retryDelay) } });
      failed += 1;
    }
  }
  return { processed: due.length, sent, failed };
}

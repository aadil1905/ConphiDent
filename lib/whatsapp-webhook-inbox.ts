import "server-only";

import type { Prisma, WhatsAppWebhookEvent } from "@prisma/client";
import { clearBooking, continueBooking, hasBooking, resumeBooking, startBooking, startCancellation, startReschedule } from "@/lib/booking";
import { clearConversation, getAIReply } from "@/lib/ai";
import { clinicDisplayName, formatClinicInformation, getClinicConfiguration } from "@/lib/clinic-config";
import { detectIntent } from "@/lib/intent";
import { currentLanguage, menuCopyFor, selectLanguage, welcomeFor } from "@/lib/language";
import { isStaleWhatsAppMessage, whatsappProviderTimestamp } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { premiumReceptionReply } from "@/lib/premium-receptionist";
import { sendListMessage, sendReplyButtons, sendTextMessage, WhatsAppDeliveryUncertainError } from "@/lib/whatsapp";
import { resolveWhatsAppWebhookClinic } from "@/lib/whatsapp-connection";
import { getConversationState, recordInboundMessage, setConversationContactStatus, updateOutboundDeliveryStatus } from "@/lib/whatsapp-conversations";
import { currentWhatsAppClinicId, runWithWhatsAppClinic } from "@/lib/whatsapp-context";
import { isWhatsAppInboundAutomationEnabled } from "@/lib/whatsapp-automation";
import {
  emergencyNotificationDetail,
  messageWebhookProviderEventId,
  statusWebhookProviderEventId,
  WHATSAPP_WEBHOOK_MAX_ATTEMPTS,
  WHATSAPP_WEBHOOK_PROCESSING_TIMEOUT_MS,
  whatsappMediaMetadata,
  whatsappWebhookRetryAt,
  type WhatsAppWebhookMessage,
  type WhatsAppWebhookStatus,
} from "@/lib/whatsapp-webhook-inbox-core";

const EMERGENCY_REPLY = "I'm sorry you're dealing with this. For severe pain or swelling, uncontrolled bleeding, facial injury, difficulty breathing, or a knocked-out tooth, please seek urgent emergency dental care now. I've flagged your message in the clinic inbox.";
const EMERGENCY_NOTIFICATION_TITLE = "Urgent WhatsApp clinical handover";

type InboxOutcome = "PROCESSED" | "DEFERRED" | "DEAD_LETTER" | "SKIPPED";

class PermanentWebhookProcessingError extends Error {}

export async function persistWhatsAppMessageWebhookEvent(input: {
  clinicId: number;
  phoneNumberId: string;
  message: WhatsAppWebhookMessage;
}) {
  const providerEventId = messageWebhookProviderEventId(input.phoneNumberId, input.message);
  return prisma.whatsAppWebhookEvent.upsert({
    where: { providerEventId },
    create: {
      providerEventId,
      clinicId: input.clinicId,
      phoneNumberId: input.phoneNumberId,
      eventType: "MESSAGE",
      payload: input.message as Prisma.InputJsonValue,
      correlationId: input.message.id || providerEventId,
    },
    update: {},
  });
}

export async function persistWhatsAppStatusWebhookEvent(input: {
  clinicId: number;
  phoneNumberId: string;
  status: WhatsAppWebhookStatus;
}) {
  const providerEventId = statusWebhookProviderEventId(input.status);
  if (!providerEventId) return null;
  return prisma.whatsAppWebhookEvent.upsert({
    where: { providerEventId },
    create: {
      providerEventId,
      clinicId: input.clinicId,
      phoneNumberId: input.phoneNumberId,
      eventType: "STATUS",
      payload: input.status as Prisma.InputJsonValue,
      correlationId: input.status.id || providerEventId,
    },
    update: {},
  });
}

async function claimWhatsAppWebhookEvent(id: string, now: Date) {
  const claim = await prisma.whatsAppWebhookEvent.updateMany({
    where: {
      id,
      status: "PENDING",
      availableAt: { lte: now },
      attempts: { lt: WHATSAPP_WEBHOOK_MAX_ATTEMPTS },
    },
    data: { status: "PROCESSING", attempts: { increment: 1 } },
  });
  if (!claim.count) return null;
  return prisma.whatsAppWebhookEvent.findUnique({ where: { id } });
}

export async function processWhatsAppWebhookEvent(
  id: string,
  now = new Date(),
): Promise<InboxOutcome> {
  const event = await claimWhatsAppWebhookEvent(id, now);
  if (!event) {
    const current = await prisma.whatsAppWebhookEvent.findUnique({
      where: { id },
      select: { status: true },
    });
    if (current?.status === "PROCESSED") return "SKIPPED";
    if (current?.status === "DEAD_LETTER") return "DEAD_LETTER";
    return "DEFERRED";
  }

  try {
    await processClaimedWhatsAppWebhookEvent(event, now);
    await prisma.whatsAppWebhookEvent.updateMany({
      where: { id: event.id, status: "PROCESSING" },
      data: {
        status: "PROCESSED",
        processedAt: new Date(),
        failureReason: null,
      },
    });
    return "PROCESSED";
  } catch (error) {
    const permanent = error instanceof PermanentWebhookProcessingError || error instanceof WhatsAppDeliveryUncertainError;
    const exhausted = event.attempts >= WHATSAPP_WEBHOOK_MAX_ATTEMPTS;
    const failureReason = error instanceof Error
      ? `${error.name}: ${error.message}`.slice(0, 500)
      : "Webhook processing failed.";
    const status = permanent || exhausted ? "DEAD_LETTER" : "PENDING";
    await prisma.whatsAppWebhookEvent.updateMany({
      where: { id: event.id, status: "PROCESSING" },
      data: {
        status,
        failureReason,
        availableAt: status === "PENDING"
          ? whatsappWebhookRetryAt(event.attempts, now)
          : event.availableAt,
      },
    });
    return status === "PENDING" ? "DEFERRED" : "DEAD_LETTER";
  }
}

export async function processPendingWhatsAppWebhookEvents(now = new Date()) {
  const staleBefore = new Date(now.getTime() - WHATSAPP_WEBHOOK_PROCESSING_TIMEOUT_MS);
  const recovered = await prisma.whatsAppWebhookEvent.updateMany({
    where: {
      status: "PROCESSING",
      updatedAt: { lte: staleBefore },
      attempts: { lt: WHATSAPP_WEBHOOK_MAX_ATTEMPTS },
    },
    data: {
      status: "PENDING",
      availableAt: now,
      failureReason: "Recovered after an interrupted webhook worker.",
    },
  });
  const exhausted = await prisma.whatsAppWebhookEvent.updateMany({
    where: {
      attempts: { gte: WHATSAPP_WEBHOOK_MAX_ATTEMPTS },
      OR: [
        { status: "PENDING" },
        { status: "PROCESSING", updatedAt: { lte: staleBefore } },
      ],
    },
    data: {
      status: "DEAD_LETTER",
      failureReason: "Webhook processing exhausted its retry budget.",
    },
  });
  const due = await prisma.whatsAppWebhookEvent.findMany({
    where: {
      status: "PENDING",
      availableAt: { lte: now },
      attempts: { lt: WHATSAPP_WEBHOOK_MAX_ATTEMPTS },
    },
    select: { id: true },
    orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
    take: 40,
  });
  const result = {
    recovered: recovered.count,
    exhausted: exhausted.count,
    due: due.length,
    processed: 0,
    deferred: 0,
    deadLetter: 0,
    skipped: 0,
  };
  for (const item of due) {
    const outcome = await processWhatsAppWebhookEvent(item.id, now);
    if (outcome === "PROCESSED") result.processed += 1;
    else if (outcome === "DEFERRED") result.deferred += 1;
    else if (outcome === "DEAD_LETTER") result.deadLetter += 1;
    else result.skipped += 1;
  }
  return result;
}

async function processClaimedWhatsAppWebhookEvent(
  event: WhatsAppWebhookEvent,
  now: Date,
) {
  if (!event.phoneNumberId || !event.clinicId) {
    throw new PermanentWebhookProcessingError("Webhook event is missing tenant routing metadata.");
  }
  const route = await resolveWhatsAppWebhookClinic(event.phoneNumberId);
  if (!route || route.clinicId !== event.clinicId) {
    throw new PermanentWebhookProcessingError("Webhook tenant is disconnected, inactive, or not entitled to WhatsApp.");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new PermanentWebhookProcessingError("Webhook event payload is invalid.");
  }

  if (event.eventType === "STATUS") {
    const status = event.payload as WhatsAppWebhookStatus;
    if (!status.id || !status.status) {
      throw new PermanentWebhookProcessingError("WhatsApp status payload is incomplete.");
    }
    await runWithWhatsAppClinic(event.clinicId, () => updateOutboundDeliveryStatus(
      status.id!,
      status.status!.toUpperCase(),
      status.errors?.[0]?.title,
      whatsappProviderTimestamp(status.timestamp) ?? undefined,
    ));
    return;
  }
  if (event.eventType !== "MESSAGE") {
    throw new PermanentWebhookProcessingError(`Unsupported webhook event type: ${event.eventType}.`);
  }
  await runWithWhatsAppClinic(event.clinicId, () => processMessage(
    event.payload as WhatsAppWebhookMessage,
    event,
    now,
  ));
}

function messageContent(message: WhatsAppWebhookMessage) {
  if (message.type === "text") return { content: message.text?.body ?? "", actionId: "" };
  if (message.type === "image") return { content: message.image?.caption ?? "", actionId: "" };
  if (message.type === "document") return { content: message.document?.caption ?? "", actionId: "" };
  if (message.type === "interactive" && message.interactive?.type === "button_reply") {
    return {
      content: message.interactive.button_reply?.title ?? "",
      actionId: message.interactive.button_reply?.id ?? "",
    };
  }
  if (message.type === "interactive" && message.interactive?.type === "list_reply") {
    return {
      content: message.interactive.list_reply?.title ?? "",
      actionId: message.interactive.list_reply?.id ?? "",
    };
  }
  return { content: "", actionId: "" };
}

function cleanInput(value: string) {
  return value.normalize("NFKC").toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ");
}

function matchesAny(value: string, aliases: string[]) {
  const cleaned = cleanInput(value);
  return aliases.some((alias) => cleaned === cleanInput(alias));
}

function menuAction(value: string) {
  if (["MAIN_HOME", "HOME", "MENU"].includes(value) || matchesAny(value, ["home", "menu", "main menu", "help"])) return "HOME";
  if (["MAIN_BOOK_APPOINTMENT"].includes(value)) return "BOOK_APPOINTMENT";
  if (["MAIN_SERVICES"].includes(value)) return "SERVICES";
  if (["MAIN_CONTACT"].includes(value)) return "CONTACT";
  if (matchesAny(value, ["BOOK_APPOINTMENT", "Book appointment", "appointment", "book", "अपॉइंटमेंट", "अपॉइंटमेंट बुक", "बुक अपॉइंटमेंट", "भेट", "भेट बुक"])) return "BOOK_APPOINTMENT";
  if (matchesAny(value, ["SERVICES", "Services", "service", "सेवाएं", "सेवा", "services list", "treatment", "इलाज", "उपचार"])) return "SERVICES";
  if (matchesAny(value, ["CONTACT", "Contact", "संपर्क", "phone", "number", "address", "पता", "फोन", "नंबर"])) return "CONTACT";
  return "";
}

function isEmergency(value: string) {
  return /\b(heavy|uncontrolled)\s+bleed|difficulty\s+breath|facial\s+(injury|swelling)|knocked[ -]?out|tooth.*out|severe\s+(pain|swelling)|accident|emergency|urgent\b|bahut\s+(dard|sujan)|khoon.*(band|ruk)/i.test(value);
}

function requestsHuman(value: string) {
  return /\b(human|person|staff|receptionist|call me|call back|doctor se baat|baat karni|representative)\b/i.test(value);
}

function requestsOptOut(value: string) {
  const cleaned = cleanInput(value);
  return /^(stop|unsubscribe|opt out|cancel messages|dont message|do not message|please (stop|dont|do not) (message|messaging) me|message mat karo|messages band|band karo|मुझे संदेश मत भेजो|मैसेज बंद करो|संदेश बंद करा|मेसेज बंद करा)$/iu.test(cleaned);
}

function requestsOptIn(value: string) {
  return /^(start|subscribe|opt[ -]?in|resume|messages start)$/i.test(value.trim());
}

async function showLanguagePicker(to: string) {
  const clinic = await getClinicConfiguration(currentWhatsAppClinicId());
  await sendListMessage(
    to,
    `Welcome to ${clinic ? clinicDisplayName(clinic) : "our clinic"}. Please choose your language.`,
    "Choose language",
    [{
      title: "Languages",
      rows: [
        { id: "LANG_EN", title: "English" },
        { id: "LANG_HI", title: "Hindi" },
        { id: "LANG_MR", title: "Marathi" },
      ],
    }],
  );
}

async function showMainMenu(to: string) {
  const copy = await welcomeFor(await currentLanguage(to));
  await sendReplyButtons(to, copy.text, [
    { id: "BOOK_APPOINTMENT", title: copy.book },
    { id: "SERVICES", title: copy.services },
    { id: "CONTACT", title: copy.contact },
  ]);
}

function providerMessageId(result: unknown) {
  if (!result || typeof result !== "object" || !("messages" in result)) return undefined;
  const messages = result.messages;
  if (!Array.isArray(messages) || !messages[0] || typeof messages[0] !== "object" || !("id" in messages[0])) return undefined;
  return typeof messages[0].id === "string" ? messages[0].id : undefined;
}

async function sendCorrelatedTextOnce(input: {
  conversationId: number;
  to: string;
  content: string;
  event: WhatsAppWebhookEvent;
  triggerType: string;
}) {
  const correlationId = input.event.correlationId || input.event.providerEventId;
  const existing = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      OR: [
        { correlationId, triggerType: input.triggerType },
        {
          content: input.content,
          createdAt: { gte: input.event.createdAt },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    if (!existing.correlationId || !existing.triggerType || !existing.sourceId) {
      await prisma.whatsAppMessage.update({
        where: { id: existing.id },
        data: {
          actorType: "AUTOMATION",
          triggerType: input.triggerType,
          correlationId,
          sourceType: "WHATSAPP_WEBHOOK_EVENT",
          sourceId: input.event.id,
        },
      });
    }
    return;
  }

  const result = await sendTextMessage(input.to, input.content);
  const messageId = providerMessageId(result);
  const metadata = {
    actorType: "AUTOMATION",
    triggerType: input.triggerType,
    correlationId,
    sourceType: "WHATSAPP_WEBHOOK_EVENT",
    sourceId: input.event.id,
  };
  if (messageId) {
    const updated = await prisma.whatsAppMessage.updateMany({
      where: {
        conversationId: input.conversationId,
        providerMessageId: messageId,
        direction: "OUTBOUND",
      },
      data: metadata,
    });
    if (updated.count) return;
  }
  const recorded = await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: input.conversationId,
      direction: "OUTBOUND",
      content: input.content,
      createdAt: { gte: input.event.createdAt },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recorded) await prisma.whatsAppMessage.update({ where: { id: recorded.id }, data: metadata });
}

async function ensureEmergencyHandoff(input: {
  conversationId: number;
  clinicId: number;
  correlationId: string;
}) {
  const detail = emergencyNotificationDetail(input.conversationId, input.correlationId);
  await prisma.$transaction(async (tx) => {
    await tx.whatsAppConversation.update({
      where: { id: input.conversationId },
      data: {
        status: "OPEN",
        label: "URGENT CLINICAL HANDOVER",
        automationMode: "HUMAN_ACTIVE",
      },
    });
    const existing = await tx.platformNotification.findFirst({
      where: {
        clinicId: input.clinicId,
        title: EMERGENCY_NOTIFICATION_TITLE,
        detail,
      },
      select: { id: true },
    });
    if (!existing) {
      await tx.platformNotification.create({
        data: {
          clinicId: input.clinicId,
          severity: "CRITICAL",
          title: EMERGENCY_NOTIFICATION_TITLE,
          detail,
          href: `/dashboard/conversations?conversation=${input.conversationId}`,
        },
      });
    }
  });
}

async function auditStaleInboundMessage(input: {
  conversationId: number;
  event: WhatsAppWebhookEvent;
  providerTimestamp: Date;
  processedAt: Date;
  optOutHonored: boolean;
}) {
  if (!input.event.clinicId) {
    throw new PermanentWebhookProcessingError("A stale webhook event is missing its tenant audit scope.");
  }
  const correlationId = input.event.correlationId || input.event.providerEventId;
  const existing = await prisma.auditLog.findFirst({
    where: {
      clinicId: input.event.clinicId,
      action: "WHATSAPP_STALE_INBOUND_SUPPRESSED",
      entityType: "WHATSAPP_WEBHOOK_EVENT",
      entityId: input.event.id,
      correlationId,
    },
    select: { id: true },
  });
  if (existing) return;

  await prisma.auditLog.create({
    data: {
      clinicId: input.event.clinicId,
      actorRole: "WHATSAPP_PROVIDER",
      action: "WHATSAPP_STALE_INBOUND_SUPPRESSED",
      entityType: "WHATSAPP_WEBHOOK_EVENT",
      entityId: input.event.id,
      detail: "Inbound message was retained for audit but suppressed from the automation workflow because its provider timestamp was older than ten minutes.",
      source: "WHATSAPP",
      correlationId,
      afterState: {
        conversationId: input.conversationId,
        providerTimestamp: input.providerTimestamp.toISOString(),
        processedAt: input.processedAt.toISOString(),
        ageMilliseconds: Math.max(0, input.processedAt.getTime() - input.providerTimestamp.getTime()),
        workflowSuppressed: true,
        optOutHonored: input.optOutHonored,
      },
    },
  });
}

async function processMessage(
  message: WhatsAppWebhookMessage,
  event: WhatsAppWebhookEvent,
  now: Date,
) {
  const from = message.from;
  if (!from) throw new PermanentWebhookProcessingError("Inbound WhatsApp message has no sender.");
  const { content: userMessage, actionId } = messageContent(message);
  const workflowInput = actionId || userMessage;
  const media = whatsappMediaMetadata(message);
  const mediaCaption = message.image?.caption || message.document?.caption || "";
  const content = media
    ? [mediaCaption, media.content].filter(Boolean).join(" | ")
    : userMessage || "Unsupported WhatsApp message";
  const providerTimestamp = whatsappProviderTimestamp(message.timestamp);
  const conversation = await recordInboundMessage(
    from,
    content,
    message.type?.toUpperCase() || "UNKNOWN",
    message.id || event.providerEventId,
    providerTimestamp ?? undefined,
  );

  const optedOut = requestsOptOut(userMessage);
  const stale = isStaleWhatsAppMessage(message.timestamp, now);
  if (stale && providerTimestamp) {
    await auditStaleInboundMessage({
      conversationId: conversation.id,
      event,
      providerTimestamp,
      processedAt: now,
      optOutHonored: optedOut,
    });
  }

  // Consent withdrawal is deliberately the only stale message effect. A
  // delayed STOP must remain safe, while every other delayed inbound message
  // is retained and audited without restarting menus or booking workflows.
  if (optedOut) {
    await setConversationContactStatus(from, "OPTED_OUT");
    return;
  }
  if (stale) return;
  if (requestsOptIn(userMessage)) {
    await setConversationContactStatus(from, "OPEN", "WhatsApp contact opted in");
    await sendTextMessage(from, "You are subscribed to WhatsApp messages again. Reply MENU anytime to see available options.");
    return;
  }
  // The Control Centre tenant automation row is authoritative. Inbound data
  // and consent changes are still persisted while patient-facing automation is paused.
  if (!(await isWhatsAppInboundAutomationEnabled(conversation.clinicId))) return;

  const state = await getConversationState(from);
  const emergency = isEmergency(userMessage);
  // A staff member has explicitly taken over this thread. Persist inbound
  // messages, but do not let ordinary media or workflow automation compete
  // with the human response. Emergency safety escalation remains deliberate.
  if (!emergency && ["HUMAN_ACTIVE", "HUMAN_ONLY", "PAUSED"].includes(state?.automationMode || "")) return;
  if (media && !isEmergency(userMessage)) {
    await sendCorrelatedTextOnce({
      conversationId: conversation.id,
      to: from,
      content: media.patientReply,
      event,
      triggerType: "MEDIA_RETRIEVAL_UNAVAILABLE",
    });
    return;
  }
  if (!userMessage) return;

  if (emergency) {
    if (!state) throw new Error("Emergency conversation state could not be loaded.");
    const correlationId = message.id || event.correlationId || event.providerEventId;
    await ensureEmergencyHandoff({
      conversationId: state.id,
      clinicId: state.clinicId,
      correlationId,
    });
    await sendCorrelatedTextOnce({
      conversationId: state.id,
      to: from,
      content: EMERGENCY_REPLY,
      event,
      triggerType: "EMERGENCY_AUTO_REPLY",
    });
    return;
  }

  if (requestsHuman(userMessage)) {
    if (state) {
      await prisma.$transaction(async (tx) => {
        await tx.whatsAppConversation.update({
          where: { id: state.id },
          data: { status: "OPEN", label: "Human handover requested", automationMode: "HUMAN_ACTIVE" },
        });
        const detail = `Conversation ${state.id} requested human support from contact ending ${from.slice(-4)}.`;
        const existing = await tx.platformNotification.findFirst({
          where: { clinicId: state.clinicId, title: "WhatsApp human handover requested", detail, readAt: null },
          select: { id: true },
        });
        if (!existing) await tx.platformNotification.create({
          data: { clinicId: state.clinicId, severity: "WARNING", title: "WhatsApp human handover requested", detail, href: `/dashboard/conversations?conversation=${state.id}` },
        });
      });
    }
    await sendTextMessage(from, "Certainly. I've flagged this conversation for the clinic team. They will reply here as soon as possible; meanwhile, you can share your preferred appointment date or your question.");
    return;
  }

  const normalized = cleanInput(userMessage);
  const greeting = /^(hi+|hey+|hello+|start|नमस्ते|नमस्कार)$/i.test(normalized);
  if (!state?.language && !workflowInput.startsWith("LANG_")) {
    if (await hasBooking(from)) {
      await resumeBooking(from);
      return;
    }
    await showLanguagePicker(from);
    return;
  }
  if (greeting) {
    if (await hasBooking(from)) {
      await resumeBooking(from);
      return;
    }
    await Promise.all([clearBooking(from), clearConversation(from)]);
    await showLanguagePicker(from);
    return;
  }

  const language = await selectLanguage(from, workflowInput);
  if (language) {
    await showMainMenu(from);
    return;
  }
  if (matchesAny(userMessage, ["cancel", "cancel booking", "cancel_booking", "कैंसल", "रद्द", "नहीं", "नको"]) && await hasBooking(from)) {
    const copy = menuCopyFor(await currentLanguage(from));
    await clearBooking(from);
    await sendTextMessage(from, copy.cancelled);
    return;
  }
  if (matchesAny(userMessage, ["cancel", "cancel appointment", "cancel my appointment", "appointment cancel", "रद्द", "अपॉइंटमेंट रद्द", "अपॉइंटमेंट रद्द करा"])) {
    await startCancellation(from);
    return;
  }
  if (workflowInput === "CONTINUE_BOOKING") {
    await resumeBooking(from);
    return;
  }
  if (workflowInput.startsWith("RESCHEDULE_APPOINTMENT_")) {
    const appointmentId = Number(workflowInput.replace("RESCHEDULE_APPOINTMENT_", ""));
    if (Number.isInteger(appointmentId)) await startReschedule(from, appointmentId);
    return;
  }
  if (workflowInput.startsWith("CANCEL_APPOINTMENT_")) {
    const appointmentId = Number(workflowInput.replace("CANCEL_APPOINTMENT_", ""));
    if (Number.isInteger(appointmentId)) await startCancellation(from, appointmentId);
    return;
  }

  const action = menuAction(workflowInput);
  if (action === "HOME") {
    await showMainMenu(from);
    if (await hasBooking(from)) {
      await sendReplyButtons(from, "Your appointment details are still saved. Continue whenever you're ready.", [{ id: "CONTINUE_BOOKING", title: "Continue booking" }]);
    }
    return;
  }
  if (action === "BOOK_APPOINTMENT") {
    if (await hasBooking(from)) await clearBooking(from);
    await startBooking(from);
    return;
  }
  if (action === "SERVICES" || action === "CONTACT") {
    if (action === "SERVICES") {
      const reply = await premiumReceptionReply("services");
      const clinic = await getClinicConfiguration(currentWhatsAppClinicId());
      const services = clinic?.services ?? [];
      await sendTextMessage(from, reply || `${menuCopyFor(await currentLanguage(from)).servicesTitle}\n\n${services.length ? services.map((service) => `- ${service.name}${service.description ? `: ${service.description}` : ""}`).join("\n") : menuCopyFor(await currentLanguage(from)).servicesEmpty}`);
    } else {
      const reply = await premiumReceptionReply("contact hours");
      const clinic = await getClinicConfiguration(currentWhatsAppClinicId());
      await sendTextMessage(from, reply || formatClinicInformation(clinic));
    }
    if (await hasBooking(from)) {
      await sendReplyButtons(from, "Your appointment details are still saved. Continue whenever you're ready.", [{ id: "CONTINUE_BOOKING", title: "Continue booking" }]);
    }
    return;
  }
  if (await hasBooking(from)) {
    await continueBooking(from, workflowInput);
    return;
  }
  if (detectIntent(userMessage) === "BOOK_APPOINTMENT") {
    await startBooking(from);
    return;
  }

  try {
    const deterministicReply = await premiumReceptionReply(userMessage);
    if (deterministicReply) await sendTextMessage(from, deterministicReply);
    else {
      const reply = await getAIReply(from, userMessage);
      await sendTextMessage(from, reply.message);
    }
  } catch (error) {
    console.error("WhatsApp AI fallback error:", error);
    await sendTextMessage(from, `${menuCopyFor(await currentLanguage(from)).fallback}\n\nYou can also type "human" to request a clinic team member.`);
  }
}

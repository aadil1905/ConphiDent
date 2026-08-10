import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { clearBooking, continueBooking, hasBooking, resumeBooking, startBooking, startReschedule } from "@/lib/booking";
import { clearConversation, getAIReply } from "@/lib/ai";
import { clinicDisplayName, formatClinicInformation, getClinicConfiguration } from "@/lib/clinic-config";
import { detectIntent } from "@/lib/intent";
import { currentLanguage, menuCopyFor, selectLanguage, welcomeFor } from "@/lib/language";
import { sendListMessage, sendReplyButtons, sendTextMessage } from "@/lib/whatsapp";
import { getConversationState, recordInboundMessage, setConversationContactStatus, updateOutboundDeliveryStatus } from "@/lib/whatsapp-conversations";
import { prisma } from "@/lib/prisma";
import { premiumReceptionReply } from "@/lib/premium-receptionist";
import { connectionForPhoneNumberId } from "@/lib/whatsapp-connection";
import { runWithWhatsAppClinic } from "@/lib/whatsapp-context";
import { currentWhatsAppClinicId } from "@/lib/whatsapp-context";
import { normalizeWhatsAppWebhook } from "@/lib/whatsapp-webhook";

export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
    return new Response(challenge!, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new Response("Forbidden", { status: 403 });
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

function runInBackground(work: Promise<unknown>, label: string) {
  work.catch((error) => console.error(`${label}:`, error));
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

function hasValidSignature(rawBody: string, signature: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

function messageContent(message: { type?: string; text?: { body?: string }; interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } } }) {
  if (message.type === "text") return { content: message.text?.body ?? "", actionId: "" };
  if (message.type === "interactive" && message.interactive?.type === "button_reply") return { content: message.interactive.button_reply?.title ?? "", actionId: message.interactive.button_reply?.id ?? "" };
  if (message.type === "interactive" && message.interactive?.type === "list_reply") return { content: message.interactive.list_reply?.title ?? "", actionId: message.interactive.list_reply?.id ?? "" };
  return { content: "", actionId: "" };
}

function isEmergency(value: string) {
  return /\b(heavy|uncontrolled)\s+bleed|difficulty\s+breath|facial\s+(injury|swelling)|knocked[ -]?out|tooth.*out|severe\s+(pain|swelling)|accident|emergency|urgent\b|bahut\s+(dard|sujan)|khoon.*(band|ruk)/i.test(value);
}

function requestsHuman(value: string) {
  return /\b(human|person|staff|receptionist|call me|call back|doctor se baat|baat karni|representative)\b/i.test(value);
}

function requestsOptOut(value: string) {
  return /^(stop|unsubscribe|opt[ -]?out|cancel messages|dont message|don't message|message mat karo|messages band|band karo)$/i.test(value.trim());
}

function requestsOptIn(value: string) {
  return /^(start|subscribe|opt[ -]?in|resume|messages start)$/i.test(value.trim());
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    if (!hasValidSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
      return NextResponse.json({ error: "Unauthorized webhook request." }, { status: 401 });
    }
    const body = JSON.parse(rawBody);
    const webhookEvents = normalizeWhatsAppWebhook(body);
    const firstEvent = webhookEvents[0];
    const phoneNumberId = firstEvent?.phoneNumberId;
    const connection = typeof phoneNumberId === "string" ? await connectionForPhoneNumberId(phoneNumberId) : null;
    // A legacy connection is valid only for its explicit legacy clinic. Never
    // fall back to the first clinic for an unknown Meta phone number ID.
    const legacyPhoneNumberId = process.env.PHONE_NUMBER_ID;
    const legacyClinicId = Number(process.env.LEGACY_WHATSAPP_CLINIC_ID);
    const useLegacyConnection = Boolean(
      phoneNumberId
      && legacyPhoneNumberId
      && phoneNumberId === legacyPhoneNumberId
      && Number.isInteger(legacyClinicId),
    );
    if (!connection && !useLegacyConnection) return NextResponse.json({ error: "Unknown WhatsApp phone number." }, { status: 404 });
    // Delivery updates have globally unique provider IDs and can be consumed
    // across every Meta entry/change independently of inbound message routing.
    const statusUpdates = webhookEvents.flatMap((event) => event.statuses);
    if (statusUpdates.length) {
      await Promise.all(statusUpdates.map((status) => {
        if (!status.id || !status.status) return Promise.resolve();
        return updateOutboundDeliveryStatus(status.id, status.status.toUpperCase(), status.errors?.[0]?.title);
      }));
    }
    const processMessage = async () => {
    const message = firstEvent?.messages[0]?.message as { from?: string; type?: string; id?: string; text?: { body?: string }; interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } } } | undefined;
    if (!message) return NextResponse.json({ received: true });

    const from = message.from;
    if (!from) return NextResponse.json({ received: true });
    const { content: userMessage, actionId } = messageContent(message);
    // Persist human-readable text, but route interactive replies by their stable ID.
    const workflowInput = actionId || userMessage;
    const mediaLabel = message.type === "image" ? "Image received" : message.type === "document" ? "Document received" : message.type === "audio" ? "Voice note received" : "";
    const content = userMessage || mediaLabel;
    const recorded = await recordInboundMessage(from, content || "Unsupported WhatsApp message", message.type?.toUpperCase() || "UNKNOWN", message.id);
    if (!recorded) return NextResponse.json({ received: true });

    // Honour consent withdrawal before any menu, AI, booking, or scheduled reply.
    if (requestsOptOut(userMessage)) {
      await setConversationContactStatus(from, "OPTED_OUT");
      return NextResponse.json({ received: true });
    }
    if (requestsOptIn(userMessage)) {
      await setConversationContactStatus(from, "OPEN", "WhatsApp contact opted in");
      await sendTextMessage(from, "You are subscribed to WhatsApp messages again. Reply MENU anytime to see available options.");
      return NextResponse.json({ received: true });
    }

    if (!userMessage) {
      if (mediaLabel) await sendTextMessage(from, "Thank you — we have received your file. The clinic team will review it. For urgent pain, swelling, bleeding, breathing difficulty, or injury, please seek emergency dental care immediately.");
      return NextResponse.json({ received: true });
    }

    const conversation = await getConversationState(from);
    // A staff member has explicitly taken over this thread. Persist inbound
    // messages, but do not let automation compete with the human response.
    if (conversation?.automationMode === "HUMAN_ACTIVE" || conversation?.automationMode === "PAUSED") {
      return NextResponse.json({ received: true });
    }
    const normalized = cleanInput(userMessage);
    const greeting = /^(hi+|hey+|hello+|menu|start|नमस्ते|नमस्कार)$/i.test(normalized);

    if (!conversation?.language && !workflowInput.startsWith("LANG_")) {
      if (await hasBooking(from)) {
        await resumeBooking(from);
        return NextResponse.json({ received: true });
      }
      await showLanguagePicker(from);
      return NextResponse.json({ received: true });
    }

    if (greeting) {
      if (await hasBooking(from)) {
        await resumeBooking(from);
        return NextResponse.json({ received: true });
      }
      runInBackground(clearBooking(from), "WhatsApp clear booking error");
      runInBackground(clearConversation(from), "WhatsApp clear conversation error");
      await showLanguagePicker(from);
      return NextResponse.json({ received: true });
    }

    const language = await selectLanguage(from, workflowInput);
    if (language) {
      await showMainMenu(from);
      return NextResponse.json({ received: true });
    }

    if (matchesAny(userMessage, ["cancel", "cancel booking", "cancel_booking", "कैंसल", "रद्द", "नहीं", "नको"])) {
      const copy = menuCopyFor(await currentLanguage(from));
      await clearBooking(from);
      await sendTextMessage(from, copy.cancelled);
      return NextResponse.json({ received: true });
    }

    if (workflowInput === "CONTINUE_BOOKING") {
      await resumeBooking(from);
      return NextResponse.json({ received: true });
    }

    if (workflowInput.startsWith("RESCHEDULE_APPOINTMENT_")) {
      const appointmentId = Number(workflowInput.replace("RESCHEDULE_APPOINTMENT_", ""));
      if (Number.isInteger(appointmentId)) {
        await startReschedule(from, appointmentId);
      }
      return NextResponse.json({ received: true });
    }

    if (isEmergency(userMessage)) {
      await sendTextMessage(from, "I’m sorry you’re dealing with this. For severe pain or swelling, uncontrolled bleeding, facial injury, difficulty breathing, or a knocked-out tooth, please seek urgent emergency dental care now. I’ve flagged your message in the clinic inbox.");
      return NextResponse.json({ received: true });
    }

    if (requestsHuman(userMessage)) {
      const state = await getConversationState(from);
      if (state) await prisma.whatsAppConversation.update({ where: { id: state.id }, data: { status: "OPEN", label: "Human handover requested", automationMode: "HUMAN_ACTIVE" } });
      await sendTextMessage(from, "Certainly. I’ve flagged this conversation for the clinic team. They will reply here as soon as possible; meanwhile, you can share your preferred appointment date or your question.");
      return NextResponse.json({ received: true });
    }

    const action = menuAction(workflowInput);

    if (action === "HOME") {
      await showMainMenu(from);
      if (await hasBooking(from)) await sendReplyButtons(from, "Your appointment details are still saved. Continue whenever you're ready.", [{ id: "CONTINUE_BOOKING", title: "Continue booking" }]);
      return NextResponse.json({ received: true });
    }

    if (action === "BOOK_APPOINTMENT") {
      if (await hasBooking(from)) await clearBooking(from);
      await startBooking(from);
      return NextResponse.json({ received: true });
    }

    // Global navigation must win over an in-progress form. This prevents a
    // button such as Services from being saved as a patient's name.
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
      if (await hasBooking(from)) await sendReplyButtons(from, "Your appointment details are still saved. Continue whenever you're ready.", [{ id: "CONTINUE_BOOKING", title: "Continue booking" }]);
      return NextResponse.json({ received: true });
    }

    if (await hasBooking(from)) {
      await continueBooking(from, workflowInput);
      return NextResponse.json({ received: true });
    }

    if (detectIntent(userMessage) === "BOOK_APPOINTMENT") {
      await startBooking(from);
      return NextResponse.json({ received: true });
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
      await sendTextMessage(from, `${menuCopyFor(await currentLanguage(from)).fallback}\n\nYou can also type “human” to request a clinic team member.`);
    }
    return NextResponse.json({ received: true });
    };
    return runWithWhatsAppClinic(connection?.clinicId ?? legacyClinicId, processMessage);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: "Unable to process webhook." }, { status: 500 });
  }
}

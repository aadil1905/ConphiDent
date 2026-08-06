import { formatClinicInformation, getClinicConfiguration } from "./clinic-config";
import { primaryClinic } from "./whatsapp-conversations";
import { prisma } from "./prisma";

function normalise(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function words(value: string) {
  return new Set(normalise(value).split(" ").filter((word) => word.length > 2));
}

function matchesFaq(message: string, question: string) {
  const messageWords = words(message);
  const questionWords = words(question);
  if (questionWords.size < 2) return false;
  let overlap = 0;
  for (const word of questionWords) if (messageWords.has(word)) overlap += 1;
  return overlap >= Math.min(2, questionWords.size);
}

export async function premiumReceptionReply(message: string) {
  const text = normalise(message);
  const clinic = await getClinicConfiguration();
  if (!clinic) return null;

  if (/\b(contact|address|location|where|phone|number|timing|time|hours|open|close|kab|kaha|kitne baje)\b/.test(text)) return formatClinicInformation(clinic);
  if (/\b(invoice|bill|payment|paid|due|balance|receipt|upi|refund)\b/.test(text)) return "I can help with billing. To protect your privacy, I can’t share invoice or payment details in this chat automatically. Please type “human” and the clinic team can verify and assist you here.";

  if (/\b(doctor|dr |available|availability|kaun|which doctor)\b/.test(text)) {
    const primary = await primaryClinic();
    const providers = primary ? await prisma.clinicProvider.findMany({ where: { clinicId: primary.id, active: true }, select: { name: true }, orderBy: { name: "asc" }, take: 8 }) : [];
    const names = providers.map((provider) => provider.name);
    return names.length ? `Our available clinical team includes ${names.join(", ")}. Doctor schedules can change, so please book an appointment and the clinic will confirm the right doctor and time.` : "Doctor schedules can change. Please book an appointment and the clinic will confirm the right doctor and time for your visit.";
  }

  const directFaq = clinic.faqs.find((faq) => matchesFaq(text, faq.question));
  if (directFaq) return directFaq.answer;

  const isPrice = /\b(price|pricing|cost|fees?|charges?|rate|kitna|kitne|charge)\b/.test(text);
  const isTreatment = /\b(service|treatment|implant|root canal|braces|cleaning|extraction|denture|crown|x ray|tooth|dental)\b/.test(text);
  if (!isPrice && !isTreatment) return null;

  const matched = clinic.services.find((service) => text.includes(normalise(service.name)) || normalise(service.name).split(" ").some((word) => word.length > 3 && text.includes(word)));
  if (matched) {
    const price = matched.price === null ? "The final fee depends on the dentist’s assessment." : `The listed fee is ₹${matched.price.toLocaleString("en-IN")}.`;
    return `${matched.name}: ${matched.description || "Dental consultation and treatment support"}. ${price} Would you like to book a consultation?`;
  }

  if (isPrice) return "Treatment fees depend on the clinical assessment and treatment plan. Please tell me which treatment you are asking about, or book a consultation for an exact estimate.";
  if (!clinic.services.length) return "Our service list is being updated. Please share the treatment you need and the clinic team will guide you.";
  return `We can help with: ${clinic.services.map((service) => service.name).join(", ")}. Which treatment would you like to know about?`;
}

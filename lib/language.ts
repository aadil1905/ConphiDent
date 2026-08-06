import { clinicDisplayName, getClinicConfiguration } from "./clinic-config";
import { currentWhatsAppClinicId } from "./whatsapp-context";
import { getConversationLanguage, setConversationLanguage } from "./whatsapp-conversations";

export type ClinicLanguage = "en" | "hi" | "mr";

const languages: Record<string, ClinicLanguage> = {
  LANG_EN: "en",
  LANG_HI: "hi",
  LANG_MR: "mr",
};

export async function currentLanguage(userId: string): Promise<ClinicLanguage> {
  const language = await getConversationLanguage(userId);
  return language === "hi" || language === "mr" ? language : "en";
}

export async function selectLanguage(userId: string, selection: string) {
  const language = languages[selection];
  if (!language) return undefined;
  await setConversationLanguage(userId, language);
  return language;
}

export async function clearLanguage(userId: string) {
  await setConversationLanguage(userId, null);
}

export function menuCopyFor(language: ClinicLanguage) {
  if (language === "hi") {
    return {
      servicesEmpty: "हमारी services list update हो रही है। Appointment book करने के लिए अपॉइंटमेंट चुनें।",
      servicesTitle: "हमारी services:",
      contactTitle: "Clinic contact details:",
      phone: "फोन",
      email: "ईमेल",
      address: "पता",
      hours: "Clinic timing:",
      monFri: "सोमवार से शुक्रवार: 10:00 AM से 1:30 PM और 5:30 PM से 8:30 PM",
      saturday: "शनिवार: 10:00 AM से 4:00 PM",
      sunday: "रविवार: बंद",
      cancelled: "Booking cancel हो गई है।",
      fallback: "कृपया नीचे option चुनें, या अपॉइंटमेंट, सेवाएं, या संपर्क type करें।",
    };
  }

  if (language === "mr") {
    return {
      servicesEmpty: "आमची services list update होत आहे. Appointment book करण्यासाठी अपॉइंटमेंट निवडा.",
      servicesTitle: "आमच्या services:",
      contactTitle: "Clinic contact details:",
      phone: "फोन",
      email: "ईमेल",
      address: "पत्ता",
      hours: "Clinic timing:",
      monFri: "सोमवार ते शुक्रवार: 10:00 AM ते 1:30 PM आणि 5:30 PM ते 8:30 PM",
      saturday: "शनिवार: 10:00 AM ते 4:00 PM",
      sunday: "रविवार: बंद",
      cancelled: "Booking cancel झाली आहे.",
      fallback: "कृपया खालील option निवडा, किंवा अपॉइंटमेंट, सेवा, किंवा संपर्क type करा.",
    };
  }

  return {
    servicesEmpty: "Our service list is being updated. Please choose Book appointment to speak with us.",
    servicesTitle: "Our services:",
    contactTitle: "Clinic contact details:",
    phone: "Phone",
    email: "Email",
    address: "Address",
    hours: "Clinic hours:",
    monFri: "Mon to Fri: 10:00 AM to 1:30 PM & 5:30 PM to 8:30 PM",
    saturday: "Saturday: 10:00 AM to 4:00 PM",
    sunday: "Sunday: Closed",
    cancelled: "Booking cancelled.",
    fallback: "Please choose an option below, or type Book appointment, Services, or Contact.",
  };
}

export async function welcomeFor(language: ClinicLanguage) {
  const clinic = await getClinicConfiguration(currentWhatsAppClinicId());
  const clinicName = clinic ? clinicDisplayName(clinic) : "our clinic";

  if (language === "hi") {
    return {
      text: `नमस्ते! ${clinicName} में आपका स्वागत है।\n\nहम आपकी कैसे मदद कर सकते हैं?`,
      book: "अपॉइंटमेंट",
      services: "सेवाएं",
      contact: "संपर्क",
    };
  }

  if (language === "mr") {
    return {
      text: `नमस्कार! ${clinicName} मध्ये आपले स्वागत आहे.\n\nआम्ही आपली कशी मदत करू शकतो?`,
      book: "अपॉइंटमेंट",
      services: "सेवा",
      contact: "संपर्क",
    };
  }

  return {
    text: `Welcome to ${clinicName}.\n\nHow can we help you today?`,
    book: "Book appointment",
    services: "Services",
    contact: "Contact",
  };
}

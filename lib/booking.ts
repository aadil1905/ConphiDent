import { prisma } from "@/lib/prisma";
import { saveAppointment } from "./appointment";
import { clearPersistentBooking, getBooking, getConversationLanguage, markLeadBooked, primaryClinic, startPersistentBooking, updateBooking } from "./whatsapp-conversations";
import { sendListMessage, sendReplyButtons, sendTextMessage } from "./whatsapp";

type BookingLanguage = "en" | "hi" | "mr";

const indiaDate = (offsetDays = 0) => {
  const value = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};

const todayISO = () => indiaDate();
const tomorrowISO = () => indiaDate(1);
const localDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};
const formatDate = (value: string) => localDate(value).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
function validName(name: string) {
  const cleaned = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  const digits = cleaned.match(/\p{N}/gu)?.length ?? 0;
  return cleaned.length >= 2 && cleaned.length <= 80 && letters >= 2 && digits === 0;
}
const validPhone = (phone: string) => phone.replace(/\D/g, "").length === 10;
const customDate = (value: string) => /^\d{2}-\d{2}-\d{4}$/.test(value);

const weekdayRanges = [
  { open: "10:00", close: "13:30" },
  { open: "17:30", close: "20:30" },
];
const saturdayRanges = [{ open: "10:00", close: "16:00" }];

function minutes(time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function formatTime(total: number) {
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function formatDisplayTime(time: string) {
  const [hourValue, minuteValue] = time.split(":").map(Number);
  const suffix = hourValue >= 12 ? "PM" : "AM";
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minuteValue).padStart(2, "0")} ${suffix}`;
}

function cleanInput(value: string) {
  return value.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ");
}

function matchesAny(input: string, aliases: string[]) {
  const cleaned = cleanInput(input);
  return aliases.some((alias) => cleaned === cleanInput(alias));
}

function dateChoice(input: string) {
  if (input.startsWith("DATE_")) return input;
  if (matchesAny(input, ["TODAY", "Today", "à¤†à¤œ", "aaj"])) return "TODAY";
  if (matchesAny(input, ["TOMORROW", "Tomorrow", "à¤•à¤²", "à¤‰à¤¦à¥à¤¯à¤¾", "kal", "udya"])) return "TOMORROW";
  if (matchesAny(input, ["OTHER_DATE", "Other", "à¤¦à¥‚à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤–", "à¤¦à¥à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤–", "other date", "dusri tarikh"])) return "OTHER_DATE";
  return "";
}

function parseSelectedTime(input: string, date: string) {
  if (input.startsWith("TIME_")) return input.slice(5);

  const cleaned = cleanInput(input).replace(/\./g, ":");
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2] || "00");
  const meridiem = match[3];

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";

  const parsed = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return buildSlotsForDate(date).includes(parsed) ? parsed : "";
}

function confirmationChoice(input: string) {
  if (matchesAny(input, ["CONFIRM_BOOKING", "Confirm", "yes", "ok", "à¤¹à¤¾à¤", "à¤¹à¤¾", "à¤¹à¥‹", "confirm karo", "à¤•à¤¨à¥à¤«à¤°à¥à¤®", "à¤ªà¤•à¥à¤•à¤¾"])) return "CONFIRM_BOOKING";
  if (matchesAny(input, ["CANCEL_BOOKING", "Cancel", "no", "à¤¨à¤¹à¥€à¤‚", "à¤¨à¤•à¥‹", "cancel karo", "à¤°à¤¦à¥à¤¦", "à¤•à¥ˆà¤‚à¤¸à¤²"])) return "CANCEL_BOOKING";
  return "";
}

async function userLanguage(userId: string): Promise<BookingLanguage> {
  const language = await getConversationLanguage(userId);
  return language === "hi" || language === "mr" ? language : "en";
}

const serviceTranslations: Record<string, Record<BookingLanguage, { name: string; description: string }>> = {
  Dentures: {
    en: { name: "Dentures", description: "Removable replacement teeth for missing teeth" },
    hi: { name: "à¤¡à¥‡à¤‚à¤šà¤°", description: "à¤—à¥à¤® à¤¦à¤¾à¤‚à¤¤à¥‹à¤‚ à¤•à¥‡ à¤²à¤¿à¤ removable replacement teeth" },
    mr: { name: "à¤¡à¥‡à¤‚à¤šà¤°", description: "à¤¹à¤°à¤µà¤²à¥‡à¤²à¥à¤¯à¤¾ à¤¦à¤¾à¤¤à¤¾à¤‚à¤¸à¤¾à¤ à¥€ à¤•à¤¾à¤¢à¤¤à¤¾ à¤¯à¥‡à¤£à¤¾à¤°à¥‡ replacement teeth" },
  },
  Implants: {
    en: { name: "Implants", description: "Dental implant consultation and treatment planning" },
    hi: { name: "à¤‡à¤®à¥à¤ªà¥à¤²à¤¾à¤‚à¤Ÿ", description: "Dental implant consultation à¤”à¤° treatment planning" },
    mr: { name: "à¤‡à¤®à¥à¤ªà¥à¤²à¤¾à¤‚à¤Ÿ", description: "Dental implant consultation à¤†à¤£à¤¿ treatment planning" },
  },
  "Root Canals": {
    en: { name: "Root Canals", description: "Root canal consultation and treatment" },
    hi: { name: "à¤°à¥‚à¤Ÿ à¤•à¥ˆà¤¨à¤¾à¤²", description: "Root canal consultation à¤”à¤° treatment" },
    mr: { name: "à¤°à¥‚à¤Ÿ à¤•à¥…à¤¨à¤¾à¤²", description: "Root canal consultation à¤†à¤£à¤¿ treatment" },
  },
  Braces: {
    en: { name: "Braces", description: "Orthodontic consultation for teeth alignment" },
    hi: { name: "à¤¬à¥à¤°à¥‡à¤¸à¥‡à¤¸", description: "à¤¦à¤¾à¤‚à¤¤à¥‹à¤‚ à¤•à¥€ alignment à¤•à¥‡ à¤²à¤¿à¤ orthodontic consultation" },
    mr: { name: "à¤¬à¥à¤°à¥‡à¤¸à¥‡à¤¸", description: "à¤¦à¤¾à¤¤à¤¾à¤‚à¤šà¥à¤¯à¤¾ alignment à¤¸à¤¾à¤ à¥€ orthodontic consultation" },
  },
  "Aesthetic Dentistry": {
    en: { name: "Aesthetic Dentistry", description: "Cosmetic dental care and smile improvement" },
    hi: { name: "à¤•à¥‰à¤¸à¥à¤®à¥‡à¤Ÿà¤¿à¤• à¤¡à¥‡à¤‚à¤Ÿà¤²", description: "Cosmetic dental care à¤”à¤° smile improvement" },
    mr: { name: "à¤•à¥‰à¤¸à¥à¤®à¥‡à¤Ÿà¤¿à¤• à¤¡à¥‡à¤‚à¤Ÿà¤²", description: "Cosmetic dental care à¤†à¤£à¤¿ smile improvement" },
  },
  "Kids Dentistry": {
    en: { name: "Kids Dentistry", description: "Dental care for children" },
    hi: { name: "à¤¬à¤šà¥à¤šà¥‹à¤‚ à¤•à¥€ à¤¡à¥‡à¤‚à¤Ÿà¤¿à¤¸à¥à¤Ÿà¥à¤°à¥€", description: "à¤¬à¤šà¥à¤šà¥‹à¤‚ à¤•à¥‡ à¤²à¤¿à¤ dental care" },
    mr: { name: "à¤²à¤¹à¤¾à¤¨ à¤®à¥à¤²à¤¾à¤‚à¤šà¥€ à¤¡à¥‡à¤‚à¤Ÿà¤¿à¤¸à¥à¤Ÿà¥à¤°à¥€", description: "à¤²à¤¹à¤¾à¤¨ à¤®à¥à¤²à¤¾à¤‚à¤¸à¤¾à¤ à¥€ dental care" },
  },
  "Gum Treatment": {
    en: { name: "Gum Treatment", description: "Gum health consultation and treatment" },
    hi: { name: "à¤®à¤¸à¥‚à¤¡à¤¼à¥‹à¤‚ à¤•à¤¾ à¤‡à¤²à¤¾à¤œ", description: "Gum health consultation à¤”à¤° treatment" },
    mr: { name: "à¤¹à¤¿à¤°à¤¡à¥à¤¯à¤¾à¤‚à¤šà¤¾ à¤‰à¤ªà¤šà¤¾à¤°", description: "Gum health consultation à¤†à¤£à¤¿ treatment" },
  },
  Extractions: {
    en: { name: "Extractions", description: "Tooth extraction consultation and procedure" },
    hi: { name: "à¤¦à¤¾à¤‚à¤¤ à¤¨à¤¿à¤•à¤¾à¤²à¤¨à¤¾", description: "Tooth extraction consultation à¤”à¤° procedure" },
    mr: { name: "à¤¦à¤¾à¤¤ à¤•à¤¾à¤¢à¤£à¥‡", description: "Tooth extraction consultation à¤†à¤£à¤¿ procedure" },
  },
  Surgeries: {
    en: { name: "Surgeries", description: "Dental and oral surgical consultation" },
    hi: { name: "à¤¸à¤°à¥à¤œà¤°à¥€", description: "Dental à¤”à¤° oral surgical consultation" },
    mr: { name: "à¤¸à¤°à¥à¤œà¤°à¥€", description: "Dental à¤†à¤£à¤¿ oral surgical consultation" },
  },
};
void serviceTranslations;

function selectedReason(input: string) {
  if (input === "REASON_NEW_CONSULTATION") return "New consultation";
  if (input === "REASON_FOLLOW_UP") return "Follow up";
  if (matchesAny(input, ["new consultation", "new", "consultation", "à¤¨à¤ˆ à¤¸à¤²à¤¾à¤¹", "à¤¨à¤ˆ à¤•à¤‚à¤¸à¤²à¥à¤Ÿà¥‡à¤¶à¤¨", "à¤¨à¤¯à¤¾ à¤ªà¤°à¤¾à¤®à¤°à¥à¤¶", "à¤¨à¤µà¥€à¤¨ à¤¸à¤²à¥à¤²à¤¾", "à¤¨à¤µà¥€à¤¨ à¤•à¤¨à¥à¤¸à¤²à¥à¤Ÿà¥‡à¤¶à¤¨"])) return "New consultation";
  if (matchesAny(input, ["follow up", "follow-up", "followup", "à¤«à¥‰à¤²à¥‹ à¤…à¤ª", "à¤«à¥‰à¤²à¥‹à¤…à¤ª", "à¤ªà¥à¤¨à¤ƒ à¤­à¥‡à¤Ÿ", "à¤ªà¥à¤¨à¥à¤¹à¤¾ à¤­à¥‡à¤Ÿ"])) return "Follow up";
  return "";
}

const bookingCopy = {
  en: {
    start: "Great! Let's book your appointment. Please enter your full name.",
    validName: "Please enter a valid full name.",
    phone: "Please enter your 10-digit mobile number.",
    validPhone: "Please enter a valid 10-digit mobile number.",
    date: "Please choose an appointment date.",
    today: "Today",
    tomorrow: "Tomorrow",
    other: "Other",
    customDate: "Please enter the date in DD-MM-YYYY format.",
    invalidDate: "Invalid date. Please use DD-MM-YYYY.",
    closed: "The clinic is closed on that day. Please choose another date.",
    full: "All slots are booked for that day. Please choose another date.",
    time: "Select your preferred time.",
    timeButton: "Choose time",
    availableTimes: "Available times",
    service: "What service would you like to book?",
    serviceButton: "Choose service",
    serviceTitle: "Dental services",
    reason: "What is this appointment for?",
    reasonButton: "Choose reason",
    newConsultation: "New consultation",
    followUp: "Follow up",
    existingAppointment: "You already have an appointment booked:",
    rescheduleQuestion: "Would you like to reschedule it?",
    rescheduleButton: "Reschedule",
    keepButton: "Keep appointment",
    rescheduleDate: "Please choose a new appointment date.",
    rescheduleReason: "Reschedule",
    kept: "Okay, your existing appointment is unchanged.",
    rescheduled: "Your appointment has been rescheduled successfully!",
    slotBooked: "This slot is booked. Please try another time.",
    confirm: "Please confirm your appointment",
    name: "Name",
    phoneLabel: "Phone",
    dateLabel: "Date",
    timeLabel: "Time",
    serviceLabel: "Service",
    confirmButton: "Confirm",
    cancelButton: "Cancel",
    chooseOption: "Please choose an option.",
    cancelled: "Appointment booking cancelled.",
    success: "Your appointment has been booked successfully!",
    thanks: "Thank you. We look forward to seeing you.",
    error: "Sorry, something went wrong while booking your appointment. Please try again.",
  },
  hi: {
    start: "à¤¬à¤¹à¥à¤¤ à¤…à¤šà¥à¤›à¤¾! à¤†à¤ªà¤•à¤¾ à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤¬à¥à¤• à¤•à¤°à¤¤à¥‡ à¤¹à¥ˆà¤‚à¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤ªà¤¨à¤¾ à¤ªà¥‚à¤°à¤¾ à¤¨à¤¾à¤® à¤²à¤¿à¤–à¥‡à¤‚à¥¤",
    validName: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤¹à¥€ à¤ªà¥‚à¤°à¤¾ à¤¨à¤¾à¤® à¤²à¤¿à¤–à¥‡à¤‚à¥¤",
    phone: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤ªà¤¨à¤¾ 10 à¤…à¤‚à¤•à¥‹à¤‚ à¤•à¤¾ à¤®à¥‹à¤¬à¤¾à¤‡à¤² à¤¨à¤‚à¤¬à¤° à¤²à¤¿à¤–à¥‡à¤‚à¥¤",
    validPhone: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤¹à¥€ 10 à¤…à¤‚à¤•à¥‹à¤‚ à¤•à¤¾ à¤®à¥‹à¤¬à¤¾à¤‡à¤² à¤¨à¤‚à¤¬à¤° à¤²à¤¿à¤–à¥‡à¤‚à¥¤",
    date: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ à¤•à¥€ à¤¤à¤¾à¤°à¥€à¤– à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    today: "à¤†à¤œ",
    tomorrow: "à¤•à¤²",
    other: "à¤¦à¥‚à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤–",
    customDate: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¤à¤¾à¤°à¥€à¤– DD-MM-YYYY format à¤®à¥‡à¤‚ à¤²à¤¿à¤–à¥‡à¤‚à¥¤",
    invalidDate: "à¤¤à¤¾à¤°à¥€à¤– à¤¸à¤¹à¥€ à¤¨à¤¹à¥€à¤‚ à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ DD-MM-YYYY use à¤•à¤°à¥‡à¤‚à¥¤",
    closed: "à¤‰à¤¸ à¤¦à¤¿à¤¨ à¤•à¥à¤²à¤¿à¤¨à¤¿à¤• à¤¬à¤‚à¤¦ à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¦à¥‚à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤– à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    full: "à¤‰à¤¸ à¤¦à¤¿à¤¨ à¤¸à¤­à¥€ slots booked à¤¹à¥ˆà¤‚à¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¦à¥‚à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤– à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    time: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤ªà¤¨à¤¾ à¤ªà¤¸à¤‚à¤¦à¥€à¤¦à¤¾ à¤¸à¤®à¤¯ à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    timeButton: "à¤¸à¤®à¤¯ à¤šà¥à¤¨à¥‡à¤‚",
    availableTimes: "Available times",
    service: "à¤†à¤ª à¤•à¥Œà¤¨ à¤¸à¥€ service book à¤•à¤°à¤¨à¤¾ à¤šà¤¾à¤¹à¥‡à¤‚à¤—à¥‡?",
    serviceButton: "Service à¤šà¥à¤¨à¥‡à¤‚",
    serviceTitle: "Dental services",
    reason: "à¤¯à¤¹ appointment à¤•à¤¿à¤¸à¤•à¥‡ à¤²à¤¿à¤ à¤¹à¥ˆ?",
    reasonButton: "Reason à¤šà¥à¤¨à¥‡à¤‚",
    newConsultation: "à¤¨à¤ˆ consultation",
    followUp: "Follow up",
    existingAppointment: "à¤†à¤ªà¤•à¤¾ appointment à¤ªà¤¹à¤²à¥‡ à¤¸à¥‡ booked à¤¹à¥ˆ:",
    rescheduleQuestion: "à¤•à¥à¤¯à¤¾ à¤†à¤ª à¤‡à¤¸à¥‡ reschedule à¤•à¤°à¤¨à¤¾ à¤šà¤¾à¤¹à¥‡à¤‚à¤—à¥‡?",
    rescheduleButton: "Reschedule",
    keepButton: "à¤¯à¤¹à¥€ à¤°à¤–à¥‡à¤‚",
    rescheduleDate: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¨à¤ˆ appointment date à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    rescheduleReason: "Reschedule",
    kept: "à¤ à¥€à¤• à¤¹à¥ˆ, à¤†à¤ªà¤•à¤¾ existing appointment à¤µà¤¹à¥€ à¤°à¤¹à¥‡à¤—à¤¾à¥¤",
    rescheduled: "à¤†à¤ªà¤•à¤¾ appointment successfully reschedule à¤¹à¥‹ à¤—à¤¯à¤¾ à¤¹à¥ˆ!",
    slotBooked: "à¤¯à¤¹ slot booked à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¦à¥‚à¤¸à¤°à¤¾ à¤¸à¤®à¤¯ à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    confirm: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤…à¤ªà¤¨à¤¾ à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ confirm à¤•à¤°à¥‡à¤‚",
    name: "à¤¨à¤¾à¤®",
    phoneLabel: "à¤«à¥‹à¤¨",
    dateLabel: "à¤¤à¤¾à¤°à¥€à¤–",
    timeLabel: "à¤¸à¤®à¤¯",
    serviceLabel: "Service",
    confirmButton: "Confirm",
    cancelButton: "Cancel",
    chooseOption: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤à¤• option à¤šà¥à¤¨à¥‡à¤‚à¥¤",
    cancelled: "à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ booking cancel à¤¹à¥‹ à¤—à¤ˆ à¤¹à¥ˆà¥¤",
    success: "à¤†à¤ªà¤•à¤¾ à¤…à¤ªà¥‰à¤‡à¤‚à¤Ÿà¤®à¥‡à¤‚à¤Ÿ successfully book à¤¹à¥‹ à¤—à¤¯à¤¾ à¤¹à¥ˆ!",
    thanks: "à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦à¥¤ à¤¹à¤® à¤†à¤ªà¤¸à¥‡ à¤®à¤¿à¤²à¤¨à¥‡ à¤•à¥‡ à¤²à¤¿à¤ à¤‰à¤¤à¥à¤¸à¥à¤• à¤¹à¥ˆà¤‚à¥¤",
    error: "Sorry, booking à¤®à¥‡à¤‚ à¤•à¥à¤› problem à¤¹à¥à¤ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤«à¤¿à¤° à¤¸à¥‡ try à¤•à¤°à¥‡à¤‚à¥¤",
  },
  mr: {
    start: "à¤›à¤¾à¤¨! à¤†à¤ªà¤²à¥€ appointment book à¤•à¤°à¥‚à¤¯à¤¾. à¤•à¥ƒà¤ªà¤¯à¤¾ à¤†à¤ªà¤²à¥‡ à¤ªà¥‚à¤°à¥à¤£ à¤¨à¤¾à¤µ à¤²à¤¿à¤¹à¤¾.",
    validName: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¯à¥‹à¤—à¥à¤¯ à¤ªà¥‚à¤°à¥à¤£ à¤¨à¤¾à¤µ à¤²à¤¿à¤¹à¤¾.",
    phone: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤†à¤ªà¤²à¤¾ 10 à¤…à¤‚à¤•à¥€ mobile number à¤²à¤¿à¤¹à¤¾.",
    validPhone: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¯à¥‹à¤—à¥à¤¯ 10 à¤…à¤‚à¤•à¥€ mobile number à¤²à¤¿à¤¹à¤¾.",
    date: "à¤•à¥ƒà¤ªà¤¯à¤¾ appointment à¤šà¥€ à¤¤à¤¾à¤°à¥€à¤– à¤¨à¤¿à¤µà¤¡à¤¾.",
    today: "à¤†à¤œ",
    tomorrow: "à¤‰à¤¦à¥à¤¯à¤¾",
    other: "à¤¦à¥à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤–",
    customDate: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¤à¤¾à¤°à¥€à¤– DD-MM-YYYY format à¤®à¤§à¥à¤¯à¥‡ à¤²à¤¿à¤¹à¤¾.",
    invalidDate: "à¤¤à¤¾à¤°à¥€à¤– à¤¯à¥‹à¤—à¥à¤¯ à¤¨à¤¾à¤¹à¥€. à¤•à¥ƒà¤ªà¤¯à¤¾ DD-MM-YYYY use à¤•à¤°à¤¾.",
    closed: "à¤¤à¥à¤¯à¤¾ à¤¦à¤¿à¤µà¤¶à¥€ clinic à¤¬à¤‚à¤¦ à¤†à¤¹à¥‡. à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¦à¥à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤– à¤¨à¤¿à¤µà¤¡à¤¾.",
    full: "à¤¤à¥à¤¯à¤¾ à¤¦à¤¿à¤µà¤¶à¥€ à¤¸à¤°à¥à¤µ slots booked à¤†à¤¹à¥‡à¤¤. à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¦à¥à¤¸à¤°à¥€ à¤¤à¤¾à¤°à¥€à¤– à¤¨à¤¿à¤µà¤¡à¤¾.",
    time: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤†à¤ªà¤²à¤¾ preferred time à¤¨à¤¿à¤µà¤¡à¤¾.",
    timeButton: "à¤µà¥‡à¤³ à¤¨à¤¿à¤µà¤¡à¤¾",
    availableTimes: "Available times",
    service: "à¤†à¤ªà¤£ à¤•à¥‹à¤£à¤¤à¥€ service book à¤•à¤°à¥‚ à¤‡à¤šà¥à¤›à¤¿à¤¤à¤¾?",
    serviceButton: "Service à¤¨à¤¿à¤µà¤¡à¤¾",
    serviceTitle: "Dental services",
    reason: "à¤¹à¥€ appointment à¤•à¤¶à¤¾à¤¸à¤¾à¤ à¥€ à¤†à¤¹à¥‡?",
    reasonButton: "Reason à¤¨à¤¿à¤µà¤¡à¤¾",
    newConsultation: "à¤¨à¤µà¥€à¤¨ consultation",
    followUp: "Follow up",
    existingAppointment: "à¤†à¤ªà¤²à¥€ appointment à¤†à¤§à¥€à¤š booked à¤†à¤¹à¥‡:",
    rescheduleQuestion: "à¤†à¤ªà¤£ à¤¤à¥€ reschedule à¤•à¤°à¥‚ à¤‡à¤šà¥à¤›à¤¿à¤¤à¤¾ à¤•à¤¾?",
    rescheduleButton: "Reschedule",
    keepButton: "à¤¤à¥€à¤š à¤ à¥‡à¤µà¤¾",
    rescheduleDate: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¨à¤µà¥€à¤¨ appointment date à¤¨à¤¿à¤µà¤¡à¤¾.",
    rescheduleReason: "Reschedule",
    kept: "à¤ à¥€à¤• à¤†à¤¹à¥‡, à¤†à¤ªà¤²à¥€ existing appointment à¤¤à¤¶à¥€à¤š à¤°à¤¾à¤¹à¥€à¤².",
    rescheduled: "à¤†à¤ªà¤²à¥€ appointment successfully reschedule à¤à¤¾à¤²à¥€ à¤†à¤¹à¥‡!",
    slotBooked: "à¤¹à¤¾ slot booked à¤†à¤¹à¥‡. à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¦à¥à¤¸à¤°à¥€ à¤µà¥‡à¤³ à¤¨à¤¿à¤µà¤¡à¤¾.",
    confirm: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤†à¤ªà¤²à¥€ appointment confirm à¤•à¤°à¤¾",
    name: "à¤¨à¤¾à¤µ",
    phoneLabel: "à¤«à¥‹à¤¨",
    dateLabel: "à¤¤à¤¾à¤°à¥€à¤–",
    timeLabel: "à¤µà¥‡à¤³",
    serviceLabel: "Service",
    confirmButton: "Confirm",
    cancelButton: "Cancel",
    chooseOption: "à¤•à¥ƒà¤ªà¤¯à¤¾ à¤à¤• option à¤¨à¤¿à¤µà¤¡à¤¾.",
    cancelled: "Appointment booking cancel à¤à¤¾à¤²à¥€ à¤†à¤¹à¥‡.",
    success: "à¤†à¤ªà¤²à¥€ appointment successfully book à¤à¤¾à¤²à¥€ à¤†à¤¹à¥‡!",
    thanks: "à¤§à¤¨à¥à¤¯à¤µà¤¾à¤¦. à¤†à¤®à¥à¤¹à¥€ à¤†à¤ªà¤²à¥€ à¤­à¥‡à¤Ÿ à¤˜à¥‡à¤£à¥à¤¯à¤¾à¤¸à¤¾à¤ à¥€ à¤‰à¤¤à¥à¤¸à¥à¤• à¤†à¤¹à¥‹à¤¤.",
    error: "Sorry, booking à¤®à¤§à¥à¤¯à¥‡ à¤•à¤¾à¤¹à¥€ problem à¤à¤¾à¤²à¥€. à¤•à¥ƒà¤ªà¤¯à¤¾ à¤ªà¥à¤¨à¥à¤¹à¤¾ try à¤•à¤°à¤¾.",
  },
};

function buildSlotsForDate(date: string) {
  const day = localDate(date).getDay();
  if (day === 0) return [];
  const ranges = day === 6 ? saturdayRanges : weekdayRanges;
  return ranges.flatMap((range) => {
    const slots: string[] = [];
    for (let current = minutes(range.open); current < minutes(range.close); current += 60) {
      slots.push(formatTime(current));
    }
    return slots;
  });
}

function nextOpenDates(count = 10) {
  const dates: string[] = [];
  for (let offset = 2; dates.length < count && offset < 45; offset += 1) {
    const date = indiaDate(offset);
    if (buildSlotsForDate(date).length) dates.push(date);
  }
  return dates;
}

async function bookedTimesForDate(date: string) {
  const appointmentDate = localDate(date);
  const appointments = await prisma.appointment.findMany({
    where: {
      appointmentDate,
      status: { not: "Cancelled" },
    },
    select: { appointmentTime: true },
  });
  return new Set(appointments.map((appointment) => appointment.appointmentTime));
}

async function isSlotBooked(date: string, time: string, excludeAppointmentId?: number) {
  const appointmentDate = localDate(date);
  const existing = await prisma.appointment.findFirst({
    where: {
      appointmentDate,
      appointmentTime: time,
      status: { not: "Cancelled" },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(existing);
}

function appointmentIdFromReason(reason: string) {
  const value = bookingReason(reason);
  return value.startsWith("RESCHEDULE:") ? Number(value.slice("RESCHEDULE:".length)) : null;
}

function bookingReason(reason: string) {
  return reason.startsWith("REMINDED:") ? reason.slice("REMINDED:".length) : reason;
}

function reminderReason(reason: string) {
  return reason.startsWith("REMINDED:") ? reason : `REMINDED:${reason}`;
}

async function existingAppointmentForPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  const today = localDate(todayISO());

  return prisma.appointment.findFirst({
    where: {
      phone: { in: Array.from(new Set([digits, last10].filter(Boolean))) },
      appointmentDate: { gte: today },
      status: { notIn: ["Cancelled", "Completed"] },
    },
    orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
  });
}

export async function hasBooking(userId: string) {
  return Boolean(await getBooking(userId));
}

export async function clearBooking(userId: string) {
  await clearPersistentBooking(userId);
}

async function saveAndSend(userId: string, data: Record<string, string>, reply: Promise<unknown>) {
  await Promise.all([updateBooking(userId, data), reply]);
}

async function askDate(userId: string, language: BookingLanguage) {
  const copy = bookingCopy[language];
  await sendReplyButtons(userId, copy.date, [
    { id: "TODAY", title: copy.today },
    { id: "TOMORROW", title: copy.tomorrow },
    { id: "OTHER_DATE", title: copy.other },
  ]);
}

async function askRescheduleDate(userId: string, language: BookingLanguage) {
  const copy = bookingCopy[language];
  await sendReplyButtons(userId, copy.rescheduleDate, [
    { id: "TODAY", title: copy.today },
    { id: "TOMORROW", title: copy.tomorrow },
    { id: "OTHER_DATE", title: copy.other },
  ]);
}

async function askDatePicker(userId: string, language: BookingLanguage) {
  const copy = bookingCopy[language];
  await sendListMessage(userId, copy.date, "Choose date", [{
    title: "Available dates",
    rows: nextOpenDates().map((date) => ({
      id: `DATE_${date}`,
      title: localDate(date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" }),
      description: localDate(date).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" }),
    })),
  }]);
}

async function askRescheduleChoice(userId: string, appointment: { id: number; appointmentDate: Date; appointmentTime: string }, language: BookingLanguage) {
  const copy = bookingCopy[language];
  const date = appointment.appointmentDate.toISOString().slice(0, 10);
  await sendReplyButtons(userId, `${copy.existingAppointment}\n\n${formatDate(date)} at ${formatDisplayTime(appointment.appointmentTime)}\n\n${copy.rescheduleQuestion}`, [
    { id: "RESCHEDULE_YES", title: copy.rescheduleButton },
    { id: "RESCHEDULE_NO", title: copy.keepButton },
  ]);
}

async function askTime(userId: string, date: string, language: BookingLanguage) {
  const copy = bookingCopy[language];
  const slots = buildSlotsForDate(date);
  if (!slots.length) {
    await sendTextMessage(userId, copy.closed);
    return askDate(userId, language);
  }

  const booked = await bookedTimesForDate(date);
  const available = slots.filter((slot) => !booked.has(slot));
  if (!available.length) {
    await sendTextMessage(userId, copy.full);
    return askDate(userId, language);
  }

  await sendListMessage(userId, copy.time, copy.timeButton, [{
    title: copy.availableTimes,
    rows: available.slice(0, 10).map((time) => ({ id: `TIME_${time}`, title: formatDisplayTime(time) })),
  }]);
}

async function askReason(userId: string, language: BookingLanguage) {
  const copy = bookingCopy[language];
  await sendListMessage(userId, copy.reason, copy.reasonButton, [{
    title: copy.reasonButton,
    rows: [
      { id: "REASON_NEW_CONSULTATION", title: copy.newConsultation },
      { id: "REASON_FOLLOW_UP", title: copy.followUp },
    ],
  }]);
}

function rescheduleChoice(input: string) {
  if (matchesAny(input, ["RESCHEDULE_YES", "reschedule", "yes", "à¤¹à¤¾à¤", "à¤¹à¤¾", "à¤¹à¥‹"])) return "YES";
  if (matchesAny(input, ["RESCHEDULE_NO", "keep appointment", "keep", "no", "à¤¨à¤¹à¥€à¤‚", "à¤¨à¤•à¥‹"])) return "NO";
  return "";
}

export async function startBooking(userId: string) {
  const language = await userLanguage(userId);
  await Promise.all([
    startPersistentBooking(userId),
    sendTextMessage(userId, bookingCopy[language].start),
  ]);
}

export async function startReschedule(userId: string, appointmentId: number) {
  const language = await userLanguage(userId);
  const copy = bookingCopy[language];
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });

  if (!appointment || ["Cancelled", "Completed"].includes(appointment.status)) {
    await sendTextMessage(userId, copy.error);
    return;
  }

  await startPersistentBooking(userId);
  await updateBooking(userId, {
    patientName: appointment.patientName,
    phone: appointment.phone,
    reason: `RESCHEDULE:${appointment.id}`,
    step: "date",
  });
  await askRescheduleDate(userId, language);
}

export async function resumeBooking(userId: string) {
  const booking = await getBooking(userId);
  if (!booking) return false;

  const language = await userLanguage(userId);
  const copy = bookingCopy[language];

  if (booking.step === "name") await sendTextMessage(userId, copy.start);
  else if (booking.step === "phone") await sendTextMessage(userId, copy.phone);
  else if (booking.step === "reschedule_confirm") {
    const appointmentId = appointmentIdFromReason(booking.reason);
    const appointment = appointmentId ? await prisma.appointment.findUnique({ where: { id: appointmentId } }) : null;
    if (appointment) await askRescheduleChoice(userId, appointment, language);
    else await sendTextMessage(userId, copy.error);
  } else if (booking.step === "date") {
    if (appointmentIdFromReason(booking.reason)) await askRescheduleDate(userId, language);
    else await askDate(userId, language);
  } else if (booking.step === "date_picker") await askDatePicker(userId, language);
  else if (booking.step === "custom_date") await sendTextMessage(userId, copy.customDate);
  else if (booking.step === "time" && booking.appointmentDate) await askTime(userId, booking.appointmentDate, language);
  else if (booking.step === "reason") await askReason(userId, language);
  else if (booking.step === "confirm") {
    const rescheduleAppointmentId = appointmentIdFromReason(booking.reason);
    const reason = rescheduleAppointmentId ? copy.rescheduleReason : bookingReason(booking.reason);
    await sendReplyButtons(userId, `${copy.confirm}\n\n${copy.name}: ${booking.patientName}\n${copy.phoneLabel}: ${booking.phone}\n${copy.dateLabel}: ${formatDate(booking.appointmentDate)}\n${copy.timeLabel}: ${formatDisplayTime(booking.appointmentTime)}\n${copy.serviceLabel}: ${reason}`, [
      { id: "CONFIRM_BOOKING", title: copy.confirmButton },
      { id: "CANCEL_BOOKING", title: copy.cancelButton },
    ]);
  } else await sendTextMessage(userId, copy.start);

  return true;
}

export async function sendAbandonedBookingReminders() {
  const now = new Date();
  const reminderCutoff = new Date(now.getTime() - 20 * 60 * 1000);
  const staleCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const bookings = await prisma.whatsAppBooking.findMany({
    where: {
      updatedAt: { lte: reminderCutoff, gte: staleCutoff },
      step: { not: "confirm" },
      NOT: { reason: { startsWith: "REMINDED:" } },
    },
    include: { conversation: true },
    take: 25,
  });

  let sent = 0;
  for (const booking of bookings) {
    const language = booking.conversation.language === "hi" || booking.conversation.language === "mr" ? booking.conversation.language : "en";
    const text = language === "hi"
      ? "आपकी appointment booking अधूरी रह गई है. वहीं से continue करने के लिए नीचे button दबाएं."
      : language === "mr"
        ? "आपली appointment booking अपूर्ण राहिली आहे. तिथूनच continue करण्यासाठी खालील button दाबा."
        : "Your appointment booking is still incomplete. Tap below to continue from where you left.";

    await sendReplyButtons(booking.conversation.phone, text, [
      { id: "CONTINUE_BOOKING", title: "Continue booking" },
    ], booking.conversation.clinicId);
    await prisma.whatsAppBooking.update({
      where: { id: booking.id },
      data: { reason: reminderReason(booking.reason) },
    });
    sent += 1;
  }

  return sent;
}

export async function continueBooking(userId: string, message: string) {
  const booking = await getBooking(userId);
  if (!booking) return;

  const input = message.trim();
  const language = await userLanguage(userId);
  const copy = bookingCopy[language];

  if (booking.step === "name") {
    if (!validName(input)) return void await sendTextMessage(userId, copy.validName);
    return void await saveAndSend(userId, { patientName: input, step: "phone" }, sendTextMessage(userId, copy.phone));
  }

  if (booking.step === "phone") {
    if (!validPhone(input)) return void await sendTextMessage(userId, copy.validPhone);
    const phone = input.replace(/\D/g, "");
    const existingAppointment = await existingAppointmentForPhone(phone);
    if (existingAppointment) {
      return void await saveAndSend(userId, { phone, reason: `RESCHEDULE:${existingAppointment.id}`, step: "reschedule_confirm" }, askRescheduleChoice(userId, existingAppointment, language));
    }
    return void await saveAndSend(userId, { phone, step: "date" }, askDate(userId, language));
  }

  if (booking.step === "reschedule_confirm") {
    const choice = rescheduleChoice(input);
    if (choice === "NO") {
      await clearBooking(userId);
      return void await sendTextMessage(userId, copy.kept);
    }
    if (choice !== "YES") {
      const appointmentId = appointmentIdFromReason(booking.reason);
      const appointment = appointmentId ? await prisma.appointment.findUnique({ where: { id: appointmentId } }) : null;
      if (appointment) return askRescheduleChoice(userId, appointment, language);
      await clearBooking(userId);
      return void await sendTextMessage(userId, copy.error);
    }
    return void await saveAndSend(userId, { appointmentDate: "", appointmentTime: "", step: "date" }, askRescheduleDate(userId, language));
  }

  if (booking.step === "date") {
    let date = "";
    const choice = dateChoice(input);
    if (choice === "TODAY") date = todayISO();
    else if (choice === "TOMORROW") date = tomorrowISO();
    else if (choice.startsWith("DATE_")) date = choice.slice(5);
    else if (choice === "OTHER_DATE") {
      return void await saveAndSend(userId, { step: "date_picker" }, askDatePicker(userId, language));
    } else return appointmentIdFromReason(booking.reason) ? askRescheduleDate(userId, language) : askDate(userId, language);

    return void await saveAndSend(userId, { appointmentDate: date, step: "time" }, askTime(userId, date, language));
  }

  if (booking.step === "date_picker") {
    const choice = dateChoice(input);
    if (!choice.startsWith("DATE_")) return askDatePicker(userId, language);
    const date = choice.slice(5);
    return void await saveAndSend(userId, { appointmentDate: date, step: "time" }, askTime(userId, date, language));
  }

  if (booking.step === "custom_date") {
    if (!customDate(input)) return void await sendTextMessage(userId, copy.invalidDate);
    const [day, month, year] = input.split("-");
    const date = `${year}-${month}-${day}`;
    return void await saveAndSend(userId, { appointmentDate: date, step: "time" }, askTime(userId, date, language));
  }

  if (booking.step === "time") {
    const selectedTime = parseSelectedTime(input, booking.appointmentDate);
    const rescheduleAppointmentId = appointmentIdFromReason(booking.reason);
    if (!selectedTime) return askTime(userId, booking.appointmentDate, language);
    if (await isSlotBooked(booking.appointmentDate, selectedTime, rescheduleAppointmentId ?? undefined)) {
      await sendTextMessage(userId, copy.slotBooked);
      return askTime(userId, booking.appointmentDate, language);
    }
    if (rescheduleAppointmentId) {
      return void await saveAndSend(userId, { appointmentTime: selectedTime, step: "confirm" }, sendReplyButtons(userId, `${copy.confirm}\n\n${copy.name}: ${booking.patientName}\n${copy.phoneLabel}: ${booking.phone}\n${copy.dateLabel}: ${formatDate(booking.appointmentDate)}\n${copy.timeLabel}: ${formatDisplayTime(selectedTime)}\n${copy.serviceLabel}: ${copy.rescheduleReason}`, [
        { id: "CONFIRM_BOOKING", title: copy.confirmButton },
        { id: "CANCEL_BOOKING", title: copy.cancelButton },
      ]));
    }
    return void await saveAndSend(userId, { appointmentTime: selectedTime, step: "reason" }, askReason(userId, language));
  }

  if (booking.step === "reason") {
    const reason = selectedReason(input);
    if (!reason) return askReason(userId, language);
    const localizedReason = reason === "Follow up" ? copy.followUp : copy.newConsultation;
    return void await saveAndSend(userId, { reason, step: "confirm" }, sendReplyButtons(userId, `${copy.confirm}\n\n${copy.name}: ${booking.patientName}\n${copy.phoneLabel}: ${booking.phone}\n${copy.dateLabel}: ${formatDate(booking.appointmentDate)}\n${copy.timeLabel}: ${formatDisplayTime(booking.appointmentTime)}\n${copy.serviceLabel}: ${localizedReason}`, [
      { id: "CONFIRM_BOOKING", title: copy.confirmButton },
      { id: "CANCEL_BOOKING", title: copy.cancelButton },
    ]));
  }

  if (booking.step === "confirm") {
    const choice = confirmationChoice(input);
    if (choice === "CANCEL_BOOKING") {
      await clearBooking(userId);
      return void await sendTextMessage(userId, copy.cancelled);
    }

    if (choice !== "CONFIRM_BOOKING") {
      return void await sendReplyButtons(userId, copy.chooseOption, [
        { id: "CONFIRM_BOOKING", title: copy.confirmButton },
        { id: "CANCEL_BOOKING", title: copy.cancelButton },
      ]);
    }

    try {
      const rescheduleAppointmentId = appointmentIdFromReason(booking.reason);
      if (await isSlotBooked(booking.appointmentDate, booking.appointmentTime, rescheduleAppointmentId ?? undefined)) {
        await updateBooking(userId, { appointmentTime: "", step: "time" });
        await sendTextMessage(userId, copy.slotBooked);
        return askTime(userId, booking.appointmentDate, language);
      }

      if (rescheduleAppointmentId) {
        await prisma.appointment.update({
          where: { id: rescheduleAppointmentId },
          data: {
            patientName: booking.patientName,
            phone: booking.phone,
            appointmentDate: localDate(booking.appointmentDate),
            appointmentTime: booking.appointmentTime,
            treatment: copy.rescheduleReason,
            status: "Confirmed",
          },
        });
        await sendTextMessage(userId, `${copy.rescheduled}\n\n${formatDate(booking.appointmentDate)} at ${formatDisplayTime(booking.appointmentTime)}`);
        await clearBooking(userId);
        return;
      }

      const appointment = await saveAppointment({
        clinicId: (await primaryClinic())!.id,
        name: booking.patientName,
        phone: booking.phone,
        date: booking.appointmentDate,
        time: booking.appointmentTime,
        reason: bookingReason(booking.reason),
      });
      await markLeadBooked(userId, appointment.id, booking.patientName);
      await sendReplyButtons(userId, `${copy.success}\n\n${formatDate(booking.appointmentDate)} at ${formatDisplayTime(booking.appointmentTime)}\n\n${copy.thanks}`, [
        { id: `RESCHEDULE_APPOINTMENT_${appointment.id}`, title: copy.rescheduleButton },
      ]);
    } catch (error) {
      console.error("Booking Error:", error);
      await sendTextMessage(userId, copy.error);
    }

    await clearBooking(userId);
  }
}



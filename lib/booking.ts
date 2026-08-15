import { prisma } from "@/lib/prisma";
import {
  AppointmentNotAvailableError,
  AppointmentSlotUnavailableError,
  cancelAppointmentForWhatsApp,
  rescheduleAppointmentForWhatsApp,
  saveAppointment,
} from "./appointment";
import { availableLocationSlots, inspectLocationAvailability } from "./availability";
import { clearPersistentBooking, getBooking, getConversationLanguage, markLeadBooked, primaryClinic, startPersistentBooking, updateBooking } from "./whatsapp-conversations";
import { sendListMessage, sendReplyButtons, sendTextMessage } from "./whatsapp";
import { appointmentDateFromKey, appointmentDayRange, clinicDateAtOffset, parseClinicDate } from "./scheduling-core";
import { canonicalWhatsAppPhone } from "./phone";
import type { WhatsAppBooking } from "@prisma/client";

type BookingLanguage = "en" | "hi" | "mr";

const MAX_BOOKING_OFFSET_DAYS = 44;
const ACTIVE_BOOKING_STEPS = [
  "name",
  "phone",
  "reschedule_confirm",
  "date",
  "date_picker",
  "custom_date",
  "time",
  "reason",
  "confirm",
  "cancel_confirm",
];

const localDate = (value: string) => appointmentDateFromKey(value);
const formatDate = (value: string) => localDate(value).toLocaleDateString("en-IN", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });
function validName(name: string) {
  const cleaned = name.normalize("NFKC").trim().replace(/\s+/g, " ");
  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  const digits = cleaned.match(/\p{N}/gu)?.length ?? 0;
  return cleaned.length >= 2 && cleaned.length <= 80 && letters >= 2 && digits === 0;
}
const customDate = (value: string) => /^\d{2}-\d{2}-\d{4}$/.test(value);

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
  if (matchesAny(input, ["TODAY", "Today", "आज", "aaj"])) return "TODAY";
  if (matchesAny(input, ["TOMORROW", "Tomorrow", "कल", "उद्या", "kal", "udya"])) return "TOMORROW";
  if (matchesAny(input, ["OTHER_DATE", "Other", "दूसरी तारीख", "दुसरी तारीख", "other date", "dusri tarikh"])) return "OTHER_DATE";
  return "";
}

async function parseSelectedTime(input: string, date: string) {
  let parsed = input.startsWith("TIME_") ? input.slice(5) : "";

  if (parsed) {
    const location = await primaryBookingLocation();
    return location && (await availableLocationSlots(location.clinicId, location.id, date)).includes(parsed) ? parsed : "";
  }

  const cleaned = cleanInput(input).replace(/\./g, ":");
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return "";

  let hour = Number(match[1]);
  const minute = Number(match[2] || "00");
  const meridiem = match[3];

  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return "";

  parsed = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const location = await primaryBookingLocation();
  return location && (await availableLocationSlots(location.clinicId, location.id, date)).includes(parsed) ? parsed : "";
}

/** WhatsApp is scoped by its mapped Meta connection; select only that clinic's active primary branch. */
async function primaryBookingLocation() {
  const clinic = await primaryClinic();
  if (!clinic) return null;
  return prisma.clinicLocation.findFirst({
    where: { clinicId: clinic.id, active: true, isPrimary: true },
    select: { id: true, clinicId: true, timezone: true, clinic: { select: { timezone: true } } },
  });
}

function bookingLocationTimezone(location: { timezone: string | null; clinic: { timezone: string } }) {
  return location.timezone || location.clinic.timezone;
}

async function bookingDate(offsetDays = 0) {
  const location = await primaryBookingLocation();
  if (!location) return null;
  try {
    return clinicDateAtOffset(bookingLocationTimezone(location), offsetDays);
  } catch {
    return null;
  }
}

async function isAllowedBookingDate(value: string) {
  try {
    parseClinicDate(value);
    const location = await primaryBookingLocation();
    if (!location) return false;
    const timezone = bookingLocationTimezone(location);
    return value >= clinicDateAtOffset(timezone) && value <= clinicDateAtOffset(timezone, MAX_BOOKING_OFFSET_DAYS);
  } catch {
    return false;
  }
}

function confirmationChoice(input: string) {
  if (matchesAny(input, ["CONFIRM_BOOKING", "Confirm", "yes", "ok", "हाँ", "हा", "हो", "confirm karo", "कन्फर्म", "पक्का"])) return "CONFIRM_BOOKING";
  if (matchesAny(input, ["CANCEL_BOOKING", "Cancel", "no", "नहीं", "नको", "cancel karo", "रद्द", "कैंसल"])) return "CANCEL_BOOKING";
  return "";
}

async function userLanguage(userId: string): Promise<BookingLanguage> {
  const language = await getConversationLanguage(userId);
  return language === "hi" || language === "mr" ? language : "en";
}

const bookingCopy = {
  en: {
    start: "Great! Let's book your appointment. Please enter your full name.",
    validName: "Please enter a valid full name.",
    date: "Please choose an appointment date.",
    today: "Today",
    tomorrow: "Tomorrow",
    other: "Other",
    customDate: "Please enter the date in DD-MM-YYYY format.",
    invalidDate: "Invalid date. Please use DD-MM-YYYY.",
    past: "That date or time has already passed. Please choose another date.",
    closed: "The clinic is closed on that day. Please choose another date.",
    full: "All slots are booked for that day. Please choose another date.",
    misconfigured: "Online booking is temporarily unavailable because the clinic schedule is not configured. Please contact the clinic team.",
    noDates: "No later online-booking dates are available in the next 45 days. You can still check Today or Tomorrow.",
    time: "Select your preferred time.",
    timeButton: "Choose time",
    availableTimes: "Available times",
    service: "What service would you like to book?",
    serviceButton: "Choose service",
    serviceTitle: "Dental services",
    noServices: "Online booking is temporarily unavailable because no active services are configured. Please contact the clinic team.",
    serviceUnavailable: "That service is no longer available. Please choose an active service.",
    nextPage: "More services",
    previousPage: "Previous services",
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
    start: "बहुत अच्छा! आपका अपॉइंटमेंट बुक करते हैं। कृपया अपना पूरा नाम लिखें।",
    validName: "कृपया सही पूरा नाम लिखें।",
    date: "कृपया अपॉइंटमेंट की तारीख चुनें।",
    today: "आज",
    tomorrow: "कल",
    other: "दूसरी तारीख",
    customDate: "कृपया तारीख DD-MM-YYYY format में लिखें।",
    invalidDate: "तारीख सही नहीं है। कृपया DD-MM-YYYY use करें।",
    past: "यह तारीख या समय बीत चुका है। कृपया दूसरी तारीख चुनें।",
    closed: "उस दिन क्लिनिक बंद है। कृपया दूसरी तारीख चुनें।",
    full: "उस दिन सभी slots booked हैं। कृपया दूसरी तारीख चुनें।",
    misconfigured: "क्लिनिक का schedule configured नहीं है, इसलिए online booking अभी उपलब्ध नहीं है। कृपया clinic team से संपर्क करें।",
    noDates: "अगले 45 दिनों में बाद की कोई online-booking तारीख उपलब्ध नहीं है। आप आज या कल देख सकते हैं।",
    time: "कृपया अपना पसंदीदा समय चुनें।",
    timeButton: "समय चुनें",
    availableTimes: "Available times",
    service: "आप कौन सी service book करना चाहेंगे?",
    serviceButton: "Service चुनें",
    serviceTitle: "Dental services",
    noServices: "कोई active service configured नहीं है, इसलिए online booking अभी उपलब्ध नहीं है। कृपया clinic team से संपर्क करें।",
    serviceUnavailable: "यह service अब उपलब्ध नहीं है। कृपया कोई active service चुनें।",
    nextPage: "और services",
    previousPage: "पिछली services",
    reason: "यह appointment किसके लिए है?",
    reasonButton: "Reason चुनें",
    newConsultation: "नई consultation",
    followUp: "Follow up",
    existingAppointment: "आपका appointment पहले से booked है:",
    rescheduleQuestion: "क्या आप इसे reschedule करना चाहेंगे?",
    rescheduleButton: "Reschedule",
    keepButton: "यही रखें",
    rescheduleDate: "कृपया नई appointment date चुनें।",
    rescheduleReason: "Reschedule",
    kept: "ठीक है, आपका existing appointment वही रहेगा।",
    rescheduled: "आपका appointment successfully reschedule हो गया है!",
    slotBooked: "यह slot booked है। कृपया दूसरा समय चुनें।",
    confirm: "कृपया अपना अपॉइंटमेंट confirm करें",
    name: "नाम",
    phoneLabel: "फोन",
    dateLabel: "तारीख",
    timeLabel: "समय",
    serviceLabel: "Service",
    confirmButton: "Confirm",
    cancelButton: "Cancel",
    chooseOption: "कृपया एक option चुनें।",
    cancelled: "अपॉइंटमेंट booking cancel हो गई है।",
    success: "आपका अपॉइंटमेंट successfully book हो गया है!",
    thanks: "धन्यवाद। हम आपसे मिलने के लिए उत्सुक हैं।",
    error: "Sorry, booking में कुछ problem हुई। कृपया फिर से try करें।",
  },
  mr: {
    start: "छान! आपली appointment book करूया. कृपया आपले पूर्ण नाव लिहा.",
    validName: "कृपया योग्य पूर्ण नाव लिहा.",
    date: "कृपया appointment ची तारीख निवडा.",
    today: "आज",
    tomorrow: "उद्या",
    other: "दुसरी तारीख",
    customDate: "कृपया तारीख DD-MM-YYYY format मध्ये लिहा.",
    invalidDate: "तारीख योग्य नाही. कृपया DD-MM-YYYY use करा.",
    past: "ही तारीख किंवा वेळ निघून गेली आहे. कृपया दुसरी तारीख निवडा.",
    closed: "त्या दिवशी clinic बंद आहे. कृपया दुसरी तारीख निवडा.",
    full: "त्या दिवशी सर्व slots booked आहेत. कृपया दुसरी तारीख निवडा.",
    misconfigured: "Clinic चे schedule configured नसल्यामुळे online booking सध्या उपलब्ध नाही. कृपया clinic team शी संपर्क करा.",
    noDates: "पुढील 45 दिवसांत नंतरची online-booking तारीख उपलब्ध नाही. तुम्ही आज किंवा उद्या तपासू शकता.",
    time: "कृपया आपला preferred time निवडा.",
    timeButton: "वेळ निवडा",
    availableTimes: "Available times",
    service: "आपण कोणती service book करू इच्छिता?",
    serviceButton: "Service निवडा",
    serviceTitle: "Dental services",
    noServices: "कोणतीही active service configured नसल्यामुळे online booking सध्या उपलब्ध नाही. कृपया clinic team शी संपर्क करा.",
    serviceUnavailable: "ही service आता उपलब्ध नाही. कृपया active service निवडा.",
    nextPage: "आणखी services",
    previousPage: "मागील services",
    reason: "ही appointment कशासाठी आहे?",
    reasonButton: "Reason निवडा",
    newConsultation: "नवीन consultation",
    followUp: "Follow up",
    existingAppointment: "आपली appointment आधीच booked आहे:",
    rescheduleQuestion: "आपण ती reschedule करू इच्छिता का?",
    rescheduleButton: "Reschedule",
    keepButton: "तीच ठेवा",
    rescheduleDate: "कृपया नवीन appointment date निवडा.",
    rescheduleReason: "Reschedule",
    kept: "ठीक आहे, आपली existing appointment तशीच राहील.",
    rescheduled: "आपली appointment successfully reschedule झाली आहे!",
    slotBooked: "हा slot booked आहे. कृपया दुसरी वेळ निवडा.",
    confirm: "कृपया आपली appointment confirm करा",
    name: "नाव",
    phoneLabel: "फोन",
    dateLabel: "तारीख",
    timeLabel: "वेळ",
    serviceLabel: "Service",
    confirmButton: "Confirm",
    cancelButton: "Cancel",
    chooseOption: "कृपया एक option निवडा.",
    cancelled: "Appointment booking cancel झाली आहे.",
    success: "आपली appointment successfully book झाली आहे!",
    thanks: "धन्यवाद. आम्ही आपली भेट घेण्यासाठी उत्सुक आहोत.",
    error: "Sorry, booking मध्ये काही problem झाली. कृपया पुन्हा try करा.",
  },
};

const lifecycleCopy: Record<BookingLanguage, {
  cancelQuestion: string;
  cancelConfirm: string;
  keep: string;
  cancelled: string;
  noAppointment: string;
}> = {
  en: {
    cancelQuestion: "Do you want to cancel this appointment?",
    cancelConfirm: "Yes, cancel it",
    keep: "Keep appointment",
    cancelled: "Your appointment has been cancelled.",
    noAppointment: "I could not find an active appointment for this WhatsApp number.",
  },
  hi: {
    cancelQuestion: "क्या आप यह अपॉइंटमेंट रद्द करना चाहते हैं?",
    cancelConfirm: "हाँ, रद्द करें",
    keep: "अपॉइंटमेंट रखें",
    cancelled: "आपका अपॉइंटमेंट रद्द कर दिया गया है।",
    noAppointment: "इस WhatsApp नंबर के लिए कोई सक्रिय अपॉइंटमेंट नहीं मिला।",
  },
  mr: {
    cancelQuestion: "तुम्हाला ही अपॉइंटमेंट रद्द करायची आहे का?",
    cancelConfirm: "हो, रद्द करा",
    keep: "अपॉइंटमेंट ठेवा",
    cancelled: "तुमची अपॉइंटमेंट रद्द केली आहे.",
    noAppointment: "या WhatsApp क्रमांकासाठी सक्रिय अपॉइंटमेंट सापडली नाही.",
  },
};

type BookableService = {
  id: number;
  name: string;
  description: string | null;
  durationMinutes: number;
};

const SERVICE_PAGE_SIZE = 8;

function serviceIdFromReason(reason: string) {
  const value = bookingReason(reason);
  if (!value.startsWith("SERVICE:")) return null;
  const id = Number(value.slice("SERVICE:".length).split(":", 1)[0]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function servicePageFromInput(input: string) {
  if (!input.startsWith("SERVICE_PAGE_")) return null;
  const page = Number(input.slice("SERVICE_PAGE_".length));
  return Number.isInteger(page) && page >= 0 ? page : null;
}

function serviceIdFromInput(input: string) {
  if (!input.startsWith("SERVICE_")) return null;
  const id = Number(input.slice("SERVICE_".length));
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function branchUsesAssignedServices(locationId: number, clinicId: number) {
  return (await prisma.clinicLocationService.count({
    where: {
      locationId,
      service: { clinicId, active: true },
    },
  })) > 0;
}

function serviceScope(locationId: number, clinicId: number, assignedOnly: boolean) {
  return {
    clinicId,
    active: true,
    ...(assignedOnly ? { locations: { some: { locationId } } } : {}),
  };
}

async function bookableServicePage(page: number) {
  const location = await primaryBookingLocation();
  if (!location) return null;
  const assignedOnly = await branchUsesAssignedServices(location.id, location.clinicId);
  const where = serviceScope(location.id, location.clinicId, assignedOnly);
  const total = await prisma.clinicService.count({ where });
  const maxPage = Math.max(0, Math.ceil(total / SERVICE_PAGE_SIZE) - 1);
  const safePage = Math.min(page, maxPage);
  const services = await prisma.clinicService.findMany({
    where,
    select: { id: true, name: true, description: true, durationMinutes: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }],
    skip: safePage * SERVICE_PAGE_SIZE,
    take: SERVICE_PAGE_SIZE,
  });
  return { services, page: safePage, maxPage };
}

async function activeBookableService(serviceId: number): Promise<BookableService | null> {
  const location = await primaryBookingLocation();
  if (!location) return null;
  const assignedOnly = await branchUsesAssignedServices(location.id, location.clinicId);
  return prisma.clinicService.findFirst({
    where: {
      id: serviceId,
      ...serviceScope(location.id, location.clinicId, assignedOnly),
    },
    select: { id: true, name: true, description: true, durationMinutes: true },
  });
}

/** Date choices must use the same canonical branch-hours and capacity query as booking confirmation. */
async function nextOpenDates(count = 10) {
  const dates: string[] = [];
  const location = await primaryBookingLocation();
  if (!location) return { dates, status: "MISCONFIGURED" as const };
  for (let offset = 2; dates.length < count && offset < 45; offset += 1) {
    const date = clinicDateAtOffset(bookingLocationTimezone(location), offset);
    const availability = await inspectLocationAvailability(location.clinicId, location.id, date);
    if (availability.status === "MISCONFIGURED") {
      return { dates: [], status: "MISCONFIGURED" as const };
    }
    if (availability.status === "AVAILABLE") dates.push(date);
  }
  return { dates, status: dates.length ? "AVAILABLE" as const : "NONE" as const };
}

async function isSlotBooked(date: string, time: string, excludeAppointmentId?: number) {
  const location = await primaryBookingLocation();
  if (!location) return true;
  const existing = await prisma.appointment.findFirst({
    where: {
      clinicId: location.clinicId,
      locationId: location.id,
      appointmentDate: appointmentDayRange(date),
      appointmentTime: time,
      archivedAt: null,
      status: { notIn: ["Cancelled", "No-show"] },
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

function resultAppointmentId(reason: string, prefix: "BOOKED" | "RESCHEDULED" | "CANCEL" | "CANCELLED") {
  const value = bookingReason(reason);
  if (!value.startsWith(`${prefix}:`)) return null;
  const id = Number(value.slice(prefix.length + 1));
  return Number.isInteger(id) && id > 0 ? id : null;
}

function bookingReason(reason: string) {
  return reason.startsWith("REMINDED:") ? reason.slice("REMINDED:".length) : reason;
}

function reminderReason(reason: string) {
  return reason.startsWith("REMINDED:") ? reason : `REMINDED:${reason}`;
}

async function existingAppointmentForPhone(phone: string) {
  const location = await primaryBookingLocation();
  if (!location) return null;
  const today = appointmentDayRange(clinicDateAtOffset(bookingLocationTimezone(location))).gte;

  return prisma.appointment.findFirst({
    where: {
      clinicId: location.clinicId,
      phone: { in: phoneCandidates(phone) },
      appointmentDate: { gte: today },
      archivedAt: null,
      status: { notIn: ["Cancelled", "Completed", "No-show"] },
    },
    orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
  });
}

function phoneCandidates(phone: string) {
  const canonical = canonicalWhatsAppPhone(phone);
  if (!canonical) return [];
  const indiaLegacy = canonical.startsWith("91") && canonical.length === 12 ? canonical.slice(2) : "";
  return Array.from(new Set([canonical, indiaLegacy].filter(Boolean)));
}

async function existingPatientForPhone(phone: string) {
  const clinic = await primaryClinic();
  if (!clinic) return null;
  return prisma.patient.findFirst({
    where: { clinicId: clinic.id, phone: { in: phoneCandidates(phone) } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, fullName: true, phone: true },
  });
}

// WhatsApp interactive replies are user-controlled strings.  An appointment
// id alone is never sufficient authority to view or reschedule a booking.
async function appointmentForWhatsAppContact(phone: string, appointmentId: number) {
  const clinic = await primaryClinic();
  if (!clinic) return null;
  return prisma.appointment.findFirst({
    where: {
      id: appointmentId,
      clinicId: clinic.id,
      phone: { in: phoneCandidates(phone) },
      archivedAt: null,
      status: { notIn: ["Cancelled", "Completed", "No-show"] },
    },
  });
}

export async function hasBooking(userId: string) {
  return Boolean(await getBooking(userId));
}

export async function clearBooking(userId: string) {
  await clearPersistentBooking(userId);
}

async function wasConfirmationRecorded(booking: WhatsAppBooking, content: string) {
  return Boolean(await prisma.whatsAppMessage.findFirst({
    where: {
      conversationId: booking.conversationId,
      direction: "OUTBOUND",
      content,
      createdAt: { gte: booking.updatedAt },
    },
    select: { id: true },
  }));
}

async function deliverBookedConfirmation(userId: string, booking: WhatsAppBooking, language: BookingLanguage) {
  const appointmentId = resultAppointmentId(booking.reason, "BOOKED");
  if (!appointmentId) return false;
  const copy = bookingCopy[language];
  const content = `${copy.success}\n\n${formatDate(booking.appointmentDate)} at ${formatDisplayTime(booking.appointmentTime)}\n\n${copy.thanks}`;
  await markLeadBooked(userId, appointmentId, booking.patientName);
  if (!(await wasConfirmationRecorded(booking, content))) {
    await sendReplyButtons(userId, content, [
      { id: `RESCHEDULE_APPOINTMENT_${appointmentId}`, title: copy.rescheduleButton },
      { id: `CANCEL_APPOINTMENT_${appointmentId}`, title: copy.cancelButton },
    ]);
  }
  await clearBooking(userId);
  return true;
}

async function deliverRescheduledConfirmation(userId: string, booking: WhatsAppBooking, language: BookingLanguage) {
  if (!resultAppointmentId(booking.reason, "RESCHEDULED")) return false;
  const copy = bookingCopy[language];
  const content = `${copy.rescheduled}\n\n${formatDate(booking.appointmentDate)} at ${formatDisplayTime(booking.appointmentTime)}`;
  if (!(await wasConfirmationRecorded(booking, content))) await sendTextMessage(userId, content);
  await clearBooking(userId);
  return true;
}

async function deliverCancellationConfirmation(userId: string, booking: WhatsAppBooking, language: BookingLanguage) {
  if (!resultAppointmentId(booking.reason, "CANCELLED")) return false;
  const content = lifecycleCopy[language].cancelled;
  if (!(await wasConfirmationRecorded(booking, content))) await sendTextMessage(userId, content);
  await clearBooking(userId);
  return true;
}

async function saveAndSend(userId: string, data: Record<string, string>, reply: () => Promise<unknown>) {
  await updateBooking(userId, data);
  await reply();
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

async function askDateForCurrentFlow(userId: string, language: BookingLanguage) {
  const booking = await getBooking(userId);
  if (booking && appointmentIdFromReason(booking.reason)) {
    await askRescheduleDate(userId, language);
  } else {
    await askDate(userId, language);
  }
}

async function askDatePicker(userId: string, language: BookingLanguage) {
  const copy = bookingCopy[language];
  const result = await nextOpenDates();
  if (!result.dates.length) {
    await updateBooking(userId, { appointmentDate: "", appointmentTime: "", step: "date" });
    await sendTextMessage(userId, result.status === "MISCONFIGURED" ? copy.misconfigured : copy.noDates);
    if (result.status !== "MISCONFIGURED") {
      await sendReplyButtons(userId, copy.date, [
        { id: "TODAY", title: copy.today },
        { id: "TOMORROW", title: copy.tomorrow },
      ]);
    }
    return;
  }
  await sendListMessage(userId, copy.date, "Choose date", [{
    title: "Available dates",
    rows: result.dates.map((date) => ({
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
  const location = await primaryBookingLocation();
  if (!location) {
    await updateBooking(userId, { appointmentDate: "", appointmentTime: "", step: "date" });
    await sendTextMessage(userId, copy.misconfigured);
    return;
  }
  const availability = await inspectLocationAvailability(location.clinicId, location.id, date);
  if (availability.status !== "AVAILABLE") {
    await updateBooking(userId, { appointmentDate: "", appointmentTime: "", step: "date" });
    const statusCopy = availability.status === "FULL"
      ? copy.full
      : availability.status === "PAST"
        ? copy.past
        : availability.status === "MISCONFIGURED"
          ? copy.misconfigured
          : copy.closed;
    await sendTextMessage(userId, statusCopy);
    if (availability.status !== "MISCONFIGURED") await askDateForCurrentFlow(userId, language);
    return;
  }

  await sendListMessage(userId, copy.time, copy.timeButton, [{
    title: copy.availableTimes,
    rows: availability.slots.slice(0, 10).map((time) => ({ id: `TIME_${time}`, title: formatDisplayTime(time) })),
  }]);
}

async function askReason(userId: string, language: BookingLanguage, requestedPage = 0) {
  const copy = bookingCopy[language];
  const result = await bookableServicePage(requestedPage);
  if (!result) return void await sendTextMessage(userId, copy.misconfigured);
  if (!result.services.length) return void await sendTextMessage(userId, copy.noServices);
  const rows = result.services.map((service) => ({
    id: `SERVICE_${service.id}`,
    title: service.name,
    description: service.description || `${service.durationMinutes} minutes`,
  }));
  if (result.page > 0) rows.unshift({
    id: `SERVICE_PAGE_${result.page - 1}`,
    title: copy.previousPage,
    description: "",
  });
  if (result.page < result.maxPage) rows.push({
    id: `SERVICE_PAGE_${result.page + 1}`,
    title: copy.nextPage,
    description: "",
  });
  await sendListMessage(userId, copy.service, copy.serviceButton, [{
    title: copy.serviceTitle,
    rows,
  }]);
}

function rescheduleChoice(input: string) {
  if (matchesAny(input, ["RESCHEDULE_YES", "reschedule", "yes", "हाँ", "हा", "हो"])) return "YES";
  if (matchesAny(input, ["RESCHEDULE_NO", "keep appointment", "keep", "no", "नहीं", "नको"])) return "NO";
  return "";
}

export async function startBooking(userId: string) {
  const language = await userLanguage(userId);
  const copy = bookingCopy[language];
  const senderPhone = canonicalWhatsAppPhone(userId);
  if (!senderPhone) {
    await sendTextMessage(userId, copy.error);
    return;
  }
  const [patient, existingAppointment] = await Promise.all([
    existingPatientForPhone(senderPhone),
    existingAppointmentForPhone(senderPhone),
  ]);

  await startPersistentBooking(userId);
  const phone = senderPhone;

  if (existingAppointment) {
    await updateBooking(userId, {
      patientName: patient?.fullName || existingAppointment.patientName,
      phone,
      reason: `RESCHEDULE:${existingAppointment.id}`,
      step: "reschedule_confirm",
    });
    await askRescheduleChoice(userId, existingAppointment, language);
    return;
  }

  if (patient) {
    await updateBooking(userId, { patientName: patient.fullName, phone, step: "date" });
    await sendTextMessage(userId, `Welcome back, ${patient.fullName}.`);
    await askDate(userId, language);
    return;
  }

  await updateBooking(userId, { phone, step: "name" });
  await sendTextMessage(userId, copy.start);
}

export async function startReschedule(userId: string, appointmentId: number) {
  const language = await userLanguage(userId);
  const copy = bookingCopy[language];
  const senderPhone = canonicalWhatsAppPhone(userId);
  if (!senderPhone) {
    await sendTextMessage(userId, copy.error);
    return;
  }
  const appointment = await appointmentForWhatsAppContact(userId, appointmentId);

  if (!appointment || ["Cancelled", "Completed"].includes(appointment.status)) {
    await sendTextMessage(userId, copy.error);
    return;
  }

  await startPersistentBooking(userId);
  await updateBooking(userId, {
    patientName: appointment.patientName,
    phone: senderPhone,
    reason: `RESCHEDULE:${appointment.id}`,
    step: "date",
  });
  await askRescheduleDate(userId, language);
}

export async function startCancellation(userId: string, appointmentId?: number) {
  const language = await userLanguage(userId);
  const copy = lifecycleCopy[language];
  const senderPhone = canonicalWhatsAppPhone(userId);
  if (!senderPhone) {
    await sendTextMessage(userId, copy.noAppointment);
    return;
  }
  const appointment = appointmentId
    ? await appointmentForWhatsAppContact(userId, appointmentId)
    : await existingAppointmentForPhone(userId);
  if (!appointment) {
    await sendTextMessage(userId, copy.noAppointment);
    return;
  }

  await startPersistentBooking(userId);
  await updateBooking(userId, {
    patientName: appointment.patientName,
    phone: senderPhone,
    appointmentDate: appointment.appointmentDate.toISOString().slice(0, 10),
    appointmentTime: appointment.appointmentTime,
    reason: `CANCEL:${appointment.id}`,
    step: "cancel_confirm",
  });
  await sendReplyButtons(userId, `${copy.cancelQuestion}\n\n${formatDate(appointment.appointmentDate.toISOString().slice(0, 10))} at ${formatDisplayTime(appointment.appointmentTime)}`, [
    { id: "CONFIRM_CANCELLATION", title: copy.cancelConfirm },
    { id: "KEEP_APPOINTMENT", title: copy.keep },
  ]);
}

export async function resumeBooking(userId: string) {
  const booking = await getBooking(userId);
  if (!booking) return false;

  const language = await userLanguage(userId);
  const copy = bookingCopy[language];

  if (booking.step === "booked") await deliverBookedConfirmation(userId, booking, language);
  else if (booking.step === "rescheduled") await deliverRescheduledConfirmation(userId, booking, language);
  else if (booking.step === "cancelled") await deliverCancellationConfirmation(userId, booking, language);
  else if (booking.step === "cancel_confirm") {
    const lifecycle = lifecycleCopy[language];
    const details = booking.appointmentDate && booking.appointmentTime
      ? `\n\n${formatDate(booking.appointmentDate)} at ${formatDisplayTime(booking.appointmentTime)}`
      : "";
    await sendReplyButtons(userId, `${lifecycle.cancelQuestion}${details}`, [
      { id: "CONFIRM_CANCELLATION", title: lifecycle.cancelConfirm },
      { id: "KEEP_APPOINTMENT", title: lifecycle.keep },
    ]);
  } else if (booking.step === "name") await sendTextMessage(userId, copy.start);
  else if (booking.step === "phone") {
    const senderPhone = canonicalWhatsAppPhone(userId);
    if (!senderPhone) await sendTextMessage(userId, copy.error);
    else await saveAndSend(userId, { phone: senderPhone, step: "date" }, () => askDate(userId, language));
  }
  else if (booking.step === "reschedule_confirm") {
    const appointmentId = appointmentIdFromReason(booking.reason);
    const appointment = appointmentId ? await appointmentForWhatsAppContact(booking.phone || userId, appointmentId) : null;
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
    const service = rescheduleAppointmentId
      ? null
      : await activeBookableService(serviceIdFromReason(booking.reason) || 0);
    if (!rescheduleAppointmentId && !service) {
      await updateBooking(userId, { reason: "", step: "reason" });
      await sendTextMessage(userId, copy.serviceUnavailable);
      await askReason(userId, language);
      return true;
    }
    const reason = rescheduleAppointmentId ? copy.rescheduleReason : service!.name;
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
      step: { in: ACTIVE_BOOKING_STEPS },
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

  if (booking.step === "booked") return void await deliverBookedConfirmation(userId, booking, language);
  if (booking.step === "rescheduled") return void await deliverRescheduledConfirmation(userId, booking, language);
  if (booking.step === "cancelled") return void await deliverCancellationConfirmation(userId, booking, language);

  if (booking.step === "cancel_confirm") {
    const lifecycle = lifecycleCopy[language];
    if (matchesAny(input, ["KEEP_APPOINTMENT", "keep", "no", "नहीं", "नको"])) {
      await clearBooking(userId);
      return void await sendTextMessage(userId, lifecycle.keep);
    }
    if (!matchesAny(input, ["CONFIRM_CANCELLATION", "yes", "cancel appointment", "हाँ", "हो"])) {
      return void await sendReplyButtons(userId, lifecycle.cancelQuestion, [
        { id: "CONFIRM_CANCELLATION", title: lifecycle.cancelConfirm },
        { id: "KEEP_APPOINTMENT", title: lifecycle.keep },
      ]);
    }
    const appointmentId = resultAppointmentId(booking.reason, "CANCEL");
    const clinic = await primaryClinic();
    if (!appointmentId || !clinic) {
      await clearBooking(userId);
      return void await sendTextMessage(userId, lifecycle.noAppointment);
    }
    await cancelAppointmentForWhatsApp({
      clinicId: clinic.id,
      appointmentId,
      phoneCandidates: phoneCandidates(userId),
      bookingId: booking.id,
    });
    const completed = await getBooking(userId);
    if (completed) await deliverCancellationConfirmation(userId, completed, language);
    return;
  }

  if (booking.step === "name") {
    if (!validName(input)) return void await sendTextMessage(userId, copy.validName);
    const senderPhone = canonicalWhatsAppPhone(userId);
    if (!senderPhone) return void await sendTextMessage(userId, copy.error);
    return void await saveAndSend(userId, { patientName: input, phone: senderPhone, step: "date" }, () => askDate(userId, language));
  }

  // Migrate any legacy in-flight workflow without ever asking the WhatsApp
  // user to type a separate contact number.
  if (booking.step === "phone") {
    const senderPhone = canonicalWhatsAppPhone(userId);
    if (!senderPhone) return void await sendTextMessage(userId, copy.error);
    return void await saveAndSend(userId, { phone: senderPhone, step: "date" }, () => askDate(userId, language));
  }

  if (booking.step === "reschedule_confirm") {
    const choice = rescheduleChoice(input);
    if (choice === "NO") {
      await clearBooking(userId);
      return void await sendTextMessage(userId, copy.kept);
    }
    if (choice !== "YES") {
      const appointmentId = appointmentIdFromReason(booking.reason);
      const appointment = appointmentId ? await appointmentForWhatsAppContact(booking.phone || userId, appointmentId) : null;
      if (appointment) return askRescheduleChoice(userId, appointment, language);
      await clearBooking(userId);
      return void await sendTextMessage(userId, copy.error);
    }
    return void await saveAndSend(userId, { appointmentDate: "", appointmentTime: "", step: "date" }, () => askRescheduleDate(userId, language));
  }

  if (booking.step === "date") {
    let date: string | null = "";
    const choice = dateChoice(input);
    if (choice === "TODAY") date = await bookingDate();
    else if (choice === "TOMORROW") date = await bookingDate(1);
    else if (choice.startsWith("DATE_")) date = choice.slice(5);
    else if (choice === "OTHER_DATE") {
      return void await saveAndSend(userId, { step: "date_picker" }, () => askDatePicker(userId, language));
    } else return appointmentIdFromReason(booking.reason) ? askRescheduleDate(userId, language) : askDate(userId, language);

    if (!date || !(await isAllowedBookingDate(date))) {
      await sendTextMessage(userId, date ? copy.invalidDate : copy.misconfigured);
      if (!date) return;
      return appointmentIdFromReason(booking.reason) ? askRescheduleDate(userId, language) : askDate(userId, language);
    }

    return void await saveAndSend(userId, { appointmentDate: date, step: "time" }, () => askTime(userId, date, language));
  }

  if (booking.step === "date_picker") {
    const choice = dateChoice(input);
    if (!choice.startsWith("DATE_")) return askDatePicker(userId, language);
    const date = choice.slice(5);
    if (!(await isAllowedBookingDate(date))) return askDatePicker(userId, language);
    return void await saveAndSend(userId, { appointmentDate: date, step: "time" }, () => askTime(userId, date, language));
  }

  if (booking.step === "custom_date") {
    if (!customDate(input)) return void await sendTextMessage(userId, copy.invalidDate);
    const [day, month, year] = input.split("-");
    const date = `${year}-${month}-${day}`;
    if (!(await isAllowedBookingDate(date))) return void await sendTextMessage(userId, copy.invalidDate);
    return void await saveAndSend(userId, { appointmentDate: date, step: "time" }, () => askTime(userId, date, language));
  }

  if (booking.step === "time") {
    const selectedTime = await parseSelectedTime(input, booking.appointmentDate);
    const rescheduleAppointmentId = appointmentIdFromReason(booking.reason);
    if (!selectedTime) return askTime(userId, booking.appointmentDate, language);
    if (await isSlotBooked(booking.appointmentDate, selectedTime, rescheduleAppointmentId ?? undefined)) {
      await sendTextMessage(userId, copy.slotBooked);
      return askTime(userId, booking.appointmentDate, language);
    }
    if (rescheduleAppointmentId) {
      return void await saveAndSend(userId, { appointmentTime: selectedTime, step: "confirm" }, () => sendReplyButtons(userId, `${copy.confirm}\n\n${copy.name}: ${booking.patientName}\n${copy.phoneLabel}: ${booking.phone}\n${copy.dateLabel}: ${formatDate(booking.appointmentDate)}\n${copy.timeLabel}: ${formatDisplayTime(selectedTime)}\n${copy.serviceLabel}: ${copy.rescheduleReason}`, [
        { id: "CONFIRM_BOOKING", title: copy.confirmButton },
        { id: "CANCEL_BOOKING", title: copy.cancelButton },
      ]));
    }
    return void await saveAndSend(userId, { appointmentTime: selectedTime, step: "reason" }, () => askReason(userId, language));
  }

  if (booking.step === "reason") {
    const page = servicePageFromInput(input);
    if (page != null) return askReason(userId, language, page);
    const serviceId = serviceIdFromInput(input);
    const service = serviceId ? await activeBookableService(serviceId) : null;
    if (!service) {
      await sendTextMessage(userId, copy.serviceUnavailable);
      return askReason(userId, language);
    }
    return void await saveAndSend(userId, { reason: `SERVICE:${service.id}:${service.name}`, step: "confirm" }, () => sendReplyButtons(userId, `${copy.confirm}\n\n${copy.name}: ${booking.patientName}\n${copy.phoneLabel}: ${booking.phone}\n${copy.dateLabel}: ${formatDate(booking.appointmentDate)}\n${copy.timeLabel}: ${formatDisplayTime(booking.appointmentTime)}\n${copy.serviceLabel}: ${service.name}`, [
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
      const service = rescheduleAppointmentId
        ? null
        : await activeBookableService(serviceIdFromReason(booking.reason) || 0);
      if (!rescheduleAppointmentId && !service) {
        await updateBooking(userId, { reason: "", step: "reason" });
        await sendTextMessage(userId, copy.serviceUnavailable);
        return askReason(userId, language);
      }
      if (await isSlotBooked(booking.appointmentDate, booking.appointmentTime, rescheduleAppointmentId ?? undefined)) {
        await updateBooking(userId, { appointmentTime: "", step: "time" });
        await sendTextMessage(userId, copy.slotBooked);
        return askTime(userId, booking.appointmentDate, language);
      }

      if (rescheduleAppointmentId) {
        const location = await primaryBookingLocation();
        if (!location) throw new Error("No active primary branch configured for booking.");
        await rescheduleAppointmentForWhatsApp({
          clinicId: location.clinicId,
          appointmentId: rescheduleAppointmentId,
          phoneCandidates: phoneCandidates(userId),
          fallbackLocationId: location.id,
          date: booking.appointmentDate,
          time: booking.appointmentTime,
          bookingId: booking.id,
        });
        const completed = await getBooking(userId);
        if (completed) await deliverRescheduledConfirmation(userId, completed, language);
        return;
      }

      const location = await primaryBookingLocation();
      if (!location) throw new Error("No active primary branch configured for booking.");
      await saveAppointment({
        clinicId: location.clinicId,
        locationId: location.id,
        name: booking.patientName,
        phone: booking.phone,
        date: booking.appointmentDate,
        time: booking.appointmentTime,
        reason: service!.name,
        bookingId: booking.id,
      });
      const completed = await getBooking(userId);
      if (completed) await deliverBookedConfirmation(userId, completed, language);
    } catch (error) {
      console.error("Booking Error:", error);
      const durable = await getBooking(userId);
      // The database effect committed and its terminal state is durable. Do
      // not send a false failure message or repeat the appointment mutation.
      if (durable && ["booked", "rescheduled"].includes(durable.step)) return;
      if (error instanceof AppointmentSlotUnavailableError) {
        await updateBooking(userId, { appointmentTime: "", step: "time" });
        await sendTextMessage(userId, copy.slotBooked);
        return askTime(userId, booking.appointmentDate, language);
      }
      if (error instanceof AppointmentNotAvailableError) await clearBooking(userId);
      await sendTextMessage(userId, copy.error);
    }
  }
}

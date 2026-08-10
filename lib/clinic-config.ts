import { prisma } from "@/lib/prisma";

export const defaultServices = [
  { name: "Dentures", description: "Removable replacement teeth for missing teeth", durationMinutes: 45, sortOrder: 1 },
  { name: "Implants", description: "Dental implant consultation and treatment planning", durationMinutes: 45, sortOrder: 2 },
  { name: "Root Canals", description: "Root canal consultation and treatment", durationMinutes: 45, sortOrder: 3 },
  { name: "Braces", description: "Orthodontic consultation for teeth alignment", durationMinutes: 45, sortOrder: 4 },
  { name: "Aesthetic Dentistry", description: "Cosmetic dental care and smile improvement", durationMinutes: 45, sortOrder: 5 },
  { name: "Kids Dentistry", description: "Dental care for children", durationMinutes: 30, sortOrder: 6 },
  { name: "Gum Treatment", description: "Gum health consultation and treatment", durationMinutes: 45, sortOrder: 7 },
  { name: "Extractions", description: "Tooth extraction consultation and procedure", durationMinutes: 45, sortOrder: 8 },
  { name: "Surgeries", description: "Dental and oral surgical consultation", durationMinutes: 60, sortOrder: 9 },
  { name: "X-Ray", description: "Dental X-Ray imaging and review", durationMinutes: 20, sortOrder: 10 },
];

export const defaultHours = Array.from({ length: 7 }, (_, dayOfWeek) => ({
  dayOfWeek,
  openTime: "09:00",
  closeTime: "18:00",
  slotMinutes: 30,
  isClosed: dayOfWeek === 0,
}));

export async function getClinicConfiguration(clinicId?: number) {
  return prisma.clinic.findFirst({
    where: clinicId ? { id: clinicId } : undefined,
    include: {
      services: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      hours: { orderBy: { dayOfWeek: "asc" } },
      whatsapp: true,
      locations: {
        where: { active: true },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        include: { hours: { orderBy: [{ dayOfWeek: "asc" }, { sortOrder: "asc" }] } },
      },
      faqs: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 20 },
    },
  });
}

export function clinicDisplayName(clinic: { name: string; brandName?: string | null }) {
  return clinic.brandName?.trim() || clinic.name;
}

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatClinicInformation(clinic: Awaited<ReturnType<typeof getClinicConfiguration>> | null | undefined) {
  if (!clinic) return "Clinic details are being updated. Please contact the clinic team directly for assistance.";
  const primaryLocation = clinic.locations.find((location) => location.isPrimary) || clinic.locations[0];

  const contactLines = [
    clinic.name,
    primaryLocation?.phone || clinic.phone ? `Phone: ${primaryLocation?.phone || clinic.phone}` : null,
    primaryLocation?.email || clinic.email ? `Email: ${primaryLocation?.email || clinic.email}` : null,
    primaryLocation?.address || clinic.address ? `Address: ${primaryLocation?.address || clinic.address}` : null,
  ].filter(Boolean);

  const effectiveHours = primaryLocation?.hours.length ? primaryLocation.hours : clinic.hours;
  const hourLines = effectiveHours.length
    ? effectiveHours.map((item) => `${dayNames[item.dayOfWeek] || `Day ${item.dayOfWeek}`}: ${item.isClosed ? "Closed" : `${item.openTime} - ${item.closeTime}`}`)
    : defaultHours.map((item) => `${dayNames[item.dayOfWeek]}: ${item.isClosed ? "Closed" : `${item.openTime} - ${item.closeTime}`}`);

  return [...contactLines, "", "Clinic hours:", ...hourLines].join("\n").trim();
}

export function buildTimeSlots(openTime: string, closeTime: string, slotMinutes: number) {
  const [openHour, openMinute] = openTime.split(":").map(Number);
  const [closeHour, closeMinute] = closeTime.split(":").map(Number);
  let current = openHour * 60 + openMinute;
  const closing = closeHour * 60 + closeMinute;
  const slots: string[] = [];
  while (current < closing && slots.length < 10) {
    const hour = String(Math.floor(current / 60)).padStart(2, "0");
    const minute = String(current % 60).padStart(2, "0");
    slots.push(`${hour}:${minute}`);
    current += Math.max(15, slotMinutes);
  }
  return slots;
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

const operationsPath = "/dashboard/settings/operations";

function scheduleInput(formData: FormData) {
  const dayValue = String(formData.get("dayOfWeek") ?? "").trim();
  const openTime = String(formData.get("openTime") ?? "").trim();
  const closeTime = String(formData.get("closeTime") ?? "").trim();
  const slotValue = String(formData.get("slotMinutes") ?? "").trim();
  const dayOfWeek = Number(dayValue);
  const slotMinutes = Number(slotValue);
  const isClosed = formData.get("isClosed") === "true";
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;

  if (
    !/^\d+$/.test(dayValue)
    || !Number.isInteger(dayOfWeek)
    || dayOfWeek < 0
    || dayOfWeek > 6
    || !validTime.test(openTime)
    || !validTime.test(closeTime)
    || !/^\d+$/.test(slotValue)
    || !Number.isInteger(slotMinutes)
    || slotMinutes < 15
    || slotMinutes > 240
    || (!isClosed && openTime >= closeTime)
  ) return null;

  return { dayOfWeek, openTime, closeTime, slotMinutes, isClosed };
}

export async function addServiceAction(formData: FormData) {
  const owner = await requireOwner();
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const durationMinutes = Math.max(15, Number(formData.get("durationMinutes")) || 30);
  const rawPrice = String(formData.get("price") || "").trim();
  await prisma.clinicService.create({ data: {
    clinicId: owner.clinicId, name,
    description: String(formData.get("description") || "").trim() || null,
    durationMinutes, price: rawPrice ? Number(rawPrice) : null,
    sortOrder: Number(formData.get("sortOrder")) || 0,
  }});
  revalidatePath(operationsPath);
}

export async function toggleServiceAction(formData: FormData) {
  const owner = await requireOwner();
  const id = Number(formData.get("id"));
  const active = String(formData.get("active")) === "true";
  if (Number.isInteger(id)) await prisma.clinicService.updateMany({ where: { id, clinicId: owner.clinicId }, data: { active } });
  revalidatePath(operationsPath);
}

export async function updateServiceAction(formData: FormData) {
  const owner = await requireOwner();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") || "").trim();
  const rawPrice = String(formData.get("price") || "").trim();
  if (!Number.isInteger(id) || !name) return;

  await prisma.clinicService.updateMany({
    where: { id, clinicId: owner.clinicId },
    data: {
      name,
      description: String(formData.get("description") || "").trim() || null,
      durationMinutes: Math.max(15, Number(formData.get("durationMinutes")) || 30),
      price: rawPrice ? Number(rawPrice) : null,
    },
  });
  revalidatePath(operationsPath);
}

export async function saveHoursAction(formData: FormData) {
  const owner = await requireOwner();
  const schedule = scheduleInput(formData);
  if (!schedule) return;

  await prisma.$transaction(async (tx) => {
    const primaryLocation = await tx.clinicLocation.findFirst({
      where: { clinicId: owner.clinicId, active: true, isPrimary: true },
      select: { id: true },
    });
    if (!primaryLocation) {
      throw new Error("No active primary branch is configured for booking.");
    }

    await tx.clinicHours.upsert({
      where: {
        clinicId_dayOfWeek: {
          clinicId: owner.clinicId,
          dayOfWeek: schedule.dayOfWeek,
        },
      },
      create: { clinicId: owner.clinicId, ...schedule },
      update: schedule,
    });
    await tx.clinicLocationHours.upsert({
      where: {
        locationId_dayOfWeek_sortOrder: {
          locationId: primaryLocation.id,
          dayOfWeek: schedule.dayOfWeek,
          sortOrder: 0,
        },
      },
      create: { locationId: primaryLocation.id, sortOrder: 0, ...schedule },
      update: schedule,
    });
    await tx.auditLog.create({
      data: {
        clinicId: owner.clinicId,
        userId: owner.id,
        action: "CLINIC_HOURS_UPDATED",
        entityType: "ClinicLocationHours",
        entityId: `${primaryLocation.id}:${schedule.dayOfWeek}:0`,
        detail: `${schedule.isClosed ? "Closed" : `${schedule.openTime}-${schedule.closeTime}`} · ${schedule.slotMinutes} minute slots`,
      },
    });
  });

  revalidatePath(operationsPath);
  revalidatePath(`/platform/clinics/${owner.clinicId}`);
}

export async function saveWhatsAppCopyAction(formData: FormData) {
  const owner = await requireOwner();
  await prisma.clinicWhatsAppSettings.upsert({ where: { clinicId: owner.clinicId }, create: {
    clinicId: owner.clinicId,
    welcomeEnglish: String(formData.get("welcomeEnglish") || "").trim() || null,
    welcomeHindi: String(formData.get("welcomeHindi") || "").trim() || null,
    welcomeMarathi: String(formData.get("welcomeMarathi") || "").trim() || null,
    bookingIntro: String(formData.get("bookingIntro") || "").trim() || null,
    contactMessage: String(formData.get("contactMessage") || "").trim() || null,
  }, update: {
    welcomeEnglish: String(formData.get("welcomeEnglish") || "").trim() || null,
    welcomeHindi: String(formData.get("welcomeHindi") || "").trim() || null,
    welcomeMarathi: String(formData.get("welcomeMarathi") || "").trim() || null,
    bookingIntro: String(formData.get("bookingIntro") || "").trim() || null,
    contactMessage: String(formData.get("contactMessage") || "").trim() || null,
  }});
  revalidatePath(operationsPath);
}

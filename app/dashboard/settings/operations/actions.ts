"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";

const operationsPath = "/dashboard/settings/operations";

/**
 * These forms post straight to a server action, so a rejected submit used to
 * `return` and leave the page exactly as it was — the same screen, the same
 * values, no message. The person had no way to tell a save from a refusal.
 * The page reads this code back and says what went wrong, which is the same
 * convention the staff form on /dashboard/settings already uses.
 */
const refuse = (code: string): never => redirect(`${operationsPath}?error=${code}`);

/**
 * A day is one or two sessions: Indian dental clinics commonly run a morning
 * and an evening shift with the chair dark in between. The second session is
 * optional — leave its times blank and the day is a single range again.
 */
function scheduleInput(formData: FormData) {
  const dayValue = String(formData.get("dayOfWeek") ?? "").trim();
  const openTime = String(formData.get("openTime") ?? "").trim();
  const closeTime = String(formData.get("closeTime") ?? "").trim();
  const openTime2 = String(formData.get("openTime2") ?? "").trim();
  const closeTime2 = String(formData.get("closeTime2") ?? "").trim();
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

  // The evening session needs both ends, must sit after the morning closes,
  // and must be long enough to hold at least one slot.
  const hasSecond = Boolean(openTime2 || closeTime2);
  if (hasSecond && !isClosed) {
    if (
      !validTime.test(openTime2)
      || !validTime.test(closeTime2)
      || openTime2 >= closeTime2
      || openTime2 < closeTime
    ) return null;
  }

  return {
    dayOfWeek,
    openTime,
    closeTime,
    slotMinutes,
    isClosed,
    second: hasSecond && !isClosed ? { openTime: openTime2, closeTime: closeTime2 } : null,
  };
}

export async function addServiceAction(formData: FormData) {
  const owner = await requireOwner();
  const name = String(formData.get("name") || "").trim();
  if (!name) return refuse("service-name");
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
  if (!Number.isInteger(id) || !name) return refuse("service-name");

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
  if (!schedule) return refuse("hours");

  // Checked here as well as inside the transaction: the guard below is an
  // invariant and throws, which reaches the person as a blank error screen.
  const branch = await prisma.clinicLocation.findFirst({
    where: { clinicId: owner.clinicId, active: true, isPrimary: true },
    select: { id: true },
  });
  if (!branch) return refuse("branch");

  await prisma.$transaction(async (tx) => {
    const primaryLocation = await tx.clinicLocation.findFirst({
      where: { clinicId: owner.clinicId, active: true, isPrimary: true },
      select: { id: true },
    });
    if (!primaryLocation) {
      throw new Error("No active primary branch is configured for booking.");
    }

    // Clinic-level mirror: one range per day is all this older model can hold,
    // so a split day is recorded as its full span. Booking reads the branch
    // rows below, never this.
    const mirror = {
      dayOfWeek: schedule.dayOfWeek,
      openTime: schedule.openTime,
      closeTime: schedule.second ? schedule.second.closeTime : schedule.closeTime,
      slotMinutes: schedule.slotMinutes,
      isClosed: schedule.isClosed,
    };
    await tx.clinicHours.upsert({
      where: {
        clinicId_dayOfWeek: {
          clinicId: owner.clinicId,
          dayOfWeek: schedule.dayOfWeek,
        },
      },
      create: { clinicId: owner.clinicId, ...mirror },
      update: mirror,
    });
    const { second, ...base } = schedule;
    await tx.clinicLocationHours.upsert({
      where: {
        locationId_dayOfWeek_sortOrder: {
          locationId: primaryLocation.id,
          dayOfWeek: schedule.dayOfWeek,
          sortOrder: 0,
        },
      },
      create: { locationId: primaryLocation.id, sortOrder: 0, ...base },
      update: base,
    });
    if (second) {
      await tx.clinicLocationHours.upsert({
        where: {
          locationId_dayOfWeek_sortOrder: {
            locationId: primaryLocation.id,
            dayOfWeek: schedule.dayOfWeek,
            sortOrder: 1,
          },
        },
        create: {
          locationId: primaryLocation.id,
          sortOrder: 1,
          dayOfWeek: schedule.dayOfWeek,
          slotMinutes: schedule.slotMinutes,
          isClosed: false,
          ...second,
        },
        update: { ...second, slotMinutes: schedule.slotMinutes, isClosed: false },
      });
    }
    // What was saved is the whole truth for the day: with no evening session
    // in the form, any old evening window is removed rather than quietly
    // merging with the new hours and offering times nobody set.
    await tx.clinicLocationHours.deleteMany({
      where: {
        locationId: primaryLocation.id,
        dayOfWeek: schedule.dayOfWeek,
        sortOrder: { gt: second ? 1 : 0 },
      },
    });
    await tx.auditLog.create({
      data: {
        clinicId: owner.clinicId,
        userId: owner.id,
        action: "CLINIC_HOURS_UPDATED",
        entityType: "ClinicLocationHours",
        entityId: `${primaryLocation.id}:${schedule.dayOfWeek}:0`,
        detail: `${
          schedule.isClosed
            ? "Closed"
            : `${schedule.openTime}-${schedule.closeTime}${schedule.second ? ` and ${schedule.second.openTime}-${schedule.second.closeTime}` : ""}`
        } · ${schedule.slotMinutes} minute slots`,
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

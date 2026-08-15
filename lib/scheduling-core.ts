const ISO_DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_KEY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export class InvalidScheduleInputError extends Error {}

export type ParsedClinicDate = {
  key: string;
  year: number;
  month: number;
  day: number;
  dayOfWeek: number;
};

export type ScheduleWindow = {
  openTime: string;
  closeTime: string;
  slotMinutes: number;
};

export type ScheduleResources = {
  locationId?: number | null;
  providerId?: number | null;
  chairId?: number | null;
};

/** Parse a calendar key without allowing Date to normalize impossible dates. */
export function parseClinicDate(value: string): ParsedClinicDate {
  const match = ISO_DATE_KEY.exec(value);
  if (!match) {
    throw new InvalidScheduleInputError("Appointment date must use YYYY-MM-DD.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new InvalidScheduleInputError("Appointment date is not a real calendar date.");
  }

  return { key: value, year, month, day, dayOfWeek: date.getUTCDay() };
}

export function parseAppointmentTime(value: string) {
  if (!TIME_KEY.test(value)) {
    throw new InvalidScheduleInputError("Appointment time must use 24-hour HH:mm format.");
  }
  const [hour, minute] = value.split(":").map(Number);
  return { key: value, hour, minute, totalMinutes: hour * 60 + minute };
}

/** Canonical new writes use UTC noon, avoiding host-timezone date drift. */
export function appointmentDateFromKey(value: string) {
  const parsed = parseClinicDate(value);
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12));
}

/**
 * Whole-day reads include both legacy UTC-midnight rows and canonical UTC-noon
 * rows for the same calendar key.
 */
export function appointmentDayRange(value: string) {
  const parsed = parseClinicDate(value);
  const start = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  const end = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1));
  return { gte: start, lt: end };
}

export function appointmentDateKey(value: Date) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidScheduleInputError("Appointment date is invalid.");
  }
  const key = value.toISOString().slice(0, 10);
  parseClinicDate(key);
  return key;
}

function partsInTimeZone(now: Date, timeZone: string) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new InvalidScheduleInputError("Current time is invalid.");
  }

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
  } catch {
    throw new InvalidScheduleInputError(`Clinic timezone is invalid: ${timeZone}`);
  }

  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value ?? ""
  );
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  const time = `${part("hour")}:${part("minute")}`;
  parseClinicDate(date);
  parseAppointmentTime(time);
  return { date, time };
}

export function clinicNow(timeZone: string, now = new Date()) {
  return partsInTimeZone(now, timeZone);
}

export function clinicDateAtOffset(timeZone: string, offsetDays = 0, now = new Date()) {
  if (!Number.isInteger(offsetDays)) {
    throw new InvalidScheduleInputError("Date offset must be a whole number of days.");
  }
  const current = parseClinicDate(clinicNow(timeZone, now).date);
  const shifted = new Date(Date.UTC(current.year, current.month - 1, current.day + offsetDays));
  return shifted.toISOString().slice(0, 10);
}

export function isPastClinicSlot(
  date: string,
  time: string,
  timeZone: string,
  now = new Date(),
) {
  parseClinicDate(date);
  parseAppointmentTime(time);
  const current = clinicNow(timeZone, now);
  return date < current.date || (date === current.date && time <= current.time);
}

export function assertBookableClinicSlot(
  date: string,
  time: string,
  timeZone: string,
  now = new Date(),
) {
  if (isPastClinicSlot(date, time, timeZone, now)) {
    throw new InvalidScheduleInputError(
      "Appointments must be scheduled in the future for the clinic's timezone.",
    );
  }
}

function timeAt(totalMinutes: number) {
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
}

/** Validate and expand non-overlapping split shifts into deterministic slots. */
export function scheduleWindowSlots(windows: ScheduleWindow[]) {
  if (!windows.length) return [];

  const parsed = windows.map((window) => {
    const open = parseAppointmentTime(window.openTime).totalMinutes;
    const close = parseAppointmentTime(window.closeTime).totalMinutes;
    if (
      !Number.isInteger(window.slotMinutes)
      || window.slotMinutes < 15
      || window.slotMinutes > 240
      || open >= close
      || open + window.slotMinutes > close
    ) {
      throw new InvalidScheduleInputError("Clinic hours contain an invalid booking window.");
    }
    return { ...window, open, close };
  }).sort((left, right) => left.open - right.open || left.close - right.close);

  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index].open < parsed[index - 1].close) {
      throw new InvalidScheduleInputError("Clinic booking windows overlap.");
    }
  }

  return Array.from(new Set(parsed.flatMap((window) => {
    const slots: string[] = [];
    for (
      let current = window.open;
      current + window.slotMinutes <= window.close;
      current += window.slotMinutes
    ) {
      slots.push(timeAt(current));
    }
    return slots;
  }))).sort();
}

function validResourceId(value: number | null | undefined) {
  return Number.isInteger(value) && Number(value) > 0;
}

/**
 * An unassigned appointment reserves its branch slot. Assigned appointments
 * may run in parallel only when neither their provider nor chair overlaps.
 */
export function schedulingResourcesConflict(
  requested: ScheduleResources,
  existing: ScheduleResources,
) {
  const sameLocation = validResourceId(requested.locationId)
    && requested.locationId === existing.locationId;
  const requestedAssigned = validResourceId(requested.providerId)
    || validResourceId(requested.chairId);
  const existingAssigned = validResourceId(existing.providerId)
    || validResourceId(existing.chairId);

  if (sameLocation && (!requestedAssigned || !existingAssigned)) return true;
  if (
    validResourceId(requested.providerId)
    && requested.providerId === existing.providerId
  ) return true;
  return Boolean(
    validResourceId(requested.chairId)
    && requested.chairId === existing.chairId,
  );
}

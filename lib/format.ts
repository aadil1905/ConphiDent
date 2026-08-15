/**
 * Shared formatting. Money is whole rupees everywhere in the schema; time is
 * written the way a person would say it, with the exact stamp kept for `title`.
 */

export function rupees(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

export function clockTime(value: Date) {
  return value
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .toLowerCase();
}

export function exactStamp(value: Date) {
  return `${value.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, ${clockTime(value)}`;
}

/**
 * "in 20 minutes", "yesterday, 4:30 pm", "overdue by 3 days". Pair every use
 * with `title={exactStamp(value)}` so the precise time is one hover away.
 */
export function humanTime(value: Date, now: Date = new Date()) {
  const delta = value.getTime() - now.getTime();
  const ahead = delta >= 0;
  const size = Math.abs(delta);

  if (size < MINUTE) return "just now";
  if (size < HOUR) {
    const mins = Math.round(size / MINUTE);
    return ahead ? `in ${mins} minute${mins === 1 ? "" : "s"}` : `${mins} minute${mins === 1 ? "" : "s"} ago`;
  }
  if (sameDay(value, now)) return `today, ${clockTime(value)}`;

  const yesterday = new Date(now.getTime() - DAY);
  if (sameDay(value, yesterday)) return `yesterday, ${clockTime(value)}`;

  const tomorrow = new Date(now.getTime() + DAY);
  if (sameDay(value, tomorrow)) return `tomorrow, ${clockTime(value)}`;

  const days = Math.round(size / DAY);
  if (days <= 6) {
    return ahead
      ? `${value.toLocaleDateString("en-IN", { weekday: "long" })}, ${clockTime(value)}`
      : `${days} days ago`;
  }
  return value.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** For anything with a deadline: "overdue by 3 days" reads better than a date. */
export function overdueBy(due: Date, now: Date = new Date()) {
  const size = now.getTime() - due.getTime();
  if (size <= 0) return null;
  const days = Math.floor(size / DAY);
  if (days < 1) {
    const hours = Math.max(1, Math.floor(size / HOUR));
    return `overdue by ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `overdue by ${days} day${days === 1 ? "" : "s"}`;
}

/** Turns SCREAMING_SNAKE statuses into something a person reads. */
export function humanLabel(value: string) {
  const spaced = value.replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

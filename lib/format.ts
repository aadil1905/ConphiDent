/**
 * Shared formatting. Money is whole rupees everywhere in the schema; time is
 * written the way a person would say it, with the exact stamp kept for `title`.
 */

export function rupees(amount: number) {
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function underThousand(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) return [TENS[Math.floor(value / 10)], ONES[value % 10]].filter(Boolean).join(" ");
  return [`${ONES[Math.floor(value / 100)]} hundred`, underThousand(value % 100)].filter(Boolean).join(" ");
}

/**
 * "Four thousand two hundred only" — the words line a receipt carries beside
 * the figure, so an altered amount is contradicted by its own sheet.
 *
 * Grouped the Indian way (crore, lakh, thousand), because that is how the
 * amount would be read aloud at the desk.
 */
export function rupeesInWords(amount: number) {
  const whole = Math.max(0, Math.round(amount));
  if (whole === 0) return "Zero only";

  const parts: string[] = [];
  const crore = Math.floor(whole / 10_000_000);
  const lakh = Math.floor((whole % 10_000_000) / 100_000);
  const thousand = Math.floor((whole % 100_000) / 1_000);
  const rest = whole % 1_000;

  if (crore) parts.push(`${underThousand(crore)} crore`);
  if (lakh) parts.push(`${underThousand(lakh)} lakh`);
  if (thousand) parts.push(`${underThousand(thousand)} thousand`);
  if (rest) parts.push(underThousand(rest));

  const sentence = parts.join(" ");
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} only`;
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

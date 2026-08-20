const DEFAULT_INVOICE_PREFIX = "INV";

export function normalizeInvoicePrefix(value: string | null | undefined) {
  return value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12) || DEFAULT_INVOICE_PREFIX;
}

/** The highest number already used under this prefix, 0 when there are none. */
function highestUnderPrefix(prefix: string, invoiceNumbers: string[]) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);
  return invoiceNumbers.reduce((maximum, invoiceNumber) => {
    const match = pattern.exec(invoiceNumber);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0);
}

export function nextInvoiceNumber(
  prefixValue: string | null | undefined,
  invoiceNumbers: string[],
) {
  const prefix = normalizeInvoicePrefix(prefixValue);
  return `${prefix}-${String(highestUnderPrefix(prefix, invoiceNumbers) + 1).padStart(6, "0")}`;
}

/**
 * The last bill actually raised under this prefix. Read from the numbers rather
 * than sorted as text, because older runs were not always padded the same way.
 */
export function latestInvoiceNumber(
  prefixValue: string | null | undefined,
  invoiceNumbers: string[],
) {
  const prefix = normalizeInvoicePrefix(prefixValue);
  const highest = highestUnderPrefix(prefix, invoiceNumbers);
  return highest > 0 ? `${prefix}-${String(highest).padStart(6, "0")}` : null;
}

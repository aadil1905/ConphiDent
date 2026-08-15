const DEFAULT_INVOICE_PREFIX = "INV";

export function normalizeInvoicePrefix(value: string | null | undefined) {
  return value
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 12) || DEFAULT_INVOICE_PREFIX;
}

export function nextInvoiceNumber(
  prefixValue: string | null | undefined,
  invoiceNumbers: string[],
) {
  const prefix = normalizeInvoicePrefix(prefixValue);
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}-(\\d+)$`);
  const highest = invoiceNumbers.reduce((maximum, invoiceNumber) => {
    const match = pattern.exec(invoiceNumber);
    return Math.max(maximum, match ? Number(match[1]) : 0);
  }, 0);

  return `${prefix}-${String(highest + 1).padStart(6, "0")}`;
}

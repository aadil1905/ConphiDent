export function toCsv(headers: string[], rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const raw = String(value ?? "");
    // Spreadsheet applications may execute formulas in imported CSV files.
    // Prefix untrusted formula-like cells with an apostrophe while preserving
    // numeric values supplied as actual numbers.
    const safe = typeof value === "string" && /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
}

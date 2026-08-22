export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { BlankPrescriptionDocument, BlankReceiptDocument } from "@/components/documents/BlankPads";
import { BlankCasePaperDocument } from "@/components/documents/CasePaperDocument";
import { PrintActions } from "@/components/documents/PrintActions";
import { loadClinicDocumentBrand } from "@/lib/clinic-document";
import { requirePermission } from "@/lib/permissions";

const PADS = [
  { key: "consent", label: "Patient record & consent" },
  { key: "prescription", label: "Prescription" },
  { key: "receipt", label: "Receipt" },
] as const;
type Pad = (typeof PADS)[number]["key"];

/**
 * The blank pads, on the clinic's own letterhead.
 *
 * One sheet at a time, because `window.print()` prints the page — showing all
 * three at once would mean nobody can print just the one they ran out of.
 */
export default async function StationeryPage({ searchParams }: { searchParams: Promise<{ pad?: string }> }) {
  const user = await requirePermission("managePatients");
  const params = await searchParams;
  const pad: Pad = PADS.some((item) => item.key === params.pad) ? (params.pad as Pad) : "consent";

  const clinic = await loadClinicDocumentBrand(user.clinicId);
  if (!clinic) notFound();

  return (
    <main className="min-h-screen bg-background px-3 py-6 text-heading print:bg-white print:p-0">
      <div className="mx-auto mb-4 w-full max-w-[210mm] print:hidden">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold text-heading">Blank pads</h1>
          <p className="text-sm text-text-muted">Print a stack and keep them at the desk.</p>
        </div>
        <div role="tablist" aria-label="Which pad" className="flex flex-wrap gap-1">
          {PADS.map((item) => (
            <Link
              key={item.key}
              href={`/dashboard/stationery?pad=${item.key}`}
              role="tab"
              aria-selected={pad === item.key}
              className={`inline-flex min-h-11 items-center rounded-control border px-3.5 text-sm font-semibold ${pad === item.key ? "border-primary bg-primary text-primary-foreground" : "border-border-strong bg-card text-heading hover:bg-muted"}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      <PrintActions backHref="/dashboard/settings" backLabel="Back to settings" printLabel="Print this pad" />

      {pad === "consent" && <BlankCasePaperDocument clinic={clinic} />}
      {pad === "prescription" && <BlankPrescriptionDocument clinic={clinic} />}
      {pad === "receipt" && <BlankReceiptDocument clinic={clinic} />}
    </main>
  );
}

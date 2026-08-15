import Link from "next/link";
import { Download } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import PageHeader from "@/components/lists/PageHeader";

const SHEETS = [
  {
    name: "Patients",
    what: "Everyone on your list — names, numbers, addresses and the notes you keep about their health.",
    href: "/api/exports/patients",
  },
  {
    name: "Visits",
    what: "Every appointment with its treatment, who it was with, whether they turned up, and where they came from.",
    href: "/api/exports/appointments",
  },
  {
    name: "Money",
    what: "Invoices, what has been paid, what is still owed, and the state of each one.",
    href: "/api/exports/billing",
  },
];

export default async function ExportsPage() {
  await requirePermission("exportData");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <PageHeader
        title="Take your data out"
        sub="Spreadsheets you can open in Excel or Google Sheets. This is your clinic's data — you can have it whenever you want."
        actions={
          <Link
            href="/dashboard/settings?tab=records"
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
          >
            Back to Settings
          </Link>
        }
      />

      <div className="flex flex-col gap-3">
        {SHEETS.map((sheet) => (
          <section
            key={sheet.name}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]"
          >
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-heading">{sheet.name}</h2>
              <p className="mt-1 text-[13px] text-text-muted">{sheet.what}</p>
            </div>
            <a
              href={sheet.href}
              className="inline-flex min-h-11 flex-none items-center gap-2 rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download
            </a>
          </section>
        ))}
      </div>

      <p className="rounded-control border border-border bg-muted px-3.5 py-3 text-[13px] text-text-muted">
        These files hold real patient details. Keep them somewhere only your clinic can reach, and delete
        them when you are done.
      </p>
    </div>
  );
}

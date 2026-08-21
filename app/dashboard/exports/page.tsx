import Link from "next/link";
import { CalendarDays, Download, IndianRupee, Users, type LucideIcon } from "lucide-react";
import { requirePermission } from "@/lib/permissions";
import WorkPage from "@/components/lists/WorkPage";

const SHEETS: Array<{
  name: string;
  what: string;
  columns: string;
  href: string;
  icon: LucideIcon;
}> = [
  {
    name: "Patients",
    what: "Everyone on your list, with the notes you keep about their health.",
    columns: "Name · Phone · Address · First visit · Health notes",
    href: "/api/exports/patients",
    icon: Users,
  },
  {
    name: "Visits",
    what: "Every appointment, whether they turned up, and where they came from.",
    columns: "Date · Time · Patient · Treatment · Status · Source",
    href: "/api/exports/appointments",
    icon: CalendarDays,
  },
  {
    name: "Money",
    what: "Invoices, what has been paid, and what is still owed.",
    columns: "Number · Date · Patient · Total · Paid · Outstanding",
    href: "/api/exports/billing",
    icon: IndianRupee,
  },
];

export default async function ExportsPage() {
  await requirePermission("exportData");

  return (
    <WorkPage
      title="Take your data out"
      sub="Spreadsheets you can open in Excel or Google Sheets. This is your clinic's data — you can have it whenever you want."
      actions={
        <Link
          href="/dashboard/settings?tab=records"
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
        >
          Back to Settings
        </Link>
      }
    >
      {SHEETS.map((sheet) => {
        const Icon = sheet.icon;
        return (
          <section
            key={sheet.name}
            className="flex flex-wrap items-center gap-x-5 gap-y-3.5 rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]"
          >
            <span className="grid h-11 w-11 flex-none place-items-center rounded-control bg-secondary text-heading">
              <Icon className="h-[19px] w-[19px]" strokeWidth={1.8} aria-hidden />
            </span>

            <div className="min-w-[16rem] flex-1">
              <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">{sheet.name}</h2>
              <p className="mt-0.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">{sheet.what}</p>
              {/* What is actually in the file, so nobody downloads three to find out. */}
              <p className="mt-1.5 text-xs text-text-muted">{sheet.columns}</p>
            </div>

            <a
              href={sheet.href}
              className="inline-flex min-h-11 flex-none items-center gap-2 rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <Download className="h-4 w-4" aria-hidden />
              Download
            </a>
          </section>
        );
      })}

      <p className="rounded-card border border-warning-border bg-warning-bg px-4 py-3 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-warning">
        These files hold real patient details. Keep them somewhere only your clinic can reach, and
        delete them when you are done.
      </p>
    </WorkPage>
  );
}

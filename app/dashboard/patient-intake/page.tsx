import Link from "next/link";
import { FileSignature, Send, ShieldAlert } from "lucide-react";
import WorkPage from "@/components/lists/WorkPage";
import PatientIntakeWizard from "@/components/patients/PatientIntakeWizard";
import { INTAKE_LINK_DAYS } from "@/lib/patient-intake-link";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: Send,
    title: "You send them a link",
    detail: `Their name and number is enough. It opens on their phone and works for ${INTAKE_LINK_DAYS} days.`,
  },
  {
    icon: FileSignature,
    title: "They fill it in before they arrive",
    detail:
      "Three short pages — who they are, why they are coming, and their health. They sign with a finger.",
  },
  {
    icon: ShieldAlert,
    title: "It lands in their file",
    detail:
      "Allergies and conditions show in red at the top of their record, so nobody treats without seeing them.",
  },
];

export default async function StaffIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; phone?: string }>;
}) {
  const { name = "", phone = "" } = await searchParams;

  return (
    <WorkPage
      title="Send the intake form"
      sub="So nobody is filling in a clipboard in your waiting room."
      actions={
        <Link
          href="/dashboard/patients"
          className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
        >
          Back to Patients
        </Link>
      }
      context={
        <section className="rounded-card border border-border bg-card px-5.5 py-4 shadow-[var(--shadow)]">
          <h2 className="text-[13px] font-semibold text-heading">How it goes</h2>
          {/* Three steps read as one line across the width, rather than a tall
              column of instructions above the thing you came here to do. */}
          <ol className="mt-3 grid gap-x-8 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr))]">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-3">
                  <span className="relative grid h-9 w-9 flex-none place-items-center rounded-control bg-secondary text-heading">
                    <Icon className="h-[17px] w-[17px]" strokeWidth={1.8} aria-hidden />
                    <span className="absolute -top-1.5 -right-1.5 grid h-5 w-5 place-items-center rounded-pill bg-primary text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-heading">{step.title}</span>
                    <span className="mt-0.5 block text-[13px] text-text-muted">{step.detail}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      }
    >
      <PatientIntakeWizard defaultName={name} defaultPhone={phone} linkDays={INTAKE_LINK_DAYS} />
    </WorkPage>
  );
}

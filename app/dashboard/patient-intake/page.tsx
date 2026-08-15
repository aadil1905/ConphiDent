import Link from "next/link";
import PageHeader from "@/components/lists/PageHeader";
import PatientIntakeWizard from "@/components/patients/PatientIntakeWizard";
import { INTAKE_LINK_DAYS } from "@/lib/patient-intake-link";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "You send them a link",
    detail: `Their name and number is enough. The link opens on their phone and works for ${INTAKE_LINK_DAYS} days.`,
  },
  {
    title: "They fill it in before they arrive",
    detail:
      "Three short pages — who they are, why they are coming, and anything about their health. They sign on the phone with a finger or by typing their name.",
  },
  {
    title: "It lands in their file",
    detail:
      "Allergies and conditions show in red at the top of Patient 360, so nobody starts treating without seeing them.",
  },
];

export default async function StaffIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; phone?: string }>;
}) {
  const { name = "", phone = "" } = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <PageHeader
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
      />

      <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
        <h2 className="text-base font-semibold text-heading">How it goes</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span className="grid h-7 w-7 flex-none place-items-center rounded-pill bg-secondary text-[13px] font-bold text-heading">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-heading">{step.title}</span>
                <span className="block text-[13px] text-text-muted">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <PatientIntakeWizard defaultName={name} defaultPhone={phone} />
    </div>
  );
}

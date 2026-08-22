import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission, can } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { clockTime, exactStamp, humanTime, overdueBy, rupees } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/visit-status";
import ToothMap from "@/components/patients/ToothMap";
import ScrollToSection from "@/components/patients/ScrollToSection";
import BackLink from "@/components/navigation/BackLink";
import SafetyBanner from "@/components/clinical/SafetyBanner";
import { patientSafety } from "@/lib/patient-safety";

export const dynamic = "force-dynamic";

const TABS = ["Visits", "Clinical", "Plans", "Money", "Files"] as const;
type Tab = (typeof TABS)[number];

function visitMoment(date: Date, time: string) {
  const match = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec((time || "").trim());
  const when = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!match) return when;
  let hour = Number(match[1]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  when.setHours(hour, Number(match[2]), 0, 0);
  return when;
}

function Card({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-card border border-border bg-card shadow-[var(--shadow)]">
      {children}
    </section>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "bad" | "flat"; children: React.ReactNode }) {
  const look = {
    good: "bg-success-bg text-success",
    warn: "bg-warning-bg text-warning",
    bad: "bg-danger-bg text-danger",
    flat: "bg-muted text-heading",
  }[tone];
  return (
    <span className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${look}`}>
      {children}
    </span>
  );
}

export default async function Patient360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requirePermission("managePatients");
  const { id } = await params;
  const patientId = Number(id);
  if (!Number.isInteger(patientId)) notFound();

  const requested = (await searchParams).tab;
  const tab: Tab | null = TABS.includes(requested as Tab) ? (requested as Tab) : null;
  const now = new Date();

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: user.clinicId, archivedAt: null },
    select: {
      id: true,
      fullName: true,
      phone: true,
      email: true,
      address: true,
      gender: true,
      dateOfBirth: true,
      medicalNotes: true,
      createdAt: true,
    },
  });
  if (!patient) notFound();

  const canSeeClinical = can(user.role, "viewClinical");
  const canSeeMoney = can(user.role, "manageBilling");

  const [visits, invoices, plans, chart, studies, intakes, whatsappOn, prescriptions] = await Promise.all([
    prisma.appointment.findMany({
      where: { clinicId: user.clinicId, patientId, archivedAt: null },
      orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      take: 40,
      select: {
        id: true,
        appointmentDate: true,
        appointmentTime: true,
        treatment: true,
        status: true,
        provider: { select: { name: true } },
      },
    }),
    canSeeMoney
      ? prisma.invoice.findMany({
          where: { clinicId: user.clinicId, patientId, voidedAt: null },
          orderBy: { issueDate: "desc" },
          select: {
            id: true,
            invoiceNumber: true,
            totalAmount: true,
            issueDate: true,
            lineItems: { select: { description: true }, take: 3 },
            payments: {
              where: { status: "POSTED", reversedAt: null },
              select: { amount: true, paidAt: true, method: true },
            },
          },
        })
      : [],
    prisma.treatmentPlan.findMany({
      where: { clinicId: user.clinicId, patientId, cancelledAt: null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        estimatedCost: true,
        notes: true,
        updatedAt: true,
        invoices: { where: { voidedAt: null }, select: { totalAmount: true } },
      },
    }),
    canSeeClinical
      ? prisma.dentalChartEntry.findMany({
          where: { clinicId: user.clinicId, patientId, status: "CURRENT" },
          orderBy: { visitDate: "desc" },
          select: { toothNumber: true, condition: true },
        })
      : [],
    can(user.role, "viewImaging")
      ? prisma.imagingStudy.findMany({
          where: { clinicId: user.clinicId, patientId, archivedAt: null, enteredInErrorAt: null },
          orderBy: { acquisitionDate: "desc" },
          take: 20,
          select: {
            id: true,
            modality: true,
            description: true,
            acquisitionDate: true,
            toothCodes: true,
            accessionNumber: true,
          },
        })
      : [],
    prisma.patientIntakeRequest.findMany({
      where: { clinicId: user.clinicId, patientId },
      orderBy: { createdAt: "desc" },
      take: 5,
      // `drugAllergies` is here for the safety banner. It used to come off a
      // clinical note; notes were removed and an allergy is a standing fact
      // about the person, not a note, so the intake carries it now.
      select: { id: true, status: true, completedAt: true, expiresAt: true, createdAt: true, drugAllergies: true },
    }),
    hasFeature(user.clinicId, "whatsapp"),
    canSeeClinical
      ? prisma.prescription.findMany({
          where: { clinicId: user.clinicId, patientId, cancelledAt: null },
          orderBy: { prescribedOn: "desc" },
          take: 5,
          select: {
            id: true,
            prescribedOn: true,
            diagnosis: true,
            instructions: true,
            status: true,
            medicationItems: {
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                genericName: true,
                strength: true,
                dose: true,
                doseUnit: true,
                frequency: true,
                duration: true,
                mealRelation: true,
                instructions: true,
              },
            },
          },
        })
      : [],
  ]);

  // --- Derived ------------------------------------------------------------
  const balance = invoices.reduce((sum, invoice) => {
    const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
    return sum + Math.max(0, invoice.totalAmount - paid);
  }, 0);
  const oldestUnpaid = invoices
    .filter((invoice) => invoice.totalAmount > invoice.payments.reduce((t, p) => t + p.amount, 0))
    .sort((a, b) => a.issueDate.getTime() - b.issueDate.getTime())[0];


  const conditions: Record<string, string> = {};
  for (const entry of chart) {
    if (!conditions[entry.toothNumber]) conditions[entry.toothNumber] = entry.condition;
  }

  const age = patient.dateOfBirth ? now.getFullYear() - patient.dateOfBirth.getFullYear() : null;
  const initials =
    patient.fullName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const safety = patientSafety({ medicalNotes: patient.medicalNotes, intakeAnswers: intakes });


  const tabCounts: Record<Tab, string> = {
    Visits: String(visits.length),
    Clinical: String(Object.keys(conditions).length),
    Plans: String(plans.length),
    Money: balance > 0 ? rupees(balance) : String(invoices.length),
    Files: String(studies.length),
  };

  return (
    <div className="flex flex-col gap-6">
      {tab && <ScrollToSection target={tab} />}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-11 w-11 flex-none place-items-center rounded-pill bg-secondary text-[length:var(--text-body)] font-bold text-heading">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            {/* min-h-11 with the negative margin keeps the 44px target without
                growing the header — the primary escape from the record was a
                16px-tall link. */}
            <BackLink
              fallback="/dashboard/patients"
              className="-my-3 inline-flex min-h-11 items-center text-xs font-semibold text-primary hover:underline"
            >
              ← Patients
            </BackLink>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h1 className="text-[length:var(--text-page)] leading-[var(--text-page-lh)] font-semibold text-heading">{patient.fullName}</h1>
              <span className="text-[length:var(--text-secondary)] text-text-muted">
                {[age !== null && `${age} y`, patient.gender, patient.phone].filter(Boolean).join(" · ")}
              </span>
            </div>
          </div>
          {/* One action up here. Booking lives on Schedule, messaging in the
              inbox, charting behind "Open charting" below — the header names
              the person and opens their case paper, nothing else. */}
          {canSeeClinical && (
            <Link
              href={`/dashboard/clinical-workspace/${patient.id}?fromPatient=1`}
              className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              View case paper
            </Link>
          )}
        </div>

        {/* The whole record reads top to bottom now — these are jump links,
            not tabs that hide five sections behind clicks. */}
        <nav aria-label="Jump to a section" className="flex gap-1 overflow-x-auto border-b border-border">
          {TABS.map((option) => (
            <a
              key={option}
              href={`#${option}`}
              className="inline-flex min-h-11 flex-none items-center px-3.5 text-[length:var(--text-secondary)] font-semibold text-text-muted hover:text-heading"
            >
              {option}
              {tabCounts[option] && (
                <span className="ml-1.5 font-normal text-text-muted">{tabCounts[option]}</span>
              )}
            </a>
          ))}
        </nav>
      </header>

      {/* Read-before-treating stays at the very top — but only when there is
          something to read. The quiet "nothing on file" state that used to
          hold this slot lives on in the prescribing and charting screens,
          where the no-allergies/never-asked distinction is a dosing decision;
          here it was one more grey box between the person and their record. */}
      {safety.hasAlerts && (
        <SafetyBanner safety={safety} recordHref={`/dashboard/patients/${patient.id}/edit`} />
      )}

      <div className="flex flex-col gap-2 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-semibold text-heading">Details</p>
          {canSeeMoney && balance > 0 && (
            <span className="text-[length:var(--text-secondary)] font-semibold tabular-nums text-danger">
              {rupees(balance)} due
              {oldestUnpaid && ` · oldest ${overdueBy(oldestUnpaid.issueDate, now) ?? "raised today"}`}
            </span>
          )}
        </div>
        <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
          <a
            href={`tel:${patient.phone.replace(/[^+\d]/g, "")}`}
            title={`Call ${patient.fullName}`}
            className="tabular-nums underline-offset-2 hover:text-primary hover:underline"
          >
            {patient.phone}
          </a>
          <br />
          {patient.email || "No email on file"}
          <br />
          {patient.address || "No address on file"}
          <br />
          Patient since{" "}
          {patient.createdAt.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/dashboard/patients/${patient.id}/edit`}
            className="inline-flex min-h-11 w-fit items-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            Edit details
          </Link>
          {/* Entitlement-gated, not role-gated: a clinic that never bought
              WhatsApp gets no send affordance anywhere on the record. The
              same gate the Patients list row action uses. */}
          {whatsappOn && (
            <Link
              href={`/dashboard/conversations?phone=${encodeURIComponent(patient.phone)}`}
              className="inline-flex min-h-11 w-fit items-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
            >
              Message on WhatsApp
            </Link>
          )}
        </div>
      </div>

      <div className="grid items-start gap-5">
        <div className="flex min-w-0 flex-col gap-5">
          {(
            <Card id="Visits">
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-3">
                <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Visits</h2>
                <span className="text-xs text-text-muted">Showing {visits.length}</span>
              </div>
              {visits.length === 0 ? (
                <p className="border-t border-border px-5.5 py-8 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  No visits yet. Book the first one and it will show up here.
                </p>
              ) : (
                visits.map((visit) => {
                  const moment = visitMoment(visit.appointmentDate, visit.appointmentTime);
                  return (
                    <div
                      key={visit.id}
                      className="grid grid-cols-1 items-center gap-3 border-t border-border px-5.5 py-2.5 sm:grid-cols-[170px_minmax(0,1fr)_140px_150px]"
                    >
                      <span title={exactStamp(moment)} className="text-[length:var(--text-secondary)] tabular-nums">
                        {moment.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })},{" "}
                        {visit.appointmentTime || clockTime(moment)}
                      </span>
                      <span className="text-[length:var(--text-secondary)] text-text-muted">
                        {visit.treatment}
                        {visit.provider?.name ? ` · ${visit.provider.name}` : ""}
                      </span>
                      <Pill
                        tone={
                          visit.status === "Completed"
                            ? "good"
                            : visit.status === "Cancelled" || visit.status === "No-show"
                              ? "bad"
                              : "flat"
                        }
                      >
                        {STATUS_LABELS[visit.status] ?? visit.status}
                      </Pill>
                      <Link
                        href={`/dashboard/appointments/${visit.id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
                      >
                        Open
                      </Link>
                    </div>
                  );
                })
              )}
            </Card>
          )}

          {canSeeClinical && (
            <div id="Clinical" className="flex scroll-mt-24 flex-col gap-5">
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-1">
                  <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Mouth as it stands</h2>
                  <Link
                    href={`/dashboard/clinical-workspace/${patient.id}?fromPatient=1`}
                    className="text-[length:var(--text-secondary)] font-semibold text-primary hover:underline"
                  >
                    Open charting →
                  </Link>
                </div>
                <p className="px-5.5 pb-3.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  Hover a tooth to see what was recorded. Charting happens in the clinical workspace.
                </p>
                <div className="px-5.5 pb-4.5">
                  <ToothMap conditions={conditions} />
                </div>
              </Card>

              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-3">
                  <div className="min-w-0">
                    <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Prescribing</h2>
                    <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                      {prescriptions.length === 0
                        ? "Nothing prescribed yet."
                        : `Latest ${prescriptions.length} — the full history is under Prescriptions.`}
                    </p>
                  </div>
                  {can(user.role, "issuePrescription") && (
                    <Link
                      href={`/dashboard/prescriptions/new?patientId=${patient.id}`}
                      className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
                    >
                      Prescribe
                    </Link>
                  )}
                </div>
                {/* The medicines themselves, right where they were written. A
                    script that vanishes into another screen the moment it is
                    saved reads as "not saved" — this is the receipt. */}
                {prescriptions.length > 0 && (
                  <div className="max-h-[340px] overflow-y-auto">
                    {prescriptions.map((script) => (
                      <div key={script.id} className="border-t border-border px-5.5 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <Link
                            // No /dashboard/prescriptions/[id] page exists —
                            // only .../edit and .../print. Every other link to
                            // a past script (lib/workspace-search.ts) already
                            // goes to print; this one just never matched.
                            href={`/dashboard/prescriptions/${script.id}/print`}
                            className="text-[length:var(--text-secondary)] font-semibold text-primary hover:underline"
                          >
                            {script.prescribedOn.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            {script.diagnosis ? ` · ${script.diagnosis}` : ""}
                          </Link>
                          <span className="text-xs font-semibold text-text-muted">
                            {script.status === "ISSUED" ? "Issued" : script.status.charAt(0) + script.status.slice(1).toLowerCase()}
                          </span>
                        </div>
                        <ul className="mt-1.5 flex flex-col gap-1">
                          {script.medicationItems.map((item) => (
                            <li key={item.id} className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
                              <span className="font-semibold text-heading">
                                {item.genericName}
                                {item.strength ? ` ${item.strength}` : ""}
                              </span>
                              {" — "}
                              {[
                                item.dose && item.doseUnit ? `${item.dose} ${item.doseUnit}` : "",
                                item.frequency.toLowerCase(),
                                (item.mealRelation || "").toLowerCase(),
                                item.duration ? `for ${item.duration}` : "",
                              ]
                                .filter(Boolean)
                                .join(", ")}
                              {item.instructions ? ` · ${item.instructions}` : ""}
                            </li>
                          ))}
                        </ul>
                        {script.instructions && (
                          <p className="mt-1 text-xs text-text-muted">{script.instructions}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          )}

          {(
            <Card id="Plans">
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-3">
                <div className="min-w-0">
                  <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Treatment plans</h2>
                  <p className="mt-1 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                    What you agreed, and how far along it is.
                  </p>
                </div>
                <Link
                  href={`/dashboard/treatment-plans/new?patientId=${patient.id}`}
                  className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  New plan
                </Link>
              </div>
              {plans.length === 0 ? (
                <p className="border-t border-border px-5.5 py-8 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  Nothing planned yet. Agree a plan and its progress shows up here.
                </p>
              ) : (
                plans.map((plan) => {
                  const done = plan.status === "Completed";
                  const turnedDown = plan.status === "Cancelled";
                  const priced = plan.estimatedCost ?? 0;
                  const invoiced = plan.invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
                  // Real progress: what has actually been billed against the plan.
                  const pct = priced > 0 ? Math.min(100, Math.round((invoiced / priced) * 100)) : 0;
                  return (
                    <div key={plan.id} className="flex flex-col gap-2 border-t border-border px-5.5 py-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-3">
                        <Link
                          href={`/dashboard/treatment-plans/${plan.id}`}
                          className="text-sm font-semibold text-primary hover:underline"
                        >
                          {plan.title}
                        </Link>
                        <span className="text-[length:var(--text-secondary)] font-semibold tabular-nums text-heading">
                          {priced > 0 ? rupees(priced) : "not priced"}
                        </span>
                      </div>
                      <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                        {plan.notes || `Last touched ${humanTime(plan.updatedAt, now)}`}
                      </p>
                      {priced > 0 && (
                        <>
                          <div className="h-2 overflow-hidden rounded-pill bg-muted">
                            <div
                              className={`h-full ${turnedDown ? "bg-text-muted" : done ? "bg-success" : "bg-primary"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="text-xs text-text-muted">
                            {rupees(invoiced)} of {rupees(priced)} invoiced
                          </p>
                        </>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <span className="text-xs font-semibold text-text-muted">
                          {done
                            ? "Finished"
                            : turnedDown
                              ? "Turned down"
                              : plan.status === "Proposed"
                                ? "Waiting on a yes"
                                : "In progress"}
                        </span>
                        <span className="ml-auto flex gap-2">
                          <Link
                            href={`/dashboard/treatment-plans/${plan.id}`}
                            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
                          >
                            Open plan
                          </Link>
                          <Link
                            href={`/dashboard/treatment-plans/${plan.id}/edit`}
                            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
                          >
                            Edit
                          </Link>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
          )}

          {canSeeMoney && (
            <Card id="Money">
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-3">
                <div className="min-w-0">
                  <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">Invoices and payments</h2>
                  <p className="mt-1 text-xs text-text-muted">
                    {balance > 0
                      ? `${rupees(balance)} outstanding across ${invoices.length} ${
                          invoices.length === 1 ? "invoice" : "invoices"
                        }`
                      : "Nothing outstanding"}
                  </p>
                </div>
                <Link
                  href={`/dashboard/billing/new?patientId=${patient.id}&fromPatient=1`}
                  className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Raise an invoice
                </Link>
              </div>
              {invoices.length === 0 ? (
                <p className="border-t border-border px-5.5 py-8 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  Nothing billed yet.
                </p>
              ) : (
                invoices.map((invoice) => {
                  const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
                  const due = invoice.totalAmount - paid;
                  const late = due > 0 ? overdueBy(invoice.issueDate, now) : null;
                  return (
                    <div
                      key={invoice.id}
                      className="grid grid-cols-1 items-center gap-3 border-t border-border px-5.5 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)_120px_130px_150px]"
                    >
                      <Link
                        href={`/dashboard/billing/${invoice.id}`}
                        className="text-[length:var(--text-secondary)] font-semibold tabular-nums text-primary hover:underline"
                      >
                        {invoice.invoiceNumber}
                      </Link>
                      <span className="truncate text-[length:var(--text-secondary)] text-text-muted">
                        {invoice.lineItems.map((line) => line.description).join(", ") || "Treatment"}
                      </span>
                      <span className="text-[length:var(--text-secondary)] tabular-nums">{rupees(invoice.totalAmount)}</span>
                      <Pill tone={due <= 0 ? "good" : late ? "bad" : "warn"}>
                        {due <= 0 ? "Paid" : late ? `Unpaid, ${late}` : `${rupees(due)} left`}
                      </Pill>
                      <Link
                        href={`/dashboard/billing/${invoice.id}`}
                        className={`inline-flex min-h-11 items-center justify-center rounded-control border px-3 text-[length:var(--text-secondary)] font-semibold ${
                          due > 0
                            ? "border-primary bg-primary text-primary-foreground hover:bg-primary-hover"
                            : "border-border-strong bg-card text-heading hover:bg-muted"
                        }`}
                      >
                        {due > 0 ? `Collect ${rupees(due)}` : "Send receipt"}
                      </Link>
                    </div>
                  );
                })
              )}
            </Card>
          )}

          {(
            <Card id="Files">
              <div className="flex flex-wrap items-baseline justify-between gap-3 px-5.5 pt-4 pb-3">
                <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">X-rays and documents</h2>
                <div className="flex flex-wrap gap-2">
                  {can(user.role, "uploadImaging") && (
                    <Link
                      href={`/dashboard/imaging/new?patient=${patient.id}`}
                      className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-3.5 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
                    >
                      Add an X-ray
                    </Link>
                  )}
                  {/* "Case paper" and "All X-rays" used to link to sub-routes
                      that are now redirects straight back to this page, and a
                      second ungated "Add an X-ray" sat beside the gated one.
                      Everything they opened is on this page already. */}
                </div>
              </div>
              {studies.length === 0 ? (
                <p className="border-t border-border px-5.5 py-8 text-center text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">
                  No X-rays on file. Anything you capture and match lands here.
                </p>
              ) : (
                studies.map((study) => (
                  <div
                    key={study.id}
                    className="grid grid-cols-1 items-center gap-3 border-t border-border px-5.5 py-2.5 sm:grid-cols-[120px_minmax(0,1fr)_140px_130px]"
                  >
                    <span className="text-[length:var(--text-secondary)] font-semibold tabular-nums text-heading">
                      {study.accessionNumber || study.modality}
                    </span>
                    <span className="text-[length:var(--text-secondary)] text-text-muted">
                      {[study.description, study.toothCodes.join(", ")].filter(Boolean).join(" · ") ||
                        study.modality}
                    </span>
                    <span
                      title={exactStamp(study.acquisitionDate)}
                      className="text-[length:var(--text-secondary)] tabular-nums text-text-muted"
                    >
                      {study.acquisitionDate.toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <Link
                      href={`/dashboard/imaging?study=${encodeURIComponent(study.id)}`}
                      className="inline-flex min-h-11 items-center justify-end text-[length:var(--text-secondary)] font-semibold text-primary"
                    >
                      Open
                    </Link>
                  </div>
                ))
              )}
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}

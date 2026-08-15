export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { Check, Stethoscope } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { clockTime, exactStamp, humanTime, rupees } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/visit-status";
import { parseListQuery, type RawSearchParams } from "@/lib/list-params";
import ListSearch from "@/components/lists/ListSearch";
import PageHeader from "@/components/lists/PageHeader";

const BASE = "/dashboard/clinical-workspace";
const DAY = 24 * 60 * 60 * 1000;
const SEARCH_LIMIT = 8;
const UPCOMING_LIMIT = 6;

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function yearsOld(dateOfBirth: Date | null, now: Date) {
  if (!dateOfBirth) return null;
  const years = Math.floor((now.getTime() - dateOfBirth.getTime()) / (365.25 * DAY));
  return years >= 0 && years < 130 ? years : null;
}

function Pill({ tone, children }: { tone: "danger" | "warning" | "success" | "muted"; children: React.ReactNode }) {
  const tones = {
    danger: "bg-danger-bg text-danger",
    warning: "bg-warning-bg text-warning",
    success: "bg-success-bg text-success",
    muted: "bg-muted text-text-muted",
  } as const;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-pill px-2.5 py-[5px] text-xs font-semibold whitespace-nowrap ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

function SectionCard({
  id,
  title,
  aside,
  children,
  strong,
}: {
  id: string;
  title: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className={`overflow-hidden rounded-card border bg-card shadow-[var(--shadow)] ${
        strong ? "border-border-strong" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-4.5 pt-4 pb-3">
        <h2 id={id} className="text-base font-semibold text-heading">
          {title}
        </h2>
        {aside && <span className="text-xs text-text-muted">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export default async function ClinicalPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("viewClinical");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultSort: "name", defaultDir: "asc" });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + DAY);
  const searching = query.q.trim().length >= 2;

  const searchWhere: Prisma.PatientWhereInput = {
    clinicId: user.clinicId,
    archivedAt: null,
    OR: [
      { fullName: { contains: query.q, mode: "insensitive" } },
      { phone: { contains: query.q.replace(/\D/g, "") || query.q } },
    ],
  };

  const [inChair, todaysVisits, openNotes, matches, matchCount] = await Promise.all([
    prisma.encounter.findMany({
      where: {
        clinicId: user.clinicId,
        archivedAt: null,
        status: "IN_PROGRESS",
        occurredAt: { gte: startOfDay, lt: endOfDay },
      },
      orderBy: { occurredAt: "asc" },
      select: {
        id: true,
        occurredAt: true,
        patientId: true,
        chair: { select: { name: true } },
        provider: { select: { name: true } },
        appointment: { select: { treatment: true, appointmentTime: true } },
        patient: {
          select: {
            id: true,
            fullName: true,
            dateOfBirth: true,
            gender: true,
            medicalNotes: true,
            invoices: {
              where: { voidedAt: null, status: { not: "Paid" } },
              select: {
                totalAmount: true,
                payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
              },
            },
            labCases: {
              where: {
                cancelledAt: null,
                status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] },
                dueDate: { lt: now },
              },
              orderBy: { dueDate: "asc" },
              take: 1,
              select: { caseType: true, labName: true, dueDate: true },
            },
          },
        },
      },
    }),
    prisma.appointment.findMany({
      where: {
        clinicId: user.clinicId,
        archivedAt: null,
        appointmentDate: { gte: startOfDay, lt: endOfDay },
        status: { not: "Cancelled" },
      },
      orderBy: [{ appointmentTime: "asc" }, { id: "asc" }],
      select: {
        id: true,
        appointmentTime: true,
        appointmentDate: true,
        patientName: true,
        patientId: true,
        treatment: true,
        status: true,
        encounter: { select: { id: true, status: true } },
      },
    }),
    prisma.clinicalRecord.findMany({
      where: { clinicId: user.clinicId, status: "DRAFT", enteredInErrorAt: null },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        visitDate: true,
        updatedAt: true,
        chiefComplaint: true,
        patientId: true,
        patient: { select: { fullName: true } },
      },
    }),
    searching
      ? prisma.patient.findMany({
          where: searchWhere,
          orderBy: { fullName: "asc" },
          take: SEARCH_LIMIT,
          select: {
            id: true,
            fullName: true,
            phone: true,
            dateOfBirth: true,
            clinicalRecords: {
              where: { enteredInErrorAt: null },
              orderBy: { visitDate: "desc" },
              take: 1,
              select: { visitDate: true, chiefComplaint: true },
            },
          },
        })
      : [],
    searching ? prisma.patient.count({ where: searchWhere }) : 0,
  ]);

  const inChairIds = new Set(inChair.map((encounter) => encounter.patientId));
  const upcoming = todaysVisits.filter(
    (visit) =>
      visit.status !== "Completed" &&
      !(visit.patientId !== null && inChairIds.has(visit.patientId)),
  );
  const seen = todaysVisits.filter((visit) => visit.status === "Completed");

  const seenNotes = seen.length
    ? await prisma.clinicalRecord.findMany({
        where: {
          clinicId: user.clinicId,
          enteredInErrorAt: null,
          visitDate: { gte: startOfDay, lt: endOfDay },
          patientId: { in: seen.map((visit) => visit.patientId).filter((id): id is number => id !== null) },
        },
        orderBy: { visitDate: "desc" },
        select: { id: true, patientId: true, status: true },
      })
    : [];
  const noteByPatient = new Map(seenNotes.map((note) => [note.patientId, note]));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clinical"
        sub="Chart, write the note, or prescribe. Nothing here waits on a visit being marked off."
      />

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        {/* ListSearch sizes itself with a 240px flex-basis, which is a width in
            the row every other screen puts it in. Dropped straight into this
            column it became a 240px-tall box with the field floating in it. */}
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch
              placeholder="Chart anyone — name or phone"
              label="Find any patient to chart"
            />
          </Suspense>
        </div>
        <nav
          aria-label="Clinical records"
          className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3"
        >
          <span className="text-xs text-text-muted">Everything on file:</span>
          {[
            { href: "/dashboard/treatment-plans", label: "Treatment plans" },
            { href: "/dashboard/clinical-records", label: "Notes archive" },
            { href: "/dashboard/prescriptions", label: "Prescriptions" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex min-h-10 items-center rounded-control border border-border-strong bg-card px-3 text-[13px] font-semibold text-heading hover:bg-muted"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </section>

      {searching && (
        <SectionCard
          id="matches"
          title={`${matchCount} ${matchCount === 1 ? "patient matches" : "patients match"} “${query.q}”`}
          aside="Charting does not need an appointment"
        >
          {matches.length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4.5 pt-6 pb-8 text-center">
              <p className="text-sm font-semibold text-heading">Nobody matches “{query.q}”</p>
              <p className="text-[13px] text-text-muted">
                Try a phone number, or add them from Patients first.
              </p>
              <Link
                href="/dashboard/patients?add=1"
                className="mt-2 inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
              >
                Add a patient
              </Link>
            </div>
          ) : (
            <>
              {matches.map((patient) => {
                const age = yearsOld(patient.dateOfBirth, now);
                const last = patient.clinicalRecords[0];
                return (
                  <div
                    key={patient.id}
                    className="grid items-center gap-3 border-t border-border px-4.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_170px]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-heading">{patient.fullName}</p>
                      <p className="text-[13px] text-text-muted">
                        {[
                          age !== null ? `${age} y` : null,
                          patient.phone,
                          last
                            ? `last note ${humanTime(last.visitDate, now)}`
                            : "nothing charted yet",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Link
                      href={`${BASE}/${patient.id}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-control border border-primary bg-primary px-3.5 text-[13px] font-semibold text-white hover:bg-primary-hover"
                    >
                      Start charting
                    </Link>
                  </div>
                );
              })}
              {matchCount > matches.length && (
                <p className="border-t border-border px-4.5 py-3 text-xs text-text-muted">
                  Showing the first {matches.length} of {matchCount}. Keep typing to narrow it down.
                </p>
              )}
            </>
          )}
        </SectionCard>
      )}

      {inChair.length === 0 ? (
        <section className="rounded-card border border-border bg-card px-4.5 py-4 shadow-[var(--shadow)]">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-pill bg-text-muted" aria-hidden />
            <h2 className="text-[13px] font-bold tracking-[0.08em] text-text-muted uppercase">
              Nobody in the chair
            </h2>
          </div>
          <p className="text-[13px] text-text-muted">
            You can still chart anyone — search above and start. Anything you record attaches to
            today&rsquo;s visit when you save.
          </p>
        </section>
      ) : (
        inChair.map((encounter) => {
          const patient = encounter.patient;
          const age = yearsOld(patient.dateOfBirth, now);
          const balance = patient.invoices.reduce((sum, invoice) => {
            const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
            return sum + Math.max(0, invoice.totalAmount - paid);
          }, 0);
          const lateCase = patient.labCases[0];
          const minutes = Math.max(0, Math.round((now.getTime() - encounter.occurredAt.getTime()) / 60000));
          const flag = patient.medicalNotes?.trim();
          return (
            <section
              key={encounter.id}
              aria-labelledby={`in-chair-${encounter.id}`}
              className="rounded-card border border-border-strong bg-card px-4.5 py-4 shadow-[var(--shadow)]"
            >
              <div className="mb-2.5 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-pill bg-success" aria-hidden />
                <h2
                  id={`in-chair-${encounter.id}`}
                  className="text-[13px] font-bold tracking-[0.08em] text-success uppercase"
                >
                  In the chair now
                </h2>
              </div>

              <div className="grid items-center gap-4.5 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="flex min-w-0 flex-wrap items-center gap-3.5">
                  <span className="flex h-13 w-13 flex-none items-center justify-center rounded-pill bg-secondary text-[17px] font-bold text-heading">
                    {initials(patient.fullName)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2.5">
                      <span className="text-xl font-bold text-heading">{patient.fullName}</span>
                      <span title={exactStamp(encounter.occurredAt)} className="text-[13px] text-text-muted">
                        {[
                          age !== null ? `${age} y` : null,
                          patient.gender,
                          `in the chair ${minutes} ${minutes === 1 ? "minute" : "minutes"}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    <p className="text-[13px] text-text-muted">
                      {[
                        encounter.appointment?.treatment,
                        encounter.chair?.name,
                        encounter.provider?.name,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No treatment recorded on the visit yet"}
                    </p>
                    {(lateCase || balance > 0 || flag) && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {lateCase && (
                          <Pill tone="danger">
                            {lateCase.caseType} still at {lateCase.labName}
                          </Pill>
                        )}
                        {flag && <Pill tone="danger">Read first: {flag}</Pill>}
                        {balance > 0 && <Pill tone="warning">{rupees(balance)} due</Pill>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Link
                    href={`${BASE}/${patient.id}`}
                    className="inline-flex min-h-12 items-center justify-center rounded-control border border-primary bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover"
                  >
                    Start charting
                  </Link>
                  <Link
                    href={`/dashboard/patients/${patient.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-4 text-[13px] font-semibold text-heading hover:bg-muted"
                  >
                    Open their record
                  </Link>
                </div>
              </div>

              <p className="mt-3 text-xs text-text-muted">
                You can chart before the visit is closed — we attach it to today&rsquo;s visit when
                you save.
              </p>
            </section>
          );
        })
      )}

      <SectionCard
        id="coming-up"
        title="Coming up"
        aside={
          upcoming.length === 0
            ? "Nobody else booked today"
            : `Showing ${Math.min(upcoming.length, UPCOMING_LIMIT)} of ${upcoming.length} still to come today`
        }
      >
        {upcoming.length === 0 ? (
          <p className="px-4.5 pb-5 text-[13px] text-text-muted">
            That is everyone for today. Search above to chart anyone else.
          </p>
        ) : (
          upcoming.slice(0, UPCOMING_LIMIT).map((visit) => (
            <div
              key={visit.id}
              className="grid items-center gap-x-3 gap-y-1.5 border-t border-border px-4.5 py-2.5 sm:grid-cols-[84px_minmax(0,1fr)_150px_160px]"
            >
              <span
                title={exactStamp(visit.appointmentDate)}
                className="text-[13px] font-semibold tabular-nums text-heading"
              >
                {visit.appointmentTime || clockTime(visit.appointmentDate)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  {visit.patientId ? (
                    <Link
                      href={`/dashboard/patients/${visit.patientId}`}
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      {visit.patientName}
                    </Link>
                  ) : (
                    <span className="text-sm font-semibold text-heading">{visit.patientName}</span>
                  )}
                </div>
                <p className="text-[13px] text-text-muted">{visit.treatment}</p>
              </div>
              <span className="justify-self-start sm:justify-self-auto">
                <Pill tone={visit.status === "Pending" ? "warning" : "muted"}>
                  {STATUS_LABELS[visit.status] ?? visit.status}
                </Pill>
              </span>
              {visit.patientId ? (
                <Link
                  href={`${BASE}/${visit.patientId}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
                >
                  Chart early
                </Link>
              ) : (
                <Link
                  href={`/dashboard/appointments/${visit.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
                >
                  Link a patient
                </Link>
              )}
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard
        id="open-notes"
        title="Notes still open"
        aside="Charted but not signed off — finish before you leave"
      >
        {openNotes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4.5 pt-6 pb-8 text-center">
            <Check className="h-6 w-6 text-success" strokeWidth={2} aria-hidden />
            <p className="text-[15px] font-semibold text-heading">Everything is signed off. Nice.</p>
          </div>
        ) : (
          openNotes.map((note) => (
            <div
              key={note.id}
              className="grid items-center gap-x-3 gap-y-1.5 border-t border-border border-l-[3px] border-l-warning px-4.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_150px_160px]"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-heading">{note.patient.fullName}</p>
                <p className="text-[13px] text-text-muted">
                  {note.chiefComplaint || "No complaint written down yet"} — saved as a draft, not
                  signed off
                </p>
              </div>
              <span title={exactStamp(note.updatedAt)} className="text-xs font-semibold text-warning">
                {humanTime(note.updatedAt, now)}
              </span>
              <Link
                href={`/dashboard/clinical-records/${note.id}/edit`}
                className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
              >
                Finish note
              </Link>
            </div>
          ))
        )}
      </SectionCard>

      <SectionCard
        id="seen-today"
        title="Seen today"
        aside={
          seen.length === 0
            ? "Nobody seen yet"
            : `${seen.length} ${seen.length === 1 ? "patient" : "patients"} · ${
                seen.filter(
                (visit) =>
                  visit.patientId !== null &&
                  noteByPatient.get(visit.patientId)?.status === "SIGNED",
              ).length
              } signed off`
        }
      >
        {seen.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4.5 pt-6 pb-8 text-center">
            <Stethoscope className="h-6 w-6 text-text-muted" strokeWidth={1.6} aria-hidden />
            <p className="text-[15px] font-semibold text-heading">Nobody through the chair yet.</p>
            <p className="text-[13px] text-text-muted">
              Patients land here once their visit is marked as seen.
            </p>
          </div>
        ) : (
          seen.map((visit) => {
            const note = visit.patientId === null ? undefined : noteByPatient.get(visit.patientId);
            const notesHref = note
              ? `/dashboard/clinical-records/${note.id}`
              : visit.patientId !== null
                ? `${BASE}/${visit.patientId}`
                : `/dashboard/appointments/${visit.id}`;
            return (
              <div
                key={visit.id}
                className="grid items-center gap-x-3 gap-y-1.5 border-t border-border px-4.5 py-2.5 sm:grid-cols-[84px_minmax(0,1fr)_150px_160px]"
              >
                <span className="text-[13px] tabular-nums text-text-muted">
                  {visit.appointmentTime || clockTime(visit.appointmentDate)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-heading">{visit.patientName}</p>
                  <p className="text-[13px] text-text-muted">{visit.treatment}</p>
                </div>
                <span className="justify-self-start sm:justify-self-auto">
                  {note?.status === "SIGNED" ? (
                    <Pill tone="success">Signed off</Pill>
                  ) : note ? (
                    <Pill tone="warning">Note not signed</Pill>
                  ) : (
                    <Pill tone="muted">No note yet</Pill>
                  )}
                </span>
                <Link
                  href={notesHref}
                  className="inline-flex min-h-11 items-center justify-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap text-heading hover:bg-muted"
                >
                  {note ? "Open notes" : "Write the note"}
                </Link>
              </div>
            );
          })
        )}
      </SectionCard>
    </div>
  );
}

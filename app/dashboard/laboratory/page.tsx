export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { FlaskConical } from "lucide-react";
import { Prisma } from "@prisma/client";
import { LaboratoryDirectoryForm } from "@/components/laboratory/LaboratoryDirectoryForm";
import { LabActionForm } from "@/components/laboratory/LabActionForm";
import { LAB_STAGES, labCaseStage, labDelayThreatensAppointment } from "@/lib/laboratory-core";
import { labReliability, verdictLabel } from "@/lib/laboratory-reliability";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, overdueBy } from "@/lib/format";
import { pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListLink, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";
import { archiveLaboratoryAction } from "./actions";

const BASE = "/dashboard/laboratory";
const CLOSED = ["COMPLETED", "CANCELLED"];
const IN_FLIGHT = [...CLOSED, "READY", "DISPATCHED", "RECEIVED_BY_CLINIC", "FITTED"];

const COLUMNS = [
  // Below sm the number gives way to the three things a phone is used for
  // here — whose case, when it is needed, where it has got to.
  { key: "order", label: "Case", sortKey: "order", secondary: true },
  { key: "patient", label: "Patient" },
  { key: "lab", label: "Lab", secondary: true },
  { key: "due", label: "Needed by", sortKey: "due" },
  { key: "state", label: "Where it is", width: "14rem" },
  { key: "open", label: "", align: "right" as const },
];

/** The four steps as a bar, so "where is it" reads without opening the case. */
function StageBar({ stage, late }: { stage: number; late: boolean }) {
  return (
    <span className="flex gap-1" aria-hidden>
      {LAB_STAGES.map((label, index) => (
        <span
          key={label}
          className={`h-1.5 flex-1 rounded-pill ${
            index < stage ? (late && index === stage - 1 ? "bg-danger-mark" : "bg-primary") : "bg-muted"
          }`}
        />
      ))}
    </span>
  );
}

export default async function LaboratoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("manageLaboratory");
  const params = await searchParams;
  const query = parseListQuery(params, { defaultSort: "due", defaultDir: "asc", filterKeys: ["show", "lab"] });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const inThreeDays = new Date(now.getTime() + 72 * 60 * 60 * 1000);
  const show = query.filters.show ?? "";
  const labId = Number(query.filters.lab) || 0;

  const search: Prisma.LabCaseWhereInput = query.q
    ? {
        OR: [
          { orderNumber: { contains: query.q, mode: "insensitive" } },
          { caseType: { contains: query.q, mode: "insensitive" } },
          { labName: { contains: query.q, mode: "insensitive" } },
          { patient: { fullName: { contains: query.q, mode: "insensitive" } } },
        ],
      }
    : {};

  const scoped: Prisma.LabCaseWhereInput = {
    clinicId: user.clinicId,
    ...search,
    ...(labId ? { labId } : {}),
    ...(show === "late"
      ? {
          status: { notIn: IN_FLIGHT },
          OR: [{ dueDate: { lt: today } }, { patientAppointmentAt: { lte: inThreeDays } }],
        }
      : {}),
    ...(show === "ready" ? { status: "READY" } : {}),
    ...(show === "open" ? { status: { notIn: CLOSED } } : {}),
    ...(show === "fitted" ? { status: { in: ["FITTED", "COMPLETED"] } } : {}),
  };

  const total = await prisma.labCase.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [cases, laboratories, openCount, readyCount, lateCount, fittedCount, reliability] = await Promise.all([
    prisma.labCase.findMany({
      where: scoped,
      orderBy: query.sort === "order" ? { orderNumber: query.dir } : [{ dueDate: query.dir }, { updatedAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        orderNumber: true,
        caseType: true,
        status: true,
        priority: true,
        dueDate: true,
        patientAppointmentAt: true,
        labName: true,
        patient: { select: { id: true, fullName: true } },
        laboratory: { select: { name: true } },
      },
    }),
    prisma.laboratory.findMany({
      where: { clinicId: user.clinicId, active: true, archivedAt: null },
      orderBy: { name: "asc" },
    }),
    prisma.labCase.count({ where: { clinicId: user.clinicId, status: { notIn: CLOSED } } }),
    prisma.labCase.count({ where: { clinicId: user.clinicId, status: "READY" } }),
    prisma.labCase.count({
      where: {
        clinicId: user.clinicId,
        status: { notIn: IN_FLIGHT },
        OR: [{ dueDate: { lt: today } }, { patientAppointmentAt: { lte: inThreeDays } }],
      },
    }),
    prisma.labCase.count({ where: { clinicId: user.clinicId, status: { in: ["FITTED", "COMPLETED"] } } }),
    labReliability(user.clinicId, now),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Lab work"
        sub={
          lateCount
            ? `${lateCount} ${lateCount === 1 ? "case is" : "cases are"} running late against a patient's visit — they are waiting on these.`
            : "Nothing is late. Every patient will get their work on time."
        }
        actions={
          <Link
            href="/dashboard/laboratory/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            New lab order
          </Link>
        }
      />

      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))]">
        {[
          { label: "Out with the lab", value: openCount, tone: "text-heading" },
          { label: "Back and ready to fit", value: readyCount, tone: "text-success" },
          { label: "Late against a visit", value: lateCount, tone: "text-danger" },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded-card border border-border bg-card px-4 py-3.5 shadow-[var(--shadow)]"
          >
            <p className="text-[length:var(--text-micro)] font-semibold tracking-[0.14em] text-text-muted uppercase">
              {tile.label}
            </p>
            <p className={`text-[length:var(--text-metric)] leading-[var(--text-metric-lh)] font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch placeholder="Order, patient, lab or what was made" label="Search lab cases" />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the cases"
            options={[
              { value: "late", label: "Running late", count: lateCount, tone: "danger" as const },
              { value: "ready", label: "Ready to fit", count: readyCount },
              { value: "open", label: "Still out", count: openCount },
              { value: "fitted", label: "Fitted", count: fittedCount },
            ]}
          />
        </div>
        {laboratories.length > 1 && (
          <FilterChips
            basePath={BASE}
            query={query}
            name="lab"
            legend="Filter by laboratory"
            options={laboratories.map((lab) => ({ value: String(lab.id), label: lab.name }))}
          />
        )}
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Filters live in the URL — copy the link to share this view.
        </p>
      </section>

      <DataList
        basePath={BASE}
        query={query}
        columns={COLUMNS}
        total={total}
        shown={cases.length}
        noun="cases"
        empty={
          <EmptyState
            icon={FlaskConical}
            title={query.q ? `Nothing matches “${query.q}”` : "Nothing out with a lab"}
            body={
              query.q
                ? "Try an order number, or clear the filters."
                : "Send your first case and you can follow it from here until it is in the patient's mouth."
            }
            action={{ label: "New lab order", href: "/dashboard/laboratory/new" }}
          />
        }
      >
        {cases.map((item) => {
          const threatened = labDelayThreatensAppointment({
            status: item.status,
            requiredAt: item.dueDate,
            appointmentAt: item.patientAppointmentAt,
          });
          const late = item.dueDate ? overdueBy(item.dueDate, now) : null;
          const stage = labCaseStage(item.status);
          return (
            <ListRow key={item.id} needsAttention={threatened}>
              <ListCell secondary interactive>
                <Link
                  href={`/dashboard/laboratory/${item.id}`}
                  className="font-semibold tabular-nums text-primary hover:underline"
                >
                  {item.orderNumber || `LAB-${item.id}`}
                </Link>
                <span className="block text-xs text-text-muted">
                  {item.caseType}
                  {item.priority === "URGENT" ? " · urgent" : ""}
                </span>
              </ListCell>
              <ListCell interactive>
                <Link
                  href={`/dashboard/patients/${item.patient.id}`}
                  className="text-primary hover:underline"
                >
                  {item.patient.fullName}
                </Link>
              </ListCell>
              <ListCell secondary>
                <span className="text-text-muted">{item.laboratory?.name || item.labName}</span>
              </ListCell>
              <ListCell>
                {item.dueDate ? (
                  <span
                    title={exactStamp(item.dueDate)}
                    className={late ? "font-semibold text-danger" : "text-text-muted"}
                  >
                    {late ?? humanTime(item.dueDate, now)}
                  </span>
                ) : (
                  <span className="text-text-muted">no date set</span>
                )}
              </ListCell>
              <ListCell>
                <StageBar stage={stage} late={threatened} />
                <span
                  className={`mt-1 block text-xs font-semibold ${
                    threatened ? "text-danger" : stage === 4 ? "text-success" : "text-text-muted"
                  }`}
                >
                  {threatened
                    ? "The patient is booked before this lands"
                    : stage === 0
                      ? "Not sent yet"
                      : LAB_STAGES[stage - 1]}
                </span>
              </ListCell>
              <ListCell align="right" primary>
                <ListLink href={`/dashboard/laboratory/${item.id}`} className="text-xs font-semibold text-primary">
                  Open
                </ListLink>
              </ListCell>
            </ListRow>
          );
        })}
      </DataList>

      <section className="rounded-card border border-border bg-card p-5.5 shadow-[var(--shadow)]">
        <h2 className="text-[length:var(--text-section)] leading-[var(--text-section-lh)] font-semibold text-heading">The labs you work with</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          How long they take and how often they make the promised day, measured from your own cases
          over the last 90 days — not from what the lab tells you.
        </p>

        <div className="mt-3.5 flex flex-col gap-3">
          {laboratories.map((lab) => {
            const measured = reliability.get(lab.id);
            const stats = [
              { label: "Cases sent", value: measured ? String(measured.cases) : "0", tone: "text-heading" },
              {
                label: "On the promised day",
                value: measured?.onTimePercent === null || !measured ? "—" : `${measured.onTimePercent}%`,
                tone:
                  measured?.onTimePercent != null && measured.onTimePercent < 75
                    ? "text-danger"
                    : measured?.onTimePercent != null && measured.onTimePercent >= 90
                      ? "text-success"
                      : "text-heading",
              },
              {
                label: "Usual wait",
                value: measured?.usualWaitDays
                  ? `${measured.usualWaitDays} days`
                  : lab.defaultTurnaroundDays
                    ? `${lab.defaultTurnaroundDays} days`
                    : "not known",
                tone: "text-heading",
              },
            ];
            const verdict = measured?.verdict ?? "too-new";

            return (
              <div key={lab.id} className="rounded-control border border-border p-3.5">
                <div className="grid gap-x-8 gap-y-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-heading">{lab.name}</p>
                    <p className="text-xs text-text-muted">
                      {lab.technicianName || lab.contactName || "No named contact"}
                      {lab.phone ? ` · ${lab.phone}` : ""}
                    </p>
                    {lab.services && <p className="text-xs text-text-muted">{lab.services}</p>}
                  </div>

                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(6rem,1fr))]">
                    {stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-[length:var(--text-micro)] font-semibold tracking-[0.14em] text-text-muted uppercase">
                          {stat.label}
                        </p>
                        <p className={`text-[17px] font-bold tabular-nums ${stat.tone}`}>{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start">
                    <span
                      className={`inline-flex items-center rounded-pill px-3 py-1 text-xs font-semibold ${
                        verdict === "reliable"
                          ? "bg-success-bg text-success"
                          : verdict === "late"
                            ? "bg-danger-bg text-danger"
                            : verdict === "watch"
                              ? "bg-warning-bg text-warning"
                              : "bg-muted text-text-muted"
                      }`}
                    >
                      {verdictLabel(verdict)}
                    </span>
                  </div>
                </div>

                <LabActionForm
                  action={archiveLaboratoryAction}
                  label="Take this lab off the list"
                  pendingLabel="Saving…"
                  confirmMessage="They stop showing up when you send new cases. Everything already sent to them is untouched."
                  className="mt-3 flex flex-wrap items-end gap-2 border-t border-border/70 pt-3"
                  buttonClassName="min-h-11 rounded-control border border-danger-border px-3 text-xs font-semibold text-danger disabled:opacity-60"
                >
                  <input type="hidden" name="id" value={lab.id} />
                  <label className="min-w-0 flex-1 text-xs font-semibold">
                    Why
                    <input
                      required
                      minLength={8}
                      name="reason"
                      placeholder="Why are they coming off?"
                      className="mt-1 min-h-11 w-full rounded-control border border-border px-3"
                    />
                  </label>
                </LabActionForm>
              </div>
            );
          })}
          {!laboratories.length && (
            <p className="text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-text-muted">No labs on your list yet.</p>
          )}
        </div>

        <details className="mt-4 border-t border-border/70 pt-3">
          <summary className="cursor-pointer text-[length:var(--text-secondary)] font-semibold text-heading">
            Add a lab to the list
          </summary>
          <div className="mt-3">
            <LaboratoryDirectoryForm />
          </div>
        </details>
      </section>
    </div>
  );
}

export const dynamic = "force-dynamic";

import Link from "next/link";
import { Suspense } from "react";
import { FlaskConical } from "lucide-react";
import { Prisma } from "@prisma/client";
import { LaboratoryDirectoryForm } from "@/components/laboratory/LaboratoryDirectoryForm";
import { LabActionForm } from "@/components/laboratory/LabActionForm";
import { labDelayThreatensAppointment } from "@/lib/laboratory-core";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanLabel, humanTime, overdueBy } from "@/lib/format";
import { pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";
import { archiveLaboratoryAction } from "./actions";

const BASE = "/dashboard/laboratory";
const CLOSED = ["COMPLETED", "CANCELLED"];
const IN_FLIGHT = [...CLOSED, "READY", "DISPATCHED", "RECEIVED_BY_CLINIC", "FITTED"];

const COLUMNS = [
  { key: "order", label: "Case", sortKey: "order" },
  { key: "patient", label: "Patient" },
  { key: "lab", label: "Lab", secondary: true },
  { key: "due", label: "Needed by", sortKey: "due" },
  { key: "state", label: "Where it is" },
  { key: "open", label: "", align: "right" as const },
];

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
  };

  const total = await prisma.labCase.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [cases, laboratories, openCount, readyCount, lateCount] = await Promise.all([
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
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Laboratory"
        sub={
          lateCount
            ? `${lateCount} ${lateCount === 1 ? "case is" : "cases are"} running late against a patient's visit`
            : "Nothing is late. Nice."
        }
        actions={
          <Link
            href="/dashboard/laboratory/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
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
            <p className="text-[11px] font-semibold tracking-[0.06em] text-text-muted uppercase">
              {tile.label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${tile.tone}`}>{tile.value}</p>
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
              { value: "late", label: "Running late" },
              { value: "ready", label: "Ready to fit" },
              { value: "open", label: "Still out" },
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
          return (
            <ListRow key={item.id} needsAttention={threatened}>
              <ListCell>
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
              <ListCell>
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
                <span
                  className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${
                    threatened
                      ? "bg-danger-bg text-danger"
                      : item.status === "READY"
                        ? "bg-success-bg text-success"
                        : "bg-muted text-heading"
                  }`}
                >
                  {threatened ? "The patient is booked before this lands" : humanLabel(item.status)}
                </span>
              </ListCell>
              <ListCell align="right">
                <Link href={`/dashboard/laboratory/${item.id}`} className="text-xs font-semibold text-primary">
                  Open
                </Link>
              </ListCell>
            </ListRow>
          );
        })}
      </DataList>

      <details className="rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <summary className="cursor-pointer text-base font-semibold text-heading">
          The labs you work with
        </summary>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] text-text-muted">
              Who they are, how long they take, and how to reach them.
            </p>
            <LaboratoryDirectoryForm />
          </div>
          <div className="flex flex-col gap-3">
            {laboratories.map((lab) => (
              <div key={lab.id} className="rounded-control border border-border p-3">
                <p className="text-sm font-semibold text-heading">{lab.name}</p>
                <p className="text-xs text-text-muted">
                  {lab.technicianName || lab.contactName || "No named contact"} ·{" "}
                  {lab.defaultTurnaroundDays ? `${lab.defaultTurnaroundDays} days` : "turnaround not set"}
                </p>
                <LabActionForm
                  action={archiveLaboratoryAction}
                  label="Take this lab off the list"
                  pendingLabel="Saving…"
                  confirmMessage="They stop showing up when you send new cases. Everything already sent to them is untouched."
                  className="mt-2.5 flex flex-wrap items-end gap-2"
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
            ))}
            {!laboratories.length && (
              <p className="text-[13px] text-text-muted">No labs on your list yet.</p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

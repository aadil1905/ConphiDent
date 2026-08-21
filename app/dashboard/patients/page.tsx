import Link from "next/link";
import { Suspense } from "react";
import { CalendarPlus, MessageSquare, UserRoundSearch } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime, rupees } from "@/lib/format";
import { listHref, pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListLink, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";
import AddPatientSheet from "@/components/patients/AddPatientSheet";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/patients";
const RECALL_DAYS = 180;

const COLUMNS = [
  { key: "patient", label: "Patient", sortKey: "name" },
  { key: "phone", label: "Phone", sortKey: "phone", secondary: true },
  { key: "visits", label: "Visits", sortKey: "visits", align: "right" as const, secondary: true },
  // Not sortable: "last seen" is the newest of a patient's visits, which Prisma
  // cannot order by. A wrong sort is worse than none.
  { key: "last", label: "Last seen", secondary: true },
  { key: "balance", label: "Balance", align: "right" as const },
  { key: "actions", label: "Quick actions", align: "right" as const },
];

function orderFor(sort: string, dir: "asc" | "desc"): Prisma.PatientOrderByWithRelationInput {
  if (sort === "phone") return { phone: dir };
  if (sort === "visits") return { appointments: { _count: dir } };
  return { fullName: dir };
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("managePatients");
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: "name",
    defaultDir: "asc",
    filterKeys: ["show"],
  });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const recallCutoff = new Date(now.getTime() - RECALL_DAYS * 24 * 60 * 60 * 1000);
  const show = query.filters.show ?? "";

  const search: Prisma.PatientWhereInput = query.q
    ? {
        OR: [
          { fullName: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q.replace(/\D/g, "") || query.q } },
          { email: { contains: query.q, mode: "insensitive" } },
        ],
      }
    : {};

  const scoped: Prisma.PatientWhereInput = {
    clinicId: user.clinicId,
    archivedAt: null,
    ...search,
    ...(show === "new" ? { createdAt: { gte: startOfMonth } } : {}),
    ...(show === "today"
      ? { appointments: { some: { appointmentDate: { gte: startOfDay }, archivedAt: null } } }
      : {}),
    ...(show === "due"
      ? { invoices: { some: { voidedAt: null, status: { not: "Paid" } } } }
      : {}),
    ...(show === "recall"
      ? {
          appointments: { none: { appointmentDate: { gte: recallCutoff }, archivedAt: null } },
        }
      : {}),
  };

  const total = await prisma.patient.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [patients, everyone, whatsappOn] = await Promise.all([
    prisma.patient.findMany({
      where: scoped,
      orderBy: orderFor(query.sort, query.dir),
      skip,
      take,
      select: {
        id: true,
        fullName: true,
        phone: true,
        dateOfBirth: true,
        gender: true,
        medicalNotes: true,
        createdAt: true,
        _count: { select: { appointments: true } },
        appointments: {
          where: { archivedAt: null },
          orderBy: { appointmentDate: "desc" },
          take: 1,
          select: { appointmentDate: true, appointmentTime: true, status: true },
        },
        invoices: {
          where: { voidedAt: null },
          select: {
            totalAmount: true,
            payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
          },
        },
      },
    }),
    prisma.patient.count({ where: { clinicId: user.clinicId, archivedAt: null } }),
    hasFeature(user.clinicId, "whatsapp"),
  ]);

  const rows = patients.map((patient) => {
    const balance = patient.invoices.reduce((sum, invoice) => {
      const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
      return sum + Math.max(0, invoice.totalAmount - paid);
    }, 0);
    const lastVisit = patient.appointments[0]?.appointmentDate ?? null;
    const age = patient.dateOfBirth
      ? now.getFullYear() - patient.dateOfBirth.getFullYear()
      : null;

    return {
      id: patient.id,
      name: patient.fullName,
      meta: [
        age !== null && `${age} y`,
        patient.gender,
        `added ${patient.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`,
      ]
        .filter(Boolean)
        .join(" · "),
      flag: patient.medicalNotes?.trim() || null,
      phone: patient.phone,
      visits: patient._count.appointments,
      lastVisit,
      balance,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Patients"
        sub={`${everyone.toLocaleString("en-IN")} on your list`}
        actions={
          <Link
            href={listHref(BASE, query, { add: "1" })}
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[length:var(--text-secondary)] font-semibold text-primary-foreground hover:bg-primary-hover"
          >
            Add patient
          </Link>
        }
      />

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch
              placeholder="Name, phone or email — filters as you type"
              label="Search patients"
            />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the list"
            options={[
              { value: "due", label: "Money due" },
              { value: "recall", label: "Recall due" },
              { value: "new", label: "New this month" },
              { value: "today", label: "Seen today" },
            ]}
          />
        </div>
        <p className="border-t border-border/70 pt-2.5 text-xs text-text-muted">
          Filters live in the URL — copy the link to share this view.
        </p>
      </section>

      <DataList
        basePath={BASE}
        query={query}
        columns={COLUMNS}
        total={total}
        shown={rows.length}
        noun="patients"
        empty={
          query.q ? (
            <EmptyState
              icon={UserRoundSearch}
              title={`No patients match “${query.q}”`}
              body="Try a phone number, or add them as a new patient — it takes four fields."
              action={{ label: `Add “${query.q}”`, href: listHref(BASE, query, { add: "1" }) }}
            />
          ) : (
            <EmptyState
              icon={UserRoundSearch}
              title="Nobody on the list yet"
              body="Add the first patient and their file starts here — four fields is enough to begin."
              action={{ label: "Add a patient", href: listHref(BASE, query, { add: "1" }) }}
            />
          )
        }
      >
        {rows.map((row) => (
          <ListRow key={row.id} needsAttention={row.balance > 0}>
            <ListCell primary>
              <div className="flex flex-wrap items-baseline gap-2">
                <ListLink
                  href={`/dashboard/patients/${row.id}`}
                  className="text-sm font-semibold text-primary hover:underline"
                >
                  {row.name}
                </ListLink>
                {row.flag && (
                  <span className="inline-flex items-center rounded-pill bg-warning-bg px-2 py-0.5 text-[length:var(--text-micro)] font-semibold text-warning">
                    {row.flag.length > 34 ? `${row.flag.slice(0, 34)}…` : row.flag}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-text-muted">{row.meta}</p>
            </ListCell>
            <ListCell secondary interactive>
              {/* tel: so calling back is one tap — the desk phone, the tablet
                  and the reception mobile all resolve it. */}
              <a
                href={`tel:${row.phone.replace(/[^+\d]/g, "")}`}
                title={`Call ${row.name}`}
                className="tabular-nums text-text-muted underline-offset-2 hover:text-primary hover:underline"
              >
                {row.phone}
              </a>
            </ListCell>
            <ListCell align="right" secondary>
              <span className="tabular-nums">{row.visits}</span>
            </ListCell>
            <ListCell secondary>
              {row.lastVisit ? (
                <span title={exactStamp(row.lastVisit)} className="text-text-muted">
                  {humanTime(row.lastVisit, now)}
                </span>
              ) : (
                <span className="text-text-muted">not yet</span>
              )}
            </ListCell>
            <ListCell align="right">
              {row.balance > 0 ? (
                <span className="font-semibold tabular-nums text-danger">{rupees(row.balance)}</span>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </ListCell>
            <ListCell align="right" interactive>
              <div className="flex justify-end gap-1.5">
                <Link
                  href={`/dashboard/appointments/new?patient=${row.id}`}
                  title={`Book a visit for ${row.name}`}
                  aria-label={`Book a visit for ${row.name}`}
                  className="grid h-11 w-11 place-items-center rounded-control border border-border-strong bg-card text-heading hover:bg-muted"
                >
                  <CalendarPlus className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                </Link>
                {whatsappOn && (
                  <Link
                    href={`/dashboard/conversations?phone=${encodeURIComponent(row.phone)}`}
                    title={`Message ${row.name} on WhatsApp`}
                    aria-label={`Message ${row.name} on WhatsApp`}
                    className="grid h-11 w-11 place-items-center rounded-control border border-border-strong bg-card text-heading hover:bg-muted"
                  >
                    <MessageSquare className="h-4 w-4" strokeWidth={1.9} aria-hidden />
                  </Link>
                )}
              </div>
            </ListCell>
          </ListRow>
        ))}
      </DataList>

      <Suspense fallback={null}>
        <AddPatientSheet whatsappOn={whatsappOn} />
      </Suspense>
    </div>
  );
}

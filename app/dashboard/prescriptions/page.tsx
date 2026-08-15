import Link from "next/link";
import { Suspense } from "react";
import { Pill } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime } from "@/lib/format";
import { pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/prescriptions";

const COLUMNS = [
  { key: "when", label: "Written", sortKey: "when" },
  { key: "patient", label: "Patient" },
  { key: "medicines", label: "What was prescribed", secondary: true },
  { key: "by", label: "Prescriber", secondary: true },
  { key: "state", label: "Status" },
  { key: "open", label: "Next step", align: "right" as const },
];

/** First couple of medicine names, so the row says something useful. */
function summarise(items: { genericName: string; brandName: string | null; strength: string }[], fallback: string) {
  const names = items.map((item) => [item.brandName || item.genericName, item.strength].filter(Boolean).join(" ")).filter(Boolean);
  if (names.length === 0) return fallback.split("\n")[0] || "No medicines listed";
  if (names.length <= 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
}

export default async function PrescriptionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("viewClinical");
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: "when",
    defaultDir: "desc",
    filterKeys: ["show"],
  });
  const now = new Date();
  const show = query.filters.show ?? "";

  const search: Prisma.PrescriptionWhereInput = query.q
    ? {
        OR: [
          { patient: { fullName: { contains: query.q, mode: "insensitive" } } },
          { medicines: { contains: query.q, mode: "insensitive" } },
          { diagnosis: { contains: query.q, mode: "insensitive" } },
        ],
      }
    : {};

  const scoped: Prisma.PrescriptionWhereInput = {
    clinicId: user.clinicId,
    cancelledAt: null,
    ...search,
    ...(show === "draft" ? { status: "DRAFT" } : {}),
    ...(show === "issued" ? { status: { not: "DRAFT" } } : {}),
  };

  const total = await prisma.prescription.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [scripts, drafts] = await Promise.all([
    prisma.prescription.findMany({
      where: scoped,
      orderBy: { prescribedOn: query.dir },
      skip,
      take,
      select: {
        id: true,
        prescribedOn: true,
        diagnosis: true,
        medicines: true,
        status: true,
        version: true,
        patientId: true,
        patient: { select: { fullName: true } },
        provider: { select: { name: true } },
        providerNameSnapshot: true,
        medicationItems: {
          select: { genericName: true, brandName: true, strength: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    prisma.prescription.count({
      where: { clinicId: user.clinicId, cancelledAt: null, status: "DRAFT" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Prescriptions"
        sub={
          drafts > 0
            ? `${drafts} still unsigned — a draft is not a prescription until you sign it.`
            : "Everything you have prescribed, newest first."
        }
        actions={
          <>
            {/* Both of these were reachable only from inside the prescription
                form, so nobody could set them up before writing their first. */}
            <Link
              href={`${BASE}/profile`}
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
            >
              Your prescriber details
            </Link>
            <Link
              href={`${BASE}/templates`}
              className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
            >
              Saved sets
            </Link>
            <Link
              href={`${BASE}/new`}
              className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Write a prescription
            </Link>
          </>
        }
      />

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch
              placeholder="Patient, medicine or what you were treating"
              label="Search prescriptions"
            />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the list"
            options={[
              { value: "draft", label: "Unsigned only" },
              { value: "issued", label: "Signed" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-2.5 text-xs text-text-muted">
          <span>Filters live in the URL — copy the link to share this view.</span>
          <span className="ml-auto flex gap-3">
            <Link href={`${BASE}/profile`} className="font-semibold text-primary hover:underline">
              Your prescriber details
            </Link>
            <Link href={`${BASE}/templates`} className="font-semibold text-primary hover:underline">
              Your medicine sets
            </Link>
          </span>
        </div>
      </section>

      <DataList
        basePath={BASE}
        query={query}
        columns={COLUMNS}
        total={total}
        shown={scripts.length}
        noun="prescriptions"
        empty={
          <EmptyState
            icon={Pill}
            title={query.q ? `Nothing matches “${query.q}”` : "Nothing prescribed yet"}
            body={
              query.q
                ? "Try a patient name or a medicine, or clear the filters."
                : "Open a patient and write the first one — it lands here with its safety checks."
            }
            action={{ label: "Write a prescription", href: `${BASE}/new` }}
          />
        }
      >
        {scripts.map((script) => {
          const draft = script.status === "DRAFT";
          return (
            <ListRow key={script.id} needsAttention={draft}>
              <ListCell>
                <span title={exactStamp(script.prescribedOn)} className="tabular-nums">
                  {humanTime(script.prescribedOn, now)}
                </span>
              </ListCell>
              <ListCell>
                <Link
                  href={`/dashboard/patients/${script.patientId}?tab=Clinical`}
                  className="font-semibold text-primary hover:underline"
                >
                  {script.patient.fullName}
                </Link>
              </ListCell>
              <ListCell secondary className="max-w-[24rem]">
                <span className="block truncate text-text-muted">
                  {summarise(script.medicationItems, script.medicines)}
                </span>
              </ListCell>
              <ListCell secondary>
                <span className="text-text-muted">
                  {script.provider?.name ?? script.providerNameSnapshot ?? "Not recorded"}
                </span>
              </ListCell>
              <ListCell>
                <span
                  className={`inline-flex items-center rounded-pill px-2.5 py-1 text-xs font-semibold ${
                    draft ? "bg-warning-bg text-warning" : "bg-success-bg text-success"
                  }`}
                >
                  {draft ? "Unsigned" : "Signed"}
                </span>
              </ListCell>
              <ListCell align="right">
                <Link
                  href={draft ? `${BASE}/${script.id}/edit` : `${BASE}/${script.id}/print`}
                  className={`inline-flex min-h-11 items-center justify-center rounded-control px-3.5 text-[13px] font-semibold whitespace-nowrap ${
                    draft
                      ? "border border-primary bg-primary text-white hover:bg-primary-hover"
                      : "border border-border-strong bg-card text-heading hover:bg-muted"
                  }`}
                >
                  {draft ? "Finish it" : "Open it"}
                </Link>
              </ListCell>
            </ListRow>
          );
        })}
      </DataList>
    </div>
  );
}

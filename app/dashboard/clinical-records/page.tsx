import Link from "next/link";
import { Suspense } from "react";
import { Download, NotebookPen } from "lucide-react";
import { Prisma } from "@prisma/client";
import { requirePermission, can } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { exactStamp, humanTime } from "@/lib/format";
import { pageWindow, parseListQuery, type RawSearchParams } from "@/lib/list-params";
import DataList, { ListCell, ListRow } from "@/components/lists/DataList";
import ListSearch from "@/components/lists/ListSearch";
import FilterChips from "@/components/lists/FilterChips";
import FilterSelect from "@/components/lists/FilterSelect";
import EmptyState from "@/components/lists/EmptyState";
import PageHeader from "@/components/lists/PageHeader";

export const dynamic = "force-dynamic";

const BASE = "/dashboard/clinical-records";
const DAY = 24 * 60 * 60 * 1000;

const COLUMNS = [
  { key: "when", label: "Visit date", sortKey: "when" },
  { key: "patient", label: "Patient" },
  { key: "teeth", label: "Teeth", secondary: true },
  { key: "about", label: "What was recorded", secondary: true },
  { key: "state", label: "Status" },
  { key: "open", label: "Next step", align: "right" as const },
];

const RANGES = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
  { value: "all", label: "Everything" },
] as const;

function rangeStart(range: string, now: Date) {
  if (range === "90") return new Date(now.getTime() - 90 * DAY);
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  if (range === "all") return null;
  return new Date(now.getTime() - 30 * DAY);
}

export default async function NotesArchivePage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePermission("viewClinical");
  const params = await searchParams;
  const query = parseListQuery(params, {
    defaultSort: "when",
    defaultDir: "desc",
    filterKeys: ["show", "provider", "range"],
  });
  const now = new Date();
  const show = query.filters.show ?? "";
  const providerId = Number(query.filters.provider) || null;
  const range = query.filters.range || "30";
  const from = rangeStart(range, now);

  const search: Prisma.ClinicalRecordWhereInput = query.q
    ? {
        OR: [
          { patient: { fullName: { contains: query.q, mode: "insensitive" } } },
          { chiefComplaint: { contains: query.q, mode: "insensitive" } },
          { diagnosis: { contains: query.q, mode: "insensitive" } },
          { clinicalNotes: { contains: query.q, mode: "insensitive" } },
        ],
      }
    : {};

  const scoped: Prisma.ClinicalRecordWhereInput = {
    clinicId: user.clinicId,
    enteredInErrorAt: null,
    ...search,
    ...(show === "draft" ? { status: "DRAFT" } : {}),
    ...(show === "signed" ? { status: "SIGNED" } : {}),
    ...(show === "intake" ? { source: "PATIENT_INTAKE" } : {}),
    ...(providerId ? { providerId } : {}),
    ...(from ? { visitDate: { gte: from } } : {}),
  };

  const total = await prisma.clinicalRecord.count({ where: scoped });
  const { skip, take } = pageWindow(query, total);

  const [notes, providers, onFile, unsigned] = await Promise.all([
    prisma.clinicalRecord.findMany({
      where: scoped,
      orderBy: { visitDate: query.dir },
      skip,
      take,
      select: {
        id: true,
        visitDate: true,
        chiefComplaint: true,
        diagnosis: true,
        status: true,
        source: true,
        patientId: true,
        patient: { select: { fullName: true } },
        provider: { select: { name: true } },
        encounter: {
          select: {
            dentalFindings: {
              where: { status: "ACTIVE" },
              select: { toothCodeSnapshot: true },
            },
          },
        },
      },
    }),
    prisma.clinicProvider.findMany({
      where: { clinicId: user.clinicId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.clinicalRecord.count({ where: { clinicId: user.clinicId, enteredInErrorAt: null } }),
    prisma.clinicalRecord.count({
      where: { clinicId: user.clinicId, enteredInErrorAt: null, status: "DRAFT" },
    }),
  ]);

  const rangeLabel = RANGES.find((option) => option.value === range)?.label ?? RANGES[0].label;
  const providerLabel = providerId
    ? (providers.find((provider) => provider.id === providerId)?.name ?? "one dentist")
    : "everyone";
  const exportHref = `/api/exports/clinical-records?${new URLSearchParams({
    ...(query.q ? { q: query.q } : {}),
    ...(show ? { show } : {}),
    ...(providerId ? { provider: String(providerId) } : {}),
    range,
  }).toString()}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Notes archive"
        sub={`${onFile} ${onFile === 1 ? "note" : "notes"} on file · ${
          unsigned === 0 ? "all signed off" : `${unsigned} still unsigned`
        } · nothing is hidden from this list`}
        actions={
          <>
            {can(user.role, "exportData") && (
              <Link
                href={exportHref}
                prefetch={false}
                className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-strong bg-card px-3.5 text-[13px] font-semibold text-heading hover:bg-muted"
              >
                <Download className="h-4 w-4" aria-hidden />
                Export what I see
              </Link>
            )}
            <Link
              href="/dashboard/clinical-workspace"
              className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
            >
              Start a note
            </Link>
          </>
        }
      />

      <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <Suspense fallback={<div className="h-11 flex-[1_1_240px] rounded-control bg-muted" />}>
            <ListSearch placeholder="Patient, tooth or words in the note" label="Search notes" />
          </Suspense>
          <FilterChips
            basePath={BASE}
            query={query}
            name="show"
            legend="Narrow the notes"
            options={[
              { value: "draft", label: "Unsigned only" },
              { value: "signed", label: "Signed" },
              { value: "intake", label: "From the patient" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-border/70 pt-3">
          <Suspense fallback={null}>
            <FilterSelect
              name="provider"
              label="Dentist"
              value={providerId ? String(providerId) : ""}
              options={[
                { value: "", label: "Everyone" },
                ...providers.map((provider) => ({
                  value: String(provider.id),
                  label: provider.name,
                })),
              ]}
            />
          </Suspense>
          <Suspense fallback={null}>
            <FilterSelect name="range" label="When" value={range} options={RANGES} />
          </Suspense>
          <span className="ml-auto text-xs text-text-muted">
            Showing {rangeLabel.toLowerCase()}, {providerLabel === "everyone" ? "all dentists" : providerLabel}
          </span>
        </div>
      </section>

      <DataList
        basePath={BASE}
        query={query}
        columns={COLUMNS}
        total={total}
        shown={notes.length}
        noun="notes"
        empty={
          <EmptyState
            icon={NotebookPen}
            title={query.q ? `No notes match “${query.q}”` : "Nothing written down yet"}
            body={
              query.q
                ? "Try a tooth number like 36, a patient name, or widen the date range."
                : "Open a patient in Clinical and the first note lands here."
            }
            action={{ label: "Open Clinical", href: "/dashboard/clinical-workspace" }}
          />
        }
      >
        {notes.map((note) => {
          const draft = note.status !== "SIGNED";
          const teeth = Array.from(
            new Set((note.encounter?.dentalFindings ?? []).map((finding) => finding.toothCodeSnapshot)),
          );
          return (
            <ListRow key={note.id} needsAttention={draft}>
              <ListCell>
                <span
                  title={`${exactStamp(note.visitDate)}${
                    note.provider?.name ? ` · ${note.provider.name}` : ""
                  }`}
                  className="tabular-nums"
                >
                  {humanTime(note.visitDate, now)}
                </span>
              </ListCell>
              <ListCell>
                <Link
                  href={`/dashboard/patients/${note.patientId}?tab=Clinical`}
                  className="font-semibold text-primary hover:underline"
                >
                  {note.patient.fullName}
                </Link>
              </ListCell>
              <ListCell secondary>
                <span className="tabular-nums text-text-muted">
                  {teeth.length === 0 ? "—" : teeth.length > 3 ? `${teeth.slice(0, 3).join(", ")} +${teeth.length - 3}` : teeth.join(", ")}
                </span>
              </ListCell>
              <ListCell secondary className="max-w-[26rem]">
                <span className="block truncate text-text-muted">
                  {note.chiefComplaint}
                  {note.diagnosis ? ` · ${note.diagnosis}` : ""}
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
                  href={draft ? `${BASE}/${note.id}/edit` : `${BASE}/${note.id}`}
                  className={`inline-flex min-h-11 items-center justify-center rounded-control px-3.5 text-[13px] font-semibold whitespace-nowrap ${
                    draft
                      ? "border border-primary bg-primary text-white hover:bg-primary-hover"
                      : "border border-border-strong bg-card text-heading hover:bg-muted"
                  }`}
                >
                  {draft ? "Finish it" : "Open note"}
                </Link>
              </ListCell>
            </ListRow>
          );
        })}
      </DataList>
    </div>
  );
}

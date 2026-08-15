export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanLine } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePermission, can } from "@/lib/permissions";
import { hasFeature } from "@/lib/features";
import { signedImagingAssetPath } from "@/lib/imaging-access";
import { exactStamp, humanTime } from "@/lib/format";
import { IMAGING_MODALITY_LABELS, isRenderableImagingType, type ImagingModality } from "@/lib/imaging";
import PageHeader from "@/components/lists/PageHeader";
import ImagingGallery, { type ImagingGalleryStudy } from "@/components/imaging/ImagingGallery";
import { ImagingComparisonForm, ImagingReviewActions } from "@/components/imaging/ImagingWorklistActions";

const PAGE_SIZE = 24;
const BASE = "/dashboard/imaging";

const FILTERS = [
  { key: "unread", label: "Not read yet" },
  { key: "today", label: "Taken today" },
  { key: "read", label: "Read" },
  { key: "all", label: "Everything" },
] as const;

function modalityLabel(value: string) {
  return IMAGING_MODALITY_LABELS[value as ImagingModality] || value.replaceAll("_", " ");
}

function filterHref(key: string, q: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (key !== "unread") params.set("show", key);
  const search = params.toString();
  return search ? `${BASE}?${search}` : BASE;
}

export default async function ImagingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; study?: string; show?: string; patient?: string }>;
}) {
  const user = await requirePermission("viewImaging");
  if (!(await hasFeature(user.clinicId, "imaging"))) redirect("/dashboard");
  const raw = await searchParams;
  const q = raw.q?.trim().slice(0, 100) || "";
  const page = Math.max(1, Number(raw.page) || 1);
  const focusedStudy = raw.study?.trim().slice(0, 64) || "";
  // Arriving from a patient file scopes the whole screen to that patient.
  const focusedPatient = Number(raw.patient) || null;
  // Old links used ?status=unmatched / ?status=unreviewed; map them onto the chips.
  // "Not read yet" is the right default for the reading queue, but when you
  // arrive from one patient or one study you came to see all of it.
  const defaultShow = focusedPatient || focusedStudy ? "all" : "unread";
  const show = FILTERS.some((f) => f.key === raw.show) ? raw.show! : defaultShow;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const canMatch = can(user.role, "uploadImaging");
  const canSign = can(user.role, "signImaging");

  const alive = { clinicId: user.clinicId, archivedAt: null, enteredInErrorAt: null } as const;
  const where = {
    ...alive,
    ...(focusedStudy ? { id: focusedStudy } : {}),
    ...(focusedPatient ? { patientId: focusedPatient } : {}),
    ...(q
      ? {
          OR: [
            { patient: { fullName: { contains: q, mode: "insensitive" as const } } },
            { toothCodes: { has: q } },
          ],
        }
      : {}),
    ...(show === "unread" ? { matchStatus: "CONFIRMED", status: { not: "REVIEWED" } } : {}),
    ...(show === "read" ? { status: "REVIEWED" } : {}),
    ...(show === "today" ? { acquisitionDate: { gte: startOfDay } } : {}),
  };

  const [total, studies, unmatchedStudies, counts, comparisons] = await Promise.all([
    prisma.imagingStudy.count({ where }),
    prisma.imagingStudy.findMany({
      where,
      orderBy: [{ acquisitionDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        patient: { select: { id: true, fullName: true } },
        source: { select: { id: true, name: true } },
        assets: {
          where: { role: { in: ["THUMBNAIL", "PREVIEW", "ORIGINAL"] } },
          take: 3,
          select: { id: true, role: true, contentType: true, sizeBytes: true, originalName: true },
        },
        annotations: { where: { status: "ACTIVE" }, select: { id: true, label: true, toothCode: true, geometry: true } },
        reports: {
          where: { status: "FINAL" },
          orderBy: { version: "desc" },
          take: 1,
          include: { author: { select: { fullName: true } } },
        },
      },
    }),
    canMatch
      ? prisma.imagingStudy.findMany({
          where: { ...alive, matchStatus: "UNMATCHED" },
          orderBy: { acquisitionDate: "desc" },
          take: 6,
          include: {
            source: { select: { name: true } },
            reports: { where: { status: "FINAL" }, orderBy: { version: "desc" }, take: 1 },
          },
        })
      : [],
    Promise.all([
      prisma.imagingStudy.count({ where: { ...alive, matchStatus: "CONFIRMED", status: { not: "REVIEWED" } } }),
      prisma.imagingStudy.count({ where: { ...alive, acquisitionDate: { gte: startOfDay } } }),
      prisma.imagingStudy.count({ where: { ...alive, status: "REVIEWED" } }),
      prisma.imagingStudy.count({ where: alive }),
      prisma.imagingStudy.count({ where: { ...alive, matchStatus: "UNMATCHED" } }),
    ]),
    prisma.imagingComparison.findMany({
      where: { clinicId: user.clinicId, status: "FINAL" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: {
        patient: { select: { id: true, fullName: true } },
        baselineStudy: { select: { modality: true, acquisitionDate: true } },
        followupStudy: { select: { modality: true, acquisitionDate: true } },
      },
    }),
  ]);
  const [unreadCount, todayCount, readCount, allCount, unmatchedCount] = counts;
  const chipCounts: Record<string, number> = {
    unread: unreadCount,
    today: todayCount,
    read: readCount,
    all: allCount,
  };

  const galleryStudies: ImagingGalleryStudy[] = studies.map((study) => {
    const asset = study.assets.find((item) => item.role === "ORIGINAL") || null;
    const thumbnail = study.assets.find((item) => item.role === "THUMBNAIL") || null;
    return {
      id: study.id,
      modality: study.modality,
      modalityLabel: modalityLabel(study.modality),
      treatmentStage: study.treatmentStage,
      acquisitionDate: study.acquisitionDate.toISOString(),
      description: study.description,
      clinicalIndication: study.clinicalIndication,
      anatomicalRegion: study.anatomicalRegion,
      laterality: study.laterality,
      toothCodes: study.toothCodes,
      status: study.status,
      matchStatus: study.matchStatus,
      sourceName: study.source?.name || study.sourceType.replaceAll("_", " "),
      patient: study.patient,
      asset: asset
        ? {
            id: asset.id,
            contentType: asset.contentType,
            sizeBytes: asset.sizeBytes,
            originalName: asset.originalName,
            accessUrl: signedImagingAssetPath(asset.id, user.clinicId),
            thumbnailUrl: thumbnail ? signedImagingAssetPath(thumbnail.id, user.clinicId) : null,
            renderable: isRenderableImagingType(asset.contentType),
          }
        : null,
      annotations: study.annotations.flatMap((item) => {
        const geometry = item.geometry as { x?: unknown; y?: unknown };
        return typeof geometry.x === "number" && typeof geometry.y === "number"
          ? [{ id: item.id, label: item.label, toothCode: item.toothCode, x: geometry.x, y: geometry.y }]
          : [];
      }),
      report: study.reports[0]
        ? {
            version: study.reports[0].version,
            findings: study.reports[0].findings,
            impression: study.reports[0].impression,
            signedAt: study.reports[0].signedAt?.toISOString() || null,
            authorName: study.reports[0].author.fullName,
          }
        : null,
    };
  });

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="X-rays"
        sub={
          unmatchedCount > 0
            ? `${unmatchedCount} ${unmatchedCount === 1 ? "X-ray has no name on it" : "X-rays have no name on them"} · ${unreadCount} waiting to be read`
            : unreadCount > 0
              ? `${unreadCount} ${unreadCount === 1 ? "X-ray" : "X-rays"} waiting to be read`
              : "Everything has been read. Nice."
        }
        actions={
          <>
          <Link
            href="/dashboard/imaging/new"
            className="inline-flex min-h-11 items-center rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover"
          >
            Add an X-ray
          </Link>
          <form action={BASE} className="flex items-center gap-2">
            {show !== "unread" && <input type="hidden" name="show" value={show} />}
            <label className="flex min-h-11 items-center gap-2 rounded-control border border-border bg-card px-3">
              <span className="sr-only">Search X-rays</span>
              <input
                name="q"
                defaultValue={q}
                placeholder="Patient or tooth"
                className="w-[180px] min-w-0 border-0 bg-transparent text-[13px] text-foreground outline-none placeholder:text-text-muted"
              />
            </label>
          </form>
          </>
        }
      />

      {/* --- X-rays that need a name ------------------------------------- */}
      {unmatchedStudies.length > 0 && (
        <section className="overflow-hidden rounded-card border border-warning-border border-l-[3px] border-l-[#c4a46c] bg-card shadow-[var(--shadow)]">
          <div className="px-4.5 pt-3.5 pb-2.5">
            <h2 className="text-base font-semibold text-heading">
              {unmatchedStudies.length === 1
                ? "One X-ray needs a name"
                : `${unmatchedStudies.length} X-rays need a name`}
            </h2>
            <p className="text-xs text-text-muted">
              The scanner sent these without a name. Match them now so they show up on the right
              patient&rsquo;s file.
            </p>
          </div>
          <div className="flex flex-col gap-3 border-t border-border/70 px-4.5 py-3.5">
            {unmatchedStudies.map((study) => (
              <div key={study.id} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-12 w-16 flex-none items-center justify-center rounded-[0.4rem] bg-heading text-[10px] font-semibold tracking-[0.06em] text-[#6eaeb9]">
                    {modalityLabel(study.modality).toUpperCase().slice(0, 10)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-heading">
                      {study.accessionNumber || study.description || modalityLabel(study.modality)}
                    </p>
                    <p className="text-xs text-text-muted" title={exactStamp(study.acquisitionDate)}>
                      {humanTime(study.acquisitionDate, now)} · {study.source?.name || "unknown device"}
                    </p>
                    {study.matchReason && <p className="text-xs text-warning">{study.matchReason}</p>}
                  </div>
                </div>
                <ImagingReviewActions
                  study={{
                    id: study.id,
                    modalityLabel: modalityLabel(study.modality),
                    acquisitionLabel: exactStamp(study.acquisitionDate),
                    patient: null,
                    matchStatus: study.matchStatus,
                    status: study.status,
                    sourcePatientName: study.sourcePatientName,
                    sourcePatientBirthDate: study.sourcePatientBirthDate?.toLocaleDateString("en-IN") ?? null,
                    dicomPatientId: study.dicomPatientId,
                    accessionNumber: study.accessionNumber,
                    report: study.reports[0]
                      ? {
                          findings: study.reports[0].findings,
                          impression: study.reports[0].impression,
                          version: study.reports[0].version,
                        }
                      : null,
                  }}
                  canMatch={canMatch}
                  canSign={canSign}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --- Filter chips -------------------------------------------------- */}
      <section className="flex flex-wrap items-center gap-2.5 rounded-card border border-border bg-card p-4 shadow-[var(--shadow)]">
        <span className="text-xs text-text-muted">Show:</span>
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={filterHref(filter.key, q)}
            aria-current={show === filter.key ? "true" : undefined}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold whitespace-nowrap text-heading ${
              show === filter.key ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted"
            }`}
          >
            {filter.label}
            <span className="tabular-nums text-text-muted">{chipCounts[filter.key]}</span>
          </Link>
        ))}
        <span className="ml-auto text-xs text-text-muted">
          Showing {studies.length} of {total} X-rays
        </span>
      </section>

      {/* --- Gallery -------------------------------------------------------- */}
      {studies.length === 0 ? (
        <section className="flex flex-col items-center gap-2 rounded-card border border-border bg-card px-4.5 pt-9 pb-11 text-center shadow-[var(--shadow)]">
          <ScanLine className="h-7 w-7 text-text-muted" strokeWidth={1.8} aria-hidden />
          <p className="text-[15px] font-semibold text-heading">
            {show === "unread" && !q
              ? "Everything has been read. Nice."
              : q
                ? `Nothing matches “${q}”`
                : "No X-rays yet"}
          </p>
          <p className="max-w-[32rem] text-[13px] text-text-muted">
            {q
              ? "Try a patient name or a tooth number like 36."
              : "X-rays from connected devices land here automatically and file themselves against the patient in the chair."}
          </p>
        </section>
      ) : (
        <ImagingGallery
          studies={galleryStudies}
          canAnnotate={canSign}
          emptyMessage="No X-rays match this view."
        />
      )}

      {pages > 1 && (
        <nav aria-label="X-ray pages" className="flex items-center justify-between rounded-card border border-border bg-card p-3">
          <Link
            aria-disabled={page === 1}
            href={`${BASE}?${new URLSearchParams({ ...(q ? { q } : {}), ...(show !== "unread" ? { show } : {}), page: String(Math.max(1, page - 1)) })}`}
            className={`inline-flex min-h-10 items-center rounded-control border border-border-strong px-3.5 text-[13px] font-semibold text-heading ${page === 1 ? "pointer-events-none opacity-40" : "hover:bg-muted"}`}
          >
            Back
          </Link>
          <span className="text-[13px] tabular-nums text-text-muted">
            Page {page} of {pages}
          </span>
          <Link
            aria-disabled={page === pages}
            href={`${BASE}?${new URLSearchParams({ ...(q ? { q } : {}), ...(show !== "unread" ? { show } : {}), page: String(Math.min(pages, page + 1)) })}`}
            className={`inline-flex min-h-10 items-center rounded-control border border-border-strong px-3.5 text-[13px] font-semibold text-heading ${page === pages ? "pointer-events-none opacity-40" : "hover:bg-muted"}`}
          >
            Next
          </Link>
        </nav>
      )}

      {/* --- Comparisons ---------------------------------------------------- */}
      {canSign && (
        <div className="grid items-stretch gap-5 xl:grid-cols-2">
          <section className="rounded-card border border-border bg-card p-4.5 shadow-[var(--shadow)]">
            <h2 className="text-base font-semibold text-heading">Compare two X-rays</h2>
            <p className="mt-1 mb-3 text-xs text-text-muted">
              Then and now, side by side, with what you noticed written next to them.
            </p>
            <ImagingComparisonForm />
          </section>
          <section className="rounded-card border border-border bg-card shadow-[var(--shadow)]">
            <div className="px-4.5 pt-4 pb-2.5">
              <h2 className="text-base font-semibold text-heading">Saved comparisons</h2>
              <p className="text-xs text-text-muted">Signed and kept on the patient&rsquo;s file.</p>
            </div>
            {comparisons.length === 0 ? (
              <p className="border-t border-border/70 px-4.5 py-6 text-[13px] text-text-muted">
                Nothing saved yet. Compare two X-rays and the note lands here.
              </p>
            ) : (
              comparisons.map((item) => (
                <Link
                  key={item.id}
                  href={`/dashboard/imaging/comparisons/${item.id}`}
                  className="flex items-center justify-between gap-3 border-t border-border/70 px-4.5 py-3 hover:bg-muted"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-heading">
                      {item.patient.fullName}
                    </span>
                    <span className="block text-xs text-text-muted">
                      {modalityLabel(item.baselineStudy.modality)}{" "}
                      {item.baselineStudy.acquisitionDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}{" "}
                      → {item.followupStudy.acquisitionDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </span>
                  <span className="flex-none text-xs font-semibold text-primary">Open</span>
                </Link>
              ))
            )}
          </section>
        </div>
      )}
    </div>
  );
}

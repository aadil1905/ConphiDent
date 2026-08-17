"use client";

/* Authenticated short-lived image responses cannot be optimized by Next's public image pipeline. */
/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, Focus, Maximize2, Minus, Plus, RefreshCw, X } from "lucide-react";
import ImagingActionForm from "@/components/imaging/ImagingActionForm";
import { saveImagingAnnotationAction } from "@/app/dashboard/imaging/actions";

export type ImagingGalleryStudy = {
  id: string;
  modality: string;
  modalityLabel: string;
  treatmentStage?: string | null;
  acquisitionDate: string;
  description: string | null;
  clinicalIndication: string | null;
  anatomicalRegion: string | null;
  laterality: string | null;
  toothCodes: string[];
  status: string;
  matchStatus: string;
  sourceName: string;
  patient: { id: number; fullName: string } | null;
  asset: { id: string; contentType: string; sizeBytes: number; originalName: string | null; accessUrl: string; thumbnailUrl: string | null; renderable: boolean } | null;
  annotations: { id: string; label: string; toothCode: string | null; x: number; y: number }[];
  report: { version: number; findings: string | null; impression: string | null; signedAt: string | null; authorName: string } | null;
};

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "long", year: "numeric" });
}

function timeLabel(value: string) {
  return new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}

function stateWord(study: ImagingGalleryStudy) {
  if (study.matchStatus === "UNMATCHED") return "No name on it";
  if (study.status === "REVIEWED") return "Read";
  return "Not read yet";
}

function stateTone(study: ImagingGalleryStudy) {
  if (study.matchStatus === "UNMATCHED") return "bg-warning-bg text-warning";
  if (study.status === "REVIEWED") return "bg-success-bg text-success";
  return "bg-secondary text-heading";
}

const darkButton = "cursor-pointer rounded-control border border-white/25 p-2 text-white hover:bg-white/10";

function Viewer({ study, canAnnotate, close }: { study: ImagingGalleryStudy; canAnnotate: boolean; close: () => void }) {
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [placing, setPlacing] = useState(false);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);

  const asset = study.asset;
  return (
    <div role="dialog" aria-modal="true" aria-label={`${study.modalityLabel} viewer`} className="fixed inset-0 z-[95] flex flex-col bg-[#0b1f27] text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[15px] font-semibold">{study.modalityLabel}</p>
          <p className="text-xs text-white/70">
            {study.patient?.fullName || "No name on this one"} · {timeLabel(study.acquisitionDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {asset?.renderable ? (
            <>
              <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))} aria-label="Zoom out" className={darkButton}><Minus className="size-4" /></button>
              <span className="w-14 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.25))} aria-label="Zoom in" className={darkButton}><Plus className="size-4" /></button>
              <button type="button" onClick={() => setZoom(1)} className="min-h-11 cursor-pointer rounded-control border border-white/25 px-3 text-xs font-semibold text-white hover:bg-white/10">Fit</button>
            </>
          ) : null}
          <button type="button" autoFocus onClick={close} aria-label="Close" className={darkButton}><X className="size-5" /></button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[45vh] overflow-auto bg-black p-4">
          {(asset?.renderable || asset?.thumbnailUrl) && !loadFailed ? (
            <div className="relative mx-auto h-full min-h-[420px] w-full overflow-hidden" style={{ cursor: placing ? "crosshair" : zoom > 1 ? "move" : "default" }}>
              <img
                src={asset.renderable ? asset.accessUrl : asset.thumbnailUrl!}
                alt={`${study.modalityLabel} taken ${dateLabel(study.acquisitionDate)}`}
                onError={() => setLoadFailed(true)}
                onClick={(event) => {
                  if (!placing) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setPoint({
                    x: Math.max(0, Math.min(100, ((event.clientX - bounds.left) / bounds.width) * 100)),
                    y: Math.max(0, Math.min(100, ((event.clientY - bounds.top) / bounds.height) * 100)),
                  });
                  setPlacing(false);
                }}
                className="h-full min-h-[420px] w-full transition-transform select-none object-contain"
                style={{ transform: `scale(${zoom})` }}
              />
              {study.annotations.map((item) => (
                <span
                  key={item.id}
                  role="img"
                  aria-label={`${item.toothCode ? `Tooth ${item.toothCode}: ` : ""}${item.label}`}
                  title={`${item.toothCode ? `Tooth ${item.toothCode}: ` : ""}${item.label}`}
                  className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-pill border-2 border-white bg-[var(--gold-on-ink)] text-[10px] font-bold text-heading"
                  style={{ left: `${item.x}%`, top: `${item.y}%` }}
                >
                  {item.toothCode || "•"}
                </span>
              ))}
              {point ? (
                <span className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-pill border-2 border-white bg-primary font-bold" style={{ left: `${point.x}%`, top: `${point.y}%` }}>+</span>
              ) : null}
            </div>
          ) : (
            <div className="grid h-full min-h-[420px] place-items-center text-center">
              <div>
                <FileImage className="mx-auto size-12 text-white/50" />
                <p className="mt-3 text-[15px] font-semibold">
                  {loadFailed ? "That secure link timed out." : "This file needs a viewer we do not have."}
                </p>
                <p className="mx-auto mt-1 max-w-md text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-white/70">
                  The original is kept exactly as it came in. We do not pretend every format opens the same way.
                </p>
                {loadFailed ? (
                  <button
                    type="button"
                    onClick={() => { setLoadFailed(false); router.refresh(); }}
                    className="mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-white/25 px-3 text-[13px] font-semibold text-white hover:bg-white/10"
                  >
                    <RefreshCw className="size-4" />Get a fresh link
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <aside className="overflow-y-auto border-l border-white/10 bg-[#12303a] p-5">
          <p className="rounded-control border border-[var(--gold-on-ink)]/40 bg-[var(--gold-on-ink)]/10 px-3 py-2.5 text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-[var(--gold-on-ink)]">
            Not for diagnosis unless this screen and viewer have been checked here first.
          </p>
          <dl className="mt-4 grid gap-3 text-[13px]">
            <div>
              <dt className="text-white/60">Patient</dt>
              <dd className="font-semibold">{study.patient?.fullName || "No name yet — match it first"}</dd>
            </div>
            <div>
              <dt className="text-white/60">Taken</dt>
              <dd>{timeLabel(study.acquisitionDate)}</dd>
            </div>
            <div>
              <dt className="text-white/60">Region and teeth</dt>
              <dd>{study.anatomicalRegion || "Not recorded"}{study.toothCodes.length ? ` · FDI ${study.toothCodes.join(", ")}` : ""}</dd>
            </div>
            <div>
              <dt className="text-white/60">Came from</dt>
              <dd>{study.sourceName}</dd>
            </div>
            <div>
              <dt className="text-white/60">The file</dt>
              <dd>{asset?.originalName || "Stored file"} · {asset ? `${(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB` : "unavailable"}</dd>
            </div>
          </dl>
          {asset ? (
            <a href={asset.accessUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center rounded-control border border-white/25 px-3 text-[13px] font-semibold text-white hover:bg-white/10">
              Open the original
            </a>
          ) : null}

          {canAnnotate && asset?.renderable ? (
            <div className="mt-5 border-t border-white/10 pt-4">
              <p className="text-[15px] font-semibold">Mark something on it</p>
              <p className="mt-0.5 text-xs text-white/70">Markers sit on top — the image itself is never touched.</p>
              <button
                type="button"
                onClick={() => { setPlacing(true); setPoint(null); }}
                className="mt-3 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border border-white/25 px-3 text-[13px] font-semibold text-white hover:bg-white/10"
              >
                <Focus className="size-4" />{placing ? "Now tap the spot…" : "Place a marker"}
              </button>
              {point ? (
                <ImagingActionForm action={saveImagingAnnotationAction} label="Save the marker" pendingLabel="Saving…" className="mt-3">
                  <input type="hidden" name="studyId" value={study.id} />
                  <input type="hidden" name="assetId" value={asset.id} />
                  <input type="hidden" name="x" value={point.x} />
                  <input type="hidden" name="y" value={point.y} />
                  <input name="toothCode" inputMode="numeric" maxLength={2} placeholder="Tooth number (optional)" className="min-h-11 w-full rounded-control border border-white/25 bg-[#0b1f27] px-3 text-[13px] text-white" />
                  <textarea name="label" required minLength={2} maxLength={500} rows={2} placeholder="What you can see there" className="mt-2 w-full rounded-control border border-white/25 bg-[#0b1f27] p-3 text-[13px] text-white" />
                </ImagingActionForm>
              ) : null}
            </div>
          ) : null}

          {study.report ? (
            <div className="mt-5 border-t border-white/10 pt-4 text-[13px]">
              <p className="text-[15px] font-semibold">Signed reading · v{study.report.version}</p>
              <p className="mt-0.5 text-white/70">
                {study.report.authorName}{study.report.signedAt ? ` · ${timeLabel(study.report.signedAt)}` : ""}
              </p>
              {study.report.impression ? <p className="mt-2.5 whitespace-pre-wrap">{study.report.impression}</p> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default function ImagingGallery({
  studies,
  canAnnotate = false,
  emptyMessage = "Nothing here yet.",
}: {
  studies: ImagingGalleryStudy[];
  canAnnotate?: boolean;
  emptyMessage?: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = studies.find((item) => item.id === selectedId) || null;
  const groups = useMemo(() => {
    const result = new Map<string, ImagingGalleryStudy[]>();
    for (const study of studies) {
      const key = dateLabel(study.acquisitionDate);
      result.set(key, [...(result.get(key) || []), study]);
    }
    return [...result.entries()];
  }, [studies]);

  if (!studies.length) {
    return (
      <div className="rounded-card border border-dashed border-border-strong bg-card px-5.5 py-8 text-center text-[13px] text-text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-6">
        {groups.map(([date, items]) => (
          <section key={date}>
            <h3 className="mb-2.5 text-[13px] font-semibold text-heading">
              {date}
              <span className="ml-1.5 font-normal text-text-muted">
                · {items.length} X-ray{items.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((study) => (
                <article
                  key={study.id}
                  id={`study-${study.id}`}
                  className={`overflow-hidden rounded-card border bg-card shadow-[var(--shadow)] ${
                    study.matchStatus === "UNMATCHED" ? "border-warning-border border-l-[3px] border-l-[#c4a46c]" : "border-border"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(study.id)}
                    className="group relative block aspect-[4/3] w-full cursor-pointer overflow-hidden bg-[#0b1f27] text-left"
                  >
                    {study.asset?.thumbnailUrl || study.asset?.renderable ? (
                      <img
                        src={study.asset.thumbnailUrl || study.asset.accessUrl}
                        alt=""
                        className="h-full w-full object-contain transition-transform duration-200 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <span className="grid h-full place-items-center text-center text-white/60">
                        <span>
                          <FileImage className="mx-auto size-9" />
                          <span className="mt-2 block text-xs">
                            Details are here
                            <br />
                            the picture needs a viewer
                          </span>
                        </span>
                      </span>
                    )}
                    <span className="absolute top-3 right-3 rounded-control bg-black/60 p-2 text-white">
                      <Maximize2 className="size-4" />
                    </span>
                  </button>

                  <div className="px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-heading">{study.modalityLabel}</p>
                        <p className="mt-0.5 text-xs text-text-muted">
                          {new Date(study.acquisitionDate).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} · {study.sourceName}
                        </p>
                      </div>
                      <div className="flex flex-none flex-col items-end gap-1">
                        <span className={`rounded-pill px-2 py-0.5 text-[11px] font-semibold ${stateTone(study)}`}>
                          {stateWord(study)}
                        </span>
                        {study.treatmentStage ? (
                          <span className="rounded-pill bg-muted px-2 py-0.5 text-[11px] font-semibold text-text-muted">
                            {study.treatmentStage === "PRE_TREATMENT" ? "Before" : study.treatmentStage === "POST_TREATMENT" ? "After" : "Other"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2.5 truncate text-[length:var(--text-body)] leading-[var(--text-body-lh)] text-foreground">
                      {study.patient?.fullName || study.description || "Nobody's name on it yet"}
                    </p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      {study.anatomicalRegion || "Region not recorded"}
                      {study.toothCodes.length ? ` · FDI ${study.toothCodes.join(", ")}` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedId(study.id)}
                      className="mt-3.5 min-h-11 w-full cursor-pointer rounded-control border border-border-strong bg-card text-[13px] font-semibold text-heading hover:bg-muted"
                    >
                      Open it
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
      {selected ? (
        <Viewer study={selected} canAnnotate={canAnnotate && selected.matchStatus === "CONFIRMED"} close={() => setSelectedId(null)} />
      ) : null}
    </>
  );
}

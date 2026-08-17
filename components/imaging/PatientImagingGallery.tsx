import { FileImage } from "lucide-react";
import ImagingGallery, { type ImagingGalleryStudy } from "@/components/imaging/ImagingGallery";
import { signedImagingAssetPath } from "@/lib/imaging-access";
import { IMAGING_MODALITY_LABELS, isRenderableImagingType, type ImagingModality } from "@/lib/imaging";
import { prisma } from "@/lib/prisma";

export default async function PatientImagingGallery({ clinicId, patientId, patientName, canAnnotate, hideWhenEmpty = false }: { clinicId: number; patientId: number; patientName: string; canAnnotate: boolean; hideWhenEmpty?: boolean }) {
  const studies = await prisma.imagingStudy.findMany({
    where: { clinicId, patientId, archivedAt: null, enteredInErrorAt: null },
    orderBy: [{ acquisitionDate: "desc" }, { id: "desc" }],
    take: 48,
    include: { source: { select: { name: true } }, assets: { where: { role: { in: ["THUMBNAIL", "PREVIEW", "ORIGINAL"] } }, take: 3, select: { id: true, role: true, contentType: true, sizeBytes: true, originalName: true } }, annotations: { where: { status: "ACTIVE" }, select: { id: true, label: true, toothCode: true, geometry: true } }, reports: { where: { status: "FINAL" }, orderBy: { version: "desc" }, take: 1, include: { author: { select: { fullName: true } } } } },
  });
  if (hideWhenEmpty && studies.length === 0) return null;
  const galleryStudies: ImagingGalleryStudy[] = studies.map((study) => {
    const original = study.assets.find((asset) => asset.role === "ORIGINAL") || null;
    const thumbnail = study.assets.find((asset) => asset.role === "THUMBNAIL") || null;
    return {
      id: study.id, modality: study.modality,
      modalityLabel: IMAGING_MODALITY_LABELS[study.modality as ImagingModality] || study.modality.replaceAll("_", " "),
      treatmentStage: study.treatmentStage, acquisitionDate: study.acquisitionDate.toISOString(), description: study.description,
      clinicalIndication: study.clinicalIndication, anatomicalRegion: study.anatomicalRegion, laterality: study.laterality,
      toothCodes: study.toothCodes, status: study.status, matchStatus: study.matchStatus,
      sourceName: study.source?.name || study.sourceType.replaceAll("_", " "), patient: { id: patientId, fullName: patientName },
      asset: original ? { id: original.id, contentType: original.contentType, sizeBytes: original.sizeBytes, originalName: original.originalName, accessUrl: signedImagingAssetPath(original.id, clinicId), thumbnailUrl: thumbnail ? signedImagingAssetPath(thumbnail.id, clinicId) : null, renderable: isRenderableImagingType(original.contentType) } : null,
      annotations: study.annotations.flatMap((annotation) => { const geometry = annotation.geometry as { x?: unknown; y?: unknown }; return typeof geometry.x === "number" && typeof geometry.y === "number" ? [{ id: annotation.id, label: annotation.label, toothCode: annotation.toothCode, x: geometry.x, y: geometry.y }] : []; }),
      report: study.reports[0] ? { version: study.reports[0].version, findings: study.reports[0].findings, impression: study.reports[0].impression, signedAt: study.reports[0].signedAt?.toISOString() || null, authorName: study.reports[0].author.fullName } : null,
    };
  });
  return <section id="patient-xrays" className="scroll-mt-24 rounded-card border border-border bg-card p-5 shadow-[var(--shadow)] sm:p-6"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-bold text-heading"><FileImage className="size-5 text-primary" />Patient X-rays</h2><p className="mt-1 text-sm text-text-muted">Images remain linked to this patient and their recorded FDI teeth.</p></div>{studies.length ? <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{studies.length} image{studies.length === 1 ? "" : "s"}</span> : null}</div><ImagingGallery studies={galleryStudies} canAnnotate={canAnnotate} emptyMessage="No X-rays have been uploaded for this patient yet." /></section>;
}

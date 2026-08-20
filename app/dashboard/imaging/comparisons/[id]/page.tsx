export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, GitCompareArrows } from "lucide-react";
import { hasFeature } from "@/lib/features";
import { signedImagingAssetPath } from "@/lib/imaging-access";
import { isRenderableImagingType } from "@/lib/imaging";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import ImagingComparisonViewer from "@/components/imaging/ImagingComparisonViewer";

export default async function ImagingComparisonPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("viewImaging");
  if (!(await hasFeature(user.clinicId, "imaging"))) redirect("/dashboard");
  const comparison = await prisma.imagingComparison.findFirst({
    where: { id: (await params).id, clinicId: user.clinicId, status: "FINAL" },
    include: {
      patient: { select: { id: true, fullName: true } },
      author: { select: { fullName: true } },
      treatmentPlan: { select: { id: true, title: true } },
      completedFinding: { select: { id: true, toothCodeSnapshot: true, condition: true } },
      baselineStudy: { include: { assets: { where: { role: { in: ["THUMBNAIL", "PREVIEW", "ORIGINAL"] } }, orderBy: { role: "asc" }, take: 1 } } },
      followupStudy: { include: { assets: { where: { role: { in: ["THUMBNAIL", "PREVIEW", "ORIGINAL"] } }, orderBy: { role: "asc" }, take: 1 } } },
    },
  });
  if (!comparison || comparison.baselineStudy.patientId !== comparison.patientId || comparison.followupStudy.patientId !== comparison.patientId) notFound();
  const baselineAsset = comparison.baselineStudy.assets.find((asset) => asset.role === "ORIGINAL") || null;
  const followupAsset = comparison.followupStudy.assets.find((asset) => asset.role === "ORIGINAL") || null;
  const synchronized = comparison.baselineStudy.modality === comparison.followupStudy.modality && comparison.baselineStudy.anatomicalRegion === comparison.followupStudy.anatomicalRegion && Boolean(baselineAsset && followupAsset && isRenderableImagingType(baselineAsset.contentType) && isRenderableImagingType(followupAsset.contentType));
  return <div className="space-y-6 pb-12"><Link href="/dashboard/imaging" className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="size-4" />Imaging worklist</Link><header><p className="flex items-center gap-2 text-sm font-semibold text-primary"><GitCompareArrows className="size-4" />Signed derived clinical record</p><h1 className="mt-1 text-3xl font-black">Pre-/post-treatment comparison</h1><p className="mt-2 text-sm text-text-muted">{comparison.patient.fullName} · signed by {comparison.author.fullName} on {comparison.signedAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p></header><ImagingComparisonViewer baseline={{ label: "Pre-treatment", modality: comparison.baselineStudy.modality, acquiredAt: comparison.baselineStudy.acquisitionDate.toISOString(), region: comparison.baselineStudy.anatomicalRegion, url: baselineAsset ? signedImagingAssetPath(baselineAsset.id, user.clinicId) : null, renderable: Boolean(baselineAsset && isRenderableImagingType(baselineAsset.contentType)) }} followup={{ label: "Post-treatment", modality: comparison.followupStudy.modality, acquiredAt: comparison.followupStudy.acquisitionDate.toISOString(), region: comparison.followupStudy.anatomicalRegion, url: followupAsset ? signedImagingAssetPath(followupAsset.id, user.clinicId) : null, renderable: Boolean(followupAsset && isRenderableImagingType(followupAsset.contentType)) }} compatibilityNote={comparison.compatibilityNote || "Compatibility was not recorded."} synchronized={synchronized} /><section className="rounded-card border bg-card p-5 shadow-[var(--shadow)]"><h2 className="font-bold">Dentist comparison note</h2><p className="mt-3 whitespace-pre-wrap text-sm text-heading">{comparison.note}</p><dl className="mt-5 grid gap-3 border-t pt-4 text-sm sm:grid-cols-2"><div><dt className="text-text-muted">Treatment plan</dt><dd className="font-semibold">{comparison.treatmentPlan?.title || "Not linked"}</dd></div><div><dt className="text-text-muted">Completed procedure</dt><dd className="font-semibold">{comparison.completedFinding ? `FDI ${comparison.completedFinding.toothCodeSnapshot} · ${comparison.completedFinding.condition.replaceAll("_", " ")}` : "Not linked"}</dd></div></dl><Link href={`/dashboard/patients/${comparison.patient.id}#imaging`} className="mt-4 inline-block text-sm font-semibold text-primary hover:underline">Open in Patient 360</Link></section></div>;
}

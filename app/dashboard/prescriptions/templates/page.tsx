export const dynamic = "force-dynamic";

import Link from "next/link";
import { Pill } from "lucide-react";
import PrescriptionTemplateManager from "@/components/clinical/PrescriptionTemplateManager";
import PageIntro from "@/components/dashboard/PageIntro";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";
import type { StructuredMedication } from "@/lib/prescription-core";

export default async function PrescriptionTemplatesPage() {
  const user = await requireFeature("clinical");
  const templates = await prisma.prescriptionTemplate.findMany({
    where: { clinicId: user.clinicId },
    select: { id: true, name: true, diagnosis: true, items: true, active: true, reviewedAt: true, updatedAt: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const managedTemplates = templates.map((template) => ({ ...template, items: template.items as unknown as StructuredMedication[], reviewedAt: template.reviewedAt?.toISOString() || null, updatedAt: template.updatedAt.toISOString() }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageIntro title="Prescription sets" description="Your clinic's usual combinations, ready to load when you prescribe. Archiving a set never touches scripts already written with it." />
        <Link href="/dashboard/prescriptions/new" className="inline-flex min-h-11 items-center gap-2 rounded-control border border-primary bg-primary px-4 text-[13px] font-semibold text-white hover:bg-primary-hover">
          <Pill className="size-4" aria-hidden />Write a script
        </Link>
      </div>
      <PrescriptionTemplateManager templates={managedTemplates}/>
    </div>
  );
}

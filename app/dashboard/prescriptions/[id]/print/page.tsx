export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { PrescriptionDocument } from "@/components/documents/B6ClinicalDocuments";
import { PrintActions } from "@/components/documents/PrintActions";
import { requireFeature } from "@/lib/features";
import { prisma } from "@/lib/prisma";

export default async function PrintPrescriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireFeature("clinical");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [prescription, clinic] = await Promise.all([
    prisma.prescription.findFirst({
      where: { id, clinicId: user.clinicId, status: "ISSUED", cancelledAt: null },
      include: { patient: true, medicationItems: { orderBy: { sortOrder: "asc" } } },
    }),
    prisma.clinic.findUnique({
      where: { id: user.clinicId },
      select: { name: true, brandName: true, logoUrl: true, accentColor: true, address: true, phone: true, email: true, gstin: true, registrationNumber: true },
    }),
  ]);
  if (!prescription || !clinic) notFound();
  if (!prescription.medicationItems.length && !prescription.medicines.trim()) notFound();

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-6 text-slate-950 print:bg-white print:p-0">
      <PrintActions backHref={`/dashboard/patients/${prescription.patientId}#prescriptions`} backLabel="Back to patient" printLabel="Print prescription" />
      <PrescriptionDocument clinic={clinic} prescription={prescription} />
    </main>
  );
}

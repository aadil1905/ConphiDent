export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { PrescriptionDocument } from "@/components/documents/B6ClinicalDocuments";
import { PrintActions } from "@/components/documents/PrintActions";
import SendPrescriptionWhatsAppButton from "@/components/clinical/SendPrescriptionWhatsAppButton";
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
      {/* Sending a script on WhatsApp is a Run 3 requirement and the button for
          it has existed all along — it lost its home when Phase B removed the
          prescription detail page, and has been rendered nowhere since. The
          sheet is what you hand over, so this is where handing it over belongs.
          The invoice does the same thing from its own detail page. */}
      <div className="mx-auto mb-4 flex w-full max-w-[125mm] justify-end print:hidden">
        <SendPrescriptionWhatsAppButton prescriptionId={prescription.id} />
      </div>
      <PrescriptionDocument clinic={clinic} prescription={prescription} />
    </main>
  );
}

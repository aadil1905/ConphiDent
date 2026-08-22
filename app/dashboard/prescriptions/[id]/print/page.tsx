export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { PrescriptionDocument } from "@/components/documents/B6ClinicalDocuments";
import { PrescriptionScreen, ScreenHeader, ScreenSheet } from "@/components/documents/DocumentScreenView";
import PrintDocumentButton from "@/components/documents/PrintDocumentButton";
import SendPrescriptionWhatsAppButton from "@/components/clinical/SendPrescriptionWhatsAppButton";
import { formatPatientAgeSnapshot } from "@/lib/prescription-core";
import { requireFeature } from "@/lib/features";
import { loadClinicDocumentBrand } from "@/lib/clinic-document";
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
    loadClinicDocumentBrand(user.clinicId),
  ]);
  if (!prescription || !clinic) notFound();
  if (!prescription.medicationItems.length && !prescription.medicines.trim()) notFound();

  return (
    <>
      <ScreenSheet>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href={`/dashboard/patients/${prescription.patientId}#prescriptions`}
            className="inline-flex min-h-11 items-center rounded-control border border-border-strong bg-card px-3.5 text-[length:var(--text-secondary)] font-semibold text-heading hover:bg-muted"
          >
            ← Back to the patient
          </Link>
          {/* Print and WhatsApp sit together: both are ways of handing the
              script over, and both are the only places the A4 template is
              used. Everything else on this page is the screen record. */}
          <div className="flex flex-wrap items-center gap-3">
            <SendPrescriptionWhatsAppButton prescriptionId={prescription.id} />
            <PrintDocumentButton label="Print prescription" />
          </div>
        </div>
        <ScreenHeader
          eyebrow={`Prescription RX-${prescription.id}-V${prescription.version}`}
          title={prescription.patient.fullName}
          meta={[formatPatientAgeSnapshot(prescription.patientAgeSnapshot) ?? "", prescription.patientSexSnapshot ?? "", prescription.patient.phone].filter(Boolean)}
        />
        <PrescriptionScreen prescription={prescription} principalName={clinic.principalName} />
      </ScreenSheet>

      {/* Paper only. Hidden on screen, laid out for the printer. */}
      <div className="hidden print:block">
        <PrescriptionDocument clinic={clinic} prescription={prescription} />
      </div>
    </>
  );
}

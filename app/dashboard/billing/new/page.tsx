export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import InvoiceForm from "@/components/billing/InvoiceForm";
import Link from "next/link";
import WorkPage, { RailCard } from "@/components/lists/WorkPage";
import { rupees } from "@/lib/format";
import { requireFeature } from "@/lib/features";
import { nextInvoiceNumber, normalizeInvoicePrefix } from "@/lib/invoice-number";

const appointmentSelect = {
  id: true,
  appointmentDate: true,
  appointmentTime: true,
  treatment: true,
  status: true,
};

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ patientId?: string; visit?: string; fromPatient?: string }> }) {
  const user = await requireFeature("billing");
  const { patientId, visit, fromPatient } = await searchParams;
  const invoicePrefix = normalizeInvoicePrefix(user.clinic.invoicePrefix);
  const [patients, plans, latestInvoice] = await Promise.all([
    prisma.patient.findMany({
      where: { clinicId: user.clinicId, archivedAt: null },
      select: {
        id: true,
        fullName: true,
        phone: true,
        appointments: {
          where: { status: { not: "Cancelled" }, archivedAt: null },
          select: appointmentSelect,
          orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.treatmentPlan.findMany({
      select: { id: true, title: true, patientId: true, visitDate: true, items: { select: { name: true, price: true } } },
      where: { clinicId: user.clinicId, cancelledAt: null, status: { not: "Cancelled" } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.invoice.findMany({ where: { clinicId: user.clinicId, invoiceNumber: { startsWith: `${invoicePrefix}-` } }, select: { invoiceNumber: true } }),
  ]);
  const invoiceNumberPreview = nextInvoiceNumber(invoicePrefix, latestInvoice.map((invoice) => invoice.invoiceNumber));

  const selectedId = Number(patientId) || null;
  const selectedPatient = selectedId ? patients.find((entry) => entry.id === selectedId) : undefined;
  const openInvoices = selectedId
    ? await prisma.invoice.findMany({
        where: { clinicId: user.clinicId, patientId: selectedId, voidedAt: null, status: { not: "Paid" } },
        select: {
          totalAmount: true,
          payments: { where: { status: "POSTED", reversedAt: null }, select: { amount: true } },
        },
      })
    : [];
  const openBalance = openInvoices.reduce((sum, invoice) => {
    const paid = invoice.payments.reduce((total, payment) => total + payment.amount, 0);
    return sum + Math.max(0, invoice.totalAmount - paid);
  }, 0);
  const firstName = selectedPatient?.fullName.split(" ")[0] ?? "";

  return (
    <WorkPage
      title="New invoice"
      sub="Bill the work you did. It attaches to the visit you pick — or stands on its own if there is none."
      context={
        <>
          <RailCard title="This document">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="text-text-muted">Number</span>
              <span className="font-semibold tabular-nums text-heading">{invoiceNumberPreview}</span>
            </div>
            <p className="text-xs text-text-muted">
              A preview. The real number is allocated when you create the document, so two people
              billing at once never collide.
            </p>
          </RailCard>

          {selectedPatient && (
            <RailCard title={`${firstName}'s account`}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-text-muted">Already owes</span>
                <span
                  className={`font-semibold tabular-nums ${openBalance > 0 ? "text-danger" : "text-success"}`}
                >
                  {rupees(openBalance)}
                </span>
              </div>
              <Link
                href={`/dashboard/patients/${selectedPatient.id}?tab=Money`}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Open their file
              </Link>
            </RailCard>
          )}

          <RailCard title="Before you issue it">
            <p className="text-[13px] text-text-muted">
              Once issued, the wording and figures are fixed — an invoice cannot be edited. If it is
              wrong you void it and raise a new one, and both stay on the record.
            </p>
          </RailCard>
        </>
      }
    >
      <InvoiceForm patients={patients} plans={plans} initialPatientId={Number(patientId) || undefined} initialVisit={visit} invoiceNumberPreview={invoiceNumberPreview} fromPatient={fromPatient === "1"} />
    </WorkPage>
  );
}

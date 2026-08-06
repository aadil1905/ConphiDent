export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { clinicDisplayName } from "@/lib/clinic-config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PaymentForm from "@/components/billing/PaymentForm";
import SendInvoiceWhatsAppButton from "@/components/billing/SendInvoiceWhatsAppButton";

const receiptTreatments = ["Consulting", "Scaling & Polishing", "Extractions", "Silver Fillings", "Tooth Colour Fillings", "Root Canal Treatment", "Fixed Partial Denture", "Removable Denture", "Minor Surgery", "X-Rays"];

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fromPatient?: string; visit?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { fromPatient, visit } = await searchParams;
  const invoiceId = Number(id);
  if (!Number.isInteger(invoiceId)) notFound();

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, patient: { clinicId: user.clinicId } },
    include: {
      patient: true,
      treatmentPlan: { include: { selectedTeeth: { orderBy: { toothNumber: "asc" } }, items: { orderBy: { id: "asc" } } } },
      payments: { orderBy: { paidAt: "desc" } },
    },
  });
  if (!invoice) notFound();

  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const outstanding = invoice.totalAmount - paid;
  const effectiveStatus = outstanding === 0 ? "Paid" : invoice.dueDate && invoice.dueDate < new Date() ? "Overdue" : paid > 0 ? "Partially Paid" : "Unpaid";
  const treatmentTeeth = invoice.treatmentPlan?.selectedTeeth.length ? invoice.treatmentPlan.selectedTeeth.map((tooth) => tooth.toothNumber).join(", ") : invoice.treatmentPlan?.toothNumber;
  const treatmentName = invoice.treatmentPlan?.title || "Treatment";
  const clinicName = clinicDisplayName(user.clinic);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href={fromPatient ? `/dashboard/patients/${fromPatient}${visit ? `?visit=${visit}` : ""}` : "/dashboard/billing"} className="text-sm text-primary hover:underline">{fromPatient ? "Back to patient" : "Back to billing"}</Link>
          <h1 className="mt-2 text-3xl font-bold">{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-muted-foreground">Invoice for <Link className="text-primary hover:underline" href={`/dashboard/patients/${invoice.patientId}`}>{invoice.patient.fullName}</Link></p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className={`rounded-full px-3 py-1 text-sm font-medium ${effectiveStatus === "Overdue" ? "bg-rose-100 text-rose-800" : effectiveStatus === "Paid" ? "bg-emerald-100 text-emerald-800" : "bg-muted"}`}>{effectiveStatus}</p>
          <SendInvoiceWhatsAppButton invoiceId={invoice.id} />
        </div>
      </div>

      <section className="overflow-hidden rounded-[28px] border-2 border-slate-800 bg-white p-4 text-slate-950 shadow-sm sm:p-7">
        <div className="grid gap-4 border-b-2 border-slate-800 pb-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="text-xs font-semibold leading-relaxed"><p className="font-bold">{clinicName.toUpperCase()}</p><p>Clinic invoice</p></div>
          <div className="flex items-center justify-center gap-3 text-center"><div className="grid size-14 place-items-center rounded-2xl bg-sky-700 text-xl font-black text-white">{clinicName.slice(0, 1).toUpperCase()}</div><div><p className="font-serif text-xl font-bold leading-none sm:text-2xl">{clinicName}</p><p className="mt-1 text-[9px] font-semibold uppercase tracking-wide">Patient care & clinical services</p></div></div>
          <div className="text-right text-xs font-medium leading-relaxed"><p>{user.clinic.address || "Clinic address available on request"}</p><p>{user.clinic.phone || user.clinic.email || ""}</p></div>
        </div>
        <div className="grid gap-2 border-b border-slate-800 py-3 text-sm font-semibold sm:grid-cols-2"><p>No : <span className="ml-3 text-xl font-bold text-rose-700">{invoice.invoiceNumber}</span></p><p className="sm:text-right">Date : <span className="ml-2">{invoice.issueDate.toLocaleDateString("en-IN")}</span></p></div>
        <div className="space-y-3 border-b border-slate-800 py-3 text-sm"><p>Received with thanks from : <span className="ml-2 border-b border-slate-900 px-1 font-semibold">{invoice.patient.fullName}</span></p><p>The sum of Rs. : <span className="ml-2 border-b border-slate-900 px-1 font-semibold">{invoice.totalAmount.toLocaleString("en-IN")}</span></p></div>
        <div className="mt-3 overflow-hidden border border-slate-800 text-sm">
          <div className="grid grid-cols-[1fr_33%] border-b border-slate-800 bg-slate-50 font-bold"><p className="px-3 py-2 text-base">TREATMENT</p><p className="border-l border-slate-800 px-3 py-2 text-center">Amount</p></div>
          {(invoice.treatmentPlan?.items.length ? invoice.treatmentPlan.items : receiptTreatments.map((name) => ({ name, price: 0 }))).map((item) => <div key={item.name} className="grid min-h-8 grid-cols-[1fr_33%] border-b border-slate-800 last:border-b-0"><p className="px-3 py-1.5 font-semibold">{item.name}</p><p className="border-l border-slate-800 px-3 py-1.5 text-right">{item.price ? `Rs. ${item.price.toLocaleString("en-IN")}` : ""}</p></div>)}
          <div className="grid grid-cols-[1fr_33%] border-t border-slate-800 font-bold"><p className="px-3 py-2 text-right">Total</p><p className="border-l border-slate-800 px-3 py-2 text-right">Rs. {invoice.totalAmount.toLocaleString("en-IN")}</p></div>
        </div>
        {invoice.treatmentPlan ? <p className="mt-2 text-xs"><span className="font-bold">Selected treatment:</span> {treatmentName}{treatmentTeeth ? ` (Teeth: ${treatmentTeeth})` : ""}</p> : null}
        <div className="mt-3 min-h-24 border-t border-slate-800 pt-3 text-sm"><span className="font-bold">Diagnosis :- </span><span className="whitespace-pre-wrap">{invoice.notes || ""}</span></div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card><CardHeader><CardTitle>Record payment</CardTitle></CardHeader><CardContent><PaymentForm invoiceId={invoice.id} outstanding={outstanding} /></CardContent></Card>
        <Card><CardContent className="space-y-3 pt-5 text-sm"><p><span className="text-muted-foreground">Total:</span> <strong>Rs. {invoice.totalAmount.toLocaleString("en-IN")}</strong></p><p><span className="text-muted-foreground">Paid:</span> <strong className="text-emerald-700">Rs. {paid.toLocaleString("en-IN")}</strong></p><p><span className="text-muted-foreground">Outstanding:</span> <strong className="text-amber-700">Rs. {outstanding.toLocaleString("en-IN")}</strong></p><p><span className="text-muted-foreground">Due:</span> {invoice.dueDate?.toLocaleDateString("en-IN") || "Not set"}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Payment history</CardTitle></CardHeader>
        <CardContent>{invoice.payments.length === 0 ? <p className="py-5 text-sm text-muted-foreground">No payments recorded.</p> : <div className="divide-y">{invoice.payments.map((payment) => <div key={payment.id} className="flex justify-between py-3 text-sm"><div><p className="font-medium">{payment.method} · {payment.paidAt.toLocaleDateString("en-IN")}</p><p className="text-muted-foreground">{payment.recordedBy ? `Recorded by ${payment.recordedBy}` : "Staff member not recorded"}{payment.notes ? ` · ${payment.notes}` : ""}</p></div><p className="font-semibold text-emerald-700">₹{payment.amount.toLocaleString("en-IN")}</p></div>)}</div>}</CardContent>
      </Card>
    </div>
  );
}

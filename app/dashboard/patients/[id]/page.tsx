export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  FileText,
  IndianRupee,
  Pencil,
  Pill,
  Stethoscope,
  UserRound,
  CalendarPlus,
  ReceiptText,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StatusBadge from "@/components/appointments/StatusBadge";
import DentalChartSummary from "@/components/clinical/DentalChartSummary";
import type { AppointmentStatus } from "@/types/appointment";
import { preparePatientPortalAction } from "./actions";

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function formatDateTime(date: Date) {
  return date.toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function dateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function money(amount: number | null | undefined) {
  return `₹${(amount ?? 0).toLocaleString("en-IN")}`;
}

function sameVisit(date: Date, selectedVisit: string) {
  return dateKey(date) === selectedVisit;
}

function localDayRange(dayKey: string) {
  return {
    start: new Date(`${dayKey}T00:00:00.000+05:30`),
    end: new Date(`${dayKey}T23:59:59.999+05:30`),
  };
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-muted/20 p-5 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export default async function PatientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ visit?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { visit } = await searchParams;

  const patient = await prisma.patient.findFirst({
    where: { id: Number(id), clinicId: user.clinicId },
    include: {
      appointments: {
        orderBy: [{ appointmentDate: "desc" }, { appointmentTime: "desc" }],
      },
      clinicalRecords: {
        orderBy: { visitDate: "desc" },
      },
      treatmentPlans: {
        include: { service: true, selectedTeeth: true },
        orderBy: { updatedAt: "desc" },
      },
      invoices: {
        include: { payments: true, treatmentPlan: true },
        orderBy: { createdAt: "desc" },
      },
      prescriptions: {
        orderBy: { prescribedOn: "desc" },
      },
      intakeRequests: {
        where: { status: { in: ["COMPLETED", "REVIEWED"] }, consentGiven: true, patientSignature: { not: null } },
        orderBy: { completedAt: "desc" },
        take: 1,
      },
      portalAccess: true,
    },
  });

  if (!patient) notFound();

  const visitMap = new Map<string, Date>();
  for (const appointment of patient.appointments.filter((item) => item.status === "Completed")) {
    visitMap.set(dateKey(appointment.appointmentDate), appointment.appointmentDate);
  }

  const visits = Array.from(visitMap.entries())
    .map(([key, date]) => ({ key, date }))
    .sort((left, right) => right.date.getTime() - left.date.getTime());
  const selectedVisit = visit && visitMap.has(visit) ? visit : visits[0]?.key;

  const signedIntake = patient.intakeRequests[0];
  const visitPrescriptions = selectedVisit
    ? patient.prescriptions.filter((prescription) =>
        sameVisit(prescription.prescribedOn, selectedVisit),
      )
    : patient.prescriptions;
  const relatedPlans = selectedVisit
    ? patient.treatmentPlans.filter((plan) => plan.visitDate ? sameVisit(plan.visitDate, selectedVisit) : false)
    : patient.treatmentPlans;
  const relatedInvoices = selectedVisit
    ? patient.invoices.filter((invoice) => sameVisit(invoice.issueDate, selectedVisit))
    : patient.invoices;
  const openInvoice = patient.invoices.find((invoice) => invoice.payments.reduce((paid, payment) => paid + payment.amount, 0) < invoice.totalAmount);
  const selectedRange = selectedVisit ? localDayRange(selectedVisit) : null;
  const visitDentalChartEntries = selectedRange
    ? await prisma.dentalChartEntry.findMany({
        where: {
          patientId: patient.id,
          visitDate: { gte: selectedRange.start, lte: selectedRange.end },
        },
        orderBy: { toothNumber: "asc" },
      })
    : [];

  const totalBilled = relatedInvoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0);
  const totalPaid = relatedInvoices.reduce(
    (sum, invoice) => sum + invoice.payments.reduce((paid, payment) => paid + payment.amount, 0),
    0,
  );
  const outstanding = totalBilled - totalPaid;
  return (
    <div className="mx-auto max-w-[1480px] space-y-6">
      <section className="overflow-hidden rounded-3xl border bg-gradient-to-br from-white via-white to-primary/[0.06] shadow-sm">
        <div className="flex flex-col gap-5 px-5 py-5 sm:px-7 sm:py-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="hidden size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-xl font-bold uppercase text-primary-foreground shadow-sm sm:flex">
              {patient.fullName.trim().charAt(0)}
            </div>
            <div className="min-w-0">
          <Link
            href="/dashboard/patients"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition hover:-translate-x-0.5"
          >
                <ArrowLeft className="size-4" /> Back to patients
          </Link>
              <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">
                {patient.fullName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span>{patient.phone}</span>
                <span className="hidden text-border sm:inline">•</span>
                <span>
                  {visits.length} recorded visit{visits.length === 1 ? "" : "s"}
                </span>
                {selectedVisit && (
                  <>
                    <span className="hidden text-border sm:inline">•</span>
                    <span>Viewing {formatDate(new Date(`${selectedVisit}T12:00:00+05:30`))}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link href={`/dashboard/appointments/new?patientId=${patient.id}&returnTo=${encodeURIComponent(`/dashboard/patients/${patient.id}${selectedVisit ? `?visit=${selectedVisit}` : ""}`)}`} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2.5 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary/90">
              <CalendarPlus className="size-4" /> Appointment
            </Link>
            <Link href={`/dashboard/clinical-workspace/${patient.id}?visitDate=${selectedVisit ?? ""}&fromPatient=1`} className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-primary/30 hover:bg-primary/5">
              <Stethoscope className="size-4" /> Clinical chart
            </Link>
            {signedIntake ? <Link href={`/dashboard/patients/${patient.id}/case-paper`} className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-primary/30 hover:bg-primary/5"><FileText className="size-4" /> View case paper</Link> : null}
            <Link href={`/dashboard/treatment-plans/new?patientId=${patient.id}${selectedVisit ? `&visitDate=${selectedVisit}` : ""}`} className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-primary/30 hover:bg-primary/5">
              <ClipboardList className="size-4" /> Plan
            </Link>
            <Link href={`/dashboard/billing/new?patientId=${patient.id}&fromPatient=1${selectedVisit ? `&visit=${selectedVisit}` : ""}`} className="inline-flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-800 transition hover:border-primary/30 hover:bg-primary/5">
              <ReceiptText className="size-4" /> Create new invoice
            </Link>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
        <p className="text-sm font-bold text-sky-950">Patient portal</p>
        {patient.portalAccess ? <p className="mt-1 text-sm text-sky-900">Foundation prepared. Patient sign-in is intentionally unavailable until a verified SMS or production WhatsApp OTP channel is configured and tested.</p> : <p className="mt-1 text-sm text-sky-900">Prepare this patient&apos;s portal record now. This does not grant access or send a message.</p>}
        <form action={preparePatientPortalAction} className="mt-3"><input type="hidden" name="patientId" value={patient.id} /><button className="rounded-xl border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100">{patient.portalAccess ? "Refresh portal readiness" : "Prepare patient portal"}</button></form>
      </section>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarDays className="size-5 text-primary" /> Visit dates
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a completed visit to update every clinical and billing section below.
          </p>
        </CardHeader>
        <CardContent>
          {visits.length === 0 ? (
            <EmptyState>No completed appointment visits are saved yet.</EmptyState>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {visits.map((item) => (
                <Link
                  key={item.key}
                  href={`/dashboard/patients/${patient.id}?visit=${item.key}`}
                  aria-current={selectedVisit === item.key ? "page" : undefined}
                  className={`shrink-0 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md ${
                    selectedVisit === item.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-white hover:border-primary/40 hover:text-primary"
                  }`}
                >
                  {formatDate(item.date)}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <UserRound className="size-5 text-primary" /> Patient details
            </CardTitle>
            <Link href={`/dashboard/patients/${patient.id}/edit`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5">
              <Pencil className="size-3.5" /> Edit patient
            </Link>
          </CardHeader>
          <CardContent className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <p>
              <span className="block text-muted-foreground">Phone</span>
              <span className="font-semibold">{patient.phone}</span>
            </p>
            <p>
              <span className="block text-muted-foreground">Email</span>
              <span className="font-semibold">{patient.email || "Not provided"}</span>
            </p>
            <p>
              <span className="block text-muted-foreground">Date of birth</span>
              <span className="font-semibold">
                {patient.dateOfBirth ? formatDate(patient.dateOfBirth) : "Not provided"}
              </span>
            </p>
            <p>
              <span className="block text-muted-foreground">Gender</span>
              <span className="font-semibold">{patient.gender || "Not specified"}</span>
            </p>
            <p>
              <span className="block text-muted-foreground">Address</span>
              <span className="font-semibold">{patient.address || "Not provided"}</span>
            </p>
            <p className="sm:col-span-2 lg:col-span-3">
              <span className="block text-muted-foreground">Medical notes</span>
              <span className="whitespace-pre-wrap font-semibold">
                {patient.medicalNotes || "No medical notes recorded."}
              </span>
            </p>
          </CardContent>
        </Card>

        {/* Patient timeline, communication, recovery, and laboratory summaries are intentionally omitted here. */}
        {/*
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2"><MessageCircle className="size-5 text-primary" /> Communication</CardTitle>
              <Link href="/dashboard/conversations" className="text-sm font-semibold text-primary hover:underline">Open inbox</Link>
            </CardHeader>
            <CardContent>
              {!conversation ? <EmptyState>No WhatsApp conversation is linked to this patient&apos;s phone yet.</EmptyState> : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/50 p-3 text-sm"><span className="font-semibold">{conversation.status.replaceAll("_", " ")}</span><span className="text-muted-foreground">Last activity {formatDateTime(conversation.lastMessageAt)}</span></div>
                  {conversation.messages.slice(0, 5).map((message) => <div key={message.id} className={`rounded-xl p-3 text-sm ${message.direction === "OUTBOUND" ? "ml-6 bg-primary/10" : "mr-6 bg-muted/60"}`}><p className="whitespace-pre-wrap">{message.content}</p><p className="mt-1 text-xs text-muted-foreground">{message.direction === "OUTBOUND" ? "Clinic" : "Patient"} · {formatDateTime(message.createdAt)} · {message.deliveryStatus}</p></div>)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="flex items-center gap-2"><BellRing className="size-5 text-primary" /> Follow-up and laboratory</CardTitle>
              <div className="flex gap-3"><Link href="/dashboard/follow-ups" className="text-sm font-semibold text-primary hover:underline">Recovery queue</Link><Link href="/dashboard/laboratory" className="text-sm font-semibold text-primary hover:underline">Lab cases</Link></div>
            </CardHeader>
            <CardContent className="space-y-4">
              {followUps.length === 0 ? <EmptyState>No recovery tasks are open or recorded for this patient.</EmptyState> : <div className="space-y-2">{followUps.slice(0, 4).map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm"><div className="min-w-0"><p className="font-semibold">{task.taskType.replaceAll("_", " ")}</p><p className="truncate text-muted-foreground">{task.status} · due {formatDateTime(task.scheduledFor)}</p></div><span className="shrink-0 text-xs font-semibold text-primary">{task.channel}</span></div>)}</div>}
              {patient.labCases.length === 0 ? <p className="text-sm text-muted-foreground">No laboratory cases are attached to this patient.</p> : <div className="space-y-2">{patient.labCases.slice(0, 4).map((labCase) => <div key={labCase.id} className="flex items-center justify-between gap-3 rounded-xl bg-amber-50/70 p-3 text-sm"><div><p className="font-semibold">{labCase.caseType} · {labCase.labName}</p><p className="text-muted-foreground">{labCase.status.replaceAll("_", " ")}{labCase.dueDate ? ` · due ${formatDate(labCase.dueDate)}` : ""}</p></div><FlaskConical className="size-4 shrink-0 text-amber-700" /></div>)}</div>}
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-primary" /> Patient activity timeline</CardTitle><p className="text-sm text-muted-foreground">Chronological events from care, revenue, laboratory, recovery, and WhatsApp activity.</p></CardHeader>
          <CardContent>{timeline.length === 0 ? <EmptyState>No patient activity has been recorded yet.</EmptyState> : <ol className="divide-y">{timeline.map((event) => <li key={event.id} className="flex gap-3 py-3 text-sm"><span className={`mt-0.5 size-2 shrink-0 rounded-full bg-current ${event.tone}`} /><div className="min-w-0 flex-1"><Link href={event.href} className="font-semibold hover:text-primary hover:underline">{event.title}</Link><p className="mt-1 text-xs text-muted-foreground">{formatDateTime(event.at)}</p></div></li>)}</ol>}</CardContent>
        </Card>

        */}
        <Card className="border-slate-200/80 bg-slate-50/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Visit overview</CardTitle>
            <p className="text-sm text-muted-foreground">
              A quick snapshot of this patient&apos;s recorded care.
            </p>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">Visits</p><p className="mt-1 text-xl font-bold">{visits.length}</p></div>
            <div className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">Clinical records</p><p className="mt-1 text-xl font-bold">{patient.clinicalRecords.length}</p></div>
            <div className="rounded-xl border bg-white p-3"><p className="text-xs text-muted-foreground">Prescriptions</p><p className="mt-1 text-xl font-bold">{patient.prescriptions.length}</p></div>
          </CardContent>
        </Card>
        </div>

        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2"><Stethoscope className="size-5 text-primary" /> Clinical workspace</CardTitle>
              <div className="flex gap-2"><Link href={`/dashboard/clinical-workspace/${patient.id}?new=1&fromPatient=1`} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5"><Pencil className="size-3.5" /> Create new</Link><Link href={`/dashboard/clinical-workspace/${patient.id}?visitDate=${selectedVisit ?? ""}&fromPatient=1`} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5">Continue workspace</Link></div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <DentalChartSummary entries={visitDentalChartEntries} />

            {/*
            {visitRecords.length === 0 ? (
              <EmptyState>No clinical workspace data is saved for this visit.</EmptyState>
            ) : (
              <div className="space-y-3 rounded-3xl border border-slate-200/80 bg-slate-50/50 p-3 sm:p-4">
                {visitRecords.map((record) => (
                  <div key={record.id} className="space-y-3 rounded-2xl border bg-white p-4 text-sm sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Case paper</p>
                          <Link href={`/dashboard/clinical-records/${record.id}/edit`} className="inline-flex items-center gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/5">
                            <Pencil className="size-3" /> Edit
                          </Link>
                        </div>
                        <p className="mt-1 text-base font-bold">{record.chiefComplaint}</p>
                        <p className="mt-1 text-muted-foreground">
                          Diagnosis: <span className="font-medium text-foreground">{record.diagnosis || "Not recorded"}</span>
                        </p>
                      </div>
                      <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                        {formatDate(record.visitDate)}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <span className="block text-muted-foreground">BP</span>
                        <span className="font-semibold">{record.bloodPressure || "Not recorded"}</span>
                      </div>
                      <div className="rounded-2xl bg-slate-50 p-3">
                        <span className="block text-muted-foreground">Weight</span>
                        <span className="font-semibold">{record.weightKg || "Not recorded"}</span>
                      </div>
                    </div>

                    {parseMedicalHistory(record.medicalHistory).length > 0 ? (
                      <div>
                        <p className="mb-2 font-semibold">Medical history checklist</p>
                        <div className="flex flex-wrap gap-2">
                          {parseMedicalHistory(record.medicalHistory).map((item) => (
                            <span key={item} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                              {item}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border bg-slate-50/70 p-3">
                        <p className="font-semibold">Allergies / medications</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          Allergies: {record.drugAllergies || "Not recorded"}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                          Medications: {record.medications || "Not recorded"}
                        </p>
                        {record.otherHistory && (
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">Other: {record.otherHistory}</p>
                        )}
                      </div>
                      <div className="rounded-2xl border bg-slate-50/70 p-3">
                        <p className="font-semibold">Dental history</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {record.dentalHistory || "Not recorded"}
                        </p>
                      </div>
                      <div className="rounded-2xl border bg-slate-50/70 p-3">
                        <p className="font-semibold">Treatment / estimate</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {record.treatmentDone || "No treatment notes recorded."}
                        </p>
                        <p className="mt-2 font-semibold">Estimate: {record.estimateAmount ? money(record.estimateAmount) : "Not recorded"}</p>
                      </div>
                      <div className="rounded-2xl border bg-slate-50/70 p-3">
                        <p className="font-semibold">Clinical notes</p>
                        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                          {record.clinicalNotes || "No clinical notes recorded."}
                        </p>
                      </div>
                    </div>

                    {(record.patientSignature || record.guardianSignature) && (
                      <div>
                        <p className="mb-3 font-semibold">Digital signatures</p>
                        <div className={`grid gap-3 ${record.patientSignature && record.guardianSignature ? "sm:grid-cols-2" : ""}`}>
                          {record.patientSignature && (
                            <div className={`${!record.guardianSignature ? "sm:col-span-2" : ""} rounded-2xl border bg-white p-3`}>
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Patient</p>
                              <div className="flex justify-end"><div className="w-full max-w-md"><ConsentImageFrame src={record.patientSignature} alt="Patient signature" /></div></div>
                            </div>
                          )}
                          {record.guardianSignature && (
                            <div className="rounded-2xl border bg-white p-3">
                              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guardian</p>
                              <div className="flex justify-end"><div className="w-full max-w-md"><ConsentImageFrame src={record.guardianSignature} alt="Guardian signature" /></div></div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            */}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm xl:col-span-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-5 text-primary" /> Treatment plan and cost
            </CardTitle>
            <div className="flex shrink-0 gap-2"><Link href={`/dashboard/treatment-plans/new?patientId=${patient.id}${selectedVisit ? `&visitDate=${selectedVisit}` : ""}`} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5"><Pencil className="size-3.5" /> Create new</Link>{relatedPlans[0] ? <Link href={`/dashboard/treatment-plans/${relatedPlans[0].id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5">Continue plan</Link> : null}</div>
          </CardHeader>
          <CardContent>
            {relatedPlans.length === 0 ? (
              <EmptyState>No treatment plan is saved for this appointment date.</EmptyState>
            ) : (
              <div className="space-y-3">
                {relatedPlans.map((plan) => (
                  <div key={plan.id} className="rounded-2xl border p-4 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{plan.title}</p>
                        <p className="mt-1 text-muted-foreground">
                          {plan.service?.name || plan.status}
                          {plan.toothNumber ? ` · Tooth ${plan.toothNumber}` : ""}
                        </p>
                        {plan.selectedTeeth.length > 0 && (
                          <p className="mt-1 text-muted-foreground">
                            Teeth: {plan.selectedTeeth.map((tooth) => tooth.toothNumber).join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700">
                        {money(plan.estimatedCost ?? plan.unitPrice)}
                      </div>
                    </div>
                    {plan.notes && <p className="mt-3 whitespace-pre-wrap">{plan.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-sm xl:col-span-6">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Pill className="size-5 text-primary" /> Prescription
            </CardTitle>
            <div className="flex shrink-0 gap-2"><Link href={`/dashboard/prescriptions/new?patientId=${patient.id}${selectedVisit ? `&visit=${selectedVisit}` : ""}`} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5"><Pencil className="size-3.5" /> Create new</Link>{visitPrescriptions[0] ? <Link href={`/dashboard/prescriptions/${visitPrescriptions[0].id}/edit`} className="inline-flex items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5">Continue prescription</Link> : null}</div>
          </CardHeader>
          <CardContent>
            {visitPrescriptions.length === 0 ? (
              <EmptyState>No prescription is saved for this visit.</EmptyState>
            ) : (
              <div className="space-y-3">
                {visitPrescriptions.map((prescription) => (
                  <div key={prescription.id} className="rounded-2xl border p-4 text-sm">
                    <p className="font-semibold">
                      {formatDate(prescription.prescribedOn)}
                      {prescription.diagnosis ? ` · ${prescription.diagnosis}` : ""}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap">{prescription.medicines}</p>
                    {prescription.instructions && (
                      <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                        {prescription.instructions}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <IndianRupee className="size-5 text-primary" /> Invoice and payments
            </CardTitle>
            <Link
              href={`/dashboard/billing/new?patientId=${patient.id}&fromPatient=1${selectedVisit ? `&visit=${selectedVisit}` : ""}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border bg-white px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/5"
            >
              <Pencil className="size-3.5" /> Create new invoice
            </Link>
          </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">Total billed</p>
              <p className="mt-1 text-2xl font-bold">{money(totalBilled)}</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-sm text-emerald-700">Paid</p>
              <p className="mt-1 text-2xl font-bold text-emerald-700">{money(totalPaid)}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-sm text-amber-700">Outstanding</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{money(outstanding)}</p>
            </div>
          </div>

          {openInvoice ? <Link href={`/dashboard/billing/${openInvoice.id}?fromPatient=${patient.id}${selectedVisit ? `&visit=${selectedVisit}` : ""}`} className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"><span><span className="font-bold">Open patient balance:</span> {money(openInvoice.totalAmount - openInvoice.payments.reduce((sum, payment) => sum + payment.amount, 0))} on {openInvoice.invoiceNumber}</span><span className="font-semibold">Continue payment →</span></Link> : null}

          {relatedInvoices.length === 0 ? (
            <EmptyState>No invoice is saved for this appointment date.</EmptyState>
          ) : (
            <div className="overflow-x-auto rounded-2xl border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/40 text-left text-muted-foreground">
                  <tr>
                    <th className="p-4 font-medium">Invoice</th>
                    <th className="p-4 font-medium">Treatment</th>
                    <th className="p-4 font-medium">Total</th>
                    <th className="p-4 font-medium">Outstanding</th>
                    <th className="p-4 font-medium">Payment means</th>
                    <th className="p-4 font-medium">Paid date</th>
                  </tr>
                </thead>
                <tbody>
                  {relatedInvoices.map((invoice) => {
                    const paid = invoice.payments.reduce(
                      (sum, payment) => sum + payment.amount,
                      0,
                    );
                    const invoiceOutstanding = invoice.totalAmount - paid;
                    const paymentStatus = invoiceOutstanding === 0 ? "Paid" : invoice.dueDate && invoice.dueDate < new Date() ? "Overdue" : paid > 0 ? "Partially Paid" : "Unpaid";
                    return (
                      <tr key={invoice.id} className="border-t">
                        <td className="p-4">
                          <Link href={`/dashboard/billing/${invoice.id}?fromPatient=${patient.id}${selectedVisit ? `&visit=${selectedVisit}` : ""}`} className="font-semibold text-primary hover:underline">{invoice.invoiceNumber}</Link>
                          <p className={paymentStatus === "Overdue" ? "text-rose-700" : "text-muted-foreground"}>{paymentStatus}</p>
                        </td>
                        <td className="p-4">{invoice.treatmentPlan?.title || "General"}</td>
                        <td className="p-4">{money(invoice.totalAmount)}</td>
                        <td className="p-4 font-semibold">{money(invoiceOutstanding)}</td>
                        <td className="p-4">
                          {invoice.payments.length
                            ? invoice.payments.map((payment) => payment.method).join(", ")
                            : "Not paid"}
                        </td>
                        <td className="p-4">
                          {invoice.payments.length
                            ? invoice.payments.map((payment) => formatDateTime(payment.paidAt)).join(", ")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5 text-primary" /> Full appointment history
          </CardTitle>
        </CardHeader>
        <CardContent>
          {patient.appointments.length === 0 ? (
            <EmptyState>No appointment history is linked to this patient.</EmptyState>
          ) : (
            <div className="divide-y rounded-2xl border">
              {patient.appointments.map((appointment) => (
                <div
                  key={appointment.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 text-sm"
                >
                  <div>
                    <p className="font-semibold">{appointment.treatment}</p>
                    <p className="text-muted-foreground">
                      {formatDate(appointment.appointmentDate)} · {appointment.appointmentTime}
                    </p>
                  </div>
                  <StatusBadge status={appointment.status as AppointmentStatus} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

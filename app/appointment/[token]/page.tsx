import { notFound } from "next/navigation";
import PatientAppointmentResponse from "@/components/appointments/PatientAppointmentResponse";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PublicAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const accessRequest = await prisma.appointmentSelfServiceRequest.findUnique({
    where: { token },
    include: { clinic: { select: { name: true, brandName: true } }, appointment: { select: { patientName: true, treatment: true, appointmentDate: true, appointmentTime: true } } },
  });
  if (!accessRequest) notFound();
  const expired = accessRequest.expiresAt <= new Date();
  const responded = accessRequest.status !== "PENDING";
  if (!expired && !responded && !accessRequest.openedAt) {
    await prisma.appointmentSelfServiceRequest.update({ where: { id: accessRequest.id }, data: { openedAt: new Date() } });
  }
  const clinicName = accessRequest.clinic.brandName || accessRequest.clinic.name;
  const date = accessRequest.appointment.appointmentDate.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return <main className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4 py-8"><div className="mx-auto max-w-2xl"><header className="mb-6 text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">{clinicName}</p><h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Appointment response</h1><p className="mt-2 text-slate-600">A secure link for {accessRequest.appointment.patientName}</p></header><section className="rounded-3xl border border-sky-100 bg-white p-6 shadow-sm"><p className="text-sm font-semibold text-sky-700">{accessRequest.appointment.treatment}</p><p className="mt-2 text-xl font-bold text-slate-950">{date}</p><p className="mt-1 text-slate-600">{accessRequest.appointment.appointmentTime}</p></section><div className="mt-6">{expired ? <section className="rounded-3xl border bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-bold text-slate-950">This link has expired</h2><p className="mt-2 text-slate-600">Please contact the clinic to confirm or change your appointment.</p></section> : responded ? <section className="rounded-3xl border border-emerald-200 bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-bold text-emerald-800">Response received</h2><p className="mt-2 text-slate-600">The clinic has your appointment response. You can safely close this page.</p></section> : <PatientAppointmentResponse token={token} patientName={accessRequest.appointment.patientName} />}</div></div></main>;
}

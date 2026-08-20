import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clockTime } from "@/lib/format";
import PatientIntakeClient from "@/components/intake/PatientIntakeClient";
import { brandFontVariables } from "@/lib/fonts";

export const dynamic = "force-dynamic";

function visitSentence(
  appointment: { appointmentDate: Date; appointmentTime: string; provider: { name: string } | null } | null,
) {
  if (!appointment) return null;
  const day = appointment.appointmentDate.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const time = appointment.appointmentTime || clockTime(appointment.appointmentDate);
  const withWhom = appointment.provider?.name ? ` with ${appointment.provider.name}` : "";
  return `You are booked for ${day} at ${time}${withWhom}.`;
}

export default async function PublicIntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const intake = await prisma.patientIntakeRequest.findUnique({
    where: { token },
    include: { patient: true, clinic: true },
  });
  if (!intake) notFound();

  const now = new Date();
  const expired = intake.expiresAt <= now;
  const completed = ["COMPLETED", "REVIEWED"].includes(intake.status);

  if (!expired && !completed && !intake.openedAt) {
    await prisma.patientIntakeRequest.update({
      where: { id: intake.id },
      data: { status: "OPENED", openedAt: now },
    });
  }

  const nextVisit =
    expired || completed
      ? null
      : await prisma.appointment.findFirst({
          where: {
            clinicId: intake.clinicId,
            patientId: intake.patientId,
            archivedAt: null,
            appointmentDate: { gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) },
            status: { notIn: ["Cancelled"] },
          },
          orderBy: [{ appointmentDate: "asc" }, { appointmentTime: "asc" }],
          select: {
            appointmentDate: true,
            appointmentTime: true,
            provider: { select: { name: true } },
          },
        });

  const address = intake.clinic.address?.trim();
  const directionsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${intake.clinic.name} ${address}`)}`
    : null;

  return (
    <div className={`cf-portal ${brandFontVariables} flex min-h-screen flex-col text-sm leading-relaxed text-foreground`}>
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[60rem] items-center gap-3 px-[clamp(1rem,1.5vw,2rem)] py-5">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-[0.75rem] bg-secondary text-xl font-bold text-heading">
            {intake.clinic.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-primary uppercase">
              Patient intake
            </p>
            <p className="text-[15px] font-semibold text-heading">{intake.clinic.name}</p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 justify-center p-[clamp(1rem,1.5vw,2rem)]">
        <div className="flex w-full max-w-[60rem] flex-col gap-6">
          {expired ? (
            <section className="flex flex-col gap-2 rounded-card bg-white p-[clamp(1.25rem,5vw,2rem)] text-center shadow-[var(--shadow)]">
              <h1 className="text-[22px] font-bold text-heading">This link has run out</h1>
              <p className="text-base text-foreground">
                Links last a week so your details stay private. Reply to the clinic&rsquo;s WhatsApp message and
                they will send you a fresh one.
              </p>
            </section>
          ) : completed ? (
            <section className="flex flex-col gap-2 rounded-card bg-white p-[clamp(1.25rem,5vw,2rem)] text-center shadow-[var(--shadow)]">
              <h1 className="text-[22px] font-bold text-heading">
                We already have this, {intake.patient.fullName.split(" ")[0]}
              </h1>
              <p className="text-base text-foreground">
                Thank you — the dentist will read it before you come in. You can close this page.
              </p>
            </section>
          ) : (
            <PatientIntakeClient
              token={token}
              patientName={intake.patient.fullName}
              patientPhone={intake.patient.phone}
              visitLine={visitSentence(nextVisit)}
              clinicName={intake.clinic.name}
              directionsUrl={directionsUrl}
            />
          )}
        </div>
      </main>
    </div>
  );
}

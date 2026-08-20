import { reportError } from "@/lib/monitoring";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const responseSchema = z.object({
  response: z.enum(["CONFIRMED", "RESCHEDULE_REQUESTED"]),
  requestedTime: z.string().trim().max(120).optional().default(""),
  note: z.string().trim().max(500).optional().default(""),
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  try {
    const input = responseSchema.parse(await request.json());
    if (input.response === "RESCHEDULE_REQUESTED" && !input.requestedTime) {
      return NextResponse.json({ error: "Please share a preferred day or time." }, { status: 400 });
    }
    const accessRequest = await prisma.appointmentSelfServiceRequest.findUnique({
      where: { token },
      include: { appointment: { select: { id: true, clinicId: true, patientName: true, phone: true } } },
    });
    if (!accessRequest) return NextResponse.json({ error: "This appointment link is invalid." }, { status: 404 });
    if (accessRequest.expiresAt <= new Date()) return NextResponse.json({ error: "This appointment link has expired. Please contact the clinic." }, { status: 410 });
    if (accessRequest.status !== "PENDING") return NextResponse.json({ success: true, alreadyResponded: true, status: accessRequest.status });

    const respondedAt = new Date();
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.appointmentSelfServiceRequest.updateMany({
        where: { id: accessRequest.id, status: "PENDING", expiresAt: { gt: respondedAt } },
        data: { status: input.response, requestedTime: input.requestedTime || null, note: input.note || null, respondedAt },
      });
      if (!result.count) return false;

      if (input.response === "CONFIRMED") {
        await tx.appointment.updateMany({
          where: { id: accessRequest.appointmentId, clinicId: accessRequest.clinicId, archivedAt: null, status: { notIn: ["Cancelled", "Completed"] } },
          data: { status: "Confirmed" },
        });
      } else {
        const existingTask = await tx.followUpTask.findFirst({
          where: { clinicId: accessRequest.clinicId, phone: accessRequest.appointment.phone, taskType: "APPOINTMENT_FOLLOW_UP", status: { in: ["PENDING", "SENT"] } },
          select: { id: true },
        });
        if (!existingTask) {
          await tx.followUpTask.create({
            data: {
              clinicId: accessRequest.clinicId,
              patientName: accessRequest.appointment.patientName,
              phone: accessRequest.appointment.phone,
              taskType: "APPOINTMENT_FOLLOW_UP",
              channel: "PHONE",
              message: `Patient requested a different appointment time: ${input.requestedTime}.${input.note ? ` Note: ${input.note}` : ""}`,
              metadata: JSON.stringify({ appointmentId: accessRequest.appointmentId, source: "PATIENT_SELF_SERVICE" }),
            },
          });
        }
      }
      return true;
    });
    if (!claimed) return NextResponse.json({ success: true, alreadyResponded: true });
    return NextResponse.json({ success: true, status: input.response });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Please check your response." }, { status: 400 });
    await reportError(error, { where: "api/public-appointment" });
    return NextResponse.json({ error: "Your response could not be saved. Please try again." }, { status: 500 });
  }
}

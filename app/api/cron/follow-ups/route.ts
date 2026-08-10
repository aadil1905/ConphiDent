import { NextRequest, NextResponse } from "next/server";
import { generateFollowUpTasks } from "@/lib/follow-ups";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!expected || authorization !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const clinics = await prisma.clinic.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    const results = await Promise.allSettled(clinics.map((clinic) => generateFollowUpTasks(clinic.id)));
    const tasksCreated = results.reduce((total, result) => total + (result.status === "fulfilled" ? result.value : 0), 0);
    const failedClinics = results.flatMap((result, index) => result.status === "rejected" ? [clinics[index].id] : []);
    const payload = { event: failedClinics.length ? "cron.partial" : "cron.completed", job: "follow-ups", clinics: clinics.length, failedClinics, tasksCreated, durationMs: Date.now() - startedAt };
    (failedClinics.length ? console.error : console.info)(JSON.stringify(payload));
    return NextResponse.json({ success: failedClinics.length === 0, tasksCreated, failedClinics }, { status: failedClinics.length ? 207 : 200 });
  } catch (error) {
    console.error(JSON.stringify({ event: "cron.failed", job: "follow-ups", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown error" }));
    return NextResponse.json({ success: false, error: "Follow-up generation failed." }, { status: 503 });
  }
}

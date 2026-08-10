import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const dependencies = {
      database: { status: "ok", latencyMs: Date.now() - startedAt },
      redis: { status: "not_used" },
      openai: { status: process.env.OPENAI_API_KEY ? "configured" : "not_configured" },
      whatsapp: { status: process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_APP_SECRET ? "configured" : "database_managed" },
    };
    const status = process.env.OPENAI_API_KEY ? "ok" : "degraded";
    return NextResponse.json({ status, checkedAt: new Date().toISOString(), dependencies });
  } catch (error) {
    console.error(JSON.stringify({ event: "health.failed", dependency: "database", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Unknown error" }));
    return NextResponse.json({ status: "unavailable", checkedAt: new Date().toISOString(), dependencies: { database: { status: "unavailable", latencyMs: Date.now() - startedAt }, redis: { status: "not_used" }, openai: { status: process.env.OPENAI_API_KEY ? "configured" : "not_configured" }, whatsapp: { status: "unknown" } } }, { status: 503 });
  }
}

import { NextResponse } from "next/server";

import { reportError } from "@/lib/monitoring";
import { consumeRateLimit } from "@/lib/rate-limit";

/**
 * Where a crash in the browser goes.
 *
 * The server's failures now reach `reportError`, but a React error boundary
 * runs on the client and its `console.error` lands in a console nobody is
 * looking at. A screen that white-screens for the front desk was invisible.
 *
 * Deliberately unauthenticated: the boundary that most needs to report is the
 * one that fired because the session or the layout itself broke, and requiring
 * a session there would lose exactly the reports worth having. That makes it a
 * public write, so it is rate-limited per IP, takes a small fixed shape, and
 * truncates hard. Nothing here is trusted — it is a bug report, not a record.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!consumeRateLimit(`client-error:${ip}`, 20, 60_000).allowed) {
    return NextResponse.json({ ok: true });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) =>
    typeof value === "string" ? value.slice(0, max) : undefined;

  await reportError(new Error(text(input.message, 500) || "Client error"), {
    where: `client/${text(input.boundary, 60) || "unknown"}`,
    detail: {
      // Next.js's digest is the only reliable way to tie a client boundary back
      // to the server error that produced it.
      digest: text(input.digest, 80) ?? null,
      path: text(input.path, 200) ?? null,
    },
  });
  return NextResponse.json({ ok: true });
}

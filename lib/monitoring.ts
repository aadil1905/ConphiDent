import "server-only";

/**
 * Where an unhandled failure goes.
 *
 * Before this there were 30 `console.error` calls and nothing else. On Vercel
 * those land in a log nobody is watching, so a patient hitting a 500 at 9pm on
 * a Saturday was invisible until somebody rang the clinic. Errors were being
 * *recorded* and never *reported*, which is the same as not having them.
 *
 * This reports them, without adding a vendor SDK to the bundle:
 *
 *  - Always: one structured JSON line, so Vercel's log search can group by
 *    `event`, `kind` and `clinicId` instead of by prose.
 *  - When `ERROR_WEBHOOK_URL` is set: a POST carrying the same object. Any
 *    Slack or Discord incoming webhook, or Sentry's store endpoint, accepts it.
 *    Set it and alerting starts; leave it unset and nothing breaks.
 *
 * Deliberately not a hosted SDK. Adding one would mean an account, a DSN, a
 * data-processing agreement covering patient data, and a decision about what
 * leaves the country — none of which are mine to make for a clinic. This gets
 * the signal out of the black hole and leaves that choice open.
 *
 * **Never pass patient data in `context`.** Identifiers only. The whole point of
 * a clinical system is that a name does not leave it by accident, and an error
 * report is exactly the sort of accident that happens.
 */

export type ErrorContext = {
  /** Where it happened, e.g. "api/appointments.PATCH". */
  where: string;
  clinicId?: number | null;
  userId?: number | null;
  /** Identifiers and counts only — never names, phone numbers or notes. */
  detail?: Record<string, string | number | boolean | null | undefined>;
};

function describe(error: unknown) {
  if (error instanceof Error) {
    return {
      kind: error.name,
      message: error.message,
      // Trimmed: the top frames say where, the rest is framework noise.
      stack: error.stack?.split("\n").slice(0, 8).join("\n"),
    };
  }
  return { kind: "NonError", message: String(error), stack: undefined };
}

export async function reportError(error: unknown, context: ErrorContext) {
  const payload = {
    event: "error",
    at: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || null,
    ...describe(error),
    ...context,
  };

  // One line, parseable. `console.error` so it keeps its severity in Vercel.
  console.error(JSON.stringify(payload));

  const hook = process.env.ERROR_WEBHOOK_URL;
  if (!hook) return;
  try {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${payload.kind} in ${context.where}: ${payload.message}`, ...payload }),
      // The request that failed must not be held up, or made to fail again, by
      // the reporting of its own failure.
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Reporting is best-effort by definition. A webhook that is down must not
    // turn a handled 500 into an unhandled one.
  }
}

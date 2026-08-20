# ConphiDent production hardening changelog

## 2026-08-13 — Baseline

- Started the master production-hardening program.
- Recorded the initial P0/P1 risk register and evidence requirements.
- Confirmed the repository has extensive pre-existing modified and untracked work; all unrelated changes are treated as user-owned and preserved.
- Confirmed no clinic deletion, production database mutation, Meta message, or production deployment was performed during baseline collection.

## 2026-08-13 — Verified P0 hardening package

- Unified staff and WhatsApp scheduling around strict calendar dates, UTC day-range reads, tenant/location timezones, active branch ownership, future-slot validation, and one conflict service.
- Added branch selection to appointment create/edit and restored provider/chair options on edit; API errors now reach the operator instead of becoming generic failures.
- Replaced WhatsApp check-then-update rescheduling with an ownership-checked serializable transition that preserves the original treatment and rechecks capacity.
- Added an explicit, confirmation-based WhatsApp appointment cancellation transition; draft cancellation no longer claims that a real appointment was cancelled.
- Made WhatsApp create/reschedule business effects idempotent across retries by committing a durable booking result marker in the same database transaction as the appointment mutation.
- Corrected past/malformed date acceptance, clinic-timezone today/tomorrow handling, archived/no-show capacity disagreement, and the unreachable closed-versus-full response.
- Wired the Control Centre tenant automation switch into webhook execution, added a standard switch to onboarding, listed legacy tenants, and enforced one tenant/trigger row with a database unique index.
- Changed webhook ingress to acknowledge after durable persistence, isolate an unroutable tenant from other changes in the same signed batch, and moved recovery/outbox workers to one-minute schedules.
- Enforced Meta's 24-hour customer-service window for free-form text and interactive sends while leaving approved templates available outside the window; inbound provider timestamps now anchor the window.
- Prevented delivery-status downgrades with provider timestamps and monotonic tie-breaking; delivery-uncertain sends now dead-letter for operator review instead of automatic resend.
- Added durable human-handoff notification, honored HUMAN_ONLY conversations, broadened opt-out phrases, fixed MENU routing, and allowed emergency detection in media captions.
- Disabled both permanent tenant deletion and the legacy unconfirmed clinic-status action. No clinic or production data was deleted.
- Changed null/unknown platform roles to read-only and added a migration that explicitly promotes established DB-backed platform admins before the fail-closed behavior takes effect.
- Re-encoded public branding uploads through Sharp, removed SVG/icon active content, bounded pixels, and cleaned up uploaded blobs if the database transaction fails.
- Neutralized CSV spreadsheet-formula injection.
- Corrected prescription allergy selection to use only current FINAL, non-entered-in-error clinical records with deterministic ordering.
- Added scheduling and WhatsApp regression coverage and included scheduling in the full verification gate.

### Evidence

- `prisma validate`: passed.
- `npm run verify`: passed (91 tests passed; 18 database-dependent tests skipped because no safe `TEST_DATABASE_URL` is configured).
- `npm run build`: passed; Next.js generated all 70 static pages and the complete dynamic route manifest.
- `prisma migrate status`: could not establish schema-engine connectivity through the configured Supabase pooler; no migration was applied.
- No live Meta API call, production database write, clinic deletion, or deployment was performed.

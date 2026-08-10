# ConphiDent dependability audit

## Highest-frequency workflows

1. WhatsApp enquiry → booking → patient and appointment. Data crosses the webhook, persistent conversation/booking state, patient upsert, appointment creation, lead conversion, and outbound confirmation. Hardened for clinic-scoped availability, atomic patient/appointment creation, serializable slot claims, interrupted outbox workers, retries, and dead-letter handling.
2. Reception booking/rescheduling → schedule. Data crosses the appointment form, validation route, provider/chair conflict detection, patient upsert, and appointment record. Hardened with serializable transaction retries and atomic completion-to-patient linkage.
3. Completed visit → treatment plan → invoice. Data crosses completed-appointment validation, treatment plan/items/teeth, invoice, and optional initial payment. Existing nested writes and invoice transactions were retained; validation now has integration coverage for rollback invariants.
4. Invoice → partial/final payment. Data crosses tenant authorization, outstanding-balance calculation, payment ledger, and invoice status. Existing serializable transaction and retry logic prevents overpayment races; integration coverage validates partial-payment and rollback behavior.
5. Follow-up/reminder → WhatsApp delivery. Data crosses cron authorization, candidate generation, durable scheduled messages, provider delivery, retry state, and operations UI. Hardened with per-clinic isolation, structured logs, exponential retry, dead-letter state, and stale-worker recovery.

## Edge cases and disposition

| Edge case | Before | Current disposition |
| --- | --- | --- |
| Patient saved but appointment fails | Possible | One serializable transaction; full rollback |
| Two staff book the same provider/chair | Check/write race | Conflict check and write share a serializable transaction with bounded retry |
| WhatsApp availability leaks across clinics | Possible | All booking availability queries are clinic-scoped |
| Concurrent WhatsApp slot confirmation | Check/write race | Atomic serializable slot claim |
| Partial payment races/overpayment | Protected | Existing serializable ledger update retained and tested |
| Outbox provider request fails | Fixed-delay retries only | Exponential backoff, bounded attempts, dead-letter status |
| Worker dies while message is PROCESSING | Message can remain stuck | Automatically reclaimed after ten minutes |
| One clinic breaks follow-up cron | Whole cron fails | `Promise.allSettled`; failed clinic IDs returned and logged |
| Cron failures are silent/unstructured | Inconsistent | JSON completion/failure events with duration and counts |
| Health says OK when integrations are absent | DB-only result | Reports DB latency plus Redis/OpenAI/WhatsApp state without exposing secrets |

## UX findings

- Operational terminology consistently uses “Patient”; no dashboard-facing “Client” labels were found.
- New appointment intake now defaults to today in the clinic timezone and retains the existing common-service default of “New Consultation”.
- Billing and treatment-plan forms already use a single-page design and derive dates/services from completed visits. Reworking them would add risk without removing meaningful clicks.
- Role permissions are enforced server-side. The shared dashboard is dense; a future pass can tailor card order per role, but hiding navigation without a validated role task study would risk making common cross-role coverage harder.

## Verification

- `npm run verify` covers lint, TypeScript, security boundaries, and architecture boundaries.
- `npm run test:reliability` uses Node's built-in test runner and requires an isolated PostgreSQL URL in `TEST_DATABASE_URL`. It intentionally skips database mutation when that variable is absent.

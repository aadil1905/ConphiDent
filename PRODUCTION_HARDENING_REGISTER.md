# ConphiDent production hardening register

Status: active implementation program started 2026-08-13.

This register is evidence-driven. An item is complete only when the relevant automated tests, type check, lint, build, migration validation, and production-like checks pass. Live Meta, payment, DNS, backup, or deployment claims require real provider evidence and are never inferred from local mocks.

## Highest risks

| ID | Priority | Risk | Required outcome |
| --- | --- | --- | --- |
| R-001 | P0 | Production source and migrations are not reproducible from `origin/main`; the live control centre contains locally deployed work. | Establish an authoritative release commit, migration inventory, backup/restore evidence, and immutable deployment metadata. |
| R-002 | P0 | Reception and WhatsApp bookings use different location/date/capacity rules. | One tenant-scoped scheduling service for every channel, with atomic conflict enforcement. |
| R-003 | P0 | WhatsApp cancellation clears a draft rather than the real appointment. | Explicit, ownership-checked cancel flow with status history and patient confirmation. |
| R-004 | P0 | WhatsApp rescheduling is check-then-update and can overwrite concurrent changes. | Serializable reschedule with appointment version/status checks and conflict retry. |
| R-005 | P0 | Control Centre automation state is not read by webhook execution. | Runtime enforcement of tenant automation mode with an audited fail-closed control. |
| R-006 | P0 | Booking and failure-recovery paths lack executable end-to-end coverage. | Database-backed concurrency, replay, state-machine, tenant-isolation, and failure-injection tests. |
| R-007 | P1 | Daily capped workers cannot recover a high-volume backlog reliably. | Frequent claimed queue workers, bounded exponential backoff, dead letters, alerts, and safe replay. |
| R-008 | P1 | Tenant settings, service menus, templates, and message copy are only partly synchronized. | Control Centre settings become the authoritative runtime configuration. |
| R-009 | P1 | Tenant deletion is inconsistent and cannot safely account for governed records or external blobs. | Immutable tenant classification/protection, dependency preflight, durable audit, and asynchronous blob cleanup. |
| R-010 | P1 | Timezone, multilingual, multi-branch/provider, handoff, and consent edge cases are incomplete. | Explicit supported behavior and regression coverage across the scenario matrix. |

## Implementation checklist

- [ ] Capture authoritative source, deployment, environment-key, migration, and backup baselines.
- [x] Enumerate all current API handlers and exported server actions; unresolved role-boundary findings remain in the handoff.
- [x] Centralize appointment date/time, branch ownership, availability, and current slot-conflict logic.
- [ ] Implement the remaining reminder, completion, no-show, follow-up, provider-duration, break, and holiday lifecycle rules.
- [ ] Add appointment status history and idempotency/correlation support.
- [x] Enforce WhatsApp automation state, opt-out, 24-hour/template boundary, uncertain-delivery handling, and durable handoff notification.
- [x] Replace daily WhatsApp recovery/outbox schedules with frequent durable claimed workers; backlog alerts and scalable partitioning remain.
- [ ] Make Control Centre configuration authoritative and remove disconnected controls.
- [ ] Harden destructive actions, uploads, exports, files, impersonation, and audit trails.
- [ ] Repair remaining SaaS CRUD, totals, stale data, errors, loading, accessibility, and responsive flows.
- [x] Run the full local verification/build gate and document blocked provider/manual steps.

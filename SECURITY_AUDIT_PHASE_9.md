# Phase 9 Security Audit — ConphiDent

## Scope completed

- Authentication, platform authorization, tenant-scoped query patterns, Meta webhook routing, media upload controls, and environment-variable exposure were reviewed from application source.
- No secret values are included in this report.

## Fixed in this pass

- `PATCH` and `DELETE /api/patients/[id]` now require the server-side clinic permission `managePatients`, in addition to the existing `clinicId` ownership predicate. This closes a privilege gap where any authenticated clinic user could otherwise invoke that mutation directly.

## Confirmed controls

- Control Center routes are host-gated by `proxy.ts`, require a signed session, and use server-side platform authorization.
- Platform actions use dedicated `requirePlatformPermission` guards. Platform roles are distinct from clinic roles.
- Core patient, clinical record, invoice, payment, appointment, prescription, treatment-plan, conversation, and export paths use tenant ownership predicates or tenant-scoped helpers.
- Meta webhook ingress checks `x-hub-signature-256`, resolves the clinic through the unique Meta Phone Number ID, and does not fall back to a random tenant for an unknown ID.
- Per-clinic Meta tokens are encrypted at rest and the platform UI does not select token ciphertext, IV, tag, or environment secrets.
- Media upload is platform-authorized, type/size restricted, and writes into a clinic-scoped storage path.
- Login and password-reset flows use durable, hashed-subject rate limits; password hashes are not exposed to clients.

## Findings requiring external or later-phase work

| Severity | Finding | Required next step |
| --- | --- | --- |
| High | Database backups, point-in-time recovery, and restore testing are provider configuration, not observable in application source. | Verify in the database provider and record a restore runbook. |
| High | Deployment/Vercel access controls and environment-variable access are external configuration. | Review Vercel project roles, production-only secrets, deployment protection, and domain ownership. |
| Medium | The audit log is tenant-scoped and does not record IP address, before/after JSON, or request metadata. | Add a dedicated append-only platform audit model when request context and retention policy are defined. |
| Medium | `/api/health` intentionally exposes limited dependency configuration state for uptime monitoring. | Decide whether it should be restricted behind a monitor credential in production. |
| Medium | No payment-provider integration or payment webhook exists in the current source. | Implement provider-specific signed webhook and idempotency controls before platform billing payments are introduced. |
| Low | Runtime console logs are not centrally retained or redacted by a shared logging layer. | Add structured log sanitization and retention policy before enterprise observability claims. |

## Readiness assessment

The application has a solid tenant-isolation and authorization foundation, but it is **not enterprise-ready** yet. It is appropriate to describe the Control Center as an **internal beta / limited production foundation** until the external infrastructure controls, durable platform audit context, observability retention, and provider-backed billing/security integrations are verified.

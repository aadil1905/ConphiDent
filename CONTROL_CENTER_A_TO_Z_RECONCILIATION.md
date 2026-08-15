# ConphiDent A–Z Reconciliation — 2026-08-11

## Verified system boundaries

| System | Code boundary | Canonical tenant scope |
| --- | --- | --- |
| SaaS | `app/dashboard`, authenticated APIs, `lib/*` workflows | signed session `User.clinicId` |
| WhatsApp | webhook, outbox cron, booking/conversation/connection libraries | Meta phone number → `ClinicWhatsAppConnection.clinicId` → async clinic context |
| Control Center | `app/platform`, setup host gate, platform actions | platform role/permission plus explicit target clinic validation |

`Clinic` is the canonical tenant record. Identity/branding/contact live on `Clinic`; providers, services, hours, locations, WhatsApp settings/connections, features, subscription, users, and audit records are tenant-owned relations. There is no competing Tenant or Organization data model.

## Feature matrix

| Capability | SaaS | WhatsApp | Control Center | Reconciliation |
| --- | --- | --- | --- | --- |
| Identity, logo, contact, accent | reads `Clinic` | clinic context reads `Clinic` | profile + Blob upload | shared and live |
| Services | `ClinicService` | booking/context service reads | branch assignment only | add/edit control missing |
| Providers/doctors | `ClinicProvider` | availability/booking reads | branch assignment only | add/edit/deactivate control missing |
| Hours/locations | `ClinicHours`/`ClinicLocationHours` | availability/booking reads | editable | shared and live |
| WhatsApp connection | encrypted per-clinic connection | webhook resolves phone ID, sends per clinic | real status/sync pages | shared, no browser secret exposure |
| Features/subscription/status | tenant relations/`Clinic.status` | automation uses tenant context | editable | shared and live |
| Users/access | `User` with `clinicId` | no credential sharing | platform user area | inspect role guard per action |

## Security and tenant routing

- SaaS sessions validate active user and `Clinic.status`; APIs use permission and feature guards.
- Setup/platform host is gated in `proxy.ts`; platform pages require distinct platform permission checks, not a clinic owner role.
- Incoming WhatsApp resolves only an active matching Meta phone ID; credentials are AES-GCM encrypted and never selected by client clinic ID.
- The webhook uses a clinic async context; unknown phone IDs do not fall back to another tenant.
- Existing static security check currently verifies 56 boundaries. Database-linked objects such as invoices/payments require the patient-to-clinic relation in every ID query; the integration suite covers this pattern but needs a configured test database to execute all cases.

## Hardcoding review

Canonical tenant-facing branding is data-driven. Intentional constants include default hours/services, feature registry, permissions, platform domain/environment names, Meta API version, and protected clinic safeguards. Marketing demo copy/assets and a named seed script are not runtime tenant configuration. No production clinic value should be added to source code for onboarding.

## Deployment and domains

`conphident.live` serves public routes, `setup.conphident.live` is the existing Control Center host, and clinic subdomains resolve through `PLATFORM_DOMAIN`. This deployment must preserve that model; no separate `control` host is needed.

## Prioritized gaps

1. Expose canonical provider and service create/edit/deactivate controls in Tenant 360; do not duplicate models.
2. Retain the current real Meta connection/status controls; surface only supported diagnostics.
3. Keep readiness based on concrete records, and require a configured database test environment for full lifecycle and isolation execution.
4. Do not delete reliability/demo tenants without explicit evidence and authorization.

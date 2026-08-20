# ConphiDent Control Center — Phase 1 Audit

**Selected control-plane entry point:** `https://setup.conphident.live/platform`

`setup.conphident.live` is the existing internal host configured by `SETUP_DOMAIN`. It is the correct Control Center boundary for this deployment; a second `control` subdomain would duplicate routing, DNS, and access-control concerns without providing a benefit in Phase 1.

## Current system map

```text
Public site (app/page.tsx and marketing routes)
  -> DemoRequest (public lead capture)
  -> login/session (signed, HttpOnly `dentalai_session` cookie)
  -> proxy.ts host and unauthenticated-route gate
  -> tenant resolution (subdomain slug -> Clinic) and authenticated clinicId scope
  -> clinic SaaS (/dashboard)
  -> PostgreSQL / Prisma
  -> WhatsApp per-clinic connection (encrypted Meta token)
  -> Meta Cloud API + signed /api/webhook event ingress

Platform owner operations
  -> setup.conphident.live /setup -> /platform
  -> platformAdmin + platformRole authorization
  -> existing Clinic, User, Subscription, Feature, WhatsApp, Audit, Support,
     Notification, and Onboarding records
```

## Discovered architecture

- `Clinic.id` is the tenant identifier. There is no competing Organization or Tenant model; `Clinic` is the canonical tenant/organization record.
- `User.clinicId` is the user-to-tenant relationship. Clinic authorization uses the clinic `role`; platform authorization uses the distinct `platformAdmin` flag plus `platformRole`.
- Sessions are persisted in `Session`, signed by `AUTH_SECRET`, and issued as secure, HttpOnly cookies in production.
- Tenant host branding resolves `Clinic.slug` under `PLATFORM_DOMAIN`. Authenticated dashboard operations continue to bind to the signed-in user's `clinicId`, not the host alone.
- Existing platform functions are already located under `/platform`: tenant provisioning, clinic configuration, subscriptions, features, onboarding, support, notifications, WhatsApp operations, health, audit, and public-demo requests.
- `proxy.ts` restricts `/setup` and `/platform` to the configured setup host outside local development and rejects unauthenticated requests before application rendering.

## WhatsApp audit

- Each `ClinicWhatsAppConnection` owns a unique WABA ID and Meta Phone Number ID, plus encrypted token ciphertext/IV/tag. Tokens are not selected by platform pages.
- Embedded Signup is owner-scoped: the signed-in clinic owner passes their `clinicId` to `completeEmbeddedSignup`.
- The webhook validates `x-hub-signature-256`, resolves the incoming Meta Phone Number ID to one active clinic connection, and runs all message work in an AsyncLocalStorage clinic context.
- An explicit legacy connection remains supported only when both `PHONE_NUMBER_ID` and `LEGACY_WHATSAPP_CLINIC_ID` match. Unknown phone IDs return 404; there is no fallback to a random/first clinic.
- Outbound message delivery selects the current clinic's encrypted connection. Legacy credentials are restricted to the configured legacy clinic.

## Existing administration systems

| System | Current responsibility | Phase 1 decision |
| --- | --- | --- |
| `/setup` | Host-level entry redirect for the owner portal | Retain as the setup host entry point. |
| `/platform` | Existing Control Center operations | Evolve in place; do not duplicate. |
| `/dashboard/settings` | Clinic-owner configuration and WhatsApp Embedded Signup | Keep tenant-owned configuration separate. |
| `/dashboard` | Clinic SaaS for staff and doctors | Keep isolated from platform administration. |

## Control Center authorization

The platform boundary now has dedicated role/permission vocabulary independent of normal clinic permissions.

- Roles: `PLATFORM_OWNER`, `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `SUPPORT_ADMIN`, `BILLING_ADMIN`, `TECHNICAL_ADMIN`, and `READ_ONLY_ADMIN`.
- Permissions: tenant read/create/update/suspend; user read/manage; WhatsApp read/manage; billing read/manage; deployment read; logs read; settings manage; admin manage; support manage; and onboarding manage.
- Legacy stored roles (`PLATFORM_ADMIN`, `SUPPORT`, `FINANCE`, `WHATSAPP_OPERATIONS`, and `SALES_ONBOARDING`) remain mapped for compatibility. A missing historical role remains a Super Admin until explicitly narrowed.
- Only platform authorization is consulted for the Control Center. A clinic `OWNER`, `ADMINISTRATOR`, or any manually typed URL alone cannot enter it.

## Tenant-isolation findings

Strong controls found:

- Clinic records are keyed by `clinicId` throughout appointment, patient, configuration, WhatsApp, feature, and other core tenant models.
- The repository includes security-boundary checks for core clinical API routes and common dashboard reads.
- Platform clinic-location actions verify both record ID and `clinicId` before mutation.

Follow-up audit targets:

- Several billing/clinical tables derive tenant scope through `Patient` rather than owning `clinicId`. This is valid only when every query retains the patient relationship filter; it should receive automated regression tests for every ID-based API route.
- The existing static `verify-security-boundaries.mjs` script validates selected paths, not every database query. Phase 2 should add route-level tenant-isolation tests for inventory, laboratory, reports, files, conversations, and follow-ups.

## Security and environment findings

- No secret values are recorded in this document. `.env` is ignored and `.env.example` uses variable names only.
- Meta access tokens are encrypted at rest for new per-clinic connections. Permanent tokens are not rendered in the UI.
- Public health reporting discloses configuration state but not credentials. Consider protecting detailed health output with a deployment-monitor secret or moving it behind the setup host before broad production exposure.
- Error logging exists in webhook, cron, and API handlers. Phase 2 should standardize structured redaction so provider response bodies and patient content cannot be accidentally logged.
- `robots.ts` already disallows `/platform/`; the dedicated Control Center layout adds route-level `noindex, nofollow, nocache` metadata. Robots directives are advisory; the real enforcement remains proxy plus server-side permission guards.

## Database decision

No database migration was created in Phase 1. The existing schema already provides the required tenant, user, role string, subscription, feature-flag, WhatsApp, support, notification, onboarding, and audit foundations.

The existing `AuditLog` is tenant-scoped and lacks IP address, old/new JSON values, and platform-wide nullable tenant context. Add a separate `PlatformAuditLog` only when the next phase begins writing platform-wide, security-sensitive actions; doing so then avoids a dormant duplicate audit table.

## Phase 2 recommendation

1. Add a controlled Platform Admin management screen plus audited role assignment.
2. Add `PlatformAuditLog` with actor, permission, resource, tenant context, before/after JSON, request IP, timestamp, and metadata.
3. Add automated authorization matrices for each platform role and cross-tenant integration tests for all ID-based APIs.
4. Replace the current broad platform page guards with the new permission guards one route at a time, accompanied by tests.
5. Add health snapshots, job telemetry, and deployment records through provider integrations rather than synthetic dashboard data.

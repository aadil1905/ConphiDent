# Multi-tenant SaaS operations

## Production model

This is one platform deployment. Every clinic is a tenant with a distinct `clinicId`; tenant data is queried only in that scope. Deepika Dental White remains Client #1 with the `deepika-dental-white` workspace key.

## Platform administration

Set `PLATFORM_ADMIN_EMAILS` in Vercel to a comma-separated list of your internal team emails. Those users can access `/platform` after signing in. This value is platform-only; clinic owners never receive it.

The platform page provisions a new clinic with its owner, default services/hours, WhatsApp settings, and launch checklist. Do not create a clinic by manually inserting partial database rows.

## Domains

Set `PLATFORM_DOMAIN` to your future wildcard domain, for example `app.yourcompany.com`. Configure Vercel wildcard DNS for `*.app.yourcompany.com`. A request to `smile-pune.app.yourcompany.com` resolves the `smile-pune` tenant for sign-in branding; authenticated access remains bound to the signed-in user’s clinic.

## Required rollout steps

1. Apply the `20260803210000_add_saas_tenant_platform` Prisma migration.
2. Add `PLATFORM_ADMIN_EMAILS` and optionally `NEXT_PUBLIC_PLATFORM_NAME` and `PLATFORM_DOMAIN` to Vercel.
3. Sign in as an allowed platform administrator and open `/platform`.
4. Create Clinic #2 through the portal, then test its owner login, isolated patient data, and WhatsApp onboarding.
5. Only after that test, point a wildcard domain at the platform.

## WhatsApp

Use one Meta app owned by the platform. Each clinic completes Meta Embedded Signup from its own Settings → WhatsApp screen. The application stores the clinic-specific connection encrypted and routes webhook messages using Meta’s Phone Number ID. Never create Meta apps or Vercel credential sets per clinic.

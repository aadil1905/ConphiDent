# Conphident production readiness

## Code status

- Tenant records are scoped by `clinicId`; platform administrators cannot view patient records through the portfolio page.
- Clinic owners control their own staff, contact profile, services, hours and WhatsApp connection.
- WhatsApp Embedded Signup stores a per-clinic encrypted server credential; client staff never enter Meta tokens.
- Production checks are `npm run verify` and `npm run build`.

## Required before onboarding 1,000 clinics

1. **Domain** — buy one platform domain (for example `anec.in`), set `PLATFORM_DOMAIN`, and add a wildcard DNS record for `*.anec.in`. Individual clinics do not need to buy domains.
2. **Meta** — create one Meta Business app owned by Conphident, complete business verification, configure Embedded Signup, webhook URL and redirect domains, then set `META_APP_ID`, `NEXT_PUBLIC_META_APP_ID`, `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`, `WHATSAPP_CREDENTIAL_ENCRYPTION_KEY`, `VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` and (only for the established Deepika legacy connection) `LEGACY_WHATSAPP_CLINIC_ID` in Vercel. `META_APP_SECRET` is optional: the existing `WHATSAPP_APP_SECRET` is accepted as the same Meta App Secret.
3. **Email** — verify a Conphident sender domain with Resend, then set `RESEND_API_KEY` and `EMAIL_FROM`. This enables password recovery; until then the reset screen deliberately does not disclose account details.
4. **Secrets** — move every secret out of repository `.env` files into Vercel Production environment variables, rotate any value that was ever committed or shared, and restrict Vercel project access.
5. **Database** — enable Supabase point-in-time recovery/backups, set a tested restore procedure, and use the pooled `DATABASE_URL` plus direct `DIRECT_URL` only for migrations.
6. **Monitoring** — attach Vercel alerts and error monitoring (for example Sentry), monitor `/api/health`, database connection errors, webhook signature failures and cron failures.
7. **Jobs** — set `CRON_SECRET` and configure the scheduled reminder/follow-up jobs. Confirm their logs and a real reminder before relying on automation.
8. **Legal** — publish Conphident privacy policy, data-processing terms, retention/deletion policy, support contact and clinic WhatsApp consent wording. Have local counsel review them.
9. **Load proof** — before broad launch, run a controlled load test and restore drill using anonymised test data. Keep production data out of development and staging.

## Tomorrow's clinic sale

- Give Deepika only her clinic-owner login.
- Keep the Conphident platform-admin login private.
- Do not promise live WhatsApp until the Meta checklist above is completed and tested.
- Keep the current Vercel URL for the handover; `app.conphident.live` is the production domain.

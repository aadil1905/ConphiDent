# ConphiDent production security and recovery guide

## Required production settings

1. Use a managed PostgreSQL database with encrypted transport, automatic daily backups and point-in-time recovery enabled.
2. Store every secret in Vercel Production environment variables; do not copy `.env` values to commits, tickets, email, or WhatsApp.
3. Set `AUTH_SECRET`, `VERIFY_TOKEN`, `CRON_SECRET`, and `WHATSAPP_CREDENTIAL_ENCRYPTION_KEY` to independently generated high-entropy values.
4. Configure `NEXT_PUBLIC_APP_URL` to the canonical HTTPS application URL. Configure Meta redirect and webhook URLs only for that canonical domain.
5. Enable Vercel deployment protection for preview environments, error alerts, and an uptime probe for `/api/health`.
6. Configure and monitor `contact@conphident.live` before publishing the privacy/data-rights pages.

## Backup and restore

Application code cannot create provider backups. Enable provider backups separately, retain a tested restore runbook, and perform a quarterly restore test into an isolated environment. Before production migrations, take a provider snapshot, run `prisma migrate deploy`, verify the application health endpoint, and retain the prior deploy for rollback. Never roll back a migration by deleting production data.

## OAuth, SMS, and MFA

Google OAuth and SMS verification are intentionally not enabled without provider credentials, redirect allow-lists, an account-linking policy, and abuse monitoring. The `.env.example` variables reserve the server-only configuration surface. Do not fabricate provider credentials or expose them through `NEXT_PUBLIC_*` variables.

## Operational review

Review Vercel access, database access, audit events, staff accounts, platform-admin assignment, WhatsApp webhook failures, and failed scheduled sends at least monthly. Platform administration must be granted through `platformAdmin` or the controlled `PLATFORM_ADMIN_EMAILS` list; it is never a hidden route.

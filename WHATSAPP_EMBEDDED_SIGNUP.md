# WhatsApp Embedded Signup deployment

This application uses only the official Meta WhatsApp Business Platform Cloud API and Meta Embedded Signup. Clinics do not enter credentials.

## One-time platform-owner setup

In the Meta developer app, add the WhatsApp product and configure Facebook Login for Business / WhatsApp Embedded Signup. Add the production domain to the JavaScript SDK allowed domains and configure the app webhook callback as:

`https://<your-domain>/api/webhook`

Subscribe the app webhook to WhatsApp message events. Before publishing, complete Meta App Review / Advanced Access for the permissions required by your configured Embedded Signup flow, including `whatsapp_business_management`, `whatsapp_business_messaging`, and `business_management` where Meta requires it.

Set these private platform environment variables in Vercel (never in a clinic dashboard):

- `META_APP_ID`
- `META_APP_SECRET`
- `NEXT_PUBLIC_META_APP_ID` (same non-secret app ID)
- `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`
- `WHATSAPP_APP_SECRET`
- `VERIFY_TOKEN`
- `WHATSAPP_CREDENTIAL_ENCRYPTION_KEY` — a base64-encoded random 32-byte key

The existing `PHONE_NUMBER_ID` and `WHATSAPP_TOKEN` are retained only as a migration fallback for the pre-existing single-clinic connection. Remove them after that clinic completes Embedded Signup.

## Runtime flow

1. An authenticated clinic owner opens **Settings → WhatsApp** and selects **Connect WhatsApp**.
2. Meta completes Facebook authentication, WABA selection/creation, and phone verification.
3. The browser passes Meta's one-time authorization code and returned WABA/phone IDs to the authenticated server endpoint.
4. The server exchanges the code directly with Meta, verifies the phone asset, subscribes the WABA to the configured webhook, then AES-256-GCM encrypts the resulting credential before saving it.
5. Inbound webhooks are signature-verified and mapped from Meta's phone-number ID to the owning clinic before processing.

Never expose tokens, encryption keys, webhook secrets, app secrets, or Graph API responses in browser code, logs, dashboards, or support messages.

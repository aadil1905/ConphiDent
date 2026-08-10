# ConphiDent public marketing website inventory

Prepared before the public-site redesign on 8 August 2026.

## Change boundary

The redesign is restricted to public marketing routes, marketing components, sanitized public media, public metadata, and marketing-only CSS. The authenticated SaaS, Prisma schema and migrations, authentication, tenant resolution, permissions, WhatsApp backend, clinic workflows, billing logic, patient data, API behavior, and existing internal routes are protected and must not be changed.

`/platform` is an authenticated platform-administration route. Marketing navigation labelled “Platform” must continue to target `/product`; `/platform` must not be repurposed.

## Public website routes

- `/` — marketing homepage
- `/product` — public platform/product tour
- `/features` — public capabilities overview
- `/about` — public company/product positioning
- `/demo` — public product walkthrough and demo-request form
- `/terms` — terms of service
- `/login` — existing authentication entry point; linked from the public site but outside the redesign boundary
- `/privacy` — not currently present; required by the redesigned trust/footer system

Public utility routes include `/robots.txt`, `/sitemap.xml`, and `/opengraph-image`.

## Existing marketing components

- `components/marketing/PublicShell.tsx` — shared navigation and footer
- `components/marketing/ProductTour.tsx` — client-side scroll story
- `components/marketing/ProductVisual.tsx` — framed screenshot and callout presentation
- `components/marketing/DemoForm.tsx` — validated demo-request form posting to the existing `/api/demo-requests` endpoint
- `components/marketing/ProductVideo.tsx` — optional real video player; no approved recording currently exists
- `components/marketing/DashboardShowcase.tsx` — synthetic dashboard illustration; not suitable as primary proof when real screenshots are available

## Sanitized product assets

- Dashboard: `public/product/dashboard/dashboard-demo.png` (950×540)
- Patient record: `public/product/patients/patient-profile-demo.png` (1171×1180)
- Calendar and appointment: `public/product/appointments/calendar-demo.png` (1171×1144), `appointment-completed-demo.png` (950×540)
- Clinical workspace: `public/product/clinical/clinical-workspace-demo.png` (1171×1180)
- Billing: `public/product/billing/billing-invoice-demo.png` (1171×1180)
- Lead CRM and follow-ups: `public/product/crm/lead-crm-demo.png` and `followups-demo.png`
- WhatsApp operations: `public/product/whatsapp/whatsapp-operations-demo.png` (1171×1001)
- Laboratory: `public/product/laboratory/laboratory-management-demo.png` (1171×1180)
- Inventory/operations: `public/product/inventory/operations-demo.png` (1171×1180)
- Reports: `public/product/reports/reports-demo.png` (1171×1180)
- Brand: `public/conphident-logo-transparent.png`

All product screenshots are sanitized and use fictional demonstration data. There are no approved product videos, customer logos, customer testimonials, or externally verified performance statistics in the repository.

## Verified product capabilities

The existing application contains patient CRM and intake, leads, appointments and scheduling, patient records, clinical records, odontogram/dental charting, prescriptions, treatment plans, invoices and payment recording, WhatsApp connection/conversations/reminders/outbox operations, missed calls, follow-up tasks, laboratory cases, inventory movements and purchase orders, exports, analytics/reports, team permissions, audit records, and clinic/tenant administration.

AI-related code exists for the AI coach/chat and workflow assistance. Public copy may describe AI-assisted workflow support and intelligent clinic summaries, but must not claim diagnostic accuracy, regulatory clearance, certification, or autonomous clinical decision-making.

## Existing visual system

Application tokens in `app/globals.css` use cloud backgrounds, Conphi blue (`#176b87`), navy headings, teal/success accents, white cards, and soft borders. Public marketing styles are scoped under `.cf-public`, but a previous generic `.demo-card` selector leaked into the authenticated dashboard; new marketing selectors must remain explicitly scoped.

Target marketing palette:

- Deep Navy `#0B2638`
- Conphi Blue `#176B87`
- Ocean Teal `#159A9C`
- Soft Aqua `#DDF3F4`
- Cloud `#F6FAFB`
- White `#FFFFFF`
- Text Gray `#526575`
- Border `#DCE8EC`
- Premium Gold `#C7A56A`
- Success Green `#238B68`

## Responsive and accessibility baseline

The current public navigation hides its links below 800px without providing a mobile menu. Existing scroll storytelling disables sticky behavior on small screens and respects reduced motion. The redesign must add a keyboard-accessible mobile menu, retain visible focus states, use responsive `next/image` sizing, avoid layout shifts and horizontal overflow, and provide a reduced-motion path.

## Links and conversion flow

Navigation currently targets `/product`, `/features`, `/product#whatsapp`, `/about`, `/login`, and `/demo`. The demo form posts to the existing `/api/demo-requests` route, which validates with Zod, uses a honeypot field, and persists through the existing Prisma model. No backend changes are required.

## Deployment

The project is linked to Vercel project `conphident` in team `an-bot`, uses `npm run vercel-build`, runs Prisma migrations before the Next.js build, and targets region `bom1`. The production custom domain is `https://www.conphident.live/` / `https://conphident.live/`.


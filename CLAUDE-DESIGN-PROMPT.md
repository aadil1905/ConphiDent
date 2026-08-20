# MASTER PROMPT — ConphiDent / DentalAI Clinic Workspace
## Faithful rebuild first, then a deep UX/UI redesign

> Paste this whole document into Claude Design as your first message.
> Do not delete Section 0 — it is what stops the tool from redesigning before it has replicated.

---

# SECTION 0 — HOW YOU MUST WORK (read this before anything else)

You are acting as a **senior product designer + design engineer** for an existing, live SaaS product. This is **not** a greenfield project. A real product already exists, real clinics use it, and my job is to improve it — not to have it replaced by something generic.

## 0.1 The two-phase rule (non-negotiable)

**PHASE A — REPLICATE.** Before you change a single thing, you rebuild the product **exactly as it is today**, screen by screen, from the specification in Sections 2–5 of this document. Same routes, same page titles, same sections in the same order, same table columns, same button labels, same colours, same layout structure. If Section 4 says a page has six sections in a given order, you render six sections in that order. You are producing a faithful "before" — a mirror, not an interpretation.

**PHASE B — REDESIGN.** Only after I explicitly say `APPROVED — START PHASE B` do you begin improving anything. Then you redesign the same screens against the brief in Sections 6–8.

If you are ever unsure which phase you are in, you are in Phase A.

## 0.2 One screen per response, with space to breathe

Do **not** dump the whole app in one go. For every single screen, in both phases:

1. Deliver **exactly one screen per response.**
2. Start the response with a header: `PHASE A · SCREEN 7 of 34 — /dashboard/appointments (Schedule)`
3. Render the screen.
4. Below it, add a short block titled **"What I built here"** — 4–8 bullets naming every section, in order, and where each piece of data comes from.
5. Below that, add **"Deviations & assumptions"** — anything you had to guess because my spec was incomplete. Be honest. If you invented something, say so on its own line prefixed `INVENTED:`.
6. End with: `Reply "next" to continue, or tell me what to change on this screen.`
7. **Then stop and wait.** Do not proceed to the next screen until I reply.

I need this gap between screens so I can correct you page by page. A batch of twenty screens is useless to me.

## 0.3 Ordering

Work through the screens in the exact order listed in Section 3.3. Do not reorder by what you find interesting.

## 0.4 Fidelity rules for Phase A

- Use the **exact hex values** in Section 2. Do not "improve" the palette.
- Use the **exact copy** given in Section 4 for headings, eyebrows, table columns and empty states. Where I have not given you copy, write the plainest possible placeholder and flag it as `INVENTED:`.
- Reproduce the **flaws** too. If Section 5 says the sidebar is hidden behind a hamburger on desktop, then in Phase A the sidebar is hidden behind a hamburger on desktop. The whole point of the "before" is that I can see the problem next to the fix.
- Use realistic Indian dental-clinic sample data: patient names, ₹ amounts, Indian phone formats (+91 98XXX XXXXX), procedure names (RCT, scaling, extraction, crown, composite filling, implant), dates in `DD MMM YYYY`.

## 0.5 Tech constraints

- Next.js App Router + React + TypeScript + **Tailwind v4**.
- Existing primitive library is **Base UI** (`@base-ui/react`) wrapped shadcn-style in `components/ui/*`, plus `lucide-react` icons, `sonner` for toasts, `react-hook-form` + `zod` for forms.
- No new heavy dependencies in Phase A. In Phase B you may propose exactly one charting library (prefer **Recharts**) and nothing else without asking.
- Everything must work as a real component — no screenshots, no image mockups, no lorem ipsum.

---

# SECTION 1 — WHAT THE PRODUCT IS

**ConphiDent / DentalAI** is a multi-tenant SaaS practice-management system for **private dental clinics in India**. One deployment serves many clinics; each clinic is a tenant with feature entitlements and 9 staff roles.

**Who actually uses it, all day, every day:**

| User | Device / context | What they do |
|---|---|---|
| **Receptionist** (primary user, 70% of sessions) | Desktop, 1366×768, one browser tab open all day, phone ringing, patient standing at the counter | Books and reschedules appointments, registers walk-ins, answers WhatsApp, chases follow-ups, collects payments, prints invoices |
| **Dentist** | Chairside tablet or a shared operatory PC, hands gloved or just de-gloved, patient in the chair | Charts teeth, writes clinical notes, prescribes, builds treatment plans, reviews X-rays, sends lab cases |
| **Clinic owner** | Laptop, evenings, once a day | Revenue, collections, conversion, staff access, stock |
| **Assistant / inventory / lab / billing / auditor roles** | Occasional | Narrow slices of the above |

**Design consequence:** this is a *tool people live inside*, not a website people visit. Speed, glanceability, forgiveness and low cognitive load beat visual novelty every single time. A receptionist mid-phone-call must be able to complete a booking without reading anything.

---

# SECTION 2 — CURRENT DESIGN TOKENS (use these exactly in Phase A)

```css
:root {
  --background:        #f7fbfc;   /* app canvas — very pale blue-grey */
  --foreground:        #173c51;   /* body text */
  --card:              #ffffff;
  --card-foreground:   #173c51;
  --primary:           #176b87;   /* ConphiDent teal-blue — brand */
  --primary-foreground:#ffffff;
  --primary-hover:     #125b73;
  --primary-soft:      rgba(23,107,135,0.08);
  --secondary:         #ddf3f4;
  --secondary-foreground:#123b5d;
  --muted:             #eef7f8;
  --muted-foreground:  #5b7180;
  --accent:            #ddf3f4;
  --accent-foreground: #123b5d;
  --heading:           #123b5d;   /* deep navy for h1–h3 */
  --text:              #173c51;
  --text-muted:        #5b7180;
  --border:            rgba(23,107,135,0.14);
  --border-strong:     rgba(23,107,135,0.22);
  --ring:              #176b87;
  --focus-ring:        rgba(23,107,135,0.28);
  --shadow:            0 12px 32px rgba(18,59,93,0.08);
  --radius:            0.75rem;   /* sm=0.45 md=0.6 lg=0.75 xl=1.05 2xl=1.35rem */
  --sidebar:           #123b5d;   /* navy — note: defined but the live sidebar renders white */
  --chart-1:#176b87; --chart-2:#2d879b; --chart-3:#6eaeb9; --chart-4:#c4a46c; --chart-5:#123b5d;

  --workspace-card-radius: 1rem;
  --workspace-card-padding: 1.25rem;
  --workspace-shadow: 0 8px 24px rgba(18,59,93,0.07);
  --workspace-content-max: 107.5rem;
  --workspace-page-padding: clamp(1rem, 1.5vw, 2rem);
  --workspace-section-gap: 1.5rem;
  --workspace-control-height: 2.5rem;
}
```

**Typography today:** system sans stack. Page `h1` = `text-3xl`/`sm:text-4xl` bold navy. Section `h2` ≈ `text-lg`/`text-xl` semibold. Eyebrow labels above `h1` = 10–11px, uppercase, `tracking-[0.16em]`, primary teal. Table headers ≈ 11–12px uppercase. Body 14px.

**Card pattern today:** `rounded-2xl border bg-white p-5 shadow-sm` with border colour `rgba(23,107,135,.14)`.

**A dark-mode token block exists in the codebase but is never activated. Ignore it in Phase A.**

---

# SECTION 3 — INFORMATION ARCHITECTURE AS IT IS TODAY

## 3.1 App shell (reproduce exactly in Phase A)

- **Sidebar** (`components/Sidebar.tsx`): a fixed off-canvas drawer, `w-[min(88vw,320px)]`, white background, `-translate-x-full` by default, opened by a floating hamburger button pinned at `left-4 top-4`, size 48×48, rounded-xl, white, shadowed. There is **no docked desktop variant** — it is a drawer at every breakpoint. A translucent navy overlay (`#123b5d`/35 + backdrop-blur) sits behind it when open. Header shows clinic logo (56px, or a letter tile) + eyebrow `CLINIC WORKSPACE` + clinic name. Footer shows a `Clinic settings` link (OWNER only) and a pale `PRIVATE CLINIC WORKSPACE` chip.
- **Sidebar groups and labels, exactly as they are:**
  - **Workspace** — Today (`/dashboard`), Inbox (`/dashboard/conversations`), Automation (`/dashboard/automation`), Schedule (`/dashboard/appointments`), Today's priorities (`/dashboard/huddle`), Patients (`/dashboard/patients`)
  - **Patient care & revenue** — Clinical workspace, Treatment plans, Prescriptions (`/dashboard/prescriptions/new`), Revenue (`/dashboard/billing`), Billing settings (`/dashboard/settings/billing`)
  - **Manage** — Leads, Work queue (`/dashboard/follow-ups`), Laboratory, Operations, **Reports** (which actually points at `/dashboard/analytics`)
- **Topbar** (`components/Navbar.tsx`): sticky, 80px tall, `pl-24` (to clear the hamburger), translucent background + blur. Left: clinic name in uppercase teal + clinic address in grey. Right: a search input `Search patients, appointments, invoices…` (**hidden below the `md` breakpoint**, submits as a GET form to `/dashboard/search`), a notification bell with a dropdown list, an avatar menu (Profile & clinic details / Notifications & WhatsApp / Logout).
- **Content**: `dashboard-shell mx-auto pt-20`, max width `107.5rem`.

## 3.2 Complete route map

**Public / auth:** `/`, `/about`, `/features`, `/product`, `/demo`, `/privacy`, `/terms`, `/data-deletion`, `/login`, `/forgot-password`, `/reset-password`, `/change-password`, `/setup`
**Token-gated patient & partner pages:** `/intake/[token]` (patient self-intake), `/appointment/[token]` (patient confirms/reschedules), `/shared/[token]` (shared document), `/lab/cases` (external lab portal)
**Clinic dashboard:** `/dashboard` · `appointments` (+`/new`, `/[id]`, `/[id]/edit`) · `calendar` · `patients` (+`/new`, `/[id]`, `/[id]/edit`, `/[id]/case-paper`, `/[id]/xrays`) · `patient-intake` · `clinical-workspace` (+`/[patientId]`) · `clinical-records` (+`/new`, `/[id]/edit`) · `treatment-plans` (+`/new`, `/[id]/edit`) · `prescriptions/new` (+`/[id]/edit`, `/[id]/print`, `/templates`, `/profile`) · `imaging` (+`/comparisons/[id]`) · `laboratory` (+`/new`, `/[id]`, `/[id]/print`) · `billing` (+`/new`, `/[id]`, `/[id]/print`) · `conversations` · `automation` · `whatsapp-operations` · `follow-ups` · `leads` · `huddle` · `operations` · `analytics` · `reports` · `exports` · `search` · `ai-coach` · `launch` · `help` · `settings` (+`/billing`, `/operations`, `/security`, `/whatsapp`)
**Platform super-admin console:** `/platform` + `analytics`, `audit`, `automations`, `billing`, `clinics`, `health`, `infrastructure`, `notifications`, `onboarding`, `operations`, `organizations`, `sales`, `support`, `users`, `whatsapp`

## 3.3 Build order — follow this exactly

**Group 1 — Shell & daily core (screens 1–8)**
1. App shell (sidebar + topbar + empty content area)
2. `/dashboard` — Today at a glance
3. `/dashboard/appointments` — Schedule list
4. `/dashboard/appointments/new` — Booking form
5. `/dashboard/patients` — Patients list
6. `/dashboard/patients/[id]` — Patient 360
7. `/dashboard/patients/new` — Add patient
8. `/dashboard/huddle` — Daily huddle

**Group 2 — Clinical (screens 9–14)**
9. `/dashboard/clinical-workspace` — patient picker
10. `/dashboard/clinical-workspace/[patientId]` — charting workspace
11. Dental chart editor (component, in isolation)
12. `/dashboard/prescriptions/new` — prescription form
13. `/dashboard/treatment-plans` + `/new`
14. `/dashboard/clinical-records` + `/new`

**Group 3 — Money (screens 15–18)**
15. `/dashboard/billing` — invoices & collections
16. `/dashboard/billing/new` — invoice form
17. `/dashboard/billing/[id]` — invoice detail + payment
18. `/dashboard/settings/billing` — billing identity

**Group 4 — Comms & growth (screens 19–24)**
19. `/dashboard/conversations` — WhatsApp inbox
20. `/dashboard/automation`
21. `/dashboard/whatsapp-operations`
22. `/dashboard/follow-ups` — work queue
23. `/dashboard/leads` — lead CRM
24. `/dashboard/ai-coach`

**Group 5 — Ops & insight (screens 25–30)**
25. `/dashboard/laboratory`
26. `/dashboard/imaging`
27. `/dashboard/operations` — inventory
28. `/dashboard/analytics`
29. `/dashboard/reports`
30. `/dashboard/calendar`

**Group 6 — Admin & edges (screens 31–34)**
31. `/dashboard/settings`
32. `/dashboard/search`
33. `/dashboard/help` + `/exports` + `/launch`
34. `/intake/[token]` — patient-facing self-intake

---

# SECTION 4 — PAGE-BY-PAGE CURRENT STATE (this is what you replicate in Phase A)

For each page: **eyebrow** (small uppercase label above the title) · **h1** · **sections in order** · **notes**.

**`/dashboard`** — eyebrow `CLINIC COMMAND CENTRE` · h1 `Today at a glance`
Amber "front-desk focus" banner → `Attention board` (5 clickable count tiles: recovery tasks, new enquiries, open conversations, delayed lab cases, low-stock items — each linking to its queue) → 5 KPI cards (appointments today, new patients 30d, treatment plans MTD, production MTD, collections MTD) → `Today's appointments` list → dental odontogram widget → `Patient base` ring (**note: the ring's colour segments are hardcoded CSS borders, not proportional to data**) → `Recent WhatsApp` preview → `Recommended clinic actions` (4 static link cards, always the same regardless of state).

**`/dashboard/appointments`** — eyebrow `SCHEDULE` · h1 `Appointments`
Search + status filter + sort (all URL-driven) → table columns: `Patient | Phone | Date & time | Reason for visit | Status` + row actions → pagination → a "Delete all appointments" dialog exists.

**`/dashboard/appointments/new`** — booking form, 9 fields: patient name*, phone*, branch, date (native `input type=date`), **time (a `<select>` of pre-generated slots)**, reason for visit, status, provider, chair + notes. When no slots are configured for the chosen date the time select renders a single disabled option `No future configured slots for this date` and **booking becomes impossible**. Inline zod errors per field; server errors appear only as a `sonner` toast.

**`/dashboard/patients`** — eyebrow `PATIENT WORKSPACE` · h1 `Patients`
One search box (name/phone/email, submits as a full-page GET, no debounce) → table `Patient | Contact | Completed visits | Added | Actions` → 10 per page, URL pagination. No column sorting.

**`/dashboard/patients/[id]`** — Patient 360, ~829 lines, one long scroll
Header (name, phone, visit count, `View case paper`, `Add X-rays`) → patient-portal readiness card → horizontal visit-date picker → sticky in-page anchor nav `Summary / Clinical / Plans / Prescriptions / Billing / Appointments` (anchor-scrolls only — **every section is rendered at once, nothing is lazy**) → patient details → clinical workspace summary → treatment plans → prescriptions → full invoice table → appointments.

**`/dashboard/clinical-workspace/[patientId]`** — visit-date selector → dental chart editor → saved workspace for the selected date → clinical note.
**Critical current behaviour:** the editor is locked unless the patient has an appointment already marked `Completed` on that date. Locked-state copy: *"Mark one appointment as Completed to start recording clinical work for that visit date."* An undocumented `?new=1` query param bypasses it.

**Dental chart editor** — FDI-numbered arch of tooth buttons, click to toggle-select (multi-select allowed), then a panel: `Record as` → `Condition` → up to 5 surface checkboxes → note → **a native `window.confirm()` fires on every save**. Age-aware dentition-stage suggestion and FDI pronunciation helper are present.

**`/dashboard/prescriptions/new`** — blocked with an amber panel if the patient has no completed appointment: *"This patient has no completed appointment. Prescription issuing stays blocked."* Otherwise: per-medicine card with **14 free-text fields** — generic name*, brand, strength*, dosage form*, dose*, dose unit*, route*, frequency*, timing, with/after meal, duration*, quantity, indication, max dose — plus 2 checkboxes and an instructions textarea. `Add medicine` and a duplicate-medicine button. Templates can be applied. **No drug database, no autocomplete anywhere.**

**`/dashboard/treatment-plans`** and **`/dashboard/clinical-records`** — plain lists with **no search, no filter, no pagination**, hard-capped at `take: 30` with no indication that more records exist.

**`/dashboard/billing`** — eyebrow `REVENUE` · h1 `Invoices and collections` — no search, no filters, 50/page, row actions are only `Manage` and `Void`. **No way to collect a payment from the list.**

**`/dashboard/conversations`** — eyebrow `WHATSAPP INBOX` · h1 `Patient conversations`
Left thread list with filter tabs (incl. `OPTED_OUT`) → centre message thread → right `Patient context` panel. Links out to `/dashboard/whatsapp-operations` labelled "Message diagnostics". **No unread badges, no live updating.**

**`/dashboard/automation`** — a flat list of conversations with a single 3-way `<select>` per row: Bot / Human / Paused. That is the entire page.

**`/dashboard/whatsapp-operations`** — delivery diagnostics: failed and dead-lettered scheduled messages, retry actions.

**`/dashboard/follow-ups`** — eyebrow `WORK QUEUE` · h1 `Follow-ups and recovery` → `Action queue` with 10 task categories, owner assignment, outcome logging, and a `Refresh queue` button that generates tasks server-side **with no feedback about how many were created**.

**`/dashboard/leads`** — eyebrow `AI CONVERSION COACH` · h1 `Lead CRM` → `Conversion health` tiles → `Add enquiry` form → `Lead pipeline` (statuses NEW/CONTACTED/BOOKED/VISITED/CONVERTED/LOST). `Convert to patient` and `Close lead` are adjacent single-click buttons **with no confirmation**.

**`/dashboard/laboratory`** — eyebrow `LABORATORY COMMAND CENTRE` · h1 `Clinic-to-lab workflow` → `Case worklist` (delayed cases get a red left border only) → `Add laboratory` → `Active laboratory directory`.

**`/dashboard/imaging`** — h1 `X-rays & imaging records` → `Clinic imaging worklist` → `Identity & clinical review` (matched/unmatched studies) → `Saved clinical comparisons`. **Upload is not on this page** — a banner sends you to the clinical workspace.

**`/dashboard/operations`** — eyebrow `CLINICAL SUPPLY CONTROL` · h1 `Inventory command centre` — eleven stacked sections in this order: `Safety queue`, `Item master & opening batch` (18-field form), `Record clinical consumption`, `Create purchase order`, `Procedure consumption template`, `Confirm actual template consumption`, `Stock ledger`, `Purchase receiving`, `Recent movements`, `Batch recall control`.

**`/dashboard/analytics`** — h1 `Analytics` → collections/revenue tiles → `Top procedures this month` → `Recommended actions` → a link out to `/dashboard/reports`. **Number tiles only. No charts.**

**`/dashboard/reports`** — eyebrow `AI CONVERSION COACH` · h1 `Conversion intelligence` → `Conversion funnel` (hand-rolled div progress bars) → `Follow-up performance` → `Laboratory reliability · 30 days` → `Source quality` (table: `Source | Enquiries | Booked | Converted`) → `Why leads are lost`.

**`/dashboard/huddle`** — eyebrow `MORNING CONTROL ROOM` · h1 `Daily huddle` → `Today's patient flow` → `Lab work threatening patient flow` → overdue outreach.

**`/dashboard/settings`** — eyebrow `PREMIUM SETUP` · h1 `Clinic settings & staff access` — a single long scroll: `Clinic operations` (link) → `WhatsApp` (link) → `Production launch` (link) → `Your account security` (link) → `Clinic profile` form → `Billing identity` form (GSTIN, invoice prefix) → `Add staff member` (12-char password minimum, no confirm field, plaintext temp password) → `Current access` (enable/disable staff, **no confirmation dialog**) → `Recent owner activity` (20-row audit log).

**`/dashboard/search`** — eyebrow `GLOBAL SEARCH` · h1 `Search workspace` — searches patients, appointments, leads, invoices, lab cases, WhatsApp, treatment plans, prescriptions. **Form submit only, no live results, no keyboard shortcut.**

**`/dashboard/calendar`** — h1 `Clinic calendar` — read-only week grid. No drag-drop, no create-from-cell, no day/month toggle.

**`/dashboard/ai-coach`** — a FAQ question/answer CRUD table, OWNER only. No AI configuration, no preview.
**`/dashboard/exports`** — three static CSV download links.
**`/dashboard/help`** — three static link cards and two tips.
**`/dashboard/missed-calls`** — a retired route that calls `notFound()`.

---

# SECTION 5 — THE PROBLEMS TO FIX IN PHASE B

These came out of a full code audit. Fix the **cause**, not the symptom. I do not want cosmetic re-skinning.

### Navigation & findability
1. **The sidebar is an off-canvas drawer at every breakpoint** — even on a 24-inch desktop the receptionist must open a hamburger for every navigation, ~200 times a day.
2. **Eleven built modules are absent from the nav entirely:** imaging, calendar, clinical-records list, reports, help, exports, launch, ai-coach, whatsapp-operations, patient-intake, prescription templates. Imaging — an entire DICOM-grade module — is reachable only through a conditional notification link.
3. **Sidebar labels contradict the pages they open.** "Reports" opens `/analytics`; the real `/reports` is orphaned. "Revenue" opens billing. "Work queue" opens follow-ups. "Today's priorities" opens huddle.
4. **Global search is topbar-only and hidden below the `md` breakpoint**, form-submit only, with no Cmd/Ctrl-K.

### Flow & clinical reality
5. **Charting and prescribing are hard-gated on an appointment already marked `Completed`.** Real chairside order is: patient sits → dentist charts → visit is then closed. The product inverts it.
6. **`window.confirm()` fires on every dental-chart save** — a blocking OS dialog in the middle of chairside work.
7. **Prescriptions are 14 free-text fields per drug with no formulary or autocomplete.** A 3-drug script is ~40 fields of manual typing on a legally significant document.
8. **No payment can be started from the billing list** — every collection requires drilling into an invoice.
9. **Booking is impossible when no slots are configured for a date** — dead end, no manual override.

### Data honesty
10. **`clinical-records` and `treatment-plans` silently truncate at 30 rows** with no pagination, no search, and no "showing 30 of N". Staff read this as data loss.
11. **`/reports` and `/analytics` compute lead conversion with two different formulas** and both present themselves as the source of truth. An owner switching tabs sees two different conversion rates for the same clinic.
12. **There are no charts anywhere in the product** — no charting library is installed. "Analytics" is number tiles and one hand-rolled div bar.

### Duplication
13. **Four surfaces for one WhatsApp thread:** conversations, whatsapp-operations, automation, settings/whatsapp.
14. **follow-ups vs leads:** one enquiry can exist as a `Lead` *and* a `FollowUpTask` with two independent lifecycles.
15. **dashboard home vs huddle** both re-derive today's appointments, overdue follow-ups and low stock with separately written queries that will drift apart.

### Liveness & feedback
16. **Nothing is real-time.** SSR-only, manual refresh. The WhatsApp inbox and the notification bell go stale.
17. `Refresh queue` on follow-ups gives no feedback. `Convert to patient` and `Close lead` are unconfirmed one-click actions. `Disable staff` instantly revokes a colleague's login with no confirmation. There is no undo anywhere.

### Craft
18. **`globals.css` is 105 KB / 1,093 lines / ~310 bespoke classes** mixing the marketing site, product demos and the app in one file shipped to every page; 58 `!important` declarations; ~265 lines of `.platform-*` styles referenced by nothing; a global rule that patches hand-rolled cards because only 6 files use `<Card>` while 14 roll their own.
19. **~133 `<input>` elements vs 54 `<label>`** — roughly half are placeholder-only. No `aria-current` on the active nav item. The drawer has no focus trap and no Escape-to-close. The consent signature pad is pointer-only and unusable by keyboard.
20. **No keyboard shortcuts of any kind.**
21. Dead weight: three 0-byte components, ~170 commented-out lines in Patient 360, an empty `inventory/` directory, a `notFound()` stub route.

---

# SECTION 6 — PHASE B BRIEF: WHAT "BETTER" MEANS HERE

## 6.1 The five principles, in priority order

1. **Never make a clinician wait on the software.** The most common action on any screen is reachable in one click, and never behind a drawer, a modal, or a page navigation.
2. **Tell the truth about data.** Never silently truncate, never show two numbers for one fact, always say "showing 30 of 214".
3. **Be forgiving.** Every destructive action is either confirmed *or* undoable — preferably undoable. Nothing is ever lost because a network call failed.
4. **Speak like a colleague, not a system.** See 6.3.
5. **Earn every pixel.** If a section does not change what someone does next, it should not be on the screen.

## 6.2 Structural fixes required (not optional)

- **Dock the sidebar** at `lg` and above (`lg:static lg:translate-x-0`), collapsible to a 72px icon rail with tooltips, remembered per user. The drawer survives only below `lg`. Add `aria-current="page"`, a focus trap, and Escape-to-close on the mobile drawer.
- **Rebuild the IA around what staff actually do**, not around database tables. Proposed grouping — argue with me if you disagree, but justify it:
  - **Today** — home, huddle merged into one true "what do I do next" screen
  - **Schedule** — calendar and appointment list as two views of one screen, not two routes
  - **Patients** — list, Patient 360, intake
  - **Clinical** — workspace, charting, prescriptions, treatment plans, records, imaging
  - **Money** — invoices, payments, billing settings
  - **Messages** — one WhatsApp surface with tabs: Inbox · Automation · Delivery · Connection
  - **Growth** — leads and follow-ups merged into one "people to contact" queue with a single lifecycle
  - **Operations** — inventory, laboratory
  - **Insights** — one analytics home, with reports as a tab
  - **Settings**
- **Add a global command palette** (Cmd/Ctrl-K) that searches patients, appointments, invoices *and* runs actions ("book appointment", "new invoice", "add patient"). Make search visible at every breakpoint.
- **Unbind clinical work from appointment status.** Let the dentist chart and prescribe whenever a patient is open; reconcile the visit record on save and surface it as a gentle inline note, never a lock.
- **Kill every `window.confirm()`.** Reversible actions get an optimistic update + an undo toast (8 s). Only genuinely irreversible actions get a styled dialog, and that dialog must name the specific consequence ("Void invoice INV-2044 for ₹12,500 — this cannot be undone").
- **Give the prescription form a formulary.** One combobox that resolves generic + strength + form in a single keystroke sequence, with the clinic's own recently-used drugs at the top. Collapse to 4 visible fields; everything else behind "More options". Support multi-drug entry without leaving the keyboard.
- **Add inline payment collection** from the billing list — an amount + method popover, no navigation.
- **Every list gets** debounced live search, sortable columns, URL-persisted filters, a saved-views concept, real pagination with totals, and bulk actions where they make sense (confirm, remind, reschedule).
- **Add real charts** (Recharts): revenue by week with a prior-period comparison, appointments per day, conversion funnel over time, collections vs production. Use `--chart-1..5` for series colour. Derive every number from a **single shared metrics module** so no two screens can disagree.
- **Make it feel live.** Poll the inbox, the notification bell and the today queue every 30 s with `router.refresh()`, and show a quiet "updated just now" timestamp.

## 6.3 What "humanlike" means — be specific, this is where most redesigns fail

**Microcopy.** Replace system voice with colleague voice, everywhere.

| Instead of | Write |
|---|---|
| "No future configured slots for this date" | "Nothing is set up for Fridays yet. Pick another day, or book a time manually." |
| "Mark one appointment as Completed to start recording clinical work" | "You can start charting now — I'll attach it to today's visit when you save." |
| "This patient has no completed appointment. Prescription issuing stays blocked." | "Riya hasn't had a visit recorded yet. Start a visit and the prescription will attach to it." |
| "0 results" | "No patients match 'shar'. Try a phone number, or add them as a new patient." |
| "Error: failed to save" | "That didn't save — your connection dropped. Nothing was lost; try again." |
| "Attention board" | "Needs you today" |
| "Recovery tasks" | "Patients to call back" |

**Rules for all copy:** second person; the patient's first name wherever you have it; contractions; never blame the user; every error names the fix, not just the fault; never use the words *entity*, *record*, *submit*, *invalid*, *provision*, *utilise*, *leverage*.

**Empty states** have a one-line explanation, an illustration or icon, and a primary action. Never a bare "No data".

**Time is human.** "in 20 minutes", "yesterday, 4:30 pm", "overdue by 3 days" — with the exact timestamp on hover.

**Rhythm and calm.** 8px spacing scale. Cards only where a card earns its border. Motion 150–200 ms, ease-out, and honour `prefers-reduced-motion`. No decorative gradients in the workspace — save personality for microcopy and empty states, not chrome.

**Density that respects the screen.** Target 1366×768. Body 14px, table body 13px minimum (nothing at 10px), 44px minimum touch targets, sticky table headers, and a compact/comfortable density toggle for power users.

**Personality without noise.** A greeting that knows the time of day and the person's name. A quiet acknowledgement when the queue is empty ("Nothing overdue. Nice."). One well-placed piece of warmth per screen — never more.

## 6.4 Craft baseline for every Phase B screen

- Every input has a real `<label>`; placeholders are examples, never labels.
- Visible focus rings on everything interactive; full keyboard operation of every flow including the chart and the signature pad.
- Loading = skeletons matching the final layout, never spinners on full pages.
- Optimistic UI on every mutation, with rollback and an explanatory toast on failure.
- Forms autosave drafts to local storage and restore them; never lose typed work.
- Errors appear inline against the field, and a summary at the top for screen readers.
- Contrast ≥ 4.5:1 for all text; state is never signalled by colour alone (add an icon or a word).
- Every screen designed at 1366×768, 1920×1080, and 768px tablet.

---

# SECTION 7 — WHAT I WANT FROM YOU IN PHASE B, PER SCREEN

For each screen, in this order, one screen per response:

1. **The redesigned screen**, fully built and interactive.
2. **What changed and why** — a table: `Before → After → Which numbered problem from Section 5 this fixes`. Only list real changes.
3. **Flow diagram in words** — the primary task on this screen, step by step, with the click count before and after.
4. **Microcopy diff** — every string you rewrote, old and new, side by side.
5. **What I chose not to change**, and why.
6. `Reply "next" for the following screen.` Then stop.

---

# SECTION 8 — GUARDRAILS

- **Do not** invent modules I did not ask for. If you think something is missing, put it in a "Suggestions" block at the end of a response — do not build it.
- **Do not** change the brand palette. `#176b87` and `#123b5d` stay. You may add neutral greys and semantic success/warning/danger, and you must state their hex values when you do.
- **Do not** replace Base UI with another component library.
- **Do not** move to a dark theme, a glassmorphic style, a neon accent, or any trend-led aesthetic. This is a medical tool used for eight hours a day. Calm, legible, quiet.
- **Do not** produce more than one screen per response, in either phase.
- **Do not** start Phase B until I type `APPROVED — START PHASE B`.
- If any part of this spec is ambiguous, ask me **before** building, in a single batched list of questions — not one at a time.

---

**Begin now with `PHASE A · SCREEN 1 of 34 — App shell`. Build it exactly as described in Section 3.1, including the flaws. Then stop and wait for me.**

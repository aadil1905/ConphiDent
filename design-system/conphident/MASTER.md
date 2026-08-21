# ConphiDent — Design System (Master)

Source of truth for the public marketing site (`www.conphident.live`) and the
public signup portal (`setup.conphident.live`). Platform admin (`/platform`,
`/setup`) keeps its own token system in `app/portal.css` and is out of scope.

The authenticated clinic app (`/dashboard`) used to be out of scope too. It is
not any more — it is the one surface with two palettes, and the contrast proofs
for both live in [The clinic workspace](#the-clinic-workspace-two-modes) below.

Generated with `ui-ux-pro-max --design-system --variance 7 --motion 8 --density 3`
on 16 August 2026, then corrected — the deviations are recorded below with reasons.

## Deviations from the generated recommendation

| Generated | Shipped | Why |
|---|---|---|
| Style: **Neumorphism** | **Bento grid** + restrained aurora depth | Neumorphism is flagged `accessibility risk:high` and its low-contrast embossing is wrong for a clinical trust product. Bento is `risk:low` and is the recommended style for SaaS product pages. |
| Pattern: **Hero → Testimonials carousel → CTA** | Hero → Problem → Proof (real screenshots) → CTA | `MARKETING-SITE-INVENTORY.md` records that no customer testimonials, logos or verified statistics exist. Fabricating them is prohibited. Real product previews carry the proof slot instead. |
| `--color-on-primary: #000000` | `#FFFFFF` on a deeper primary | Black-on-cyan reads cheap. Deepening primary to `#0E7490` lets white pass AA at 5.36:1. |
| Background `#ECFEFF` | `#F4FBFC` | The generated tint is too saturated across full-bleed sections. |
| Border `#A5F3FC` | `#D5E8ED` | Saturated cyan borders vibrate against white cards. |

## Revision — enforcement pass, second sweep (21 Aug 2026, later the same day)

- **The Control Center has one visual language now.** globals.css's `.platform-*`
  base rules were folded onto the institutional values portal.css had been
  winning with at higher specificity — the blue radial gradients, gradient
  buttons, navy shadows and hover-lift are gone from the base rather than
  merely beaten. portal.css keeps its mirrored overrides as the pin (its
  header explains the twin-maintenance rule). The ≤520px masthead override
  that re-rounded the flat masthead into a hybrid is fixed; remaining navy
  rgba(18,59,93) shadows re-tinted to ink.
- **Booking window unlocked.** /appointments/new anchors its 7-day grid on
  `?date=` (clamped to a year); BookAVisit gained the "Further out?" picker.
  Recalls months out book from the normal screen.
- **Week grid derives its hours** from the visits in the window over a
  9am–7pm default — an 8pm visit gets a cell instead of vanishing.
- **Deleted:** the orphaned root globals.css; AdministrativeActionConfirmation
  (a no-op MutationObserver on every page — its `.dashboard-shell` scope never
  rendered); the unrendered `.conphident-marketing` !important layer; four
  orphaned Appointment* components; the fictional "WhatsApp reminder the
  evening before" checkbox (nothing scheduled it; reminders send from the
  visit).
- **Restored:** the entitlement-gated "Message on WhatsApp" action on the
  patient record (the source test pinning `whatsappOn && ` was failing because
  a refactor had dropped it). Test suite: 186 tests, 0 failures.
- **Focus contracts:** CommandPalette and AddPatientSheet now trap Tab and
  restore focus to their opener, matching NavDrawer.

## Revision — enforcement pass (21 Aug 2026)

No token changed value. This pass made the declared system true in the DOM:

- **The type scale is now consumed, not shadowed.** ~440 arbitrary `text-[Npx]`
  utilities across 96 workspace files were moved onto `--text-body/-dense/
  -secondary/-micro`. 13.5px and 12.5px one-offs normalised to `--text-secondary`;
  modal titles (five files, 17–18px) normalised to `--text-section`. Sanctioned
  non-token sizes that remain: Tailwind `text-xs`/`text-sm` (12/14px) and the
  10px badge-count/kbd labels.
- **`--input` finally paints.** The workspace input default (border `--input`,
  the 3:1 control boundary) had been dead behind `.dashboard-shell`, a class
  nothing renders. It now lives in `@layer base` behind `:where()` scoped to
  `.clinic-theme`, so call-site utilities (StatusSelect's tone tints, danger
  borders) still win. The three form-field class strings that hardcoded the
  failing `border-border` hairline now say `border-input`.
- **Interaction chrome retokenized.** The route-progress bar, loading pill and
  spinners ran a retired indigo/sky/green palette; all on `--primary`/`--card`/
  `--border` now, so they follow dark mode. The pending-state spinner rules were
  repointed from `.dashboard-shell` to `.clinic-theme` and render for the first
  time.
- **Primary-button labels** say `text-primary-foreground` (90 call sites), not
  `text-white`.
- **Control Center floor fixed:** `.platform-shell__content button` outranks
  `.platform-button`, so its 2.5rem was the real height of every CC button —
  raised to 2.75rem, with both close buttons.
- **Dead CSS removed:** the never-rendered `.dashboard-shell`/`.login-screen`
  blocks (sky-blue focus ring, off-token radius, blanket min-height, padding
  queries) and two orphaned keyframes.

## Revision — modern SaaS (17 Aug 2026) — CURRENT

The heritage direction below was reversed. Aadil was asked twice whether to keep
it and chose to move to a modern SaaS register. Everything in the heritage
section that follows is kept for its reasoning and its contrast maths, which
were the starting point for the palette here — it is history, not the target.

**Switched at the token layer, deliberately.** The site is nine pages driven by
one variable block in `app/marketing.css`, so the register moved by changing
values, not pages. No page file was edited. That is also why `--c-gold` still
exists: it now holds a teal accent. Renaming it would have meant touching every
section label on the site for no visual gain.

| | Heritage (16 Aug) | Modern SaaS (17 Aug) |
|---|---|---|
| Ground | `#FAF9F6` warm paper | `#F7F9FC` cool |
| Ink | `#10262E` | `#0B1B2B` |
| Body | `#4A5B61` | `#475A6B` |
| Primary | `#0E6379` | `#0E7490` |
| Accent (`--c-gold`) | `#8A6A2F` gold | `#0F766E` teal |
| Border | `#E4E6E3` | `#DCE5EE` |
| Headings | Source Serif 4 | Plus Jakarta Sans |
| Body type | Source Sans 3 | Inter |
| Display tracking | `-0.018em` | `-0.032em` |
| Radius (control/card/tile) | 8 / 10 / 14 | 10 / 16 / 20 |
| Elevation | single soft shadow | two-part, crisp contact edge |

**Contrast, verified again for the new palette.** Lowest measured pair is
5.08:1. Checked in the browser against computed styles, not just on paper:
display heading 17.41:1, lead 7.14:1, section label 5.47:1, primary button
5.36:1, trust line 4.87:1, footer link 4.63:1. **All pass AA.**

**Three mistakes from the first cyan attempt are not repeated** — they are the
reason this palette is not the generated one: the ground is `#F7F9FC` rather
than a saturated `#ECFEFF`; borders are cool grey rather than `#A5F3FC`, which
shimmered against white cards; and text on primary is white on deep teal rather
than black on cyan.

**Tracking had to move with the family.** A book serif sits near `-0.012em`; a
grotesque at display size wants roughly `-0.03em`. Leaving the old values would
have left every heading looking untouched but loose.

**The clinic dashboard's headings followed.** `brandFontVariables` sits on
`<html>` in `app/layout.tsx` and `globals.css` applies `--font-display` to all
`h1`–`h4`, which was an intentional link. So the app's headings are now Plus
Jakarta Sans too. Its palette is untouched — only the typeface moved. To
decouple, set an explicit `font-family` on the dashboard scope rather than
reverting `lib/fonts.ts`.

## Superseded — heritage institutional (16 Aug 2026)

The first pass shipped a cyan "modern SaaS" direction. The brief was then
sharpened to *premium, as if the company had 35+ years behind it*, which is a
different register: institutional and editorial rather than startup-modern. The
palette moved from a cool cyan tint to a warm paper ground with a deeper teal,
headings moved from a geometric sans to a serif, and radii tightened (softness
reads young). The aurora field was cut to roughly a third of its former opacity.

A side benefit: in the warm palette gold finally passes AA as text (4.77:1 on
paper), so it now carries the section labels instead of being marks-only.

## Colour tokens

All pairs below were verified with a WCAG relative-luminance check before
shipping. **Every pair passes AA.**

| Token | Hex | Use | Verified |
|---|---|---|---|
| `--c-ink` | `#10262E` | Headings, high-emphasis text | 14.90:1 on paper |
| `--c-body` | `#4A5B61` | Body copy | 6.74:1 on paper, 7.09:1 on white |
| `--c-primary` | `#0E6379` | CTAs, links | 6.48:1 on paper; 6.82:1 with white |
| `--c-primary-deep` | `#0A4E60` | Hover / pressed | 9.24:1 with white |
| `--c-gold` | `#8A6A2F` | Section labels, rules, accents | 4.77:1 on paper, 5.02:1 on white |
| `--c-gold-on-ink` | `#D9B877` | Gold text on dark sections | 8.27:1 on ink |
| `--c-glow-text` | `#8FC9D6` | Secondary label on ink | — |
| `--c-ink-muted` | `#A9BCC2` | Muted text on ink | 7.96:1 on ink |
| `--c-success` | `#0F6B4F` | Confirmations, "with ConphiDent" column | 6.49:1 with white |
| `--c-surface` | `#FFFFFF` | Cards | — |
| `--c-tint` | `#FAF9F6` | Warm paper ground | — |
| `--c-muted` | `#F1F0EC` | Inset panels, chips | ink 13.76:1 |
| `--c-border` | `#E4E6E3` | Hairlines | — |

## Typography

- Headings: **Source Serif 4** (400/600/700, incl. italic) — an established
  institution speaks in book type, not in the geometric sans every new SaaS ships.
- Body: **Source Sans 3** (300–700). Same superfamily, drawn to work together.
- Loaded via `next/font/google` in `PublicShell`, exposed as `--font-display` / `--font-body`.
- Serifs want far less negative tracking than a grotesque: headings sit at
  `-0.012em`, display at `-0.018em`, not the `-0.04em` a sans would take.
- Base body 16px, line-height 1.6. Never below 12px.

## Imagery

There are **no product screenshots**. The previous PNGs under `public/product/`
were pre-Phase-B and showed a UI the app no longer ships. They are replaced by
`components/marketing/ProductVisuals.tsx` — animated SVG/CSS depictions of each
module, plus `WhatsAppThread.tsx`, which replays the real reception flow.

Because these are illustrations rather than captures, every caption reads
"Interface illustration", never "product preview". Do not reintroduce the PNGs.

## Spacing — spacious (density 3/10)

`--space-*`: 24 / 32 / 48 / 64 / 80 / 96 / 128px. Section rhythm is 96–128px
desktop, 64–80px mobile.

## Radius & elevation

Radius 16px cards, 24px feature tiles, 999px pills, 12px controls.
Shadows stay soft and cool: `0 1px 2px rgba(8,37,46,.04)`,
`0 12px 32px rgba(8,37,46,.08)`, `0 32px 80px rgba(8,37,46,.14)`.

## Motion (Framer Motion, `motion/react`)

Translated from the GSAP presets — same physics, different runtime.

| Pattern | Spec |
|---|---|
| Scroll reveal | opacity 0→1, y 14→0, 500ms, `[0.22,1,0.36,1]`, `once: true` |
| Stagger | 0.04s per child, cap total under 400ms |
| Headline | word-level stagger, ≤8 words only |
| Parallax | decorative layers only, 5–15% delta, **never on text or controls** |
| Hover lift | `y:-4, scale:1.02`, spring `{stiffness:260, damping:22}` |
| Tab / panel swap | `AnimatePresence` crossfade 280ms |

**Every** motion component reads `useReducedMotion()` and renders the final
state immediately when reduce is set. No exceptions.

## The clinic workspace: two modes

The marketing site sells a heritage institution and sits on warm paper. The
workspace is looked at for nine hours a day, and a tint on every surface is a
tint behind every radiograph thumbnail and every shade swatch held next to the
screen. So the workspace ground is **plain white, and plain black when the
operating system asks for dark** — no colour underneath anything. The teal and
the semantic states keep their hues; only the neutrals moved.

Two consequences were designed for rather than discovered:

- **The card no longer separates itself from the ground by being whiter.** Both
  are `#ffffff`. Separation is carried by the 1px border and the shadow, which
  is why `--border` is a step darker than the hairline it replaces. In dark the
  same job is done by lifting the card to `#101010` off a `#000000` ground and
  edging it at `#383838` — a shadow is invisible against black.
- **Teal cannot do both of its jobs with one value in dark.** It fills a button
  under white text, which wants it dark, and it colours a link on a near-black
  card, which wants it light. There is no lightness that satisfies both. The
  fill keeps `--primary`; the link reads `--primary-link`, and one scoped rule
  in `globals.css` points the `text-primary` utility at it. In light mode both
  resolve to `#0e6379`, so nothing moves.

### Scope and trigger

Dark is driven by `@media (prefers-color-scheme: dark)` — the operating system
setting, with no in-app toggle. It is scoped to `.clinic-theme`, the class on
the AppShell root, so `.cf-public` and `.cf-portal` are untouched.

The `screen` in `@media screen and (prefers-color-scheme: dark)` is
load-bearing: bills, prescriptions and the huddle brief print from inside this
shell, and paper is always white. `B6ClinicalDocuments` additionally pins the
light tokens on `.b6-document-viewport`, so what a patient is handed on screen
is the same sheet either way.

The stock shadcn `.dark` block that used to sit in `globals.css` is gone. It
was never applied to anything, it covered about a third of the tokens this
workspace actually paints with, and it flipped `--primary` to near-white —
which would have put white button text on a white button.

### Colour tokens — clinic workspace

| Token | Light | Dark |
|---|---|---|
| `--background` | `#FFFFFF` | `#000000` |
| `--card` | `#FFFFFF` | `#101010` |
| `--popover` | `#FFFFFF` | `#1A1A1A` |
| `--muted` / `--secondary` / `--accent` / `--surface-muted` | `#F2F2F2` | `#1C1C1C` |
| `--heading` | `#10262E` | `#F2F2F2` |
| `--text` / `--foreground` | `#4A5B61` | `#D6D6D6` |
| `--text-muted` | `#5F7178` | `#A6A6A6` |
| `--primary` (button fill) | `#0E6379` | `#14778F` |
| `--primary-hover` | `#0A4E60` | `#167F99` |
| `--primary-link` (`text-primary`) | `#0E6379` | `#4FB2CC` |
| `--ring` (focus) | `#0E6379` | `#4FB2CC` |
| `--border` (card edge, hairlines) | `#DBDBDB` | `#383838` |
| `--input` / `--border-strong` | `#949494` | `#6B6B6B` |
| `--success` on `--success-bg` | `#0F6B4F` on `#EEF6F2` | `#3FBF8F` on `#10231D` |
| `--warning` on `--warning-bg` | `#8A6A2F` on `#FDF7EA` | `#D9B877` on `#241F12` |
| `--danger` on `--danger-bg` | `#8D1C1C` on `#FDF4F3` | `#EF8B8B` on `#241313` |
| `--danger-mark` (badge fill, edge stroke) | `#A52222` | `#B93232` |

Retired: the warm paper `#FAF9F6`, the beige inset `#F1F0EC`, the grey-green
hairline `#E4E6E3` and `#CFD3CE`, and `--gold` as a text colour. The gold that
remains is `--warning`, where amber means something, and `--gold-on-ink`, the
marker on the imaging viewer's deliberately dark chrome.

### Contrast proofs

Computed with the WCAG 2.1 sRGB relative-luminance formula against the exact
token values above. **Every pair passes in both modes** — AA (4.5:1) for text,
1.4.11 (3:1) for non-text UI boundaries.

| Pair | Needs | Light | Dark |
|---|---|---|---|
| Heading on card | 4.5 | 15.69 | 17.00 |
| Body text on card | 4.5 | 7.09 | 13.09 |
| Body text on page ground | 4.5 | 7.09 | 14.45 |
| Muted text on card | 4.5 | 5.10 | 7.82 |
| Muted text on muted inset (disabled control) | 4.5 | 4.55 | 7.00 |
| Muted text on popover (menus, palette) | 4.5 | 5.10 | 7.15 |
| White label on teal button | 4.5 | 6.82 | 5.17 |
| White label on teal button, hovered | 4.5 | 9.24 | 4.64 |
| Teal button fill against card | 3 | 6.82 | 3.68 |
| Teal link / eyebrow on card | 4.5 | 6.82 | 7.77 |
| Teal link on the muted table header | 4.5 | 6.09 | 6.96 |
| Focus ring against card | 3 | 6.82 | 7.77 |
| Focus ring against page ground | 3 | 6.82 | 8.57 |
| Success pill text on its tint | 4.5 | 5.90 | 7.08 |
| Warning pill text on its tint | 4.5 | 4.70 | 8.65 |
| Danger pill text on its tint | 4.5 | 8.38 | 7.42 |
| White count on the notification badge | 4.5 | 7.36 | 5.89 |
| Attention edge stroke against card | 3 | 7.36 | 3.23 |
| Input / control border against card | 3 | 3.03 | 3.57 |

The card edge against the page ground is 1.38:1 light and 1.79:1 dark. It is
deliberately excluded: it is decoration, not information — the card is
identified by its contents, and pushing that edge to 3:1 would draw a box
around every panel on the page.

`--input` moved from `#CFD3CE` (1.4:1, a long-standing 1.4.11 failure) to
`#949494`, the lightest neutral that clears 3:1 on white. Field and secondary-
button borders read a step firmer than before as a result.

The focus ring is new. The palette declared `--ring` and `--focus-ring` but
nothing in the live DOM ever drew them — the rules that did are scoped to
`.dashboard-shell`, a class no element carries.

## Two scopes: `.cf-public` and `.cf-portal`

| Scope | File | Applies to |
|---|---|---|
| `.cf-public` | `app/marketing.css` | The marketing site and the public signup pages |
| `.cf-portal` | `app/portal.css` | Login, password flows, 404/500, `/setup`, `/platform`, patient token pages |

`.cf-portal` re-themes rather than restyles. `app/globals.css` declares its
colour utilities through `var(--heading)`, `var(--card)` and friends inside
`@theme inline`, so redefining those custom properties *within the scope* moves
the whole surface to the heritage palette without touching the clinic dashboard,
which shares the same token names at `:root`.

**Fonts are the exception.** `--font-sans` is declared as a literal inside
`@theme inline`, so Tailwind inlines the stack and a scoped custom-property
override never reaches the utility. `.cf-portal` therefore sets `font-family`
directly on the root and on `h1–h4`.

Both scopes pull their typefaces from `lib/fonts.ts`, declared once so the two
surfaces cannot drift and the browser fetches one copy.

The clinic workspace reads from `:root` in `globals.css`, which now carries the
same heritage palette. All three surfaces are one product.

### Deliberately left alone

- **Print pages** — `/shared/[token]` and `app/dashboard/**/print/`. Invoices,
  prescriptions and lab dockets are print artifacts. Neutral black-on-white is
  correct for paper, and these are what a patient physically receives.
- **Meta's brand blue** (`#1877f2` / `#166fe5`) on the WhatsApp connect button.
  A third-party brand colour on a Meta login control, not ours to restyle.
- **The imaging viewer chrome** stays dark — radiographs are read against dark —
  though it moved onto heritage ink rather than the old navy.

## Non-negotiables

- No invented statistics, certifications, customer logos or testimonials.
- No claim of diagnostic accuracy, regulatory clearance or autonomous clinical decisions.
- Product screenshots are sanitized and must stay labelled as demonstration data.
- Every marketing selector stays scoped under `.cf-public` — a previous generic
  `.demo-card` selector leaked into the authenticated dashboard.
- Touch targets ≥44×44px; visible focus rings everywhere; no horizontal scroll at 375px.

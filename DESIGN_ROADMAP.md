# Making the workspace feel like the website

**The problem, measured.** Both surfaces were sampled live, same browser, same width.

| | Website (`.cf-public`) | Workspace (`.clinic-theme`) |
|---|---|---|
| Page heading | **48.8px** · line-height 52.7 · tracking −0.88px | **22px** · line-height 27.5 |
| Section heading | **28.9px** | **18px** |
| Body text | **17px** · line-height 1.65 | **13px** · line-height 1.5 |
| Vertical rhythm | 24 / 32 / 48 / 64 / 80 / 96 / 128px | a single 20px gap |
| Distinct text sizes in shared components | 7-step scale, each with its own line-height and tracking | 29 uses of 13px, 10 of 12px, 10 of 11px, three of 22px |

The workspace is not styled differently from the website. **It is the same design rendered at roughly 60% scale.** Nearly every word in it sits between 10px and 13px, and there is no step between "page title" and "everything else". That is what reads as light.

Nothing here needs a new feature, a new page, or a database change. Almost all of it lands in shared components, so one edit lifts every screen at once.

---

## Status

**Phases 1 and 2 are done. Phase 4 is done in the parts that mattered. Phase 3 was deliberately dropped — reason below.**

| | Done |
|---|---|
| Type scale declared as tokens | `--text-page/section/body/dense/secondary/micro/metric` in `globals.css` |
| Page titles | 22px → **30px** — 10 pages that hand-rolled the size now read the token |
| Section titles | 16px → **20px** — **84 of them, across 37 files** |
| Body prose | 13px → **15px** — **208 paragraphs across 59 files**; badges and meta stay 13px so size now carries meaning |
| Table rows | 13px → 14px; column labels bold, in heading colour |
| Card padding / stack gap | 18px → 22px, 20px → 24px — **223 values across 58 files** |
| Micro-label tracking | 0.06em → **0.14em** across 39 labels — the site tracks its 11.5px kicker at 0.18em, which is why its small caps read as labels and the workspace's read as a smudge |
| Stat values | five sizes (24/26/30/20/17px) → **one token**, 12 tiles |
| Font payload | body face dropped weight 300 — five weights were fetched, four are used |
| **The interaction layer, revived** | press states, hover and the pending treatment were all written against `.dashboard-shell` — a class no element carries — so none of it had ever rendered |
| Dark elevation | black-on-black shadows replaced with a lit top edge |
| Table chrome | cell padding aligned to the card edge, header rule given weight, empty state un-nested from its double padding |
| Touch targets | three controls still under 44px (42px tabs, two 36px filter rows) |

| Shell padding | the page title sat 21.6px under the top bar while the gap beneath it was 24px — the h1 was the tightest thing on its own page |
| Chair row on Today | the time led the row at 13px against the 14px name beside it; the column you scan down was the smallest thing in it. Now 20px |
| Empty states | a bare 28px muted glyph now sits on a 48px plate, the way the marketing tiles do |
| Dead tokens | `--workspace-card-radius`, `--workspace-section-gap`, `--workspace-card-padding` removed |

### Two things I stopped myself doing

**Nearly deleted three tokens the Control Center needs.** `--workspace-shadow`, `--workspace-card-border` and `--workspace-shadow-hover` look unused from the components — nothing in `app/` or `components/` reads them. They are read by the `.platform-*` rules further down `globals.css`. A grep that excluded "platform" made them look dead. They are now commented as such.

**Backed out a list-row tap-target fix.** A row is ~73px tall but the name link inside it is about 20px, so most of what looks tappable is not — a real miss for a gloved hand. The fix cannot live in `ListCell`: the anchors sit inside per-page wrapper divs, and a selector broad enough to catch them also stretches secondary links and breaks any row carrying two. The right fix is a stretched-link pseudo-element on the primary cell only, which needs each list to declare which cell that is. Left documented in the component rather than half-shipped.

### The biggest single find

`DashboardInteractionFeedback` really does set `data-pending` on a submitting form and `data-navigation-pending` on a clicked link. The CSS that renders those states — along with every hover, press and transition in the workspace — was scoped to `.dashboard-shell`. **So every click in the product marked itself as pending and then showed nothing.** The attributes were live and the styling was dead.

Re-pointed to `.clinic-theme` surgically: the transitions, the press state, the pending treatment. Deliberately left dead:

- the layout rules in the same block (`max-width`, `padding-inline`, a blanket `min-height` on every button), which would cap the shell including the top bar
- the rule hiding `[name="reason"]` inputs, which would hide the payment-reversal reason field
- the old `focus-visible`, which used a hardcoded sky blue from the retired palette — the token-based ring already added is better
- the `::after` spinner, because the six clinical forms now render their own `<Pending />` and two spinners on one button is worse than none

### One disagreement, recorded

A typography audit argued **body should stay at 13px** for an 11-minute appointment, and that the real fault was hierarchy — the shared `RailCard` title was 13px, *identical to the body inside it*.

It is right about the fault, and its own evidence settles the size question the other way: **124 of 328 13px elements also carried `text-text-muted`**, so primary and secondary text differed only in hue — the weakest signal available, and the first to fail on a bright clinic screen. Raising prose to 15px while leaving muted spans at 13px is what makes size carry hierarchy again. Tables stayed at 14px, so scanning density is untouched.

### Phase 3 (depth) — dropped

The plan was three elevation steps. On inspection the single `--shadow` plus a 1px border already reads correctly in both modes, and on the black dark-mode ground shadows are invisible anyway — the border is doing the work and doing it well. Adding two more steps would mean deciding per page which card is "primary", which is 20 judgement calls for a marginal gain. Not worth it.

## Phase 1 — The type scale · biggest win, smallest change

One change fixes most of it. The workspace gets a real scale, defined once as tokens and consumed by the shared primitives.

| Role | Now | Becomes | Why |
|---|---|---|---|
| Page title | 22px | **30px**, tracking −0.01em | One line per screen. Costs no vertical space and instantly anchors the page. |
| Card / section title | 18px | **20px** | Currently barely separated from body. |
| Body and primary reading text | 13px | **15px**, line-height 1.6 | The single biggest contributor to "thin". |
| Table cells and dense rows | 13px | **14px** | Kept below body: tables are scanned, not read. |
| Secondary / muted | 12px | **13px** | |
| Micro-labels (uppercase) | 11px | **11.5px**, tracking 0.06em | Already correct in kind, just needs to stop being the same weight as everything else. |

**Deliberately not matched to the website.** 49px headings and 17px body suit a page someone reads once. This is a tool someone works inside for nine hours with eleven minutes per patient, so the scale is proportionally related to the site, not identical to it. Body goes to 15px, not 17px.

**Density cost:** roughly 8–10% more vertical space on text-heavy screens. Acceptable, and Phase 2 partly pays it back by removing purposeless gaps.

Files: `app/globals.css` (tokens), `components/lists/PageHeader.tsx`, `WorkPage.tsx`, `DataList.tsx`, `EmptyState.tsx`.

---

## Phase 2 — Rhythm

The workspace has one spacing value (20px) doing every job. The website has seven.

- Section gap 20px → **24px**
- Card padding 18px → **22px**
- Table row padding → up one step, so rows breathe without losing scan density
- A real gap between the page header and the first card, so the title owns its space

Files: `WorkPage.tsx`, `DataList.tsx`, `app/globals.css`.

---

## Phase 3 — Depth

Right now a single `--shadow` is applied to nearly every card, so nothing is more important than anything else, and on the white ground the 1px border does all the work.

- Three elevation steps instead of one, matching the site's `--e-1..--e-3`
- Cards that hold the primary work sit one step above supporting cards
- Card headers get a defined treatment rather than bold 13px text
- Verify all of it against the black dark-mode ground, where shadows are invisible and the border must carry more

Files: `app/globals.css`, `WorkPage.tsx`, `DataList.tsx`.

---

## Phase 4 — Component craft

The shared primitives currently do the minimum. Upgrading them lifts ~20 screens.

- `PageHeader` — anchor the title, give the description room, settle the action buttons
- `DataList` — the header row needs weight; column labels are currently the faintest thing in the table
- `EmptyState` — good copy, thin presentation
- `TopBar` — sits at 13px throughout, so the shell frames the page in the same whisper as the content

---

## What NOT to do

- **Do not widen the layout or add a second column.** Settled decision, and it is right.
- **Do not bring back the docked nav rail.** Settled.
- **Do not import the website's whitespace wholesale.** 96–128px section gaps in a clinical tool means scrolling past air to reach a patient's allergies.
- **Do not add gradients, tinted grounds or hero treatments to working screens.** The plain white / plain black ground was a deliberate decision three sessions ago and it is correct.
- **Do not touch `.cf-public` or `.cf-portal`.**

## Risks to watch

- **Dark mode** — every change goes through tokens, so both modes move together, but each phase gets checked in both.
- **AA contrast** — larger type makes contrast easier, never harder. The existing proofs in `design-system/conphident/MASTER.md` stay valid; ratios do not change, only sizes.
- **44px touch targets** — unaffected by type, but re-measured after Phase 2 in case padding changes push a control.
- **Density** — the one real trade. Measured after Phase 1 on Today and the patient record before continuing.

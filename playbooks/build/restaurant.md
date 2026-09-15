# Build playbook — restaurant

**What this produces:** a one-page, mobile-first static site that answers a hungry
person's three questions — *what do you serve, are you open, where are you* — in under
ten seconds, and gives the owner a zero-maintenance web presence where every future edit
flows through the change pipeline ([playbooks/README.md](../README.md)).

**Stack:** Astro + Tailwind. All content lives in Astro Content Collections validated by
the Zod schema ([schemas/restaurant.ts](../../schemas/restaurant.ts), copied into the
spoke at birth). Hosting on Cloudflare Pages with per-branch previews (deferred —
described in automation/README.md). No CMS — the agent is the CMS.

## Opinions this playbook enforces

Argue with these here, once — not site by site. These opinions cover layout and
content; **visual execution follows [design-language.md](../design-language.md)**,
tuned by the client's design brief. The opinions are defaults the brief overrides.

1. **One page.** A taqueria doesn't need information architecture; it needs findability.
   Sections in fixed order, anchor-linked from a sticky header:
   **hero → about → menu → hours → location → contact.**
   Optional add-ons — **testimonials** (slots after about) and **gallery** (slots after
   menu) — default to OFF and are added only when the client asks and supplies material.
2. **The menu is HTML, never a PDF.** Searchable, zoomable on a phone, accessible,
   indexable. If the client only has a PDF or a photo of the printed menu, transcribe it —
   and confirm the prices back to them before shipping (rule 5).
3. **The phone number is the primary CTA.** Tap-to-call `tel:` link in the sticky header,
   the hero, and the contact section. Local restaurants convert by phone and feet, not by
   contact form.
4. **Hours have one source of truth** — `hours.json` — rendered in both the hours section
   and the footer from the same data. Hours are the single most common change request;
   updating them must be a one-file edit.
5. **Performance budget:** no client-side framework, no carousel library, at most two
   self-hosted webfonts (from brand tokens), all images through Astro's asset pipeline
   (responsive sizes, lazy loading, modern formats). Target Lighthouse ≥ 95 across the
   board on a mid-range phone. JS budget (per design-language.md § Motion): no
   frameworks, no external scripts, total inline JS ≤ ~1.5KB — currently three tiny
   scripts: hours-today highlight, form time-trap, reveal observer.
6. **Accessibility floor** (CLAUDE.md rule 8, made concrete): semantic landmarks
   (`header/nav/main/section/footer`), exactly one `h1` (hero), one `h2` per section,
   real alt text on every image (the schema enforces the field; you write actual
   descriptions), visible focus styles, 4.5:1 contrast for body text. Check the brand
   colors at intake — if they fail contrast, propose adjusted shades to the client rather
   than silently shipping illegible branding.
7. **Brand tokens drive Tailwind.** `primary`/`secondary`/`accent` + the two fonts map
   into the Tailwind theme; components reference tokens (`bg-primary`), never raw hex.
   Re-skinning a site is a one-file edit.
8. **A contact form is baseline on every site** — see the contact section below.

## Canonical spoke layout

```
<slug>-site/
├── src/
│   ├── content.config.ts        # content collections wired to the Zod schema
│   ├── content/data/            # THE CONTENT — what change playbooks edit
│   │   ├── site.json            # one file per top-level schema key
│   │   ├── hero.json
│   │   ├── about.json
│   │   ├── menu.json
│   │   ├── hours.json
│   │   ├── location.json
│   │   ├── contact.json
│   │   └── ordering.json        # only if the dormant slot is filled
│   ├── components/sections/     # Hero.astro … Contact.astro (per-site copies, by design)
│   ├── lib/format.ts            # display helpers (12-hour times, phone formatting)
│   ├── pages/index.astro        # + pages/thanks.astro — no-JS form success page
│   └── assets/                  # real photos go here (astro:assets); see findings
├── functions/api/contact.ts     # Cloudflare Pages Function — the form endpoint
├── schemas/restaurant.ts        # copied from hangar at birth; the spoke's own contract
└── package.json
```

One JSON file per top-level schema key, so change playbooks can name exact targets: a
menu edit touches `src/content/data/menu.json` and nothing else.

## Sections — content model and rendering opinions

Field-level precision lives in [schemas/restaurant.ts](../../schemas/restaurant.ts);
this is the intent behind each section.

### Hero
Full-bleed photo — the food or the room, never a stock storefront. Business name (logo
if supplied), headline ≤ 80 characters, optional one-line subheadline, one CTA button.
CTA default is the phone (`tel:`, "Call to order"). If the `ordering` slot is filled,
"Order Online" becomes the primary CTA and the call link goes secondary.

### About
2–3 sentences of the owner's actual story (the schema enforces a minimum length to keep
lorem ipsum out), optional photo. Tone: their words lightly edited — never marketing copy
we invented.

### Menu
Sections (Tacos, Sides, Drinks, …) each holding items: name, optional ≤ 200-character
description, price, optional tags rendered as small badges (vegetarian / vegan /
gluten-free / spicy / popular / new). Prices are display strings ("$14", "$9.50"),
right-aligned. Menus longer than ~3 sections get in-page jump links at the top of the
section.

### Hours
Weekly table from `hours.json`: per-day open/close, or closed. Stored as 24-hour strings
("21:30"), rendered 12-hour ("9:30 PM"). Today's row highlighted (the one allowed inline
script). Optional client-supplied notes line ("Closed major holidays").

### Location
Full street address; the **parking note rendered prominently** — it's the #2 pre-visit
question after hours. Map: a static map image linking out to Google Maps is preferred
(performance budget); a lazy-loaded embed is acceptable if the client insists. The
static-map *source* is an open decision (TODOS parking lot) — the rehearsal shipped
address + Google Maps link only, which is an acceptable floor.

### Contact — and the form
Phone (tap-to-call), email, optional reservation link, social icons (only the ones they
actually use).

**The form** (baseline on every site): name, email or phone, message. Posts to a
Cloudflare Pages Function at `functions/api/contact.ts` — native to our hosting, free
tier, no third-party branding. Fallback if Functions are unavailable for some reason:
Formspree or Web3Forms. Spam defense: honeypot field + minimum-time-to-submit check; no
CAPTCHA (hostile to this audience). Submissions land on a no-JS success page (`/thanks`,
via 303 redirect) — required on a static site; spam-check failures redirect there too,
so bots learn nothing.

**Where submissions go:** straight to the client's own email — the function validates,
runs the spam checks, and forwards. A contact form is **customer→client** mail (catering
questions, party bookings); the agent's intake pipeline is **client→agency** (site-change
requests). The two are entirely separate: form submissions never enter the pipeline and
the agency never sees them (DECISIONS.md, 2026-06-10).

### Ordering — the dormant slot
`ordering` in the schema: `{ provider, urlOrEmbed, label }`, optional. Absent → renders
nothing, zero visual trace. Present → an "Order Online" CTA in the hero and sticky
header pointing at the provider (Square, Toast, ChowNow, …). **We never build ordering
ourselves** — this is a hand-off slot for an embeddable third-party system, present from
day one so enabling it is a content edit, never a redesign (DECISIONS.md).

## Intake questions

The answers fill every schema slot. Ask exactly these; never fill a blank with a guess
(rules 4–5). These also drive [onboard-client.md](../onboard-client.md) step 1.

1. Business name & tagline?
2. One sentence: cuisine and vibe?
3. Logo + brand colors? (Or "generate from the vibe" — generated palettes get explicit
   client approval before the build.)
4. The menu: sections → items with **exact prices**. A photo of the printed menu is fine —
   we transcribe and confirm prices back.
5. Weekly hours, day by day, including which days you're closed?
6. Street address, plus a one-line parking note?
7. Phone, email, reservation link (if any)?
8. Social handles — Instagram / Facebook / TikTok / Yelp / Google?
9. 2–3 sentences of your story, for the About section?
10. Photos: one hero-worthy shot (≥ 1600px wide) plus 3–6 more (food, room, people).
11. Already doing online ordering with a provider? If yes, the link — it fills the
    dormant `ordering` slot.
12. **The design brief** — the eight questions in
    [design-language.md](../design-language.md) § The design brief (adjectives, tone
    sliders, palette, type vibe, motion comfort, references, never-do's). Answers go in
    the client record and steer the entire visual build.

## Build steps

*(Described for the future build — do not execute while working in hangar.)*

1. Scaffold: `npm create astro@latest` (minimal template), `npx astro add tailwind`,
   `npm i zod @fontsource-variable/<heading> @fontsource-variable/<body>`. Reality check
   (2026-06): resolves to Astro 6 + Tailwind 4 + zod 4 — zod 4 schemas validate in
   content collections unchanged (Standard Schema support). Reality check (2026-08): fresh
   installs now resolve a **duplicate rolldown-vite
   8** under `@tailwindcss/vite` alongside Astro's vite 7, and the build fails
   (`Missing field \`tsconfigPaths\``). Fix: pin one vite in the spoke's package.json —
   `"overrides": { "vite": "^7.3.2" }` — until upstream settles; verify with
   `npm ls vite` (every copy deduped to 7.x).
2. Copy `schemas/restaurant.ts` from hangar into the spoke. Wire `src/content.config.ts`
   data collections to it so each file in `src/content/data/` validates on every build.
   Proven pattern: one collection per top-level key, each
   `glob({ pattern: "<key>.json", base: "./src/content/data" })`. An empty `ordering`
   collection logs a harmless build warning — that's the dormant slot working.
3. Map brand tokens → the Tailwind v4 `@theme` block in `src/styles/global.css` (colors
   + font families — the only raw hex in the repo; there is no tailwind.config in v4);
   fonts via the Fontsource imports in the layout.
4. Create `src/content/data/*.json` from the intake answers. Anything unanswered stays
   `TBD` and blocks go-live — never invent (rule 5).
5. Build the section components in canonical order, following the rendering opinions
   above.
6. Implement `functions/api/contact.ts`: validate fields, honeypot + time check, forward
   the submission (day one: email the owner).
7. `npm run build` — the schema validates all content. Fix content, not schema.
8. Manual pass: Lighthouse ≥ 95 ×4, keyboard navigation, contrast, phone-width layout.
9. Repo + workflow: private GitHub repo `<slug>-site`, created with a bootstrap commit
   on `main` (README only) so the build PR has a base; the entire build then lands via
   branch + PR (workflow law — no direct-to-main, ever); Cloudflare Pages project +
   deploys are agent-performed direct uploads (live pattern — commands in
   automation/README.md § Hosting).
10. Owner reviews the preview → merge → custom domain. Then update the client record,
    REGISTRY.md, and hangar's state layer.

## Definition of done

- [ ] Every schema slot filled with client-confirmed values — zero invented facts, zero `TBD`
- [ ] `npm run build` green (schema validates all content)
- [ ] All six sections render in canonical order; optional sections only by client request
- [ ] Contact form delivers — a real test submission received
- [ ] `tel:` links work on a phone; hours match the intake answers and the client confirmed them
- [ ] Lighthouse ≥ 95 on all four scores; alt text is real; contrast passes
- [ ] PR + preview reviewed by the owner; merged; registry row + hangar state layer updated

## Rehearsal findings (2026-06-10 — first spoke built with this playbook)

What the first end-to-end run taught us. Corrections are folded into the sections above;
this list is the provenance.

- Astro 6 + Tailwind 4 + zod 4 all worked together; the hangar schema needed zero changes.
- Tailwind v4 has no config file — brand tokens live in a CSS `@theme` block.
- "One allowed script" became two: the form time-trap also needs inline JS.
- A no-JS form needs a `/thanks` success page (303 redirect from the Pages Function).
- Fresh repos need a bootstrap commit on `main` before the build PR can exist.
- The safety contract is real: a `$`-less price failed the build with a precise error
  (`menu.json`, exact field path); restoring it went green.
- **Unresolved — image pipeline:** the rehearsal used labeled SVG placeholders in
  `public/images/`; real photos should go through `src/assets/` + `astro:assets` for
  responsive output. Decide the concrete pattern when the first real photos arrive.
- **Unresolved — form delivery provider** (`CONTACT_FORWARD_TO`): decide when wiring
  Cloudflare Pages (Resend free tier vs. Email Routing send).

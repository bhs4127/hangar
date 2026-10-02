# Build playbook — base (every vertical)

**What this is:** the half of every build that doesn't depend on what the business sells:
stack, layout, accessibility, performance, the contact form, structured data, build steps
and the definition of done. Every vertical playbook ([restaurant.md](restaurant.md),
[law-office.md](law-office.md), …) **extends this file** and adds only what's specific to
its vertical. A client who fits no vertical playbook is built from this file plus the
derivation recipe at the bottom (DECISIONS 2026-06-10, "Verticals are open-ended").

**What every site produces:** a mobile-first static site that answers a visitor's first
questions about the business in under ten seconds, and gives the owner a zero-maintenance
web presence where every future edit flows through the change pipeline
([playbooks/README.md](../README.md)).

**Stack:** Astro + Tailwind. All content lives in Astro Content Collections validated by
the vertical's Zod schema (`schemas/<vertical>.ts`, copied into the spoke at birth).
Hosting on Cloudflare Pages with per-branch previews (described in automation/README.md).
No CMS — the agent is the CMS.

## Opinions this playbook enforces

Argue with these here, once — not site by site. These opinions cover layout and
content; **visual execution follows [design-language.md](../design-language.md)**,
tuned by the client's design brief. The opinions are defaults the brief overrides, and a
vertical playbook may override them too. Opting out of one for a single client is
recorded in the client record (DECISIONS 2026-08-05: opt out loudly).

1. **One page by default.** A local business needs findability, not information
   architecture. Sections in a fixed order, anchor-linked from a sticky header, following
   the universal anatomy:
   **hero → about → offerings → trust/credibility → practicalities → contact.**
   *Offerings* is whatever the business sells (a menu, practice areas, services,
   packages). *Practicalities* are hours and location when the business has a door.
   Optional add-ons (testimonials, gallery) default to OFF and are added only when the
   client asks and supplies material. A site whose real content can't be made findable
   on one page may go multi-page (DECISIONS 2026-09-29): one JSON file per page,
   everything else here applies per page.
2. **Offerings are HTML, never a PDF.** Searchable, zoomable on a phone, accessible,
   indexable. If the client only has a PDF or a photo, transcribe it, and confirm every
   fact back to them before shipping (rule 5).
3. **One primary CTA: the way this business actually converts.** Each vertical names it
   (a phone call for a restaurant, a consultation request for a law office). It appears
   in the sticky header, the hero and the contact section.
4. **Facts that render in more than one place have one source of truth.** Hours, phone
   and address live in one content file each and every place they appear renders from
   it, so the most common change requests are one-file edits.
5. **Performance budget:** no client-side framework, no carousel library, at most two
   self-hosted webfonts (from brand tokens), all images through Astro's asset pipeline
   (responsive sizes, lazy loading, modern formats). Target Lighthouse ≥ 95 across the
   board on a mid-range phone. JS budget per design-language.md § Motion: no frameworks,
   no external scripts, total inline JS ≤ ~1.5KB by default. Each vertical lists the
   tiny scripts it actually ships.
6. **Accessibility floor** (CLAUDE.md rule 8, made concrete): semantic landmarks
   (`header/nav/main/section/footer`), exactly one `h1` (hero), one `h2` per section,
   real alt text on every image (the schema enforces the field; you write actual
   descriptions), visible focus styles, 4.5:1 contrast for body text. Check the brand
   colors at intake — if they fail contrast, propose adjusted shades to the client rather
   than silently shipping illegible branding.
7. **Brand tokens drive Tailwind.** `primary`/`secondary`/`accent` + the two fonts map
   into the Tailwind theme; components reference tokens (`bg-primary`), never raw hex.
   Re-skinning a site is a one-file edit.
8. **A contact form is baseline on every site** — see Contact below.

## Canonical spoke layout

```
<slug>-site/
├── src/
│   ├── content.config.ts        # content collections wired to the Zod schema
│   ├── content/data/            # THE CONTENT — what change playbooks edit
│   │   ├── site.json            # one file per top-level schema key (or per page)
│   │   ├── hero.json
│   │   ├── about.json
│   │   ├── contact.json
│   │   └── …                    # the vertical's own keys (menu.json, hours.json, …)
│   ├── components/sections/     # Hero.astro … Contact.astro (per-site copies, by design)
│   ├── lib/format.ts            # display helpers (12-hour times, phone formatting)
│   ├── pages/index.astro        # + pages/thanks.astro — no-JS form success page
│   └── assets/                  # real photos go here (astro:assets)
├── functions/api/contact.ts     # Cloudflare Pages Function — the form endpoint
├── schemas/<vertical>.ts        # copied from hangar at birth; the spoke's own contract
└── package.json
```

One JSON file per top-level schema key, so change playbooks can name exact targets: a
menu edit touches `src/content/data/menu.json` and nothing else.

## Schema primitives every vertical reuses

A vertical's schema is derived, not written from nothing. These shapes recur in every
spoke so far; copy them from [schemas/restaurant.ts](../../schemas/restaurant.ts), the
reference implementation, and keep their constraints:

- **`imageSchema`** — `src` + `alt`. Empty alt only as an explicit decorative decision.
- **`hexColor`** + **`brandTokensSchema`** — three colors and two fonts.
- **`siteSchema`** — name, tagline, logo, domain (no protocol), brand tokens.
- **`heroSchema`** — headline ≤ 80 chars, optional subheadline, image, optional CTA.
- **`aboutSchema`** — a body with a minimum length that keeps lorem ipsum out.
- **`contactSchema`** — phone in E.164, email, optional socials.
- **`locationSchema`** and **`hoursSchema`** — when the business has a door. Every day is
  fully specified or explicitly closed.
- **Money** — display strings with a strict regex. Never loosen it to fit one value.

## Universal sections

### Hero
Full-bleed photo of the real business (the work, the room, the people), never stock.
Business name (logo if supplied), headline ≤ 80 characters, optional one-line
subheadline, one CTA button: the vertical's primary CTA.

### About
2–3 sentences of the owner's actual story (the schema enforces a minimum length to keep
lorem ipsum out), optional photo. Tone: their words lightly edited — never marketing copy
we invented.

### Practicalities (when the business has a door)
Hours from one file, rendered 12-hour; full street address with any parking or access
note rendered prominently. Map: a static map image linking out to Google Maps is
preferred (performance budget); a lazy-loaded embed is acceptable if the client insists.
The static-map *source* is an open decision (TODOS parking lot); address + Google Maps
link is an acceptable floor.

### Contact — and the form
Primary CTA, email, optional booking link, social icons (only the ones they actually
use).

**The form** (baseline on every site): name, email or phone, message. Posts to a
Cloudflare Pages Function at `functions/api/contact.ts` — native to our hosting, free
tier, no third-party branding. Fallback if Functions are unavailable for some reason:
Formspree or Web3Forms. Spam defense: honeypot field + minimum-time-to-submit check; no
CAPTCHA (hostile to this audience). Submissions land on a no-JS success page (`/thanks`,
via 303 redirect) — required on a static site; spam-check failures redirect there too,
so bots learn nothing.

**Where submissions go:** straight to the client's own email — the function validates,
runs the spam checks, and forwards. A contact form is **customer→client** mail; the
agent's intake pipeline is **client→agency** (site-change requests). The two are
entirely separate: form submissions never enter the pipeline and the agency never sees
them (DECISIONS.md, 2026-06-10). Delivery is Resend (DECISIONS 2026-09-29): wire it per
[change/wire-contact-delivery.md](../change/wire-contact-delivery.md) at go-live.

### Structured data (JSON-LD)
One `<script type="application/ld+json">` in the layout's `<head>`, built at build time
from the content files, so Google gets the business's name, address, phone and hours
without parsing the page. It's data, not executed JS, so it doesn't count against the JS
budget. In Astro: `<script type="application/ld+json" set:html={JSON.stringify(ld)} />`.

- **Type:** the closest subtype of `LocalBusiness` for the vertical (`Restaurant`,
  `LegalService`, `MedicalClinic`, `ProfessionalService`, …). Each vertical playbook
  names its type and field mapping. With no physical business (portfolio, creator), use
  `Person` or `Organization` with `url` and `sameAs` only.
- **Every value comes from a validated content file**, never typed into the template:
  `name` and `url` from `site.json` (`https://` + `domain`), `image` from the hero,
  `address` (`PostalAddress`) and `geo` (only if coordinates are set) from the location,
  `telephone` from contact (already E.164), `openingHoursSpecification` from hours
  (closed days are left out), `sameAs` from the socials that are actually filled in.
- **Never add a field the content doesn't hold** (rule 5): no `priceRange`, no ratings
  or review counts. Self-served review markup is against Google's guidelines anyway. A
  field becomes eligible only once the schema has a client-confirmed slot for it.
- Because it's derived, it can't drift: an hours change edits the hours file and the
  JSON-LD follows on the next build.

## Universal intake questions

Every vertical asks these; its own playbook adds the offerings questions. Never fill a
blank with a guess (rules 4–5). These drive [onboard-client.md](../onboard-client.md)
step 1.

1. Business name & tagline?
2. One sentence: what you do and the vibe?
3. Logo + brand colors? (Or "generate from the vibe" — generated palettes get explicit
   client approval before the build.)
4. Phone, email, booking link (if any)?
5. If you have a location customers visit: street address, one-line parking/access note,
   and weekly hours day by day, including closed days?
6. Social handles — only the ones you actually use?
7. 2–3 sentences of your story, for the About section?
8. Photos: one hero-worthy shot (≥ 1600px wide) plus 3–6 more.
9. **The design brief** — the eight questions in
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
2. Copy `schemas/<vertical>.ts` from hangar into the spoke (or derive it, see below).
   Wire `src/content.config.ts` data collections to it so each file in
   `src/content/data/` validates on every build. Proven pattern: one collection per
   top-level key, each `glob({ pattern: "<key>.json", base: "./src/content/data" })`. An
   empty optional collection logs a harmless build warning.
3. Map brand tokens → the Tailwind v4 `@theme` block in `src/styles/global.css` (colors
   + font families — the only raw hex in the repo; there is no tailwind.config in v4);
   fonts via the Fontsource imports in the layout.
4. Create `src/content/data/*.json` from the intake answers. Anything unanswered stays
   `TBD` and blocks go-live — never invent (rule 5).
5. Build the section components in the vertical's canonical order, following the
   rendering opinions above and the vertical's own.
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

The vertical playbook adds its own items to this list.

- [ ] Every schema slot filled with client-confirmed values — zero invented facts, zero `TBD`
- [ ] `npm run build` green (schema validates all content)
- [ ] Sections render in the vertical's canonical order; optional sections only by client request
- [ ] Contact form delivers — a real test submission received
- [ ] The primary CTA works on a phone (`tel:` links dial)
- [ ] Lighthouse ≥ 95 on all four scores; alt text is real; contrast passes
- [ ] **`public/robots.txt` and a sitemap ship with the site.** Cloudflare Pages answers
      a missing path with the HTML page, so *without a real file* a crawler asking for
      `/robots.txt` gets the homepage and Lighthouse SEO drops (caught at 92 on a live
      site, 2026-09-29). Use `@astrojs/sitemap`, which needs `site` set in the Astro
      config, and point robots.txt at `sitemap-index.xml`
- [ ] **JSON-LD present and valid:** exactly one block, every value traceable to a
      content file, and the preview URL passes Google's Rich Results Test with no errors
      (see Structured data above)
- [ ] **`fetchpriority="high"` on the hero image** when it's the LCP element
- [ ] **Registered with Google Search Console + Bing** once the custom domain is live
      ([change/register-search-console.md](../change/register-search-console.md)).
      Domain property on the agency Google account, sitemap submitted
- [ ] PR + preview reviewed by the owner; merged; registry row + hangar state layer updated

## Deriving a new vertical

When a client fits no vertical playbook, derive one during onboarding instead of forcing
them into the nearest. A dog groomer or a yoga studio should need nothing from hangar
beyond this file.

1. **Name the offerings.** What does this business sell, and what does a visitor need to
   decide? That's the offerings section (a menu and practice areas are both offerings).
   Then decide which of trust/credibility and practicalities apply.
2. **Pick the primary CTA** and the JSON-LD type.
3. **Derive `schemas/<vertical>.ts` in the spoke** from the primitives above plus a
   schema for the offerings. It stays in the spoke until a **second** client of that
   vertical appears (DECISIONS 2026-08-05).
4. **Write the vertical's opinions and any deviations from this file** in the client
   record (a "Vertical" note under gotchas). Deviations are the design brief overriding a
   default, recorded, never quiet.
5. **On the second client of the vertical:** promote the schema to `schemas/` and the
   opinions to `playbooks/build/<vertical>.md`, written as an extension of this file like
   [restaurant.md](restaurant.md).

## Rehearsal findings (2026-06-10 — first spoke built with this playbook)

What the first end-to-end run (a restaurant) taught us. Corrections are folded into the
sections above and into restaurant.md; this list is the provenance.

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

# Design language

The cross-vertical visual standard. Build playbooks own *layout and content* (which
sections, what order, what data); this document owns *how it feels*. Every build follows
it; the client's **design brief** tunes it. The bar (DECISIONS.md, 2026-06-10): every
site must feel **beautiful, interesting, professional, premium** — never templated,
never cheap. "Competent but uninspired" is a defect.

Reference implementation: *none yet* — nominate your first genuinely premium spoke
here once it ships (TODOS P2).

## The design brief

Collected at intake for every client (the build playbooks reference this section),
stored in a "Design brief" section of the client record. Never skip it — building
without a brief is how every site comes out the same.

1. **Three adjectives** for how the business should feel ("warm, handmade, lively" /
   "precise, calm, authoritative").
2. **Fun ↔ professional** — where on the line?
3. **Minimal ↔ rich** — sparse and airy, or layered and decorated?
4. **Palette** — exact brand colors if they exist; otherwise mood words, and we propose
   a palette for explicit approval (never ship an unapproved generated palette).
5. **Typography vibe** — expressive serif / clean sans / bold display? (Show 2–3 font
   pairings if they're unsure.)
6. **Motion comfort** — none / subtle / playful.
7. **References** — 2–3 sites or brands they love, one they hate, and why.
8. **Never-do's** — clichés or styles to avoid (the taqueria that hates sombrero kitsch,
   the law firm that hates stock-photo handshakes).

### Brief → build mapping

| Brief answer | What it drives |
|---|---|
| Adjectives + fun↔professional | Type pairing energy, color saturation, flourish density, copy tone |
| Minimal ↔ rich | Section background alternation, texture/flourish usage, spacing scale |
| Palette | The `@theme` tokens + derived ramp (below) |
| Typography vibe | `fontHeading`/`fontBody` choice, display sizing aggressiveness |
| Motion comfort | none → static; subtle → reveals + hovers; playful → + stagger, marquee-grade touches |
| Never-do's | Hard constraints, recorded in the client record's gotchas |

## Typography

- **Display type is used with conviction.** Hero headline:
  `clamp(2.75rem, 7vw, 5.5rem)`, line-height ≤ 1.05, `text-wrap: balance`. Variable
  fonts get their axes used (`font-optical-sizing: auto`; Fraunces at display sizes
  looks engraved — let it).
- **Eyebrows.** Every section heading carries a small uppercase letterspaced kicker
  (`text-xs font-semibold uppercase tracking-[0.18em]`, accent or primary per
  background). It's the cheapest premium cue there is.
- **Scale, not ad-hoc sizes:** pick from a ~1.25-ratio scale. Body 1rem/1.65, measure
  60–75ch. `text-wrap: balance` on headings, `text-pretty` on long paragraphs.

## Space

Space is the luxury good. Sections breathe: `py-20`–`py-28` desktop, ~60% of that on
mobile. Consistent rhythm beats clever layout. If a section feels empty, the fix is
better content hierarchy — not less padding.

## Color

- The three brand tokens are the *seeds*, not the whole palette. Derive and hardcode a
  small ramp in `@theme`, with the recipe in a comment (e.g. cream =
  `color-mix(in oklab, accent 12%, warm white)` → `#faf3e3`). Hardcode the result —
  deterministic across browsers; the recipe documents provenance.
- **Alternate section backgrounds**: warm tint → white → **one full-bleed dark band**
  (secondary) mid-page → white/tint. The dark band is the single biggest "designed, not
  templated" move. Pick the most ownable section for it (hours works beautifully).
- **Accent discipline:** eyebrows, tags, focus rings, selection, one primary CTA. If
  accent is everywhere, it's nowhere.
- `::selection` tinted to brand. Contrast floor stays 4.5:1 (CLAUDE.md rule 8) — check
  every pairing the ramp creates.

## Shape & texture

- One **radius scale** per site from the brief (sharp 0–4px / soft 8–16px / round
  16–24px + pill buttons). Never mix scales.
- One **flourish motif**, repeated: a hand-drawn SVG underline stroke, a corner accent,
  a tilted accent frame behind photos. Exactly one motif — repetition reads as identity,
  variety reads as clipart.
- Borders OR shadows, rarely both. Hairlines at 10–15% opacity of an on-palette color,
  not gray.

## Imagery

- Fixed aspect ratios per slot; rounded per the radius scale; optional brand-tinted
  scrim/duotone for cohesion when photos are mixed-quality.
- Hero scrim: gradient from secondary (≥90% at text edge) to transparent — text
  contrast is non-negotiable.
- Real photos still beat all of this — the brief's adjectives guide the *shot list* we
  ask the client for.

## Motion

Motion is seasoning: felt, barely noticed.

- **Entrance reveals** (scroll): elements get `class="reveal"` (+
  `style="--reveal-delay: n"` for stagger, ≤ 5 steps of 60ms). A ~12-line inline
  IntersectionObserver adds `.in-view`; CSS does the rest (opacity 0→1, translateY
  24px→0, 700ms, ease-out-quint). Chosen over CSS scroll-driven animations for Safari
  compatibility — revisit ~2027.
- **Progressive enhancement:** reveals only arm when JS adds `.js` to `<html>`. No JS →
  everything visible. No content is ever JS-gated.
- **`prefers-reduced-motion: reduce` collapses everything** — reveals render visible,
  transforms/transitions off, smooth-scroll off. This is law, same tier as contrast.
- **Hover micro-interactions:** buttons lift 2px + shadow (150–250ms ease-out); text
  links use the animated-underline pattern (`background-size` 0%→100%); cards get
  shadow-only. Active state returns to rest.
- **Load moment:** hero headline/CTA may fade-up once on load (CSS keyframes). Nothing
  else animates on load.
- **JS budget** (amends the old "counted scripts" rule): **no frameworks, no external
  scripts; total inline JS ≤ ~1.5KB.** Currently three tiny scripts: hours-today,
  form time-trap, reveal observer. Lighthouse ≥ 95 ×4 stays non-negotiable.

## Finishing details (the credibility checklist)

- [ ] Tinted `::selection`; visible accent `:focus-visible` (global)
- [ ] `scroll-margin-top` under the sticky header; reduced-motion kills smooth-scroll
- [ ] Tabular numerals for prices/times
- [ ] Favicon coherent with the logo/monogram
- [ ] Footer is designed, not dumped — hairline, monogram, one human line
- [ ] Dark band sits mid-page; page never feels like stacked white boxes
- [ ] One flourish motif, ≥ 2 appearances
- [ ] Every interactive element has a hover *and* focus state

## Review test ("is it premium?")

Scroll the preview cold and ask: would a stranger guess this cost $200 or $2,000?
Specifically: does the hero type have conviction; does any section surprise you; does
anything move *for* you (and stop when asked); could you tell whose site this is with
the logo removed? If the answer to the last one is no, the brief wasn't applied hard
enough.

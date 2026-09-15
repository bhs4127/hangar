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
| Motion comfort | none → static; subtle → reveals + hovers; playful → + stagger, marquee-grade touches, [typewriter reveals](#typewriter-reveals-playful-tier), and the playful JS allowance |
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
  else animates on load. *(Playful tier with typewriter reveals: the hero types instead.)*
- **JS budget** (amends the old "counted scripts" rule; two tiers since 2026-09-15 —
  DECISIONS): **no frameworks, no external scripts.** Inline JS is counted in **raw
  bytes as shipped** (comments included — never strip comments to fit):
  - **Default: ≤ ~1.5KB.** Typically three tiny scripts: hours-today, form time-trap,
    reveal observer.
  - **Playful allowance: ≤ ~3KB** — only when the client record's design brief says
    **Motion comfort: playful**. The brief is the justification; without it, the
    default applies.
  - Lighthouse ≥ 95 ×4 stays non-negotiable at either tier.
- **Main-thread gate** — required for any change that adds or changes a motion script,
  at either tier. The byte cap limits script creep; it does not measure cost (parsing
  3KB is ~1ms). What costs is the work a script does while running. Measure it, don't
  estimate it — see [Measuring the main-thread gate](#measuring-the-main-thread-gate).
  Against the current production build, on **mobile, median of 3 runs**:
  - Total Blocking Time does not rise (these sites sit at 0ms);
  - no new long tasks;
  - main-thread work rises by **≤ ~250ms**.

  Put the before/after numbers in the PR. A failing gate means the motion gets cheaper,
  not that the gate gets looser.

### Typewriter reveals (playful tier)

Text types out as it scrolls into view, with a cursor riding the last typed character;
the hero types on load. Suits terminal/tech motifs. It **replaces** the fade-up reveal —
same `.reveal` markup, same `--reveal-delay` stagger, so switching a spoke over is a
CSS + script swap (plus hero `rise` → `reveal`), not a markup rewrite.

The mechanism has three non-obvious rules. Get these right and the rest is tuning:

1. **Split on enter, restore after.** Wrapping each character in a span breaks screen
   readers (VoiceOver reads split words letter by letter) and find-in-page. So text is
   split into spans only when a block enters view, and the original text nodes are put
   back the moment it finishes typing (≤ 0.7s). Before and after, the DOM is plain text.
   Never pre-split at load.
2. **Hide with `opacity`, not `display`/removal.** Untyped characters keep their layout
   space, so the page does not shift as text appears (CLS unchanged) and wrapping is
   already final.
3. **The cursor is a `box-shadow`** on the last typed character — no inserted element,
   no reflow.

Fallbacks are the standard motion law: no JS → `.js` never lands → everything visible;
`prefers-reduced-motion: reduce` → the script never observes and CSS forces everything
visible. Text inside `svg`, `textarea`, `select`, and `[data-no-type]` is skipped.

**Tunables** (script constants): `MS_PER_CHAR` 12, each block clamped `MIN_MS` 150 –
`MAX_MS` 700 (long paragraphs speed up rather than drag), `STAGGER_MS` 70 per
`--reveal-delay` step. Blocks in view type concurrently with the stagger — typing
sequentially reads as slow.

**Measured cost** (first shipped spoke, 2026-09-15): Lighthouse 100 ×3 unchanged,
TBT 0 → 0, no new long tasks, mobile main-thread +~200ms (inside the gate), 2.9KB raw
(inside the playful allowance). *Lighthouse's LCP drops with this recipe because it
counts the heading at its first typed character — that is a measurement artifact, not
a speed win; don't claim it.*

CSS (replaces the fade-up reveal block and the hero `rise` keyframes; add `html.js .reveal`
and `.tw-c` to the reduced-motion override with `transition: none; opacity: 1`):

```css
html.js .reveal {
  opacity: 0;
  transition: opacity 0.15s ease-out; /* containers (cards, pills) fade as text starts */
}
html.js .reveal.in-view {
  opacity: 1;
}
.tw-c {
  opacity: 0;
}
.tw-c.tw-on {
  opacity: 1;
}
.tw-cursor {
  box-shadow: 0.12em 0 0 0 var(--color-accent);
}
.bg-secondary .tw-cursor {
  box-shadow: 0.12em 0 0 0 var(--color-accent-bright); /* dark band */
}
.tw-typing .caret {
  visibility: hidden; /* a blinking caret waits until its line has typed */
}
```

Script (inline, end of `<body>` in the layout; replaces the reveal observer):

```html
<script is:inline>
  // Arm reveals only when the observer can exist — otherwise content stays visible.
  if ("IntersectionObserver" in window) {
    document.documentElement.classList.add("js");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const MS_PER_CHAR = 12, MIN_MS = 150, MAX_MS = 700, STAGGER_MS = 70;
    const SKIP = "svg, script, style, textarea, select, [data-no-type]";

    const typeOut = (el) => {
      // Split only now, while it's on screen: screen readers and find-in-page see
      // plain text before and after the ~0.7s this takes.
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.nodeValue.trim() && !n.parentElement.closest(SKIP)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_REJECT,
      });
      const texts = [];
      while (walker.nextNode()) texts.push(walker.currentNode);
      const chars = [], restores = [];
      for (const node of texts) {
        const wrap = document.createElement("span");
        for (const c of node.nodeValue) {
          if (/\s/.test(c)) { wrap.append(c); continue; }
          const s = document.createElement("span");
          s.className = "tw-c";
          s.textContent = c;
          wrap.append(s);
          chars.push(s);
        }
        node.replaceWith(wrap);
        restores.push([wrap, node]);
      }
      el.classList.add("in-view", "tw-typing");
      const total = Math.min(MAX_MS, Math.max(MIN_MS, chars.length * MS_PER_CHAR));
      let shown = 0, t0;
      const tick = (t) => {
        t0 ??= t;
        const due = Math.min(chars.length, Math.ceil(((t - t0) / total) * chars.length));
        if (shown) chars[shown - 1].classList.remove("tw-cursor");
        while (shown < due) chars[shown++].classList.add("tw-on");
        if (shown < chars.length) {
          if (shown) chars[shown - 1].classList.add("tw-cursor");
          requestAnimationFrame(tick);
        } else {
          restores.forEach(([wrap, node]) => wrap.replaceWith(node));
          el.classList.remove("tw-typing");
        }
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          const delay = (parseFloat(e.target.style.getPropertyValue("--reveal-delay")) || 0) * STAGGER_MS;
          setTimeout(() => typeOut(e.target), delay);
        }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    if (!reduced) document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }
</script>
```

**Verify before the PR:** screenshot mid-typing (cursor visible, later lines already
holding their space); after settling, `document.querySelectorAll('.tw-c').length === 0`
and every `.reveal` has `.in-view`; then run the main-thread gate. Browser automation in
a hidden/background tab throttles `requestAnimationFrame` — timing checks there are
meaningless; front the tab or trust screenshots.

### Measuring the main-thread gate

Before = production (`https://<slug>.pages.dev`), after = the branch preview. Ignore the
SEO score: preview deploys send `x-robots-tag: noindex`, production doesn't.

```bash
for n in before after; do
  [ $n = before ] && URL=https://<slug>.pages.dev || URL=https://<branch-slug>.<slug>.pages.dev
  for i in 1 2 3; do
    npx -y lighthouse@12 "$URL" --quiet --output=json --output-path=lh/$n-mobile-$i.json --chrome-flags="--headless=new"
  done
done
node -e '
const fs = require("fs"), med = (a) => a.sort((x, y) => x - y)[1];
for (const n of ["before", "after"]) {
  const r = [1, 2, 3].map((i) => JSON.parse(fs.readFileSync(`lh/${n}-mobile-${i}.json`)));
  console.log(n, {
    perf: med(r.map((x) => x.categories.performance.score * 100)),
    tbt: med(r.map((x) => x.audits["total-blocking-time"].numericValue)),
    longTasks: med(r.map((x) => x.audits["long-tasks"].details?.items.length ?? 0)),
    mainThreadMs: Math.round(med(r.map((x) => x.audits["mainthread-work-breakdown"].details.items.reduce((s, i) => s + i.duration, 0)))),
  });
}'
```

Run it outside the spoke (a scratch dir), never commit the `lh/` output. Lighthouse
loads without scrolling, so it measures load-time motion only; scroll-triggered work is
the same per block, spread out over the scroll.

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

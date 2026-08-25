# Change playbook — replace an image

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md); all
other steps are shared.

## Use when

The client wants a photo swapped: hero, about, a gallery image, or the logo.
*"New hero pic attached." "Use this instead of the old patio photo."*

## Inputs required — stop and ask if any is missing (rules 4–5)

- **Which image?** If the request says "the photo" and the site has several, ask with a
  list: *"hero, the About photo, or one of the 4 gallery shots?"*
- **The new asset, attached.** No attachment → ask for it. Never source an image from
  the web for a client site.
- **An alt-text decision** — see recipe step 4.

## Recipe

1. **Check the attachment:** a real image format (jpg/png/webp/heic — convert heic);
   large enough for the slot — hero ≥ 1600px wide, other slots ≥ 800px. Too small → ask
   for a bigger original rather than shipping a blurry upscale.
2. **Place it** in `src/assets/` with a descriptive kebab name + date
   (`hero-dining-room-20260610.jpg`). Don't overwrite the old file in place — Astro's
   asset pipeline handles resizing and formats; git history is not a CDN.
3. **Update the reference** in the matching `src/content/data/*.json` (`hero.json`,
   `about.json`, …).
4. **Alt text** (the schema requires the field): if the new image shows the same subject,
   keep the existing alt; if the subject changed, write a new literal description —
   *"Carnitas tacos on a blue plate"*, not *"delicious food!"*. Empty alt is allowed only
   as an explicit decorative-image decision, never as a default.
5. **Delete the replaced asset** in the same commit — the repo shouldn't accrete dead
   images; git history is the archive.
6. **Logo swaps** additionally get checked against the header and footer backgrounds
   (contrast, transparency edges).

## Validate

`npm run build` — catches dead asset paths and missing alt fields. Astro's image
processing will also fail on a corrupt file.

## PR & reply

PR title `content(images): …`; show old and new side by side if the host renders images
in the description. Reply draft: *"Swapped the hero photo — preview: <link>."*

## Edge cases seen coming

- **Heavy phone photos** (10MB HEIC) — convert to a web format before committing; the
  built page must stay inside the performance budget.
- **"Can you brighten it up a bit?"** — a light crop/brightness pass is OK and gets
  noted in the PR. Anything beyond that, ask.
- **Identifiable customers in the shot** — confirm the client has consent to use it.
  Cheap to ask, expensive to unwind.

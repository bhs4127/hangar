# Change playbook — replace an image

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md); all
other steps are shared.

## Use when

The client wants a photo swapped: hero, about, a gallery image, or the logo.
*"New hero pic attached." "Use this instead of the old patio photo."*

## Inputs required — stop and ask if any is missing (rules 4–5)

- **Which image?** If the request says "the photo" and the site has several, ask with a
  list: *"hero, the About photo, or one of the 4 gallery shots?"*
- **The new asset, attached or in the client's upload drop.** No attachment → ask for
  it. Uploads: `node automation/upload-drop.mjs fetch uploads/<slug>/<date>/ <scratch dir>`
  ([setup-upload-drop.md](../setup-upload-drop.md)); the email says which photo goes
  where. Never source an image from the web for a client site, and never fetch a share
  link from an email body. Reply with their upload link instead.
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
- **Camera originals from the upload drop** (20MB+ each, often with GPS in the
  metadata). Don't commit originals, because git keeps every byte forever. In the spoke, re-encode
  to a 2400px long edge with metadata stripped (sharp drops it by default; convert HEIC
  with `sips -s format jpeg` first, since prebuilt sharp can't read it):
  `node -e "require('sharp')(process.argv[1]).rotate().resize(2400,2400,{fit:'inside',withoutEnlargement:true}).jpeg({quality:85,mozjpeg:true}).toFile(process.argv[2])" in.jpg src/assets/<name>.jpg`
- **"Here's a Google Drive link"** — don't open it. Reply with the client's upload
  link and ask them to put the photos there.
- **"Can you brighten it up a bit?"** — a light crop/brightness pass is OK and gets
  noted in the PR. Anything beyond that, ask.
- **Identifiable customers in the shot** — confirm the client has consent to use it.
  Cheap to ask, expensive to unwind.

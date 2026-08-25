# TODOS

> Prioritized forward queue. Each item is written to be pasted straight into Claude Code
> as a task. Maintained at the end of every task (CLAUDE.md state-layer ritual): check
> off, add, re-prioritize.

## P0 — make this HQ yours (once, before anything else)

- [ ] **Fill in `FLEET.md`.** Copy `FLEET.example.md` → `FLEET.md` (gitignored), fill
  every row or mark it `TBD` deliberately. This is the only place HQ names your GitHub
  org and Cloudflare account.
- [ ] **`gh auth login`** as the org that will own the spoke repos.
- [ ] **`wrangler login`** on the Cloudflare account that will own the Pages projects.
- [ ] **Mint the scoped Cloudflare API token** (5 min, once) — Pages:Edit, Zone:Edit,
  Zone:Read, DNS:Edit, Email Routing:Edit — and drop it at
  `~/.config/hq/cloudflare-token` (chmod 600). The `wrangler login` OAuth token is
  zone:read only, so without this every domain hookup falls back to dashboard clicking.
  See [playbooks/change/attach-custom-domain.md](playbooks/change/attach-custom-domain.md) § Inputs.

## P1 — prove the loop (one client, end to end, by hand)

Do this manually and correct the playbooks with whatever they get wrong. The manual run
is the spec for every automation that follows (DECISIONS.md — HQ-first build order).

- [ ] **Onboard client #1** per [playbooks/onboard-client.md](playbooks/onboard-client.md):
  intake conversation → client record from `_example-client.md` → registry row → spoke
  repo `<slug>-site`.
- [ ] **Build the first spoke end-to-end** per the vertical's build playbook, on a
  `build/initial-site` branch. Verify the safety contract *deliberately*: put a bad price
  in a content file and confirm the build fails with the exact field path.
- [ ] **Attach hosting** — `wrangler pages project create <slug> --production-branch main`,
  then deploy the branch as a preview. Put the preview link in the PR.
- [ ] **Approve and merge PR #1**, deploy production from `main`, verify the live URL.
- [ ] **Process one change request manually** through a change playbook (menu item,
  hours, or image) — branch → validated edit → PR → preview → approve → merge.
- [ ] **Fold corrections back into the playbooks.** This is the actual deliverable of P1;
  the site is a byproduct.

## P2 — make it premium

The design language ships with this repo — `playbooks/design-language.md` plus the
eight-question design brief in the intake flow and the record template. Nothing to build;
the work is *applying* it.

- [ ] **Collect a real design brief at intake** for client #1 and make the build visibly
  reflect it. The build playbooks' rendering opinions are defaults the brief overrides,
  not a uniform (DECISIONS.md).
- [ ] **Nominate a reference implementation.** Once one spoke looks genuinely premium,
  name it in `design-language.md` as the reference and fold what you learned back into
  the vertical's build playbook.

## P3 — close the loop on automation

- [ ] **Decide + wire contact-form delivery** (`CONTACT_FORWARD_TO`): the Pages Function
  validates and spam-checks but only logs. Candidates: Resend free tier vs. Cloudflare
  Email Routing `send_email` binding (destination must be a verified Email Routing
  address — workable, it's the client's own email). Decide at first real client; test
  end-to-end delivery as part of their go-live checklist.
- [ ] **Pick the intake domain** and record it in `FLEET.md` — per-client aliases are
  `<slug>@requests.<domain>`. Blocks the email adapter.
- [ ] **Build the email intake adapter** — Cloudflare Email Routing on
  `requests.<your-domain>` → Worker that emits the normalized `IntakeRequest` object
  (shape in `automation/README.md`) for ONE client alias. Output can land somewhere you
  can read (a file, a queue, an issue); classification and auto-editing come later.

## P4 — widen

- [ ] **Make verticals fully extensible** — write `playbooks/build/_base.md`: the
  universal one-pager anatomy (hero → about → *offerings* → trust/credibility →
  practicalities (hours/location as applicable) → contact) plus the recipe for deriving a
  brand-new vertical during onboarding: name the domain sections (a menu and
  practice-areas are both "offerings"), derive `schemas/<vertical>.ts` from the base
  patterns, write the vertical's own opinions, log a DECISIONS entry. The registry's
  `vertical` field is already free text. Acceptance test: a dog groomer or a yoga studio
  can be onboarded with no HQ changes beyond the two derived files.
- [ ] **Write `playbooks/build/law-office.md` for real**, plus `schemas/law-office.ts`,
  after the restaurant loop is proven. The stub lists the known differences to encode
  (practice areas, attorney bios, disclaimers, no ordering slot).
- [ ] **Approval channel**: Telegram (or Slack) bot that posts "PR ready: <preview link> —
  👍 to ship?" and treats the reaction as approve-to-merge. Attaches at the PR step of the
  pipeline.
- [ ] **Persistent host**: pick and provision (mini PC vs. VPS), keep HQ + spokes checked
  out, run the intake loop on it instead of a laptop.

## P5 — later channels

- [ ] **SMS adapter** via Twilio inbound webhook → same `IntakeRequest` object. Sender
  phone number is the client-matching identifier.
- [ ] **Signal adapter** via `signal-cli` daemon on the persistent host. Fiddliest of the
  channels (registered number + linked device, no managed inbound webhook) — do it last.

## Parking lot (real questions, not yet committed)

- [ ] Spoke template repo — only if onboarding #2/#3 shows real repetition (see
  DECISIONS.md: instructions over shared code).
- [ ] Registrar-API automation for nameserver flips — parked until the fleet holds enough
  domains at one registrar to beat "paste two hostnames" (DECISIONS.md — domain hookups).
- [ ] Schema v2 candidates surfaced by the change-playbook edge cases: dated hours
  exceptions (holidays), split day hours (11–2 / 5–9), multi-size prices (cup/bowl),
  "market price". All deliberately deferred by decision: the notes escape hatch and
  strict prices stand until a real client menu demands more.
- [ ] Image pipeline pattern for real photos (`src/assets/` + `astro:assets` responsive
  output) — decide when the first real photos arrive.
- [ ] Static-map image source for the location section (Mapbox static? none?) — address +
  a Google Maps link is an acceptable floor.

# STATUS

> Current-state snapshot, overwritten on every update — history lives in CHANGELOG.md
> and git. Last updated: **on fork**.

## Summary

**Fresh hangar. No clients yet.** Everything in this repo is *knowledge* — guardrails,
playbooks, a reference schema, and the state layer — carried over from a fleet where the
full loop was proven end to end: request → playbook → branch → validated edit → PR →
preview → approval → merge → deploy, hosting included (agent-performed Cloudflare Pages
direct uploads). None of that fleet's clients, accounts, or domains came with it.

**Before your first task:** fill in `private/FLEET.md` (seeded from `private.example/`). That
file is the only place hangar names your GitHub org and Cloudflare account; nothing else in
the repo hardcodes them. Then run its first-run checklist (`gh auth login`,
`wrangler login`, mint the scoped API token).

**Your next move** is TODOS P1: onboard client #1 by hand, correcting the playbooks with
whatever they get wrong. Do not build any automation until one real request has flowed
through manually (DECISIONS.md — HQ-first build order).

## Built (real, usable now)

- `CLAUDE.md` — guardrails every task runs under
- `private.example/` — seed for the private layer (`private/`, ignored by hangar; back it up as its own private repo)
- `playbooks/README.md` — the shared anatomy-of-a-change pipeline
- `playbooks/build/_base.md` — the build spec every site follows, plus how to derive a new vertical
- `playbooks/build/restaurant.md` — the restaurant vertical, extending the base
- `playbooks/design-language.md` — the cross-vertical premium standard + design brief
- `playbooks/change/` ×4 (menu item, hours, image, attach-custom-domain) — concrete
  recipes, and the template for future change types
- `playbooks/onboard-client.md` — how a spoke is born, step by step (manual-first)
- `schemas/restaurant.ts` — reference Zod contract, copied into each spoke at birth
- `private.example/clients/_example-client.md` + `private/clients/REGISTRY.md` — record format + empty index
- State layer: this file, `TODOS.md`, `CHANGELOG.md` (all in `private/`) + `DECISIONS.md` (shared)
- `dev/build-architecture.mjs` → generated `private/architecture.html`

## Stubbed

- `playbooks/build/law-office.md` — shape and known differences only
- Derived verticals (`creator`, `portfolio`, anything else) — the *pattern* is decided
  (derive inline, schema stays in the spoke, promote to hangar on a second client of the
  same vertical) but no derived playbook ships here

## Described only (design captured in docs, no code)

- Intake adapters + shared pipeline (`automation/README.md`) — email adapter is first to
  build. Intake is client→agency only; spoke contact forms are customer→client mail,
  outside this system entirely (DECISIONS.md)
- Spoke template / scaffolding automation — the build playbook is the template for now
- Contact-form delivery — provider decided (Resend); each spoke's function logs only until `change/wire-contact-delivery.md` runs for it
- Approval channel (Telegram/Slack "👍 to ship")
- Persistent host (keeps repos checked out, runs the intake loop)

## Business

<!-- Machine-read by dev/build-business.mjs — keep the table shape. One row per piece of
     current business state; overwrite rows as things change (this is a snapshot).
     Role:   sales | marketing | finance | delivery | clients | operations | legal | it
     Status: live | in-progress | waiting-owner | waiting-client | on-hold | planned | decided | blocked
     As of:  the date the row was last confirmed true (rows older than 14 days are flagged) -->

| Role | Item | Status | Detail | As of |
|---|---|---|---|---|
| sales | Offer | planned | what you sell and for how much: fill § Price list first | 2026-01-01 |
| marketing | Agency website | planned | your own site, built through the same pipeline as a client's | 2026-01-01 |
| finance | Price list | planned | owner-set prices only (rule 5); see § Price list | 2026-01-01 |
| delivery | Fleet | planned | no client spokes yet; TODOS P1 creates the first | 2026-01-01 |
| clients | First client | planned | onboard via playbooks/onboard-client.md | 2026-01-01 |
| operations | Intake | planned | email intake per playbooks/setup-email-intake.md | 2026-01-01 |
| legal | Accessibility baseline | live | semantic HTML, alt text, 4.5:1 body contrast on every site (CLAUDE.md rule 8) | 2026-01-01 |
| it | Hosting | planned | Cloudflare Pages, direct upload; fill private/FLEET.md | 2026-01-01 |

## Price list

<!-- Machine-read by dev/build-business.mjs. Stage: start | build | ongoing | exit | pass-through.
     Prices are owner-set business facts (rule 5): change them only on the owner's word. -->

| Offer | Price | Stage | Status | Notes |
|---|---|---|---|---|
| Website build | TBD | build | planned | one-time |
| Care plan | TBD | ongoing | planned | monthly, optional |
| Handoff | TBD | exit | planned | everything moves into the client's own accounts |

## Architecture nodes

<!-- Machine-read by dev/build-architecture.mjs — keep the table shape.
     Columns: Node | Group | Status | Notes
     Group:  intake | hangar | spokes | delivery | infra
     Status: built | in-progress | stubbed | planned -->

| Node | Group | Status | Notes |
|---|---|---|---|
| Guardrails (CLAUDE.md) | hangar | built | rules every task runs under |
| Fleet config (FLEET.md) | hangar | planned | fill in private/FLEET.md — first step |
| Client registry | hangar | built | format + worked example; **0 clients** |
| Base build playbook | hangar | built | `_base.md`: universal anatomy, stack, contact form, JSON-LD, DoD, and the recipe for deriving a new vertical |
| Design language | hangar | built | `design-language.md`: cross-vertical premium standard, design brief, motion recipes |
| Restaurant build playbook | hangar | built | extends _base.md; menu / hours / ordering specifics |
| Law-office build playbook | hangar | stubbed | shape + known differences only |
| Derived verticals | hangar | planned | derive inline, schema in-spoke, promote on a 2nd client |
| Change playbooks ×7 | hangar | built | menu / hours / image / custom domain / contact delivery / payment link / Search Console; template for new types |
| Shopify track (build + product playbooks) | hangar | built | second commerce track beside payment links; the client pays Shopify |
| Onboarding + handoff playbooks | hangar | built | onboarding manual-first by design; handoff moves everything into accounts the client owns |
| Restaurant schema (reference) | hangar | built | copied into each spoke at birth |
| State layer + architecture view | hangar | built | maintained at the end of every task; two generated maps (system + business by role) |
| Email adapter | intake | planned | Resend; playbook ready — needs an intake domain in FLEET.md |
| Daily mail sweep | intake | planned | scheduled, report-only read of inbound mail via automation/mail-sweep.mjs + phone digest |
| Upload drop (Worker + R2) | intake | planned | per-client photo upload links for batches too big for email |
| Intake pipeline | intake | planned | normalize → classify → playbook → spoke → PR |
| SMS adapter (Twilio) | intake | planned | easy second channel |
| Signal adapter (signal-cli) | intake | planned | fiddliest; needs persistent host; last |
| Client spokes | spokes | planned | none yet — TODOS P1 creates the first |
| Spoke scaffolding/template | spokes | planned | build playbook is the template for now |
| Cloudflare Pages + previews | delivery | built | direct upload, agent-deployed; commands proven — needs `wrangler login` |
| Contact-form delivery | delivery | planned | Pages Function → Resend, visitor as Reply-To |
| Shopify stores (client-owned) | delivery | planned | theme pushed by CLI, previews as unpublished themes |
| Search Console automation | infra | planned | automation/search-console.mjs: verify domains, submit sitemaps, report |
| Prospect finder | infra | planned | automation/prospect.mjs + prospect.md weekly loop; the owner sends |
| Meta social publishing | infra | planned | automation/meta.mjs: the agency's own IG + FB Page, owner-approved posts |
| Telegram approvals | infra | planned | telegram-approvals.md: owner commands from the phone; waits for a persistent host |
| Persistent host | infra | planned | checked-out repos + intake loop + signal-cli |

## Architecture edges

<!-- Machine-read by dev/build-architecture.mjs. Columns: From | To | Label.
     From/To must match a Node name above exactly; the generator warns on any that don't. -->

| From | To | Label |
|---|---|---|
| Email adapter | Daily mail sweep | read each weekday |
| Upload drop (Worker + R2) | Daily mail sweep | new batches listed |
| Daily mail sweep | Intake pipeline | reports requests |
| SMS adapter (Twilio) | Intake pipeline | request |
| Signal adapter (signal-cli) | Intake pipeline | request |
| Telegram approvals | Intake pipeline | owner commands |
| Guardrails (CLAUDE.md) | Intake pipeline | governs every step |
| Intake pipeline | Client registry | identify client (rule 7) |
| Intake pipeline | Change playbooks ×7 | classify + pick recipe |
| Change playbooks ×7 | Client spokes | branch → PR |
| Base build playbook | Client spokes | builds every site |
| Restaurant build playbook | Base build playbook | extends |
| Law-office build playbook | Base build playbook | extends |
| Derived verticals | Base build playbook | extends |
| Design language | Client spokes | premium pass |
| Restaurant schema (reference) | Client spokes | copied at birth |
| Onboarding + handoff playbooks | Client spokes | birth + exit |
| Shopify track (build + product playbooks) | Shopify stores (client-owned) | theme + catalogue |
| Client spokes | Cloudflare Pages + previews | deploy |
| Client spokes | Contact-form delivery | form submits |
| Search Console automation | Client spokes | verifies + reports |
| Prospect finder | Onboarding + handoff playbooks | new clients |
| Persistent host | Telegram approvals | runs operator session |
| Persistent host | Signal adapter (signal-cli) | signal-cli daemon |

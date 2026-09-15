# STATUS

> Current-state snapshot, overwritten on every update — history lives in CHANGELOG.md
> and git. Last updated: **on fork**.

## Summary

**Fresh hangar. No clients yet.** Everything in this repo is *knowledge* — guardrails,
playbooks, a reference schema, and the state layer — carried over from a fleet where the
full loop was proven end to end: request → playbook → branch → validated edit → PR →
preview → approval → merge → deploy, hosting included (agent-performed Cloudflare Pages
direct uploads). None of that fleet's clients, accounts, or domains came with it.

**Before your first task:** copy `FLEET.example.md` → `FLEET.md` and fill it in. That
file is the only place hangar names your GitHub org and Cloudflare account; nothing else in
the repo hardcodes them. Then run its first-run checklist (`gh auth login`,
`wrangler login`, mint the scoped API token).

**Your next move** is TODOS P1: onboard client #1 by hand, correcting the playbooks with
whatever they get wrong. Do not build any automation until one real request has flowed
through manually (DECISIONS.md — HQ-first build order).

## Built (real, usable now)

- `CLAUDE.md` — guardrails every task runs under
- `FLEET.example.md` — per-operator identifiers; copy to `FLEET.md` (gitignored)
- `playbooks/README.md` — the shared anatomy-of-a-change pipeline
- `playbooks/build/restaurant.md` — opinionated, full build spec
- `playbooks/design-language.md` — the cross-vertical premium standard + design brief
- `playbooks/change/` ×4 (menu item, hours, image, attach-custom-domain) — concrete
  recipes, and the template for future change types
- `playbooks/onboard-client.md` — how a spoke is born, step by step (manual-first)
- `schemas/restaurant.ts` — reference Zod contract, copied into each spoke at birth
- `clients/_example-client.md` + `clients/REGISTRY.md` — record format + empty index
- State layer: this file, `TODOS.md`, `DECISIONS.md`, `CHANGELOG.md`
- `dev/build-architecture.mjs` → generated `dev/architecture.html`

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
- Contact-form delivery provider (`CONTACT_FORWARD_TO`) — undecided; functions log only
- Approval channel (Telegram/Slack "👍 to ship")
- Persistent host (keeps repos checked out, runs the intake loop)

## Architecture nodes

<!-- Machine-read by dev/build-architecture.mjs — keep the table shape.
     Columns: Node | Group | Status | Notes
     Group:  intake | hangar | spokes | delivery | infra
     Status: built | in-progress | stubbed | planned -->

| Node | Group | Status | Notes |
|---|---|---|---|
| Guardrails (CLAUDE.md) | hangar | built | rules every task runs under |
| Fleet config (FLEET.md) | hangar | planned | copy FLEET.example.md and fill it in — first step |
| Client registry | hangar | built | format + worked example; **0 clients** |
| Restaurant build playbook | hangar | built | opinionated, full |
| Law-office build playbook | hangar | stubbed | shape + known differences only |
| Change playbooks ×4 | hangar | built | menu / hours / image / attach-custom-domain — template for new types |
| Onboarding playbook | hangar | built | manual-first by design |
| Restaurant schema (reference) | hangar | built | copied into each spoke at birth |
| State layer + architecture view | hangar | built | maintained at the end of every task |
| Email adapter | intake | planned | first adapter to build; needs an intake domain in FLEET.md |
| SMS adapter (Twilio) | intake | planned | easy second channel |
| Signal adapter (signal-cli) | intake | planned | fiddliest; needs persistent host; last |
| Intake pipeline | intake | planned | normalize → classify → playbook → spoke → PR |
| Client spokes | spokes | planned | none yet — TODOS P1 creates the first |
| Derived verticals | hangar | planned | derive inline, schema in-spoke, promote on a 2nd client |
| Spoke scaffolding/template | spokes | planned | build playbook is the template for now |
| Cloudflare Pages + previews | delivery | built | direct upload, agent-deployed; commands proven — needs `wrangler login` |
| Approval channel (Telegram/Slack) | infra | planned | "👍 to ship" from the phone |
| Persistent host | infra | planned | checked-out repos + intake loop + signal-cli |

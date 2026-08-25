# hangar

Mission control for producing and maintaining simple static websites for local-business
clients (restaurants, law offices, …). Sites are built, serviced, and dispatched from
here — the hangar itself never ships any of them.

> Throughout these docs this repo is called **HQ**: the hub in hub-and-spoke. `hangar` is
> what the repo is named; `HQ` is the role it plays. Same thing.

The architecture is hub-and-spoke:

- **HQ (this repo)** is the brain: guardrails, client registry, playbooks, reference
  schemas, and the state layer. It contains *knowledge*, never client site code.
- **Spokes** are per-client repos, one website each (Astro + Tailwind + Content
  Collections validated by a Zod schema). None exist yet.
- **There is no CMS.** Clients send requests in plain language; an agent reads HQ to find
  the client and the right playbook, edits content files in the spoke, and opens a PR.
  The agent is the CMS. The typed schema is the contract that makes that safe — a
  malformed edit fails the spoke's build instead of shipping.
- **There is no shared component library.** Each spoke carries its own components, even
  at the cost of duplication. Consistency comes from opinionated playbooks, not imported
  code (DECISIONS.md has the why).

## First run (fork this, then do these five things)

HQ ships with no accounts wired in. Everything operator-specific lives in one gitignored
file.

```bash
for f in FLEET STATUS TODOS CHANGELOG; do cp $f.example.md $f.md; done
cp clients/REGISTRY.example.md clients/REGISTRY.md
gh auth login                  # as the org that will own the spoke repos
wrangler login                 # the Cloudflare account that will own the Pages projects
```

Then fill in `FLEET.md` — your org, Cloudflare account + ID, intake domain. Those copied
files are all **gitignored**: this repo is public and forkable, but you also operate from
it, so anything naming a real client, domain, or account stays local. Improvements to
playbooks and guardrails are what you commit and share. See CLAUDE.md § Two layers.

Then mint a scoped Cloudflare API token (Pages:Edit, Zone:Edit, Zone:Read, DNS:Edit,
Email Routing:Edit) and store it outside every repo:

```bash
mkdir -p ~/.config/hq && printf '%s' 'PASTE_TOKEN_HERE' > ~/.config/hq/cloudflare-token && chmod 600 ~/.config/hq/cloudflare-token
```

Fifth: open Claude Code here and work TODOS P1 — onboard client #1 **by hand**,
correcting the playbooks with whatever they get wrong. That manual run is the spec for
every automation that comes after it.

## How a change flows

```
request arrives from the client (email today; SMS / Signal later)
  → channel adapter normalizes it to one internal request object
  → HQ: identify client (registry channels) + pick playbook
  → pull that client's spoke repo, create a branch
  → apply the playbook, run the build (Zod schema validates the edit)
  → open a PR on the spoke → Cloudflare Pages preview deploy
  → owner approves & merges → production
  → a client reply is drafted → HQ state layer updated
```

Nothing is ever pushed straight to a client's production branch. HQ is mission control;
the edit physically lands in the spoke. The full pipeline is written out once in
[playbooks/README.md](playbooks/README.md).

## What's real vs. stub vs. described-only

| Thing | State |
|---|---|
| Guardrails ([CLAUDE.md](CLAUDE.md)) | **Real** |
| Fleet config ([FLEET.example.md](FLEET.example.md)) | **Real** — copy to `FLEET.md`, fill in, never commit |
| Private layer (`*.example.md` seeds → gitignored live files) | **Real** — your clients + state stay local |
| Anatomy of a change ([playbooks/README.md](playbooks/README.md)) | **Real** |
| Restaurant build playbook ([playbooks/build/restaurant.md](playbooks/build/restaurant.md)) | **Real** — opinionated, argue with it |
| Change playbooks ×4 ([playbooks/change/](playbooks/change/)) | **Real** — menu / hours / image / custom domain; also the template for future change types |
| Onboarding playbook ([playbooks/onboard-client.md](playbooks/onboard-client.md)) | **Real** — manual-first by design |
| Reference restaurant schema ([schemas/restaurant.ts](schemas/restaurant.ts)) | **Real** — copied into each spoke at birth |
| State layer (STATUS / TODOS / DECISIONS / CHANGELOG) | **Real** — maintained every task |
| Architecture view ([dev/build-architecture.mjs](dev/build-architecture.mjs) → generated HTML) | **Real** |
| Law-office build playbook ([playbooks/build/law-office.md](playbooks/build/law-office.md)) | **Stub** — shape + known differences only |
| Client registry ([clients/](clients/)) | **Real format** — worked fictional example; real records are gitignored |
| Intake adapters + pipeline ([automation/README.md](automation/README.md)) | **Described only** — do not build until a spoke exists |
| Spoke template / scaffolding automation | **Described only** — the build playbook *is* the template for now |
| Cloudflare Pages config + per-branch previews | **Real** — direct-upload, agent-deployed; commands in [automation/README.md](automation/README.md) |
| Approval channel (Telegram/Slack "👍 to ship") | **Described only** |
| Persistent host (checked-out repos + intake loop) | **Described only** |

## Using HQ day to day

Open Claude Code in this repo and state the task ("Marisol says the carnitas taco is $14
now"). The agent follows CLAUDE.md: `FLEET.md` → registry → playbook → spoke → branch →
validate → PR.
Every task ends with the state-layer ritual, so `STATUS.md` + `dev/architecture.html`
are always the current answer to "what exists, what's next, why" — steer from those
summaries instead of re-reading the repo.

## Next steps (the short version — TODOS.md is the full queue)

1. **Copy the seeds and fill in `FLEET.md`** (see First run above) — nothing else works
   until HQ knows which GitHub org and Cloudflare account it's driving.
2. **Kick off the first client site.** Run [playbooks/onboard-client.md](playbooks/onboard-client.md):
   intake questions → client record + registry row → new `<slug>-site` repo → build per
   [playbooks/build/restaurant.md](playbooks/build/restaurant.md) → PR. Do it by hand;
   correct the playbooks with whatever they got wrong.
3. **Attach hosting** to that spoke: `wrangler pages project create <slug>
   --production-branch main`, then branch previews and production from `main` (real
   commands in automation/README.md § Hosting).
4. **Process one change request manually** through a change playbook. That manual run is
   the spec for the first adapter.
5. **Only then build the email intake adapter** (Cloudflare Email Routing → Worker →
   normalized request object). SMS is the easy second channel; Signal is the fiddly last
   one. (Spoke contact forms are *not* intake — they're customer→client mail, forwarded
   to the client's email.) The approval channel attaches at the PR step; the persistent
   host is what eventually runs the intake loop unattended.

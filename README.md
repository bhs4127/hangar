# hangar

Mission control for producing and maintaining simple static websites for local-business
clients (restaurants, law offices, …). Sites are built, serviced, and dispatched from
here — the hangar itself never ships any of them.

> Formerly called **HQ**. Older DECISIONS entries still use that name — it means this
> repo, the hub in hub-and-spoke.

The architecture is hub-and-spoke:

- **Hangar (this repo)** is the brain: guardrails, client registry, playbooks, reference
  schemas, and the state layer. It contains *knowledge*, never client site code.
- **Spokes** are per-client repos, one website each (Astro + Tailwind + Content
  Collections validated by a Zod schema). They live outside this repo; a fresh fork has
  none until you onboard client #1.
- **There is no CMS.** Clients send requests in plain language; an agent reads hangar to find
  the client and the right playbook, edits content files in the spoke, and opens a PR.
  The agent is the CMS. The typed schema is the contract that makes that safe — a
  malformed edit fails the spoke's build instead of shipping.
- **There is no shared component library.** Each spoke carries its own components, even
  at the cost of duplication. Consistency comes from opinionated playbooks, not imported
  code (DECISIONS.md has the why).

## First run (fork this, then do these five things)

Hangar ships with no accounts wired in. Everything operator-specific lives under
`private/` (ignored by hangar), and secrets live outside every repo in `~/.config/hangar/`.

```bash
cp -R private.example private   # the private layer (ignored by hangar)
gh auth login                  # as the org that will own the spoke repos
wrangler login                 # the Cloudflare account that will own the Pages projects
```

Then fill in `private/FLEET.md` — your org, Cloudflare account + ID, intake domain.
`private/` is ignored by hangar: this repo is public and forkable, but you also operate
from it, so anything naming a real client, domain, or account stays out of it.
Improvements to playbooks and guardrails are what you commit and share. To back the
private layer up, make `private/` its own git repo with a private remote
(`cd private && git init`, add the remote, push). See CLAUDE.md § Two layers.

Then mint a scoped Cloudflare API token (Pages:Edit, Zone:Edit, Zone:Read, DNS:Edit,
Email Routing:Edit) and store it outside every repo:

```bash
mkdir -p ~/.config/hangar && printf '%s' 'PASTE_TOKEN_HERE' > ~/.config/hangar/cloudflare-token && chmod 600 ~/.config/hangar/cloudflare-token
```

Email intake (Next steps §5, later) adds two more keys alongside it: a **full-access**
Resend key at `~/.config/hangar/resend-token` for the agent, and a **sending-only** key
that lives in each spoke's Pages secrets. Two keys on purpose — a leaked site secret can
then send mail but never read yours.

Fifth: open Claude Code here and work TODOS P1 — onboard client #1 **by hand**,
correcting the playbooks with whatever they get wrong. That manual run is the spec for
every automation that comes after it.

## How a change flows

```
request arrives from the client (email today; SMS / Signal later)
  → channel adapter normalizes it to one internal request object
  → hangar: identify client (registry channels) + pick playbook
  → pull that client's spoke repo, create a branch
  → apply the playbook, run the build (Zod schema validates the edit)
  → open a PR on the spoke → Cloudflare Pages preview deploy
  → owner checks the preview → the client gets the preview link
  → client says "looks good" → owner okays, agent merges → production
  → an "it's live" reply is drafted → hangar state layer updated
```

Nothing is ever pushed straight to a client's production branch. Hangar is mission control;
the edit physically lands in the spoke. The full pipeline is written out once in
[playbooks/README.md](playbooks/README.md).

## What's real vs. stub vs. described-only

| Thing | State |
|---|---|
| Guardrails ([CLAUDE.md](CLAUDE.md)) | **Real** |
| Fleet config ([private.example/FLEET.md](private.example/FLEET.md)) | **Real** — seeded into `private/FLEET.md`; fill in, never commit to hangar |
| Private layer ([private.example/](private.example/) seed → `private/`) | **Real** — your clients + state; back it up as its own private repo |
| Anatomy of a change ([playbooks/README.md](playbooks/README.md)) | **Real** |
| Base build playbook ([playbooks/build/_base.md](playbooks/build/_base.md)) | **Real** — every site; opinionated, argue with it. Also how to derive a new vertical |
| Restaurant build playbook ([playbooks/build/restaurant.md](playbooks/build/restaurant.md)) | **Real** — extends the base with menu / hours / ordering |
| Change playbooks ×5 ([playbooks/change/](playbooks/change/)) | **Real** — menu / hours / image / custom domain / contact-form delivery; also the template for future change types |
| Onboarding playbook ([playbooks/onboard-client.md](playbooks/onboard-client.md)) | **Real** — manual-first by design |
| Managed Shopify track ([playbooks/build/shopify-store.md](playbooks/build/shopify-store.md) + [product changes](playbooks/change/add-or-edit-shopify-product.md)) | **Written, not yet run** — the first Shopify client corrects it |
| Design language ([playbooks/design-language.md](playbooks/design-language.md)) | **Real** — the premium bar, the design brief, and the motion system |
| Reference restaurant schema ([schemas/restaurant.ts](schemas/restaurant.ts)) | **Real** — copied into each spoke at birth |
| State layer (STATUS / TODOS / DECISIONS / CHANGELOG) | **Real** — maintained every task |
| Architecture view ([dev/build-architecture.mjs](dev/build-architecture.mjs) → generated HTML) | **Real** |
| Law-office build playbook ([playbooks/build/law-office.md](playbooks/build/law-office.md)) | **Stub** — shape + known differences only |
| Client registry ([private.example/clients/](private.example/clients/)) | **Real format** — worked fictional example; real records live in `private/clients/` |
| Email intake ([playbooks/setup-email-intake.md](playbooks/setup-email-intake.md)) | **Playbook ready** (Resend) — set it up once a spoke exists |
| Telegram approvals ([playbooks/telegram-approvals.md](playbooks/telegram-approvals.md)) | **Drafted, not yet run** — owner commands from the phone; send script + allowlist still to build |
| Other intake adapters + pipeline ([automation/README.md](automation/README.md)) | **Described only** — SMS, Signal, unattended runs |
| Spoke template / scaffolding automation | **Described only** — the build playbook *is* the template for now |
| Cloudflare Pages config + per-branch previews | **Real** — direct-upload, agent-deployed; commands in [automation/README.md](automation/README.md) |
| Persistent host (checked-out repos + intake loop) | **Described only** |

## Using hangar day to day

Open Claude Code in this repo and state the task ("Marisol says the carnitas taco is $14
now"). The agent follows CLAUDE.md: `private/FLEET.md` → registry → playbook → spoke → branch →
validate → PR.
Every task ends with the state-layer ritual, so `private/STATUS.md` + `private/architecture.html`
are always the current answer to "what exists, what's next, why" — steer from those
summaries instead of re-reading the repo.

## Next steps (the short version — private/TODOS.md is the full queue)

1. **Copy the seeds and fill in `private/FLEET.md`** (see First run above) — nothing else works
   until hangar knows which GitHub org and Cloudflare account it's driving.
2. **Kick off the first client site.** Run [playbooks/onboard-client.md](playbooks/onboard-client.md):
   intake questions → client record + registry row → new `<slug>-site` repo → build per
   [playbooks/build/_base.md](playbooks/build/_base.md) plus the vertical's playbook
   (e.g. [restaurant.md](playbooks/build/restaurant.md)) → PR. Do it by hand;
   correct the playbooks with whatever they got wrong.
3. **Attach hosting** to that spoke: `wrangler pages project create <slug>
   --production-branch main`, then branch previews and production from `main` (real
   commands in automation/README.md § Hosting).
4. **Process one change request manually** through a change playbook. That manual run is
   the spec for the first adapter.
5. **Only then set up email intake** —
   [playbooks/setup-email-intake.md](playbooks/setup-email-intake.md) walks it end to
   end: register an intake domain, verify `requests.<domain>` in Resend for sending
   *and* receiving, then per-client aliases that need no DNS at all. Clients email
   `<slug>@requests.<domain>`; the agent reads it, and the same pipeline runs.
6. **Wire each live spoke's contact form** —
   [playbooks/change/wire-contact-delivery.md](playbooks/change/wire-contact-delivery.md).
   This is the *other* mail direction: a visitor writes, the client receives, and it
   never enters intake.

Later, in rough order: SMS is the easy second channel and Signal the fiddly last one;
the approval channel ("👍 to ship" from a phone) attaches at the PR step; a persistent
host is what eventually runs the intake loop unattended.

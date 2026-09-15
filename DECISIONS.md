# DECISIONS

> Append-only log of *why* — lightweight ADRs. New entries go at the bottom. Never
> rewrite or delete an existing entry; if a decision is reversed, append a new entry that
> supersedes it and links back.
>
> Template:
> `## YYYY-MM-DD — Title` / `**Decision:** …` / `**Why:** …`
>
> Entries below the fork point were inherited from the upstream template (then called HQ —
> read "HQ" in them as this repo) and
> generalized (client names and domains removed). They are the reasoning the playbooks
> assume — read them before arguing with a playbook. Your own entries append after them.

## 2026-06-10 — Leverage lives in instructions, not shared code

**Decision:** No shared component library. Each spoke carries its own components, even
when that duplicates code across sites. Consistency comes from opinionated playbooks in
HQ, which an agent can re-apply cheaply.
**Why:** A fleet of small one-page sites diverges naturally; shared abstractions create
coupled upgrades, version drag, and "fix one, break five" risk. Duplication is cheap when
an agent does the typing. Revisit if a single fix ever has to be hand-replicated across
5+ spokes and that hurts.

## 2026-06-10 — Hub-and-spoke: one repo per client

**Decision:** HQ is a control repo holding knowledge only; every client site lives in its
own separate repo.
**Why:** Blast radius — a bad change touches exactly one client. Per-client previews,
deploys, and permissions stay clean. If a client leaves, hand them their repo and part
cleanly.

## 2026-06-10 — No CMS; the agent is the CMS

**Decision:** Clients send requests in plain language. An agent reads them, edits the
content files in the spoke, and opens a PR. No admin UI is ever built.
**Why:** A CMS is a second product to build, secure, host, and teach. Plain language is
the interface clients already use. The schema + PR + preview supply the safety a CMS form
would have provided.

## 2026-06-10 — Typed content schema is the safety contract

**Decision:** Spoke content lives in Astro Content Collections validated by a Zod schema
(reference copies in `schemas/`). Every change is validated by running the build before a
PR is opened.
**Why:** Automated edits need machine-checkable validity, not reviewer vigilance. A bad
price or missing alt text should fail the build, not ship. Corollary: never loosen a
schema to make content pass — schema changes are project decisions, logged here.

## 2026-06-10 — Channel-agnostic intake via the adapter pattern

**Decision:** Every request source (email, SMS, Signal, contact form, owner-direct) gets
a small adapter whose only job is to normalize raw input into one internal request
object. Everything downstream operates on that object and never knows the channel.
**Why:** Channels will multiply; the seam is designed now so each new channel is one
small adapter, not a rework. Deliberately *not* building the multi-channel framework
before a single message has flowed — email is the only adapter that gets built first.

## 2026-06-10 — Cloudflare Pages for hosting

**Decision:** All spokes deploy to Cloudflare Pages; production = `main`, per-branch
preview deploys.
**Why:** Unlimited-bandwidth free tier — no surprise overage bill when a client goes
locally viral. Preview deploys per branch are native and free, which is the workflow law
(PR + preview) for free. Same platform offers Email Routing + Workers/Functions, so
intake and hosting share one account.

## 2026-06-10 — Contact forms via Cloudflare Pages Functions

**Decision:** Every site ships a contact form posting to a Pages Function on the same
host. Formspree/Web3Forms is the fallback only if Functions are unavailable.
**Why:** Native to the chosen platform, free tier, no third-party branding or dependency.
And architecturally: a form submission is just another intake source — the function emits
the same normalized request object as the email/SMS adapters, so client contact forms and
the agent's own pipeline share plumbing.

## 2026-06-10 — Dormant `ordering` slot; hand-off only, never build ordering

**Decision:** The restaurant schema carries an optional `ordering` slot
(`{ provider, urlOrEmbed }` — Square / Toast / ChowNow / …). Empty → renders nothing.
Filled → an "Order Online" CTA appears. We never build ordering functionality.
**Why:** Online ordering is a commodity to embed and a liability to build (payments,
liability, support). The slot exists from day one so turning ordering on is a content
edit, never a redesign.

## 2026-06-10 — Workflow law: branch + PR + preview, never direct to production

**Decision:** Every change to every spoke goes through a branch, a PR, and a preview
deploy. Nothing is pushed straight to a client's production branch, ever.
**Why:** The preview makes approval checkable by a human looking at a webpage, not a
diff. The PR is the audit trail. Agents make mistakes — the gate is structural, not
behavioral.

## 2026-06-10 — HQ-first build order

**Decision:** Scaffold mission control (this repo) before any client site, adapter, or
hosting config exists.
**Why:** The playbooks and guardrails *are* the product; spokes are their output. Standing
HQ up first also forces the state layer to exist before there is anything to lose track
of, and lets the architecture be argued about while it's still cheap to change.

## 2026-06-10 — Hours exceptions stay in the notes escape hatch (v1)

**Decision:** One-off exceptions ("Closed July 4") are handled via the free-text
`hours.notes` field, plus a TODOS.md reminder to remove the note afterward. No
dated-exceptions schema in v1.
**Why:** It's the most likely edge case, but a dated-exceptions model adds schema and
rendering complexity before a single real request has demanded it. A notes line renders
fine and the cleanup reminder covers staleness. Revisit only if notes-juggling becomes a
recurring chore.

## 2026-06-10 — Price format stays strict

**Decision:** `$N` / `$N.NN` only. "Market price", multi-size pricing (cup/bowl), and
happy-hour pricing remain unrepresentable until a real client menu requires them.
(Multi-size has a strict-format answer already: two items.)
**Why:** The strict regex is the safety feature that catches malformed automated edits.
Extending the price model is a decision to make against a real menu, not speculatively.

## 2026-06-10 — Contact forms are customer→client mail, not intake

**Decision:** A spoke's contact form serves the *client's customers*, not the agency.
The Pages Function validates, spam-checks, and forwards submissions straight to the
client's own email. Form submissions never enter the agent's intake pipeline, and the
agency owner never sees them.
**Why:** The original design conflated two unrelated relationships: customer→client (a
catering question) and client→agency (a site-change request). Sharing plumbing between
them would route diners' mail to the wrong inbox and create a routing problem that
doesn't need to exist. This supersedes the "shared plumbing / form-as-intake-adapter"
rationale in the earlier contact-forms entry above — the implementation choice (Pages
Function on the same host) stands.

## 2026-06-10 — Approval happens in-session: summary → "okay" → agent merges

**Decision:** PR review and merge are part of the Claude Code session. The agent
presents a review summary (the client-facing values, validation evidence, known gaps);
the owner approves in plain language ("okay") or pushes back; the agent performs the
merge. The owner opens GitHub only when they want to, never as a required step.
**Why:** The owner steers from summaries — the same principle the state layer exists
for. A mandatory GitHub round-trip adds friction without adding safety: schema + build
validation are the mechanical gate, the in-session summary is the human gate. The future
chat approval channel (Telegram/Slack "👍 to ship") is this exact pattern relocated to
the phone, not a new mechanism.

## 2026-06-10 — Deploys are agent-performed Pages direct uploads, not git-connected

**Decision:** Spokes deploy to Cloudflare Pages as **direct-upload projects**, created
and deployed entirely by the agent via wrangler: `wrangler pages project create <slug>
--production-branch main`; previews via `wrangler pages deploy dist --project-name
<slug> --branch <branch>` (alias `<branch>.<slug>.pages.dev`); production via
`--branch main` after merge. No git integration, no dashboard.
**Why:** Git-integration requires per-project dashboard setup (GitHub App connection),
and Cloudflare's current import flow steers toward Workers — the first attempt failed
and persisted nothing. Direct upload keeps the entire loop in the session, which is the
owner's explicit requirement ("I won't be deploying from browser; you will from here").
Trade-off accepted: a merge without an agent session doesn't deploy — fine, because the
agent performs every merge anyway (in-session approval protocol above). Revisit if
deploys ever need to happen with no agent in the loop. This amends the *mechanism* of
the earlier Cloudflare Pages decision; the platform choice stands.

## 2026-06-10 — Every client gets a design brief; premium is the bar

**Decision:** Styling direction is collected at intake — palette, tone sliders,
references, motion comfort — stored in the client record, and the build must visibly
reflect it. A design-language doc (TODOS P2) defines the floor (beautiful, interesting,
professional, premium) and how brief answers map to tokens and component choices. The
build playbooks' rendering opinions are defaults the brief overrides, not a uniform.
**Why:** Building the same site for everyone until they ask for changes outsources
design to change requests. Guidance upfront is cheaper than rework, and it's the
difference between "template" and "custom" in the client's eyes. (Prompted by the test
spoke feeling competent but uninspired.)

## 2026-06-10 — Verticals are open-ended, not an enum

**Decision:** HQ serves any local business. Restaurant and law-office are *derived
instances* of a base one-pager anatomy, not entries in a closed list; a new vertical is
derived at onboarding from a base playbook + a derived schema (TODOS P4). The registry's
`vertical` field stays free text.
**Why:** In local business, the client who fits no existing category is the rule, not
the exception. The system's whole premise — leverage in instructions, executed by an
agent — makes deriving a vertical cheap, so the architecture should never refuse a
category.

## 2026-08-05 — Derived verticals keep their schema in the spoke until a second client

**Decision:** When a client doesn't fit an existing vertical, derive the new vertical
**inline** from the restaurant reference rather than waiting on a base playbook, and keep
its Zod contract **in the spoke** (`schemas/<vertical>.ts`), not in HQ `schemas/`. It is
promoted to HQ — plus a `playbooks/build/<vertical>.md` — only when a **second** client
of that vertical appears. A derived build may also drop restaurant baseline opinions
where they don't fit (e.g. a site whose funnel is social needs no contact form; a bright
hero instead of the dark-scrim default), provided the deviation is the design brief
overriding a default, and is recorded.
**Why:** This is the "extract on repetition" philosophy the onboarding playbook already
states for spoke templates, applied to schemas and vertical playbooks: one instance isn't
evidence of the right abstraction. Keeping the contract in the spoke lets it settle
against reality first; HQ stays free of unproven abstractions. Deviations get logged
because standing opinions ("every site ships a contact form") should be opted out of
loudly, not quietly.

## 2026-08-20 — The operator's own site is a client like any other

**Decision:** When the person running HQ builds their own site (a portfolio, the agency's
own marketing page), it goes through the **full standard pipeline** — client record,
registry row, branch + PR + preview, explicit approval — with `owner-direct` registered
as its intake channel. No shortcuts because the client is the operator. Content facts
still obey rule 5: recover them from something the owner actually wrote, or leave them
`TBD`; never invent, and flag anything stale for confirmation.
**Why:** The operator's own site is the cheapest place for pipeline discipline to decay
("it's mine, I'll just push"). Running it as a normal client keeps the workflow law
universal and exercises the vertical-derivation path an extra time, which is exactly the
evidence `_base.md` needs (TODOS P4). Stale-but-real content beats invented content,
provided the staleness is flagged in the client record and the PR.

## 2026-08-20 — Domain hookups: scoped token + Cloudflare Registrar for new domains; the registrar flip stays human

**Decision:** Custom-domain attachment is a playbook
(`playbooks/change/attach-custom-domain.md`), with three standing mechanisms: (1) a
**scoped Cloudflare API token** (Pages:Edit, Zone:Edit, Zone:Read, DNS:Edit, Email
Routing:Edit) stored at `~/.config/hq/cloudflare-token` outside all repos, so the agent
performs the entire Cloudflare side — the `wrangler` OAuth token is zone:read-only and
cannot; (2) **new client domains are registered on Cloudflare Registrar in the agency
account** — at-cost, nameservers automatic, the whole DNS/NS dance vanishes; (3) the
**registrar nameserver flip on client-owned domains stays a human step** — whoever holds
the registrar login pastes two hostnames; we never ask clients for registrar credentials,
and registrar-API automation is parked until the fleet has enough domains at one
registrar to justify it. The playbook's **pre-flight DNS audit is mandatory and mail
records block the flip** until the client answers keep-or-kill.
**Why:** The first real run of this burned time on exactly two things: token scopes
(dashboard handoffs for zone + records) and a silent hazard (registrar-level email
forwarding that the NS flip would have killed unnoticed — caught only because MX was
checked first). A local restaurant with email on its domain is the rule, not the
exception; "site launched, catering inbox died" is the reputation-ending version of this
task. The one-time token converts every future hookup to agent-work plus one paste;
Cloudflare Registrar removes even that for domains we originate. This also keeps hosting,
DNS, and future email intake on the one platform already decided above.

## 2026-09-15 — Retire the "HQ" name; the repo is `hangar` everywhere, including its config path

**Decision:** The control repo is called `hangar` in every doc, the architecture view, and
the node-group key (`hangar`, formerly `hq`). The scoped Cloudflare token moves to
`~/.config/hangar/cloudflare-token`, superseding the `~/.config/hq/` path in the
2026-08-20 domain-hookups entry. Earlier entries keep "HQ" as written (append-only);
read it as this repo. Titles cited elsewhere (e.g. "HQ-first build order") stay verbatim.
**Why:** The repo was published as `hangar` while the docs kept calling it "HQ" — a
second name for one thing. It turned ambiguous the moment an archived private repo
literally named `hq` existed next to it: "update HQ state" could mean either. One name
removes the question; a config path that matches the repo name means a fresh fork's
setup commands and the playbooks agree without translation.

## 2026-09-15 — Two-tier JS budget (playful allowance) + a measured main-thread gate for motion

**Decision:** Inline JS stays counted in raw bytes as shipped, in two tiers: **≤ ~1.5KB by
default**, **≤ ~3KB only when the client's design brief says Motion comfort: playful**.
Separately, **any change that adds or changes a motion script must pass a main-thread
gate**, measured with Lighthouse against production (mobile, median of 3): TBT does not
rise, no new long tasks, main-thread work +≤ ~250ms. Numbers go in the PR. Typewriter
reveals are the first recipe in the playful tier (`playbooks/design-language.md`
§ Motion). Rejected: raising the cap fleet-wide (every site inherits headroom it didn't
ask for — creep); counting gzipped bytes (hides growth ~2.5× behind an unchanged
number); hand-compacting scripts to fit (strips the comments the next agent needs).
**Why:** The first playful-tier recipe shipped at 2.9KB raw / 1.2KB gzipped, over the
old cap as written. Before/after Lighthouse on that spoke (3 runs each, mobile +
desktop) showed the bytes are not the cost: all scores unchanged at 100, TBT 0 → 0, script
parse/compile 1 → 2ms. The real cost was runtime: mobile main-thread work 446 → 648ms
(+~200ms, layout/paint while typing), spread across frames with no new long tasks. A byte
cap can't see that — a 500-byte script could be far worse — so the cap is kept only for
what it is good at (making each script justify itself, with the brief as the
justification for more), and cost gets its own gate that measures cost.

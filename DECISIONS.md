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

## 2026-09-29 — Resend for both mail directions; intake addresses live on the agency domain

**Decision:** Email uses **Resend** on both sides. **Inbound (client→agency intake):** an
MX record on `requests.<intake-domain>` makes every address at that subdomain arrive
catch-all, so a new client costs one alias (`<slug>@requests.<intake-domain>`) in their
record and no DNS at all. The agent reads mail through Resend's MCP server
interactively, or its CLI (`resend emails receiving list|get|listen`) when scripted; no
webhook and no Worker until polling actually hurts. **Outbound (visitor→client contact
forms):** Pages Functions send via the Resend API **from the agency domain with the
visitor as `Reply-To`**, never as the client's domain. Secrets live outside every repo at
`~/.config/hangar/resend-token`. Client-facing addresses are **never** put on a client's
own domain, and the two flows stay separate (2026-06-10) — one provider, two playbooks.
Sender identity must be proved by the `authentication` object (SPF/DKIM/DMARC) on each
received email before it is matched to a client; a `From` header alone is not identity.
Supersedes the Cloudflare Email Routing → Worker leaning in the 2026-06-10 hosting entry
and the undecided `CONTACT_FORWARD_TO` question.
**Why:** Email Routing hands you a raw MIME message and a Worker to write; Resend parses
the message, stores it, exposes an authenticated read API, and ships both an MCP server
and a CLI — which is the entire "how does the agent get at it" problem solved by a
vendor, before any infrastructure exists to run. It also computes SPF/DKIM/DMARC per
message, which is what makes rule 7's sender-matching safe against a forged `From`; a
Worker would have to do that itself. Keeping addresses on the agency domain avoids
touching MX on domains whose mail we don't control — the exact hazard that nearly killed
a client's forwarding during the first domain hookup — and avoids the free tier's
3-domain cap, which is also why contact mail sends from the agency domain rather than
verifying every client's. The cost is a second vendor outside Cloudflare and a shared
100/day free-tier ceiling across the fleet; the first is acceptable because intake is
not on the hosting critical path, and the second is a watch item, not a blocker.

## 2026-09-29 — Registrar is the operator's choice; DNS always lives at Cloudflare

**Decision:** The 2026-08-20 default (register new domains at Cloudflare Registrar)
applies to **client** domains we originate. The operator's own domains may be registered
anywhere — consolidating with an existing registrar is a legitimate reason. The
requirement that does not bend: **nameservers point at Cloudflare**, so DNS is
agent-performed with the scoped token. Registering elsewhere costs exactly one manual
step, the nameserver paste, which is already a human step by the 2026-08-20 entry.
**Why:** Registrar and DNS host are separate choices and only the DNS host affects
automation. Scripting a second registrar's DNS is the part that doesn't pay: the common
alternative gates API access behind account thresholds and IP allowlisting, which a
laptop on a changing IP fails. On a freshly registered domain the nameserver flip is
risk-free — no existing mail or site to break — so the usual pre-flight DNS audit
applies only to domains that already carry traffic.

## 2026-09-29 — Multi-page spokes are allowed when the content outgrows one page

**Decision:** The "one page" build opinion is a default, not a rule. A derived vertical
may ship as a small multi-page site when the client's real content can't be made
findable on one page (dozens of bios, a directory table, several distinct offerings each
with its own funnel). The content contract keeps its shape: **one JSON file per page**
(instead of per section), each validated by the spoke's Zod schema, so a change playbook
still names exactly one target file. Pages are built as files (`build.format: 'file'`)
so extensionless URLs serve directly instead of 308-redirecting to a trailing slash.
Navigation stays zero-JS (a `<details>` menu on small screens). Everything else in the
build playbook applies per page: one `h1`, the JS tier, Lighthouse ≥ 95 ×4.
**Why:** The first client migrating from an existing site brought 17 pages, 24 trainer
bios, a 30-row certification directory and a 90-name client list. Forcing that onto one
page would either bury it or cut real content the client published — and cutting a
client's facts to fit a layout opinion is the wrong trade. The one-pager's actual goal
(findability, one-file edits) survives intact in this shape; the anchor nav just becomes
a page nav. Deviation recorded per the 2026-08-05 rule that standing opinions are opted
out of loudly.


## 2026-09-29 — Navigation scroll-spy is a playful-tier feature, not a default

**Decision:** The fleet-default header ships **without** scroll-spy (current-section
highlighting) on default-tier spokes. Scroll-spy is included only when the client's
design brief says **Motion comfort: playful**, where it is paid for out of the ~3 KB
playful allowance. The default JS tier stays at ~1.5 KB — it is not raised to make room.
**Why:** Making navigation a fleet default added ~1 KB of inline JS to every spoke; with
scroll-spy, the first two default-tier adoptions went over 1.5 KB (measured: one spoke at
1964 B with the spy, 1478 B without; the other 657 B → 1394 B with the pattern minus the
spy), while the playful-tier reference keeps it at 2409 B, inside 3 KB. Both default-tier
rollouts had already dropped the spy to fit, so this rule matches what shipped rather
than asking shipped code to change. The two ways out were
loosening the default tier for everyone, or reserving the most expensive and least
missed piece — on a short one-page site, the reader can see where they are — for the
briefs that asked for extra motion. The owner chose the second: the budget tiers keep
meaning what they say, and "playful" keeps buying something visible.


## 2026-09-29 — Search Console properties belong to the agency account

**Decision:** Every live client domain is registered with Google Search Console as a
**Domain property**, verified by DNS TXT, and **owned by the agency's Google account**
(named in `FLEET.md`, never here). Bing Webmaster Tools is imported from it. Clients who
want the reports are added as **Full users**, not owners. At handover the client
verifies their own ownership, and the agency's TXT record and access are removed. The
step lives in `playbooks/change/register-search-console.md` and is part of the build
definition of done.
**Why:** Search Console is the only direct view of what Google does with a site
(indexing, queries, crawl errors), and the agency runs the site, so the agency needs
the reports without waiting on a client login. A Domain property covers apex, `www`,
http and https in one go, and DNS verification uses a zone we already manage. It
doesn't depend on a file or tag inside the site, which a redesign could drop.
Keeping ownership in one agency account means no property is stranded in someone's
personal account. The explicit handover step keeps the agency from staying an owner of
a site it no longer runs. If a client already owns a property, that stands: we ask to
be added, and don't make a duplicate.


## 2026-09-29 — Handoff-ready: hosting belongs to the care plan, and leaving is a defined, paid step

**Decision:** The one-time build no longer includes open-ended hosting. At launch a client
either takes the **care plan** (the agency hosts, deploys and makes changes) or gets a
**handoff** (the domain, hosting, DNS, code, form mail and search reports all move into
accounts the client owns). There's no third option: hosting without the care plan exists
only while a handoff is actively in progress. A handoff is a **flat fee** and can happen
**any time**, at launch or years later when a care client cancels. There's no deadline.
To make "any time" real, every site is kept **handoff-ready**: the client's domain is
**registered in the client's name and account, never the agency's** (this supersedes
point 2 of the 2026-08-20 domain-hookups entry and the client-domain default in the
2026-09-29 registrar entry; the operator's own domains are unaffected). Repos build on
their own, and agency-specific values live in platform secrets, never in code. The steps
live in `playbooks/handoff.md`.
**Why:** "Hosting included, no monthly fee" costs nothing on the free tier, but it's an
indefinite commitment. It left the agency holding the infrastructure, and the support
expectations, for every client who stopped paying, with no end date. The operator
wants no ownership of anything once the business relationship ends. Moving hosting
into the care plan fixes the cost side. Handoff-readiness fixes the ownership side:
the domain is the one thing that's hard to untangle later, so it starts in the client's
name. A handoff is several hours of account work (zone move with its mail records, a
new Git-connected hosting project, form mail, search console, removing access). A flat
fee pays for that, and making it any-time rather than deadline-driven keeps "the site
is yours" literally true, not a lock-in.

## 2026-09-30 — The mail sweep reports and drafts; it never acts

**Decision:** Inbound mail is read by a scheduled agent run on the operator's machine
(`playbooks/daily-mail-sweep.md`), with a short digest pushed to the owner's phone.
The unattended run may read, classify, apply the authentication and client-identity
gates, summarise, and draft replies and change plans. It may **not** send mail, open
branches or PRs, edit a spoke, merge, deploy, or delete anything. Acting on what it finds
happens in an attended session. Where the sweep stopped is kept in a watermark file
outside every repo, because the mail provider has no read/unread state. The sweep runs
locally, not as a cloud routine, since it needs the private layer and local secrets.
**Why:** The sweep is the one job that runs with nobody watching, and its whole input is
written by strangers. Report-only keeps the blast radius of a forged or injected message
at "a wrong paragraph in a report". The alternative is "a PR someone might approve on
autopilot", or worse. The approval gate stays with a person, not a timer. Opening PRs
unattended would be compatible with the approval rule, but it moves spoke checkouts and
builds into an unwatched session for little gain at the current volume. Revisit when
requests arrive often enough that drafting the PR by hand is the bottleneck.

## 2026-10-01 — The client approves their own preview before it publishes

**Decision:** Every client change now has two human gates before production. First the
owner checks the preview ("fit to show the client?"). Then the client gets the preview
link in-thread and replies with a clear yes, or asks for changes, which loop back onto
the same branch and the same link. Only after that does the owner give the in-session
"okay" that merges and deploys. The client's yes is a precondition; the owner's okay
stays the trigger, so the 2026-06-10 approval protocol is amended, not replaced.
Silence gets one nudge after 3 business days, and the change never publishes without a
yes. Owner-direct requests skip the client gate: there the owner is the client.
Full procedure: playbooks/README.md steps 9–15.
**Why:** The agency's marketing promises clients a preview link for every change and
that nothing is published until they've seen it. The pipeline only showed the preview
to the owner and told the client afterwards, so the promise was false. The client is
also the best reviewer of most content changes: they know their real hours and prices
(the hours playbook already called them "the error-catcher of last resort"). Owner
first keeps a forged or misread request from ever reaching a client. Keeping the
owner's okay as the merge trigger keeps the "no auto-merge on an email" law intact: a
forged "looks good" can at most publish something the owner already checked, and still
needs the owner. **Trade-off:** changes now wait on the client. The turnaround promise
covers our part (request → preview link), not the client's reply time.

## 2026-10-01 — Commerce is processor-hosted; the processor is the system of record

**Decision:** Generalises the 2026-06-10 restaurant `ordering` rule to every vertical.
When a client sells anything online (a product, a package, an event seat, a recurring
membership), the sale happens on the **payment processor's hosted page**, reached
through a payment link (Stripe Payment Links / Checkout, Square payment links, or
similar). The site only links to it. The processor is the system of record for
**orders, customers, receipts, refunds, subscriptions and payouts**. We build **no
database, no cart, and no order store**, and no card data or processor key ever
touches a spoke. Specifically:
- **The account is the client's.** Links live in the client's own processor account,
  normally the one they already use, so payouts and history stay in one place. The
  agency works in it as an invited team member, never as the owner. This keeps every
  site handoff-ready (handoff.md).
- **Links go in content, not code.** Each schema's hand-off field (`ordering`,
  `checkoutUrl`, `registerUrl`, …) holds the URL, so adding, repricing or retiring a
  product is a content edit through the normal pipeline. Recipe:
  `playbooks/change/add-payment-link.md`.
- **Fulfilment uses the processor's after-payment redirect.** It points to a page on
  the site: a download page for low-value digital goods, the client's booking tool for
  services, a thank-you page otherwise.
- **Gaps get the smallest fix that keeps us database-free.** If a redirect isn't
  enough (a download worth protecting, say), a single Pages Function on the
  processor's webhook may email a signed link. That still stores nothing.
- **Past the line:** member logins, gated course content, waitlists, cross-system
  reporting. Those are project work, and the default answer is a dedicated platform
  (course or LMS service), not a database we run.

**Why:** Static sites are the whole fleet's architecture, and the agent is the CMS. A
database would be the first stateful thing we operate: backups, migrations, PII and
breach liability, PCI scope if it ever touched payments, and an uptime promise for
every client. All of that is to rebuild what processors already do better: order
history, refunds, customer emails, receipts, recurring billing, tax, exports. Hosted
links keep card data entirely off our pages, so the PCI burden stays with the
processor. They also turn commerce into content edits the existing pipeline can
already validate and review. Rejected:
- **An embedded checkout (Stripe.js / Elements):** needs a server-side session per
  purchase, which brings back a backend.
- **A full storefront platform** for small catalogues: a second site to keep in sync.
- **Building our own cart + database:** everything above.

**Trade-off:** the purchase leaves the site's design for the processor's page, and
digital delivery via redirect is only as secret as the URL. Both are acceptable for
the catalogues this fleet serves; revisit if a client's revenue depends on either.

## 2026-10-01 — Managed Shopify is the second commerce track; payment links stay the default

**Decision:** Clients who need a real store get the option of moving their **whole
site** onto a Shopify Online Store that the agency builds and maintains. It sits next to
payment links, not in place of them. Payment links on the static site remain the default
for selling (2026-10-01, processor-hosted). The Shopify track is offered when the client
needs **a cart, shipping of physical goods, variants with inventory, or a catalogue they
edit themselves**, and they opt in. Specifically:
- **The client pays Shopify directly.** Plan, card processing, any third-party-gateway
  surcharge, and any paid apps are billed to their account, never the agency's, and
  never marked up. The fees are put to them in writing before they commit. On this track
  hosting is Shopify's, so the care plan covers changes and upkeep, not hosting.
- **The store is the client's from the first real transaction.** We build on a Shopify
  *client transfer store* (free, password-protected, test orders only) and transfer it
  at go-live. The client picks the plan and completes payments onboarding themselves.
  The agency keeps collaborator access, scoped to themes, products, and settings, never
  orders or customers. That keeps the store handoff-ready (2026-09-29).
- **Theme is code, catalogue is data.** The theme lives in a spoke repo, forked per
  client from Shopify's free reference theme (no shared theme, 2026-06-10). It changes
  only via branch + PR + an unpublished preview theme, then a push of `main` to the live
  theme after the client's yes and the owner's okay. Products, prices, and stock live in
  Shopify, the system of record. The client may edit them in their own admin. We edit
  them on request through a recipe that stages the change, gets the client's yes on the
  exact values, applies, and reads back.
- **Validation changes form, not strength:** `shopify theme check` with zero errors
  stands in for the Zod build, and a catalogue read-back stands in for the schema on
  data. The static fleet's JS byte tiers don't apply. Performance is held to the stock
  theme's own measured baseline instead, while accessibility stays absolute (≥ 95,
  rule 8).
- **DNS stays on Cloudflare, DNS-only.** Shopify doesn't support proxied records, so the
  fleet's proxied-record default (attach-custom-domain.md) is waived for Shopify records only.

Steps live in `playbooks/build/shopify-store.md` and
`playbooks/change/add-or-edit-shopify-product.md`.
**Why:** Payment links have a hard ceiling: one item per checkout, no shipping, and a
link per variant. A boutique with fifty products in three sizes, shipping nationwide,
can't be served by links, and building a cart would break the no-database rule. The
2026-10-01 entry rejected "a full storefront platform" because running one *beside* the
static site means two systems to keep in sync. This track removes the static site
instead, so there's still one site and one system of record. It also extends that
entry's own logic: the platform, not us, holds orders, payments, PCI scope, tax, and
shipping. Shopify specifically because it's the default small merchants already know,
the client can own and pay for it with no agency in the middle, it has a first-party
"build then transfer" flow for agencies, and its CLI gives the agent the same
preview-then-publish loop the Pages fleet has.
**Trade-offs:** (1) The client pays a monthly platform fee where the static site cost
them nothing to host. That's why it's opt-in and the fees are disclosed up front.
(2) "The agent is the CMS" is relaxed for the catalogue: the client edits products
directly, so the catalogue can change without passing our gates. That's acceptable
because it's their data in their system of record, and the theme, which stays gated,
is what renders it. (3) The theme editor and apps can drift the live theme away from
git. Every change syncs live drift first, and production is never a theme swap. (4) A
hybrid (Buy Button or Storefront API on a Pages site) is still rejected, for the same
two-systems reason as before.


## 2026-10-01 — Client domains: the client chooses who holds it; the client is always the registrant

**Decision:** This amends the domain rule in the 2026-09-29 "Handoff-ready" entry ("registered
in the client's name and account, never the agency's"). A client chooses how their
domain is held:
- **Client-held:** in their own registrar account. Nothing changes for us beyond the
  nameserver paste.
- **Agency-held:** on Cloudflare Registrar in the agency's account. The agency renews it
  (auto-renew on) and **invoices the domain fee yearly**. The fee is never part of the
  care plan or the build price.

Either way **the client is the registrant of record**, so the domain is legally theirs,
and an agency-held domain transfers to them as part of any handoff. Hosting and DNS stay
as decided: the zone is on Cloudflare in the agency account while we run the site.
**Why:** Many small-business owners don't want another account to manage. "We'll handle
it" is a real service, and forcing them to hold a registrar login works against the
care plan's whole promise. What handoff-ready actually needs is not *which account* the
domain sits in but *whose name is on it* and a defined way out. The registrant contact
gives the first, and the handoff playbook's transfer step gives the second. Domain
prices vary by orders of magnitude (a common `.com` against a premium name), so folding
them into a flat plan would mean either overcharging most clients or eating the
outliers. A yearly pass-through invoice keeps the plan price honest. Cloudflare
Registrar keeps agency-held registration and DNS on one platform, with no second
registrar to script. The cost is the registry lock: a domain within 60 days of
registration or of a transfer can't leave, so a very early handoff finishes that one
step late.

## 2026-10-02 — Paid media is in scope: the agency runs it, the client is invoiced for spend

**Decision:** The agency offers paid search and display, starting with Google Ads, at no
tooling cost. Each client gets **their own ad account**, linked under the agency's Google
Ads manager account. The ad account is billed to the **agency's payments profile**, and the
agency **invoices the client for spend** (whether at cost or marked up, and whether in
advance or in arrears, is private pricing). The rules that come with it:
- **Every campaign launch and every budget change is approved** by the client, as a
  preview approval is today. The agent drafts and launches; it never raises spend on its
  own. Each account carries a hard monthly budget equal to what the client approved.
- **Ad copy comes only from validated site content** (rule 5): no invented offers,
  prices or claims.
- **No targeting on health or other sensitive conditions,** and no remarketing on
  medical sites. Display for those clients is geographic or contextual.
- **Conversions are tracked without personal data:** the contact form's Pages Function
  keeps the ad click ID only and reports the conversion server-side. No ad tag on
  medical sites.
- **"Connected TV" means YouTube ads in Google Ads** (they serve on TV screens) until a
  client needs more. The tooling is free; video production is a quoted pass-through.
- **Handoff:** the ad account is already the client's. Leaving means unlinking it from
  the manager account and moving billing to the client's own payments profile.

**Why:** A competitor's invoice for a local practice bundled search, display, connected
TV, content and listings around the website. The Google Ads API, its manager account and
YouTube placements cost nothing to use, so this widens the offer without new spend.
Agency billing is the owner's choice: the client gets one invoice and no new account to
manage, the same reasoning as agency-held domains (2026-10-01). The cost is credit risk.
We front the spend until the client pays, so budget caps and prepayment matter more than
they would on the client's own card. Approval on every spend change keeps the rule that
the agent never takes an irreversible step unattended (2026-09-30). The health-targeting
line follows Google's own personalized-ads policy and the HHS position on tracking
technology on medical sites.

## 2026-10-02 — The build playbook splits into a base and per-vertical extensions

**Decision:** `playbooks/build/_base.md` holds everything a build needs regardless of
vertical: stack, the universal anatomy (hero → about → offerings → trust → practicalities
→ contact), the opinions, schema primitives, the contact form, structured data, build
steps, the base definition of done, and the recipe for deriving a new vertical. A vertical
playbook (`restaurant.md`, `law-office.md`, …) **extends** it and holds only that
vertical's opinions, content files, sections, intake questions and DoD additions. New
verticals derive from `_base.md`, not from the restaurant reference; this supersedes
that wording in the 2026-08-05 entry, whose rule (schema stays in the spoke until a
second client) is unchanged. A derived vertical's deviations are recorded in the client
record, not here.
**Why:** Restaurant was written first, so universal rules were written as restaurant
rules. Five non-restaurant verticals were then built by reading a restaurant file and
mentally filtering out the menu. That worked while one operator remembered which half was
which, but a rule placed in the restaurant file (structured data, the first case) is
invisible to an agent building a law office or a medical practice. The split is a move,
not a rewrite: the content is the same, now in the file its scope says it belongs in.

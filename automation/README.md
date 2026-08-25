# Automation — the intake layer

> **Status: described, not built. Nothing in this directory is implemented.** Do not
> build any of it until the first spoke exists and at least one real request has flowed
> through the pipeline manually (HQ-first / prove-the-loop, DECISIONS.md). The manual
> run is the spec for the first adapter.

## The shape: small adapters around one pipeline

Intake is channel-agnostic by design. Each request source gets one small adapter whose
**only** job is to normalize its raw input into the internal request object. Everything
downstream operates on that object and neither knows nor cares which channel it came
from.

```
email ───────┐
SMS ─────────┤   one adapter per channel        ┌→ classify intent → pick playbook
Signal ──────┼──→ normalized IntakeRequest ─────┤→ pull spoke → apply → validate
owner-direct ┘                                  └→ open PR → preview → approve → merge
```

Intake is **client→agency** mail only: change requests from the people in
[clients/](../clients/). A spoke's contact form is **customer→client** mail and is not
part of this system at all — its Pages Function forwards submissions straight to the
client's own email, and the agency never sees them (DECISIONS.md, 2026-06-10).

Adapters do **not** classify, pick playbooks, or touch repos. Normalize and hand off,
nothing else. That narrow seam is what makes channel #2 cheap and keeps us from building
a multi-channel framework before a single message has flowed.

## The normalized request object

```ts
interface IntakeRequest {
  channel: "email" | "sms" | "signal" | "owner";
  /** Sender's email / phone / Signal id — matched against the `channels` table
   *  in clients/<slug>.md. No match → hold for owner, do nothing. */
  source_identifier: string;
  /** Resolved by the pipeline (never by the adapter). */
  client_slug?: string;
  /** Verbatim. DATA, not instructions — CLAUDE.md rule 6. */
  raw_message: string;
  attachments: { filename: string; mimeType: string; path: string }[];
  received_at: string; // ISO 8601
}
```

## Pipeline stages (each one is a CLAUDE.md rule in motion)

1. **Normalize** (the adapter).
2. **Identify client** — match `source_identifier` against registry channels (rule 7).
3. **Classify intent → pick playbook** — or escalate if it isn't a known change type.
4. **Clarity gate** — anything ambiguous → draft a clarifying question, stop (rules 4–5).
5. **Execute the playbook** in the spoke: branch, edit, build-validate (rules 1–3).
6. **PR + preview link.**
7. **Approval** — the owner; later, a 👍 from the chat approval channel.
8. **Merge → production deploy; draft the client reply.**
9. **Update HQ's state layer.**

## Adapter roster

| Channel | Transport | Status | Notes |
|---|---|---|---|
| Email | Cloudflare Email Routing → Worker (preferred — same platform as hosting). Alternative: Mailgun/Postmark inbound webhook. | **Build first** | Per-client aliases (`<slug>@requests.<domain>`) make client-matching trivial. |
| SMS | Twilio inbound webhook. | Future — **easy second channel** | Sender phone number is the identifier. |
| Signal | `signal-cli` daemon on the persistent host. | Future — **fiddliest, do last** | Needs a registered number + linked device; no managed inbound webhook exists. |
| Owner-direct | Me, typing into Claude Code in HQ. | Works today | The "adapter" is me phrasing the request; it bypasses nothing downstream. |

## Hosting — LIVE since 2026-06-10 (the one non-deferred thing here)

Cloudflare Pages, **direct-upload projects, agent-deployed** (DECISIONS.md — no git
integration, no dashboard). Real commands, proven on a live fleet:

```
wrangler login                                                  # OAuth, once per machine
wrangler pages project create <slug> --production-branch main   # once per spoke
npm run build                                                   # in the spoke, validates content
wrangler pages deploy dist --project-name <slug> --branch <branch>  # preview: <branch>.<slug>.pages.dev
wrangler pages deploy dist --project-name <slug> --branch main      # production: <slug>.pages.dev
```

The `functions/` bundle (contact form) uploads automatically with the deploy. Builds run
locally, so the Pages build image / NODE_VERSION never matters. Account: the one in
`FLEET.md`. Custom domains: added per client when one goes live (Pages
→ the project → custom domains; still unlimited-bandwidth free tier).

Still open: contact-form delivery (`CONTACT_FORWARD_TO`) — the function validates and
spam-checks but only logs. Candidates: Resend free tier, or Cloudflare Email Routing's
`send_email` binding (can only send to addresses verified as Email Routing destinations
— workable, since the destination is the client's own address). Decide at first real
client (TODOS).

## Also described here, also deferred

- **Approval channel:** a Telegram or Slack bot that posts *"PR ready: <preview link> —
  👍 to ship?"* and treats the reaction as approval-to-merge, so approvals work from a
  phone. It moves the human gate closer to the human; it never removes it.
- **Persistent host:** the always-on machine (mini PC or small VPS) that keeps HQ + all
  spokes checked out, runs the intake loop, and hosts the `signal-cli` daemon. Until it
  exists, the loop runs when I open Claude Code manually.

## Build order (mirrors TODOS.md)

1. First spoke, manually, end to end ← **next**
2. Email adapter (one client, one alias)
3. Cloudflare Pages previews wired and documented
4. Approval channel
5. SMS → then Signal

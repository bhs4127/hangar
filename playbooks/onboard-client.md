# Playbook — onboard a client (how a spoke is born)

Takes a signed client to a live site plus a complete hangar registry entry. Steps marked
*(manual for now)* get automated later; the sequence stays. The workflow law applies from
the very first commit: branch + PR + preview, even during the initial build.

## Steps

1. **Intake conversation.** Run the intake questions from the vertical's build playbook
   ([build/_base.md](build/_base.md) § Universal intake questions, plus the vertical's
   own, e.g. [build/restaurant.md](build/restaurant.md) § Intake questions; a client with
   no vertical playbook follows [_base.md § Deriving a new vertical](build/_base.md)). Capture answers
   verbatim **in the client record itself** (an "Intake answers" section — see
   [private.example/clients/_example-client.md](../private.example/clients/_example-client.md) for what complete
   looks like), so the build has one source of truth. Chase every `TBD` before the
   build, not after launch — unanswered slots block go-live (CLAUDE.md rule 5).

2. **Create the client record.** Copy
   [private.example/clients/_example-client.md](../private.example/clients/_example-client.md) →
   `private/clients/<slug>.md`; fill every field; add the row to
   [private/clients/REGISTRY.md](../private/clients/REGISTRY.md) with status `onboarding`.
   The slug is kebab-case and stable forever — it names the repo, the Pages project,
   and branches.

3. **Register channels.** Fill the record's channels table — minimum one: a per-client
   email alias (e.g. `<slug>@requests.<your-domain>`). This is what lets the pipeline map
   inbound requests to this client (rule 7); a client record without channels is
   unreachable. Add phone/Signal/form identifiers as they become real.

4. **Create the spoke repo** *(manual for now)*: private GitHub repo
   `<your-org>/<slug>-site` (org and visibility from `private/FLEET.md`),
   created with a bootstrap commit on `main` (README only) so the first build PR has a
   base — everything after lands via PR.
   There is deliberately no template repo — the build playbook *is* the template
   (instructions over shared code, DECISIONS.md). A spoke-template repo becomes a TODO
   only if onboarding #2/#3 shows real repetition.

5. **Build the site** per `build/<vertical>.md`, on a `build/initial-site` branch:
   schema copied in from hangar `schemas/`, content collections wired, content files from
   the intake answers. **Shopify-track clients** (a real store, chosen per
   [build/shopify-store.md](build/shopify-store.md) § Which track?) follow that playbook
   instead for steps 5–9: theme instead of Astro, client transfer store instead of a Pages
   project, Shopify's contact form instead of a Pages Function. The vertical's content
   opinions and intake questions still apply.

6. **Hosting** *(live pattern)*: the agent creates a direct-upload Pages project —
   `wrangler pages project create <slug> --production-branch main` — and performs all
   deploys itself (`wrangler pages deploy dist --project-name <slug> --branch …`):
   production from `main` after each merge, a preview per change branch. No dashboard,
   no git integration (DECISIONS.md, 2026-06-10; commands in automation/README.md).

7. **First PR**: open it on the spoke with the preview link → owner reviews the preview →
   the client gets the link and reviews it (rounds of changes on the same branch, same
   link) → their clear go-ahead → owner okays → merge. Same gates as pipeline steps
   10–14. Registry status → `building` → `live` as it progresses.

8. **Domain**: per [change/attach-custom-domain.md](change/attach-custom-domain.md) —
   pre-flight DNS audit (mail on the domain blocks the flip), zone onto Cloudflare,
   proxied CNAMEs, attach apex + `www` to the Pages project, registrar nameserver flip
   (the one human step), verify HTTPS end-to-end. Client has no domain yet → they choose
   client-held (they register it) or agency-held (we register and renew it, they're the
   registrant, and the fee is invoiced yearly). See that playbook's Use when, and
   DECISIONS 2026-10-01.

9. **Contact form test**: one real submission, received end-to-end.

10. **Go-live checklist**: the base and vertical definitions of done, plus the client
    confirms hours, prices, and contact info on the live URL. Once the custom domain is
    live, register it with search engines
    ([change/register-search-console.md](change/register-search-console.md)).

11. **Welcome email**: tell the client about their change-request alias, per
    [setup-email-intake.md](setup-email-intake.md) § The welcome email. The owner
    sends it, or okays the agent sending it.

12. **State layer** (CLAUDE.md): registry row status → `live`; update private/STATUS.md and
    private/TODOS.md; CHANGELOG line; DECISIONS entry only if a real decision was made.
    Client-specific deviations also go in the client record's "gotchas" section.

## What this playbook deliberately doesn't do

No shared template repo, no automated provisioning, no CI bootstrap — until the second
or third onboarding proves which parts actually repeat. The first onboarding is manual
on purpose, and this file gets corrected immediately afterward from what actually
happened.

# Playbook — onboard a client (how a spoke is born)

Takes a signed client to a live site plus a complete HQ registry entry. Steps marked
*(manual for now)* get automated later; the sequence stays. The workflow law applies from
the very first commit: branch + PR + preview, even during the initial build.

## Steps

1. **Intake conversation.** Run the intake questions from the vertical's build playbook
   ([build/restaurant.md](build/restaurant.md) § Intake questions). Capture answers
   verbatim **in the client record itself** (an "Intake answers" section — see
   [clients/_example-client.md](../clients/_example-client.md) for what complete
   looks like), so the build has one source of truth. Chase every `TBD` before the
   build, not after launch — unanswered slots block go-live (CLAUDE.md rule 5).

2. **Create the client record.** Copy
   [clients/_example-client.md](../clients/_example-client.md) →
   `clients/<slug>.md`; fill every field; add the row to
   [clients/REGISTRY.md](../clients/REGISTRY.md) with status `onboarding`.
   The slug is kebab-case and stable forever — it names the repo, the Pages project,
   and branches.

3. **Register channels.** Fill the record's channels table — minimum one: a per-client
   email alias (e.g. `<slug>@requests.<your-domain>`). This is what lets the pipeline map
   inbound requests to this client (rule 7); a client record without channels is
   unreachable. Add phone/Signal/form identifiers as they become real.

4. **Create the spoke repo** *(manual for now)*: private GitHub repo
   `<your-org>/<slug>-site` (org and visibility from `FLEET.md`),
   created with a bootstrap commit on `main` (README only) so the first build PR has a
   base — everything after lands via PR.
   There is deliberately no template repo — the build playbook *is* the template
   (instructions over shared code, DECISIONS.md). A spoke-template repo becomes a TODO
   only if onboarding #2/#3 shows real repetition.

5. **Build the site** per `build/<vertical>.md`, on a `build/initial-site` branch:
   schema copied in from HQ `schemas/`, content collections wired, content files from
   the intake answers.

6. **Hosting** *(live pattern)*: the agent creates a direct-upload Pages project —
   `wrangler pages project create <slug> --production-branch main` — and performs all
   deploys itself (`wrangler pages deploy dist --project-name <slug> --branch …`):
   production from `main` after each merge, a preview per change branch. No dashboard,
   no git integration (DECISIONS.md, 2026-06-10; commands in automation/README.md).

7. **First PR**: open it on the spoke with the preview link → owner reviews the preview →
   merge. Registry status → `building` → `live` as it progresses.

8. **Domain**: per [change/attach-custom-domain.md](change/attach-custom-domain.md) —
   pre-flight DNS audit (mail on the domain blocks the flip), zone onto Cloudflare,
   proxied CNAMEs, attach apex + `www` to the Pages project, registrar nameserver flip
   (the one human step), verify HTTPS end-to-end. Client has no domain yet → register it
   on Cloudflare Registrar instead and most of that vanishes (DECISIONS 2026-08-20).

9. **Contact form test**: one real submission, received end-to-end.

10. **Go-live checklist**: the build playbook's definition of done, plus the client
    confirms hours, prices, and contact info on the live URL.

11. **State layer** (CLAUDE.md): registry row status → `live`; update STATUS.md and
    TODOS.md; CHANGELOG line; DECISIONS entry only if a real decision was made.
    Client-specific deviations also go in the client record's "gotchas" section.

## What this playbook deliberately doesn't do

No shared template repo, no automated provisioning, no CI bootstrap — until the second
or third onboarding proves which parts actually repeat. The first onboarding is manual
on purpose, and this file gets corrected immediately afterward from what actually
happened.

# Playbook — hand a site off to its client

The opposite of [onboard-client.md](onboard-client.md): the site moves out of the agency's
accounts and into ones the client owns. After a handoff the agency holds **no access to
anything**: not the code, the hosting, the DNS, the domain, the form mail, or the search
reports. That's the point (DECISIONS 2026-09-29, handoff-ready).

## Use when

Any time. It's never gated on a date:

- **A build-only client at launch.** Without the care plan, launch *is* a handoff. There's
  no hosting without the care plan, so the site goes live on the agency's hosting only
  while its handoff is actively in progress.
- **A care-plan client cancels.**
- **The agency ends the relationship** for any reason.

The handoff is a paid, flat-fee deliverable (the amount lives in the agency's pricing,
not here). **Billing is the owner's job:** get the owner's go-ahead that it's settled
before starting, and never ask the client for payment yourself.

## Staying handoff-ready (a standing rule, not a step)

A handoff can only happen any time if every site is always ready for one. Every spoke
keeps these true from day one, and a change that would break one needs an owner decision:

- **The client is the domain's registrant of record**, whichever way it's held
  (DECISIONS 2026-10-01). It's either **client-held** (their registrar account) or
  **agency-held** (the agency's registrar account, renewed by us and billed to them
  yearly). Agency-held domains still carry the client's name as registrant, so they're
  legally theirs and leave with them (see
  [change/attach-custom-domain.md](change/attach-custom-domain.md)).
- **The repo builds on its own:** `npm ci && npm run build` on a clean machine, with no
  hangar paths, no private packages, and no secrets in the tree.
- **Agency-specific values are Pages secrets, never code.** For example, the contact
  form's sending domain is `CONTACT_FROM_DOMAIN`, so a new owner swaps values without
  touching code.
- **Everything shipped is licensed for the client to keep:** fonts via fontsource (OFL),
  photos from the client or a license recorded in the client record.

## Inputs required

| Input | From | Notes |
|---|---|---|
| Owner go-ahead (fee settled) | Owner, in chat | Blocks everything below |
| Client's **Cloudflare account**, with the agency invited as an **Administrator** member | Client creates it (free) | We work inside their account, then remove ourselves. Never ask for their password |
| Client's **GitHub username** | Client | Optional. Without one, they get a source bundle (Edge cases) |
| Contact form choice | Client | (a) their own Resend account + their domain, (b) replace the form with an email link, (c) the site has no form |
| Registrar access | Client-held: the client keeps it. Agency-held: a registrar account the client owns, to receive the domain | Client-held: they paste one nameserver pair. We never hold their registrar login |

## Recipe

Shell setup: `TOK=$(cat ~/.config/hangar/cloudflare-token)`, `DOM=<domain>`,
`SLUG=<slug>`, `ZID=<agency zone id>`, `CACC=<client's Cloudflare account id>`.

1. **Snapshot before touching anything.** Export the agency zone:
   `curl -sS "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records/export" -H "Authorization: Bearer $TOK" > zone.bind`
   (a scratch dir, never a repo). List the Pages secret *names*:
   `npx wrangler pages secret list --project-name $SLUG`. Note the Search Console
   state from the client record. Paste the record list into the client record. **Mail
   records (MX, SPF, DKIM, DMARC) are the gate for step 5,** same as the domain-hookup
   pre-flight.
2. **Readiness PR on the spoke** (normal branch + PR + preview, rule 2):
   - Rewrite `README.md` for the new owner: where content lives
     (`src/content/data/*.json`), that the build validates it, how to preview
     (`npm run dev`), and that pushing to `main` publishes. Drop hangar-only references,
     since the new owner can't see hangar.
   - Form option (b): switch the form off in content and publish the client's email
     instead. That's the client's call, and it's their address (rule 5).
   - Check against the standing rule above: grep for the agency domain, org and account
     IDs. Any hit is a bug to fix here.
   - Merge, then tag `handoff-<yyyymmdd>` on `main`.
3. **Code.** With a GitHub username: transfer the repo
   (`gh api -X POST repos/<org>/$SLUG-site/transfer -f new_owner=<username>`). The
   client accepts it by email. Then confirm the agency isn't left as a collaborator.
   Without one: see Edge cases.
4. **Hosting in their account.** In the client's Cloudflare account, create a
   **Git-connected** Pages project on the transferred repo: build `npm run build`, output
   `dist`, env `NODE_VERSION=22`. Pushes to `main` then publish without anyone like us
   in the loop. (The fleet's direct-upload model is for sites we deploy. A handed-off
   site has no agent, so Git integration is right here.) For form option (a), set
   `RESEND_API_KEY`, `CONTACT_FORWARD_TO`, `CONTACT_FROM_DOMAIN` on their project (step
   6 finishes it). Verify `https://<project>.pages.dev` serves the tagged build by
   grepping a string unique to it.
5. **Move the zone.** Add `$DOM` as a zone in the client's account. Import `zone.bind`,
   pointing the `@` and `www` CNAMEs at *their* `<project>.pages.dev`, and **diff the
   result against the step-1 snapshot**: every MX/TXT/DKIM record present, or stop.
   Attach apex + `www` to their Pages project (pending is fine). The client pastes the
   new nameserver pair at their registrar, the same human step as
   [change/attach-custom-domain.md](change/attach-custom-domain.md) step 5. Once the
   zone is active in their account, remove the domains from the agency Pages project and
   kick validation on theirs. Expect a few minutes of certificate issuance, so schedule
   it outside the client's busy hours.

   **Agency-held domain:** the registration moves too, and it moves first. Unlock it, get
   the auth code, and the client starts the transfer at a registrar account they own
   (Cloudflare Registrar in their own Cloudflare account works, and its zone is then
   already where step 5 needs it). Check Cloudflare's current docs for an
   account-to-account move before using a full transfer. **A domain within 60 days of
   registration or of a previous transfer can't leave yet** (the registry lock). The
   rest of the handoff goes ahead, and the domain and its zone stay with us, still
   serving their site, until the lock lifts. Note the date in the client record and in
   TODOS. Stop billing renewals from the handoff date.
6. **Contact form, option (a).** The client's own Resend account (free tier) verifies
   *their* domain, whose DNS records go in their zone now. `CONTACT_FROM_DOMAIN` becomes
   their domain. Then send **one real test submission** and confirm it arrives.
7. **Search Console:** the handover in
   [change/register-search-console.md](change/register-search-console.md) § Edge cases
   (client verifies their own account, then the agency's TXT record and access go).
8. **Remove the agency, completely.** Delete the agency Pages project, but only after
   their project is serving the domain. Delete the agency's copy of the zone. Leave
   their Cloudflare account (remove the membership). Mark the intake alias retired in
   the client record's channels, so any later mail from them stops at rule 7. Revoke
   their upload link (`node automation/upload-drop.mjs revoke <slug>`); anything still
   in the drop expires on its own within 30 days.
9. **Handoff note to the client** (draft; the owner sends it): what they now own and
   where (domain at their registrar, hosting and DNS in their Cloudflare, code in their
   GitHub), that **domain renewal is theirs now** with the renewal date (for an
   agency-held domain, the transfer usually adds a year), how a change
   gets published (edit, push to `main`), and that it's a standard Astro site any web
   developer can work on.
10. **State layer:** registry status → `departed`, and in the client record the handoff
    date plus what moved where, with the final snapshot. Then STATUS, TODOS, CHANGELOG
    as usual.

## Validate

- `https://$DOM` and `https://www.$DOM` → 200 with the tagged build's content, served by
  the client's project. Their Pages dashboard shows the production deployment, and the
  agency project no longer exists.
- DNS in their zone matches the step-1 snapshot for every non-site record. If mail
  existed, a test message arrives.
- Contact form (a): a real submission arrives. (b): the email link is on the page.
- **The agency access checklist is all empty:** GitHub collaborator, Cloudflare
  membership, zone, Pages project, Search Console owner or user, Resend, upload link. If any row is
  still ours, the handoff isn't done.

## Shopify stores

A Shopify-track client ([build/shopify-store.md](build/shopify-store.md)) already owns
the store, the catalogue, the orders, and the Shopify bill. That was transferred at
go-live. So their handoff is mostly removing ourselves:

1. **Snapshot + drift.** Pull the live theme into the repo (build/shopify-store.md
   § The pipeline, mapped, step 5) and merge it via PR, so the repo matches what's
   live. Tag `handoff-<yyyymmdd>`. Export the DNS zone, as in step 1 above.
2. **Code.** Transfer the theme repo, or hand over a bundle if they have no GitHub
   (step 3 above and Edge cases). Tell them a developer can connect it with Shopify's
   GitHub integration if they want git-driven publishing. With no agent in the loop,
   that's the right model, same as Git-connected Pages for a static handoff.
3. **DNS.** Move the zone into their Cloudflare account (step 5 above). The Shopify
   records stay **DNS-only**. The domain itself is already theirs in Shopify.
4. **Search Console** handover (step 7 above).
5. **Remove the agency.** The client removes our collaborator account (Settings → Users
   and permissions → Collaborators). We confirm it's gone. Retire the intake alias in the
   client record and revoke their upload link.
6. **Handoff note** (draft; the owner sends it): they own everything already; their
   Shopify plan and apps keep billing them directly; the theme editor is now safe for
   them to use, since nobody will publish over it from git.

**Validate:** the store loads on their domain, we no longer appear under Collaborators,
and the access checklist above is empty (there was no Pages project or Resend to begin
with).

## Edge cases

- **No GitHub account and no interest in one:** deliver a source bundle
  (`git bundle create $SLUG-site.bundle --all`, plus a plain zip of the tagged tree).
  Their Pages project is then direct-upload: deploy the tagged build once into their
  account (`CLOUDFLARE_ACCOUNT_ID=$CACC npx wrangler pages deploy dist --project-name
  <project> --branch main`). Future changes need whoever they hire. Say that plainly in
  the handoff note.
- **The client wants a different host:** the static build moves anywhere, but the
  contact form is a Pages Function and would need rewriting for another platform. That's
  project work, so quote it separately. Or pick form option (b) and it moves anywhere.
- **The client stalls mid-handoff** (no Cloudflare account yet, can't find the
  registrar login): nothing is torn down until they're ready, and the site keeps
  serving from the agency side while the handoff is actively in progress. If it stops
  being in progress, that's an owner conversation, not an agent decision.
- **A care client wants to leave and come back:** a fresh onboarding in their accounts,
  with the agency invited as a member. Nothing from the old setup is reused.
- **The agency's own site:** never handed off. This playbook is for client spokes only.

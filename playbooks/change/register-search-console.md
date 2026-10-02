# Register a site with Google Search Console (+ Bing)

## Use when

A spoke is live on its **own custom domain**: right after
[attach-custom-domain.md](attach-custom-domain.md) validates, or as a backfill for a site
that went live before this playbook existed. Skip test clients and sites still on
`*.pages.dev` (a `pages.dev` hostname can't be verified as a Domain property).

Search Console is how we find out what Google actually does with a site: whether pages
are indexed, which searches bring people in, and crawl errors the build can't see.
Lighthouse SEO 100 says a page is *indexable*; only Search Console says it's *indexed*.
For local businesses, Google Business Profile matters more for ranking. This playbook
doesn't cover that, but the client record tracks both side by side.

## Inputs required

1. **The agency Google account** from `FLEET.md` § Google. It owns every property
   (DECISIONS 2026-09-29). `TBD` there blocks this playbook. Never verify a client site
   under a personal account or the client's account without an explicit owner decision.
2. The live domain and the zone ID (client record → Hosting line, or
   `GET /zones?name=$DOM`).
3. The scoped Cloudflare token (`~/.config/hangar/cloudflare-token`, DNS:Edit), because
   verification is a TXT record on the zone.
4. The site already ships robots.txt and `sitemap-index.xml`, per the build
   playbook's definition of done. If either is missing, fix that first in a normal spoke
   PR. Submitting a sitemap that 404s just produces an error report.

## Recipe

**Automated path (default):** `node automation/search-console.mjs register $DOM`. It
runs steps 1–4 below unattended through Google's Site Verification and Search Console
APIs plus the Cloudflare token: it gets the token, adds the TXT record (additive; reports
"already present" on a re-run), waits for it to resolve publicly, verifies, adds the
`sc-domain:` property, and submits the sitemap. If the sitemap isn't serving XML, it
skips that step and says so. It's idempotent, so re-running is safe.
`node automation/search-console.mjs status [$DOM]` lists properties and sitemap state.
Afterwards, check that the zone's mail records are unchanged (`dig +short MX $DOM`).

**One-time setup** (owner, in Google Cloud, signed in as the agency account): a project
with the **Google Search Console API** and **Site Verification API** enabled, a Desktop
OAuth client saved as `~/.config/hangar/google-oauth-client.json` (chmod 600), and the
agency account added under **Audience → Test users**. Then `… search-console.mjs auth`
prints a sign-in link. On a desktop host it may not open a browser by itself, so hand
the owner the link. Watch the project picker: the OAuth client, the test user and both
APIs must all sit in the **same** project, and Cloud Console likes to switch to "My
First Project" silently.

**The consent screen stays in Testing on purpose.** That avoids Google's app
verification, at the cost of a refresh token that expires after 7 days. Registration is
occasional and the owner is present, so when the script reports `invalid_grant`, re-run
`auth` (about 20 seconds). Don't build anything unattended on this token.

**Manual path** (fallback, or a domain whose DNS isn't ours):

Shell setup: `TOK=$(cat ~/.config/hangar/cloudflare-token)`, `DOM=<domain>`,
`ZID=<zone id>`.

1. **Owner: add a Domain property** (not "URL prefix") while signed in to the agency
   Google account. Search Console → Add property → **Domain** → `$DOM`. Google shows a
   TXT value, `google-site-verification=…`. Paste that value into the session. It isn't
   a secret, but it only belongs in DNS, never in a repo.
2. **Agent: add the TXT record** at the zone apex. Additive only: never replace an
   existing TXT record, because SPF and other verifications live there too.

   ```
   curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/$ZID/dns_records" \
     -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
     -d '{"type":"TXT","name":"@","content":"\"google-site-verification=PASTED_VALUE\"","ttl":1,"comment":"Search Console — agency account"}'
   ```

   Confirm it resolves publicly before asking Google to check:
   `dig +short TXT $DOM @1.1.1.1 | grep google-site-verification`.
3. **Owner: click Verify.** It usually passes within minutes of the record resolving.
   If it fails, wait and retry. Don't add a second token.
4. **Submit the sitemap.** Sitemaps → `sitemap-index.xml` → Submit. robots.txt already
   points crawlers there. Submitting gets you a status report and a nudge to crawl.
5. **Bing Webmaster Tools** (one click, and it also feeds DuckDuckGo and others): sign
   in with the same agency Google account → **Import from Google Search Console**.
   Sites and sitemaps come across and no extra DNS record is needed.
6. **Client access, only if they want it:** Settings → Users and permissions → add the
   client's address as a **Full** user. Not an owner. Ownership stays with the agency
   until handover (Edge cases).

## Validate

- The property shows **Ownership verified**, as a Domain property covering apex, `www`,
  http and https.
- The sitemap status is **Success**, with a discovered-URL count that matches the
  sitemap. `/thanks` and other noindexed pages shouldn't be in it.
- A few days later, Pages report → indexed count > 0. If it shows **"Excluded by
  'noindex' tag"** for real pages, the production deploy is carrying a preview's
  `x-robots-tag`. Treat that as a bug, not a wait.
- Bing lists the site with its sitemap.

## PR & reply

No spoke PR. This is all DNS and Google state. Record it in the client record under
**Search & listings** (date verified, property type, who has access) and run the state
ritual. The client reply is optional. Only offer access if the client is the kind who
would look: "Your site is registered with Google and Bing. We can give you access to
the search reports if you'd like."

## Monthly report

`node automation/search-console.mjs report <domain> [days]` prints clicks, impressions,
click-through rate and average position for the last N days (default 28) against the N
days before, plus the top searches and pages, as Markdown tables. It uses the same agency
token, so it needs no new consent. Search data lags about two days, so each window ends
three days ago. A newly registered property reads all zeros for its first few days.

The report is something to send, but the agent never sends client mail on its own
(DECISIONS 2026-09-30). It drafts the email around the tables and the owner sends it.

## Edge cases

- **DNS isn't on our Cloudflare** (a client-held zone we didn't move): the client or
  registrar adds the same TXT record. Send them the one record and nothing else, and
  never ask for their DNS login.
- **The client already has a property** for the domain under their own Google account:
  don't create a duplicate. Ask to be added as a Full user, and note it in the record.
  Ownership stays theirs, and the DECISIONS default doesn't override what a client
  already set up.
- **Handover / client departs:** have the client verify their own account (their own
  TXT record), then remove the agency's TXT record and remove the agency from the
  property. Leaving the agency token in DNS keeps the agency a verified owner of a site
  it no longer runs.
- **Domain changes:** Search Console → Settings → Change of address, from the old
  property to the new one. Both must be verified, and the old domain must 301 to the new.
- **Multi-page spokes:** nothing changes. The sitemap already lists every page.

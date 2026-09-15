# Change playbook — attach a custom domain

Takes a live spoke from `<slug>.pages.dev` to the client's real domain, HTTPS on apex +
`www`, without breaking anything already riding on that domain (email is the classic
casualty). Written from a first real run and the decisions it produced (DECISIONS.md —
domain hookups: scoped token, Cloudflare Registrar for new domains, registrar flip stays
human).

**The shape of the job:** apex custom domains on Cloudflare Pages require the domain's
DNS to be **on Cloudflare** (external ALIAS/IP records do not work: Pages has no stable
IP, serves by hostname, and only issues TLS for validated domains). So the job is: audit
what the domain already does → zone onto Cloudflare → correct records → attach to Pages →
registrar nameserver flip (the one human step) → verify → migrate email if it existed.

## Use when

A client says "hook up my domain" / go-live reaches onboarding step 8. Applies to
client-owned domains at any registrar. If the client doesn't own a domain yet, don't use
this playbook — register it on **Cloudflare Registrar** in the agency account instead
(DECISIONS 2026-08-20) and the DNS/NS steps vanish; only "Attach + records + verify"
below applies.

## Inputs required

1. The exact domain (verbatim from the client — rule 4; confirm spelling, it names certs).
2. The spoke's Pages project name (= slug, from the client record).
3. **The scoped API token** at `~/.config/hangar/cloudflare-token` (chmod 600, never in any
   repo). Permissions: Account→Cloudflare Pages:Edit, Account→Zone:Edit, Zone→Zone:Read,
   Zone→DNS:Edit, Zone→Email Routing Rules:Edit — all zones. Without it, zone/DNS steps
   are dashboard work the owner must click (the wrangler OAuth token can attach Pages
   domains and retry validation, but is zone:read-only — proven the hard way).
4. If the pre-flight finds mail records: the client's answer on where that mail goes and
   whether to keep it. **This blocks the nameserver flip** — never assume dead.

## Recipe

Shell setup used below: `TOK=$(cat ~/.config/hangar/cloudflare-token)`,
`ACC=<cloudflare account id>` (from `FLEET.md`), `DOM=<domain>`, `SLUG=<slug>`.

1. **Pre-flight DNS audit — before touching anything** (the step that saves inboxes):

   ```
   dig +short NS $DOM; dig +short A $DOM; dig +short CNAME www.$DOM
   dig +short MX $DOM; dig +short TXT $DOM
   whois $DOM | grep -iE 'registrar:|creation|name server'
   ```

   Snapshot the output into the client record. **Gate:** any MX / SPF / DKIM / DMARC
   present → mail exists on this domain; get the client's keep-or-kill decision and the
   forwarding destination *before* step 5. Also note what A/CNAME records currently
   serve (an old site? parked page?) and confirm replacing it is intended.

2. **Create the zone** (skip if the domain is already a zone in the account):

   ```
   curl -sS -X POST "https://api.cloudflare.com/client/v4/zones" \
     -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' \
     -d "{\"account\":{\"id\":\"$ACC\"},\"name\":\"$DOM\",\"type\":\"full\"}"
   ```

   The response's `name_servers` array is the assigned pair — record it. Cloudflare may
   scan-import existing records; that's step 3's problem.

3. **Set the records.** Target state, exactly two records for the site:
   CNAME `@` → `$SLUG.pages.dev` (proxied; Cloudflare flattens the apex) and
   CNAME `www` → `$SLUG.pages.dev` (proxied). Delete any imported A/AAAA/CNAME for `@`
   or `www` (they point at the old host and block validation). Keep/migrate everything
   else the audit found (TXT verifications, etc.). List then create via
   `GET/POST /zones/$ZID/dns_records`.

4. **Attach both hostnames to the Pages project** (idempotent; fine to do early — they
   sit "pending" until DNS is live):

   ```
   curl -sS -X POST "https://api.cloudflare.com/client/v4/accounts/$ACC/pages/projects/$SLUG/domains" \
     -H "Authorization: Bearer $TOK" -H 'Content-Type: application/json' -d "{\"name\":\"$DOM\"}"
   ```

   Repeat for `www.$DOM`.

5. **Registrar nameserver flip — the one human step.** Send whoever holds the registrar
   login the assigned pair, one per row, and nothing else. Never ask a client for
   registrar credentials. Namecheap specifically: Domain List → Manage → **Domain tab →
   Nameservers → Custom DNS** (NOT Advanced DNS → "Personal DNS Server" / "Register
   Nameserver" — that's glue records, a trap someone already fell into).

6. **Watch, don't poll by hand.** Background loop on
   `GET /zones?name=$DOM` until `status: active` (registry NS usually visible in
   minutes; activation follows). On active: kick validation once per hostname —
   `PATCH .../pages/projects/$SLUG/domains/$DOM` with `{}` — then loop
   `curl -w '%{http_code}' https://$DOM` and `https://www.$DOM` until 200. Universal SSL
   on a fresh zone takes ~5–15 min; a transient `status: error` on a hostname during
   re-validation self-heals — only act if it persists after the other hostname goes
   live (delete + re-add that domain via the API).

7. **Email migration, if the audit found mail** (same token, Email Routing scope):
   enable Email Routing on the zone, recreate the forwards (catch-all or per-address),
   and have the owner/client click the destination-verification email. Verify with a
   real test message end-to-end. Only now is the old forwarding truly replaced.

## Validate

- `https://$DOM` and `https://www.$DOM` → 200, valid cert, correct content (grep a
  string unique to the current build — a deploy alias serving stale cache has fooled us
  once already; hard-refresh beats trusting one curl).
- Both Pages domains report `status: active`.
- If mail existed: test message delivered to the destination.
- The old host (audit step 1) is no longer reachable via the domain.

## PR & reply

No spoke PR for the hookup itself — it's all DNS/platform state. Optional follow-up
content edit on a normal branch+PR: set `site.json`'s `domain` field. Then the state
ritual: client record (domain, hosting line, audit snapshot, email outcome), registry
row (Domain column), STATUS/TODOS/CHANGELOG. Draft the client reply: "your site is live
at https://$DOM — email on the domain still works / was migrated" (only claim what was
verified).

## Edge cases

- **Mail on the domain** — the whole reason step 1 exists. Registrar email forwarding
  (e.g. Namecheap eforward MX) dies silently at the NS flip. Never flip before the
  keep-or-kill answer.
- **Apex on external DNS** — not supported, don't try: registrar ALIAS/redirect setups
  break HTTPS on the apex. A `www`-only CNAME without moving DNS works but leaves the
  bare domain broken; not acceptable for go-live.
- **Client can't do the flip / stalls** — everything else can sit attached-and-pending
  indefinitely; the site stays live on pages.dev. No cleanup needed to wait.
- **Domain transfer temptation** — moving the registration to Cloudflare Registrar
  mid-task adds a 60-day transfer process to a 10-minute job. Flip nameservers now;
  transfer later if ever.
- **Fresh pages.dev TLS** — a brand-new Pages project's subdomain (and especially
  two-level branch aliases) can take minutes to get a cert on first deploy; don't
  diagnose DNS for what is just cert issuance lag.

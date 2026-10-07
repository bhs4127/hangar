# FLEET — this operator's identifiers

> **This is the seed for `private/FLEET.md` (`cp -R private.example private` puts it
> there). Fill in that copy; `private/` is never committed to hangar.** It is the
> single place hangar names your accounts; playbooks and client records reference
> *this file* instead of hardcoding an org, an account, or a domain.
> That is what makes hangar forkable — the instructions are shared, the identifiers are not.
>
> If a value isn't real yet, write `TBD`. A `TBD` here blocks the step that needs it,
> which is the point (CLAUDE.md rule 5).

## Identity

| Key | Value | Used by |
|---|---|---|
| **Agency / operator name** | `TBD` | client-facing copy, PR descriptions |
| **GitHub org or user** | `TBD` | spoke repos are `<org>/<slug>-site` (onboard-client.md step 4) |
| **Spoke repo visibility** | `private` | onboard-client.md step 4 |

## Cloudflare

| Key | Value | Used by |
|---|---|---|
| **Account email** | `TBD` | `wrangler login`, dashboard steps |
| **Account ID** | `TBD` | `$ACC` in attach-custom-domain.md (Dashboard → any domain → right sidebar) |
| **Scoped API token path** | `~/.config/hangar/cloudflare-token` | `$TOK` in attach-custom-domain.md |
| **Registrar for new domains** | Cloudflare Registrar on this account, for agency-held client domains (client as registrant, fee invoiced yearly) and the operator's own. Client-held domains stay in the client's own registrar account (DECISIONS 2026-10-01). | DECISIONS.md — domain hookups |

The scoped token needs: **Pages:Edit, Zone:Edit, Zone:Read, DNS:Edit, Email
Routing:Edit**. Mint it at Dashboard → My Profile → API Tokens → Create Token → Custom.
Store it outside every repo:

```bash
mkdir -p ~/.config/hangar && printf '%s' 'PASTE_TOKEN_HERE' > ~/.config/hangar/cloudflare-token && chmod 600 ~/.config/hangar/cloudflare-token
```

The `wrangler login` OAuth token is **zone:read only** and cannot do DNS work — that's
why the scoped token exists. Deploys work with OAuth alone; domain hookups don't.

## Intake

| Key | Value | Used by |
|---|---|---|
| **Intake domain** | `TBD` | per-client aliases `<slug>@requests.<domain>` — MX to Resend (playbooks/setup-email-intake.md) |
| **Contact-form forward provider** | Resend | spoke `CONTACT_FORWARD_TO` (playbooks/change/wire-contact-delivery.md) |
| **Lead alias** | `TBD` | playbooks/daily-mail-sweep.md — class *lead* |
| **Portfolio alias** | `TBD` *(optional)* | playbooks/daily-mail-sweep.md — class *portfolio enquiry* |
| **Sweep push** | `TBD` (e.g. Telegram; destination id in `~/.config/hangar/`, never here) | playbooks/daily-mail-sweep.md step 7 |
| **Upload drop** | `TBD` (`https://upload.<intake-domain>`; Worker `hangar-upload-drop`, R2 bucket `hangar-uploads`, 30-day expiry; admin token in `~/.config/hangar/`, never here) | playbooks/setup-upload-drop.md |

## Shopify (only if you run the Shopify track)

| Key | Value | Used by |
|---|---|---|
| **Shopify Partner organization** | `TBD` | creates client transfer stores; sends collaborator requests (playbooks/build/shopify-store.md § Access) |
| **Partner business email** | `TBD` | where Shopify sends partner, review, and transfer notices. A real inbox, not a relay |
| **Shopify login identity** | `TBD` | the account the CLI signs in as (`shopify store auth` prints it). Can differ from the business email, e.g. Sign in with Apple |
| **Sandbox dev store** | `TBD` | throwaway `*.myshopify.com` for trying CLI commands. Never a client store |

No Shopify API token is ever stored. The CLI authenticates per store as the collaborator.

## Outreach (only if you prospect)

Cold outreach never uses the intake domain, and never Resend: its acceptable-use policy
bans cold outreach, and the fleet's form delivery and intake run on that account
(playbooks/prospect.md).

| Key | Value | Used by |
|---|---|---|
| **Sending domain** | `TBD` (its own domain, not the intake domain; SPF, DKIM, and DMARC set before the first send) | playbooks/prospect.md step 6 |
| **From address** | `TBD` (a real, monitored mailbox; replies come here) | prospect.md steps 6–7 |
| **Mailbox provider** | `TBD` | where the owner sends from and reads replies |
| **Postal address (CAN-SPAM)** | `TBD` (a street address, PO box, or registered private mailbox; required in every outreach email) | prospect.md step 5 footer |
| **PageSpeed API key** | optional; `~/.config/hangar/pagespeed-key`, never here | `prospect.mjs psi` |

## Meta (only if you post to Instagram / Facebook)

The agency's own accounts only (DECISIONS 2026-10-07). `automation/meta.mjs` reads the
Page name below; tokens and the app secret live in `~/.config/hangar/meta-*.json`, never here.

| Key | Value | Used by |
|---|---|---|
| **Instagram account** | `TBD` (professional account, linked to the Page below) | `meta.mjs status` / `reel` |
| **Facebook Page** | `TBD` (exact Page name; `auth` picks it from the token's Pages) | `meta.mjs auth` |
| **Meta app** | `TBD` (App Dashboard name + app ID; Standard Access, no App Review) | `meta.mjs auth` |

## Google

| Key | Value | Used by |
|---|---|---|
| **Agency Google account** | `TBD` | owns every Search Console property; Bing Webmaster Tools sign-in (playbooks/change/register-search-console.md) |
| **Google Ads manager account (MCC)** | `TBD` | links every client ad account; holds the developer token. Billing is the agency payments profile (DECISIONS 2026-10-02) |

## First-run checklist

- [ ] Fill every row of `private/FLEET.md` (or `TBD` deliberately)
- [ ] `gh auth login` as the org above
- [ ] `wrangler login` on the Cloudflare account above
- [ ] Mint + store the scoped API token (command above)
- [ ] Register the intake domain + store the Resend API key at
      `~/.config/hangar/resend-token` (chmod 600) — `playbooks/setup-email-intake.md`
- [ ] Read `CLAUDE.md`, then `playbooks/README.md`
- [ ] Onboard client #1 via `playbooks/onboard-client.md` — manually, correcting the
      playbooks as you go

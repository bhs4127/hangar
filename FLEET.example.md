# FLEET — this operator's identifiers

> **Copy this file to `FLEET.md` and fill it in. `FLEET.md` is gitignored and never
> committed.** It is the single place hangar names your accounts; playbooks and client
> records reference *this file* instead of hardcoding an org, an account, or a domain.
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

## Shopify (only if you run the Shopify track)

| Key | Value | Used by |
|---|---|---|
| **Shopify Partner organization** | `TBD` | creates client transfer stores; sends collaborator requests (playbooks/build/shopify-store.md § Access) |
| **Partner business email** | `TBD` | where Shopify sends partner, review, and transfer notices. A real inbox, not a relay |
| **Shopify login identity** | `TBD` | the account the CLI signs in as (`shopify store auth` prints it). Can differ from the business email, e.g. Sign in with Apple |
| **Sandbox dev store** | `TBD` | throwaway `*.myshopify.com` for trying CLI commands. Never a client store |

No Shopify API token is ever stored. The CLI authenticates per store as the collaborator.

## Google

| Key | Value | Used by |
|---|---|---|
| **Agency Google account** | `TBD` | owns every Search Console property; Bing Webmaster Tools sign-in (playbooks/change/register-search-console.md) |
| **Google Ads manager account (MCC)** | `TBD` | links every client ad account; holds the developer token. Billing is the agency payments profile (DECISIONS 2026-10-02) |

## First-run checklist

- [ ] Copy this file to `FLEET.md`, fill every row (or `TBD` deliberately)
- [ ] `gh auth login` as the org above
- [ ] `wrangler login` on the Cloudflare account above
- [ ] Mint + store the scoped API token (command above)
- [ ] Register the intake domain + store the Resend API key at
      `~/.config/hangar/resend-token` (chmod 600) — `playbooks/setup-email-intake.md`
- [ ] Read `CLAUDE.md`, then `playbooks/README.md`
- [ ] Onboard client #1 via `playbooks/onboard-client.md` — manually, correcting the
      playbooks as you go

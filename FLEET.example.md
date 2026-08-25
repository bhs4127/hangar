# FLEET — this operator's identifiers

> **Copy this file to `FLEET.md` and fill it in. `FLEET.md` is gitignored and never
> committed.** It is the single place HQ names your accounts; playbooks and client
> records reference *this file* instead of hardcoding an org, an account, or a domain.
> That is what makes HQ forkable — the instructions are shared, the identifiers are not.
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
| **Scoped API token path** | `~/.config/hq/cloudflare-token` | `$TOK` in attach-custom-domain.md |
| **Registrar for new domains** | Cloudflare Registrar | DECISIONS.md — domain hookups |

The scoped token needs: **Pages:Edit, Zone:Edit, Zone:Read, DNS:Edit, Email
Routing:Edit**. Mint it at Dashboard → My Profile → API Tokens → Create Token → Custom.
Store it outside every repo:

```bash
mkdir -p ~/.config/hq && printf '%s' 'PASTE_TOKEN_HERE' > ~/.config/hq/cloudflare-token && chmod 600 ~/.config/hq/cloudflare-token
```

The `wrangler login` OAuth token is **zone:read only** and cannot do DNS work — that's
why the scoped token exists. Deploys work with OAuth alone; domain hookups don't.

## Intake

| Key | Value | Used by |
|---|---|---|
| **Intake domain** | `TBD` | per-client aliases `<slug>@requests.<domain>` (automation/README.md) |
| **Contact-form forward provider** | `TBD` | spoke `CONTACT_FORWARD_TO` — undecided by default |

## First-run checklist

- [ ] Copy this file to `FLEET.md`, fill every row (or `TBD` deliberately)
- [ ] `gh auth login` as the org above
- [ ] `wrangler login` on the Cloudflare account above
- [ ] Mint + store the scoped API token (command above)
- [ ] Read `CLAUDE.md`, then `playbooks/README.md`
- [ ] Onboard client #1 via `playbooks/onboard-client.md` — manually, correcting the
      playbooks as you go

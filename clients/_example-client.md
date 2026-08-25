# Marisol's Taqueria

> **EXAMPLE / TEMPLATE — not a real client.** Copy this file to `clients/<slug>.md` for
> each new client and add a row to [REGISTRY.md](REGISTRY.md). Every field is required
> unless marked optional. If a value isn't known at onboarding, write `TBD` — never
> invent one (CLAUDE.md rule 5).

| Field | Value |
|---|---|
| **Client name** | Marisol's Taqueria |
| **Slug** | `marisols-taqueria` (kebab-case, stable forever — names the repo, Pages project, branches) |
| **Vertical** | restaurant |
| **Spoke repo** | `https://github.com/<your-org>/marisols-taqueria-site` *(TBD until created — org comes from FLEET.md)* |
| **Live domain** | marisols-taqueria.com |
| **Hosting** | Cloudflare Pages — account from FLEET.md, project: `marisols-taqueria` |
| **Status** | template |

## Channels

The identifiers that map an incoming request to this client, across all sources. Each is
tagged with its channel type so the matching adapter knows what to compare. A request
whose source identifier matches nothing here is held for the owner — never guessed at.

| Channel type | Identifier | Notes |
|---|---|---|
| email | `marisols-taqueria@requests.example.com` | per-client alias via Cloudflare Email Routing |
| sms | `+15125550143` | Marisol's cell — same as primary contact |
| signal | `+15125550143` | future channel, same number |

*(The site's contact form is not a channel — it's customer→client mail, forwarded
straight to Marisol's email. See DECISIONS.md, 2026-06-10.)*

## Primary contact

- **Name:** Marisol Vega (owner)
- **Phone:** +1 512 555 0143
- **Email:** marisol@marisols-taqueria.com
- Prefers text over email; usually replies evenings after close.

## Brand tokens

| Token | Value |
|---|---|
| primary | `#C8401A` (brick red) |
| secondary | `#1F3A2E` (deep green) |
| accent | `#F2B441` (marigold) |
| fontHeading | Fraunces |
| fontBody | Inter |

## Intake answers (fictional — this is what "complete" looks like)

Captured per `playbooks/build/restaurant.md` § Intake questions. For real clients these
arrive via the intake channel; they're recorded here so the build has one source of truth.

1. **Name & tagline:** Marisol's Taqueria — "Handmade tortillas, East Austin soul."
2. **Cuisine & vibe:** Family-run taqueria; masa pressed fresh every morning; counter
   service, picnic tables, no fuss.
3. **Logo & colors:** No logo file — wordmark from the heading font is fine. Colors as
   brand tokens above (approved).
4. **Menu:** four sections — Tacos, Especiales, Sides, Drinks. Items and exact prices in
   the spoke's `menu.json` (e.g. Carnitas Plate $13.00, Pollo Asado taco $4.50).
5. **Hours:** Mon closed; Tue–Thu 11:00–21:00; Fri–Sat 11:00–22:00; Sun 11:00–15:00.
6. **Address & parking:** 2304 E 7th St, Austin, TX 78702 — "Free lot behind the
   building; enter from Pedernales St."
7. **Phone/email/reservations:** +1 512 555 0143 / marisol@marisols-taqueria.com / no
   reservations — walk-ins only.
8. **Socials:** instagram.com/marisolstaqueria, facebook.com/marisolstaqueria.
9. **Story:** "My grandmother sold tacos from a cart on this same street in the
   seventies. We still make the tortillas her way — masa pressed every morning, nothing
   from a bag. Come hungry, leave happy."
10. **Photos:** none — test client. Color-block SVG placeholders used; real photos are a
    go-live blocker for actual clients.
11. **Online ordering:** none. Evaluating Square — dormant `ordering` slot stays empty.


## Design brief

Collected at intake per [playbooks/design-language.md](../playbooks/design-language.md)
§ The design brief. The build must visibly reflect it (DECISIONS.md, 2026-06-10).

| Question | Answer |
|---|---|
| Three adjectives | warm, handmade, lively |
| Fun ↔ professional | leans fun (≈65/35) |
| Minimal ↔ rich | middle, slightly rich |
| Palette | brand tokens above — approved |
| Typography vibe | expressive serif display + clean sans body |
| Motion comfort | subtle, a little playful |
| Loves / hates | loves neighborhood-institution feels; hates corporate chain sites |
| Never-do's | no sombrero/cactus clichés |

## Gotchas / notes

- Menu prices change roughly quarterly. Marisol sends a *photo* of the printed menu —
  transcribe it, then **confirm the prices back to her before opening the PR**.
- "Tacos" and "Especiales" are separate menu sections; never merge them.
- Kitchen actually closes 30 minutes before posted close. Site shows posted hours only —
  her explicit preference (2026-06-10).
- No online ordering yet; she's evaluating Square. If she signs up, that fills the
  dormant `ordering` slot — it is a content edit, not a build task.

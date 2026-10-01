# Build playbook — a managed Shopify store

**What this produces:** the client's whole website as a Shopify Online Store that the
agency builds and maintains. The theme lives in a spoke repo and every change goes
through the normal pipeline. The store, the catalogue, the orders, and the Shopify bill
all belong to the client. This is the **second commerce track**. Payment links on a
static site stay the default (DECISIONS 2026-10-01, "Commerce is processor-hosted"). This
track is for clients who need a real store (DECISIONS 2026-10-01, "Managed Shopify").

**Stack:** a Shopify theme forked from Shopify's free reference theme (Horizon at the
time of writing), developed with Shopify CLI, versioned in the spoke repo. The vertical's
content opinions (restaurant, boutique, …) and
[design-language.md](../design-language.md) still apply. Only the platform changes.

## Which track? Ask this before quoting

Payment links on the static site ([change/add-payment-link.md](../change/add-payment-link.md))
cover most "can people buy X on the site" requests. Offer this track only when **at least
one** of these is true, and the client opts in knowing the fees:

| Need | Payment links | Shopify |
|---|---|---|
| One item per purchase, a handful of products | ✅ | overkill |
| Event seats, services, digital downloads, memberships | ✅ | possible, not needed |
| **A cart** (several items in one order) | ❌ | ✅ |
| **Shipping physical goods** (rates, labels, tracking) | ❌ | ✅ |
| **Variants + inventory** (size/colour, stock counts) | ❌ (one link per variant) | ✅ |
| **Catalogue the client edits themselves** (many products, frequent changes) | ❌ (every edit is a PR) | ✅ |
| Discount codes, abandoned-cart email, customer accounts | partly | ✅ |

**Rule of thumb:** a cart, shipping, or more products than anyone wants to maintain as
individual links (roughly a dozen) → Shopify. Otherwise → payment links. A hybrid (a
Shopify Buy Button or Storefront API on the Pages site) is **not offered**. It's two
systems to keep in sync, which is exactly what 2026-10-01 rejected. On this track the
whole site moves to Shopify.

### The fees: say them before the client says yes

The client pays Shopify directly, from their own account. The agency is never on the
Shopify bill and never marks it up. Before they commit, tell them in writing (draft for
the owner to send) what they'll pay Shopify:

- **A monthly plan.** Read current prices from shopify.com/pricing at the time of
  asking, never from memory. Name the plan you'd recommend and why. The basic tier is
  enough for almost every client this fleet serves.
- **Card processing per sale** (Shopify Payments), at the rate for that plan.
- **An extra per-transaction fee if they use a third-party gateway** instead of Shopify
  Payments. This is the usual reason to move an existing Stripe/Square seller onto
  Shopify Payments. That's their decision, made with the numbers in front of them.
- **Paid apps or a paid theme**, if any. The default is none (Opinions 5).
- Domain renewal stays where it is, at their registrar.

The agency's own build and care pricing is separate and lives in the agency's pricing,
not here. On this track hosting is Shopify's, so the care plan covers changes and
upkeep, not hosting.

## Opinions this playbook enforces

1. **The store is the client's from the first transaction.** Build on a **client
   transfer store** (Dev Dashboard → Stores → Create store → Client transfer store): free,
   password-protected, test orders only. At go-live, transfer it. The client accepts,
   picks the plan, enters billing, and finishes Shopify Payments onboarding (identity,
   bank) themselves. We never complete payments onboarding with agency details. If they
   already have a store, we join it as a collaborator instead (Access, below). Either way
   it's handoff-ready from day one (DECISIONS 2026-09-29).
2. **Theme = code = ours. Catalogue = data = theirs.** The theme is in git and changes
   only via branch + PR + preview (rule 2). Products, prices, inventory, orders,
   discounts, and shipping rates live in Shopify, which is their system of record. The
   client may edit them in their own admin. We edit them only on request, through
   [change/add-or-edit-shopify-product.md](../change/add-or-edit-shopify-product.md).
   The agent is still the CMS for everything the theme renders.
3. **Nobody edits the live theme in the theme editor.** Tell the client once, at
   go-live: products are theirs to change, but layout and page text come through us.
   Edits in the editor write to `templates/*.json` and `config/settings_data.json` on
   the live theme, and the next publish from git would silently revert them. Apps also
   write app blocks there. So every change starts by pulling live drift (Pipeline
   mapping, step 5), and drift is never thrown away without the owner seeing it.
4. **Fork the reference theme into the spoke. Never buy one, and never share one.** Each
   spoke carries its own copy (DECISIONS 2026-06-10, no shared library). The premium bar
   from design-language.md is met through the theme's settings and our own sections, not
   a marketplace theme. A client who already paid for a theme keeps it. Note its licence
   in the client record.
5. **Apps are a cost and a script.** Every app adds to the client's bill and usually
   injects JavaScript into every page. The default is **zero apps**: Shopify's own
   features (Shopify Email, Forms, Search & Discovery, Inbox) cover what most clients
   ask for. Each app needs the owner's okay and the client's agreement to its price,
   and is recorded in the client record with what it does and costs.
6. **Performance is measured against the stock theme, not the static fleet's budget.**
   The ~1.5 KB / ~3 KB JS tiers (DECISIONS 2026-09-15) assume a static site and don't
   apply. At the start of the build, run Lighthouse (mobile, median of 3) on the
   untouched reference theme with demo content, and record it in the client record as
   the baseline. Every later change must not drop Performance more than 5 points below
   that baseline. **Accessibility is not relative:** ≥ 95, and rule 8 in full. Every
   product image needs real alt text (Shopify allows it blank; we don't).
7. **Store-level legal and money settings are the client's words, never ours** (rule 5).
   Refund, privacy, terms and shipping policies, tax collection, and shipping rates come
   from the client. Shopify can generate policy templates. If the client wants one, they
   approve the generated text verbatim, in writing, before launch.
8. **The contact form is Shopify's.** The theme's native contact form sends to the store
   email. Customer→client mail still never enters intake (DECISIONS 2026-06-10). No Pages
   Function, no Resend.

## Access (how the agency works inside the store)

- **During the build:** the agency's Shopify Partner organisation (from `FLEET.md`) owns
  the client transfer store. The client is added as staff before transfer, so their
  login already works when ownership moves.
- **After transfer, or on an existing store:** a **collaborator account**. Collaborator
  access is kept automatically after a transfer. For an existing store, send a
  collaborator request from the Partner organisation, using the store's 4-digit request
  code if they've set one, and ask for **only** these permissions: Themes, Products,
  Inventory, Online Store pages/navigation, Settings (for domains/policies), and Apps
  (only if an app was agreed). Never request Orders or Customers. We don't handle orders,
  and every permission we don't hold is customer data we can't leak. Never use the
  client's own login.
- **CLI:** `shopify theme …` uses the Shopify account login (a device-code sign-in the
  first time). Catalogue access is a separate, per-store grant:
  `shopify store auth --store <handle>.myshopify.com --scopes read_products,write_products,read_inventory,write_inventory,read_publications,write_publications`,
  approved in the browser. Re-run it when the token expires or a scope is missing. After
  that, `shopify store execute` handles catalogue reads and writes. Mutations are
  refused unless the command passes `--allow-mutations`. Use that flag only in the apply
  step of the product playbook, never on a read. The CLI keeps the token in its own
  store. **No Admin API token is ever written into the spoke or hangar.**
- **Both sign-ins need an interactive terminal.** The agent's shell can't complete them.
  Run them in the operator's terminal (the Terminal panel), and the owner approves in
  the browser. Everything after that runs non-interactively.
- **Sandbox:** a throwaway dev store for trying commands lives in `FLEET.md`. Create one
  with `shopify store create dev --name <name> --plan basic --demo-data --country US`
  (interactive, or add `--organization-id`). Dev stores can't be transferred, so client
  builds still start from the Dev Dashboard's *client transfer store*.

## Canonical spoke layout

```
<slug>-site/                      # same naming as every spoke
├── assets/  blocks/  config/  layout/  locales/  sections/  snippets/  templates/
│   └── …                         # standard Shopify theme folders, forked from the reference theme
├── config/settings_data.json     # brand tokens land here (colours, fonts)
├── templates/*.json              # page content: section/block settings. What change PRs edit
├── .shopifyignore                # nothing secret to ignore. Keep repo-only files out of the theme
├── HANDOFF.md / README.md        # how the theme is previewed and published (no hangar paths)
└── .theme-check.yml              # theme check config (defaults; tighten, never loosen)
```

There's no Zod schema on this track. The contract is split:

- **Theme code and templates:** `shopify theme check --fail-level error` must pass.
  Warnings the stock theme doesn't have need a reason in the PR.
- **Catalogue:** Shopify's own validation, plus a read-back after every write (product
  playbook § Validate).
- **Content the theme renders** (hours, address, About copy) is section settings in
  `templates/*.json` or Online Store pages, still client facts under rules 4–5. The
  vertical's playbook says what each section must contain.

## The pipeline, mapped onto a Shopify spoke

Every step of [playbooks/README.md](../README.md) applies. These steps change:

- **Step 5, pull + branch:** `git switch -c change/<yyyymmdd>-<desc>`, then **sync live
  drift first**:
  `shopify theme pull --live --only 'templates/*.json' --only 'config/settings_data.json' --only 'sections/*.json' --path .`
  Commit any difference as its own first commit, `sync: live theme drift (<what
  changed>)`. If the drift isn't explained by a known app or a client edit, stop and
  show the owner before building on it.
- **Step 7, validate:** `shopify theme check --fail-level error` (exit 0) in place of
  `npm run build`. Stock Horizon already carries a few warnings (4.2.0: 6), so compare
  warnings against the stock commit, and any new one needs a reason in the PR.
- **Step 9, preview deploy:** push the branch to **its own unpublished theme**, named
  after the branch.
  - First push:
    `shopify theme push --unpublished --theme <branch-name> --store <handle>.myshopify.com --json`.
    The theme is named after the branch with no prompt. Record the `id` and
    `preview_url` from the JSON in the PR.
  - Rework: `shopify theme push --theme <id> --json`. Same id, same `preview_url`, so the
    link the client holds keeps working (the same role as the Pages alias).
  - Before launch the store is password-protected, so the preview needs the storefront
    password, which the client already has. After launch the `preview_url` opens for
    anyone with the link. Treat it like a Pages preview: unlisted, not secret.
- **Step 13, merge + publish:** after the client's yes and the owner's okay,
  squash-merge, check out `main`, then **re-check drift**. Run the step-5 pull into a
  scratch directory and diff it. If the live theme changed since the branch was cut,
  sync it onto `main` through a follow-up PR before publishing. Then:
  `shopify theme push --live --allow-live --json` from `main`. Verify the change on the
  real domain, then `shopify theme delete --theme <preview id> --force`. A preview theme
  is a build artifact (git holds the source), and the theme library is capped at 20.
- **Never `theme publish` a preview theme to production.** Publishing swaps the whole
  theme, and with it any drift the preview didn't carry. Production is always a push of
  `main` to the live theme.

Catalogue changes don't produce a theme preview. Their mapping is in
[change/add-or-edit-shopify-product.md](../change/add-or-edit-shopify-product.md).

## Intake questions (on top of the vertical's)

Ask exactly these. Every blank is `TBD` in the client record, never a guess (rules 4–5).

1. **Existing store?** If yes: the `*.myshopify.com` handle. We send a collaborator
   request; they approve it. If no: we build on a client transfer store.
2. **The catalogue:** every product with exact title, description, price, variants
   (option names and values), SKU if they use them, and stock count if they track it.
   A spreadsheet is fine; Shopify's product CSV template is better.
3. **Photos** for every product, with permission to use them. Alt text is ours to
   write, from what the photo actually shows, and the client confirms it.
4. **Shipping:** where they ship, how they charge (flat, by weight, free over $X, local
   pickup or delivery), and who packs orders.
5. **Tax:** do they collect sales tax, and where are they registered? Their
   accountant's answer, never ours.
6. **Policies:** refund/return, privacy, terms, shipping. Their text, or approval of
   Shopify's generated text, verbatim.
7. **Payments:** Shopify Payments (recommended: no extra transaction fee) or an existing
   gateway they want to keep, with the fee difference shown to them in writing.
8. **Store email and sender name** for order notifications, and who receives new-order
   alerts.
9. **Plan:** confirm they've seen the fees above and which plan they'll pick at
   transfer.
10. **Domain:** who holds the registrar account (always the client, in their name), and
    whether mail runs on the domain. Mail decides how carefully the DNS flip is done.

## Build steps

1. **Store.** Create the client transfer store (Dev Dashboard → Stores → Create store →
   Client transfer store), named for the business, with the client's country and
   address. A wrong address can mean wrong taxes on their Shopify invoice. Add the client
   as staff now. Or, for an existing store, the collaborator request.
2. **Spoke repo** per [onboard-client.md](../onboard-client.md) step 4 (`<org>/<slug>-site`,
   bootstrap commit), then on `build/initial-site`:
   `shopify theme init horizon --clone-url https://github.com/Shopify/horizon.git` in a
   scratch directory. Pass the URL explicitly: with no URL, `theme init` clones the bare
   Skeleton theme. **Don't pass `--latest`.** Horizon publishes no GitHub releases, so it
   fails. The clone carries Horizon's own `.git`, so copy the files without it into the
   spoke checkout and commit them untouched as the first commit, so the diff of our work
   against stock is always readable. Record the upstream version (`theme_version` in
   `config/settings_schema.json`) and commit in the client record.
3. **Baseline:** push it unpublished, load demo content, and record the Lighthouse
   baseline in the client record (Opinions 6).
4. **Brand + design:** brand tokens into `config/settings_data.json` (colour schemes,
   type), then the vertical's sections in order, built to the design brief. Custom
   sections go in `sections/` and `blocks/` with schema `settings`, so future content
   edits are settings changes, not Liquid changes.
5. **Catalogue:** import the client's products (CSV import or `shopify store execute`
   mutations). Every image gets alt text, every product gets a collection, and prices
   are read back against the client's list to the cent.
6. **Store settings:** shipping zones and rates, tax as the client specified, policies
   pasted verbatim, store email and sender, checkout fields (keep the defaults unless
   asked), notification templates branded to the tokens.
7. **Navigation + pages:** menus, Online Store pages (About, FAQ, Contact) with the
   client's copy, a 404, and the native contact form.
8. **Test orders:** with the Bogus Gateway or Shopify Payments test mode, place at least
   one order per shipping method and one with a discount code. Confirm the confirmation
   email, the order in admin, and the shipping/tax lines against the client's rules.
9. **PR → previews → owner check → client review**, exactly as every first PR (onboard
   step 7). The client walks the store on the preview link with the storefront password.
10. **Go-live (in this order):**
    1. The owner okays; merge `build/initial-site`; push `main` to the live theme.
    2. **Transfer ownership** to the client. They accept, choose the plan, enter billing,
       and complete Shopify Payments onboarding. They're the store owner now; we stay as
       a collaborator.
    3. Turn off test mode and the Bogus Gateway. **One real low-value order** end to
       end, refunded afterwards. Same rule as the first payment link.
    4. **Domain** ([change/attach-custom-domain.md](../change/attach-custom-domain.md)
       pre-flight still applies: mail records are the gate). DNS stays on Cloudflare in
       the client's name (DECISIONS 2026-09-29), but **both records are DNS-only (grey
       cloud)**. Shopify doesn't support a proxied record.
       - `A @ 23.227.38.65`
       - `CNAME www shops.myshopify.com`
       Add the domain in Shopify (Settings → Domains), set the primary (apex or `www`,
       whichever the client's other material uses), and wait for Shopify's certificate.
    5. **Remove the storefront password**, and only then.
    6. Search Console ([change/register-search-console.md](../change/register-search-console.md)).
       Shopify serves `sitemap.xml` and `robots.txt` itself.
    7. Go-live note to the client (draft; the owner sends it): the store is theirs; orders
       arrive in Shopify admin and the Shopify app; they may edit products, stock, and
       discounts themselves; please don't use the theme editor, send layout and text
       changes to the intake alias; their Shopify bill is between them and Shopify.

## Definition of done

- [ ] Client is the **store owner** on their chosen plan, with billing and Payments in their name
- [ ] Agency holds collaborator access with only the permissions listed in Access
- [ ] `main` == live theme (a drift pull shows no diff); no leftover preview themes
- [ ] `shopify theme check --fail-level error` passes; no unexplained warnings beyond stock
- [ ] Lighthouse mobile: Accessibility ≥ 95; Performance within 5 of the recorded baseline
- [ ] Every product image has real alt text (read-back query in the product playbook)
- [ ] Policies, tax, and shipping match the client's written answers verbatim
- [ ] One real order placed, received, and refunded
- [ ] Domain: apex + `www` resolve, HTTPS valid, records DNS-only, mail records untouched
- [ ] Storefront password off; Search Console registered
- [ ] Client record lists: store handle, plan, apps (with cost), theme baseline, permissions held

## Edge cases seen coming

- **Migrating from Squarespace/Wix/Weebly commerce:** export the old products as CSV and
  map them to Shopify's import template. **Old order history doesn't import.** The client
  keeps the old platform's export. Old product URLs need Shopify URL redirects (Online
  Store → Navigation → URL redirects) so links and search results survive.
- **The client wants a paid theme or an app we didn't pick:** their money, their call,
  stated in writing with the price. Record it, and run the Opinions 6 measurement after
  installing.
- **The client edited the theme in the editor anyway:** the step-5 drift sync catches it.
  Show the owner what changed, ask the client whether they meant it, and keep it if so.
  Never silently overwrite their work.
- **Shopify Plus:** not this playbook. Plus brings organisation-level ownership that's
  hard to unwind, so escalate.
- **The client cancels the care plan:** [handoff.md](../handoff.md) § Shopify stores.
  Short, because they already own the store.

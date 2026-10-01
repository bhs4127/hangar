# Change playbook — add, edit, reprice, or retire a Shopify product

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md), for
clients on the managed Shopify track ([build/shopify-store.md](../build/shopify-store.md)).
It's the one change type that **doesn't land in git**. The catalogue lives in Shopify,
which is the client's system of record (DECISIONS 2026-10-01). So the branch, PR, and
theme-preview steps are replaced by a staged change, the client's confirmation of exact
values, and a read-back. The gates stay the same: the owner checks, the client says yes,
the owner okays, then it goes live.

Layout or page-text changes are **not** this playbook. They're theme changes and go
through the normal pipeline (build/shopify-store.md § The pipeline, mapped).

## Use when

*"Add the new linen tote at $38." "The blue one is sold out." "Raise everything in
Candles by $2." "Stop selling the holiday set."* A request touching products, variants,
prices, stock, collections, or product photos on a Shopify-track client.

The client can make every one of these edits in their own admin, and is welcome to.
This playbook is for when they ask us.

## Inputs required — stop and ask if any is missing (rules 4–5)

- **Which product(s), exactly.** Match the client's words to existing product titles.
  If more than one product could match ("the blue one"), ask, quoting the candidates.
- **New product:** title, description (their words), price, variants (option names +
  values, price per variant if it differs), stock per variant if they track it, photos,
  the collection(s) it belongs in, and whether it ships (weight, if rates are by weight).
- **Price change:** the exact new price per variant. "Raise by $2" is fine when the
  current prices are read back to them with the result: *"Candles go $18 → $20, $24 →
  $26. Right?"* Never round, never infer a sale price.
- **Retire:** hide it (draft or archive) or delete it. **Default is archive.** It keeps
  order history linked and can be reversed. Deleting is never ours to do (prohibited).
- **Sale prices:** a "compare at" price is a claim that the item normally sells for
  more. Only set it if the client states the regular price.

## Recipe

Shell setup: `STORE=<handle>.myshopify.com`. `shopify store auth --store $STORE` once per
machine. Writes need `--allow-mutations`. Reads never get it.

1. **Read the current state.** Query the product(s) and save the JSON to a scratch file
   (never a repo). It's the "old" side of the summary and the undo record:
   `shopify store execute --store $STORE --query-file read-product.graphql --variables '{"q":"title:Linen*"}' --json --output-file before.json`
   Write mutations against the current Admin API schema. Check field names against
   shopify.dev or the Shopify dev MCP before writing a mutation, never from memory.
2. **Stage the change where Shopify lets you:**
   - **New product:** create it with `status: DRAFT`. Drafts don't show on the
     storefront, so nothing is live until step 5.
   - **New variant, new photos, description edits on a live product:** these appear
     immediately on save, so **don't apply yet**. The staged form is the summary in
     step 3.
   - **Price, stock, retire:** same. These are immediate, so apply at step 5 only.
3. **Owner check (pipeline step 10).** Present a summary table: product · variant · field
   · old → new, plus each new product's admin link (a draft is visible to the owner and
   the client in admin). Nothing has changed on the storefront yet, apart from new
   drafts.
4. **Client confirmation (pipeline steps 11–12).** Draft the in-thread message with the
   same table in plain terms (*"Linen Tote, new, $38, in Bags, 12 in stock"*), and for
   new products: *"It's saved as a hidden draft. You can see it in your Shopify admin
   under Products."* The ask: *"Reply 'looks good' and we'll put it live."* A clear yes
   moves on. Changes go back to step 2. A hedge gets a clarifying question.
5. **Apply (pipeline step 13), after the owner's okay.** Run the mutations with
   `--allow-mutations`: set draft products to `ACTIVE` and published to the Online Store
   channel, and apply the price/stock/variant/archive changes from the confirmed table,
   exactly as confirmed.
6. **Read back** (Validate) and send the "it's live" reply (step 14) with the live
   product URL(s).

**Owner-direct and bulk edits:** a CSV import (Products → Import) is fine for 10+
products. Export first (that's the before-state), import with "overwrite existing"
only for the confirmed rows, then read back the whole set.

## Validate

- **Read back every touched product** and diff it against the confirmed table: title,
  status, price and compare-at price per variant, stock, collections. Anything that
  doesn't match exactly gets fixed before the "it's live" reply.
- **Alt text** on every image of every touched product (rule 8). Query
  `products { nodes { title media(first: 50) { nodes { alt } } } }` and treat any empty
  `alt` as a failure. Write the alt text from what the photo shows, and include it in
  the client summary.
- **Storefront check:** open the live product URL and confirm the price and availability
  shown match.

## PR & reply

There's no PR, since nothing changes in git. The audit trail is the summary table, the
client's quoted yes, the `before.json` snapshot noted in the CHANGELOG line, and
Shopify's own product history. If the change also needs a theme edit (a new collection
in the menu, a homepage feature), that part is a separate branch + PR through the normal
pipeline, and both are confirmed in the same client message.

## Edge cases seen coming

- **The client already changed it themselves** (the read-back in step 1 doesn't match
  what they described): tell them what you see now and ask what they want. Don't
  overwrite their edit.
- **Out of stock:** set the variant's stock to 0, or tick "continue selling" only if they
  say they take backorders. Never hide a product just because it's out of stock unless
  they asked.
- **Price change while orders are open:** fine. Existing orders keep their price.
- **Discounts and sales:** a discount code or automatic discount (Discounts in admin)
  beats editing prices and back. Ask for start and end dates.
- **Inventory at several locations:** ask which location. Never split stock by guessing.
- **Undo:** `before.json` holds the previous values. Re-applying them is the same recipe
  with the same gates.

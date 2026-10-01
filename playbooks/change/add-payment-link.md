# Change playbook — add, reprice, or retire a payment link

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md); all
other steps are shared. The architecture behind it, "processor-hosted checkout; the
processor is the system of record; no database", is DECISIONS.md 2026-10-01.

## Use when

The client wants to sell something online, or change something they already sell:
*"Can people pay for the workshop on the site?" "The assessment is $175 now." "Stop
selling the spring cohort."* It also covers replacing an old platform's built-in store
during a migration: one link per product that's still sold.

Not this playbook: a cart, accounts, gated content, or anything that needs to remember a
customer between visits. That's project work. Escalate it (DECISIONS 2026-10-01, "past
the line").

## Inputs required — stop and ask if any is missing (rules 4–5)

- **Exact product name** as the buyer should see it on the receipt.
- **Exact price and currency.** Never infer a price from an old site or a past invoice.
  If the client supplies one that conflicts with what the site shows, ask which is right.
- **One-time or recurring?** If recurring, the interval (monthly, yearly).
- **What the buyer gets, and how.** This decides the after-payment redirect:
  - a file → a download page on the site;
  - a session or service → the client's booking link (Calendly etc.) or a "we'll be in
    touch" page;
  - an event seat → a confirmation page with the event details.
- **Anything to collect at checkout** beyond name and email (organisation, attendee
  name, which session). The processor's custom fields hold a few. More than that means
  a form tool and an escalation.
- **Limits:** a seat cap, or an end date (events).
- **Tax:** whether the client charges sales tax on it. That's their accountant's call,
  never ours. Don't switch on automatic tax without an explicit answer.
- **Which processor account.** The client's own, normally the one they already use, so
  payouts and history stay together. If they have none, they create it; the agency
  never owns it (handoff.md).

## Access

The agency works inside the client's processor account as an **invited team member**,
with a role that can manage products and payment links, never with the client's
password. With the processor's MCP connected under that login (e.g. Stripe's), the
agent creates products, prices and links directly. Without it, the owner creates them
from this recipe.

## Recipe

1. **Create the product and price** in the client's account, exactly as supplied.
2. **Create the payment link** for it. Set:
   - **after-payment:** redirect to the page chosen above (create the page in this same
     PR if it doesn't exist);
   - **custom fields** and **collection limits / end date** if any;
   - **customer emails:** receipts on.
   Create the link **deactivated**. It's switched on at merge (step 13), so the public
   preview never carries a live checkout.
3. **Put the URL in content.** It goes in the schema's hand-off field for that item:
   `checkoutUrl`, `registerUrl`, restaurant `ordering.urlOrEmbed`, or the vertical's
   equivalent. If the vertical's schema has no such field, add an **optional URL field
   in the spoke's schema** (additive only; never loosen an existing constraint) and call
   it out in the PR. The site's displayed price is display copy: it must match the
   processor's price to the cent.
4. **Download pages** for digital goods: unlisted, `noindex`, linked only from the
   redirect. Anyone given that URL can skip paying. Fine for low-value items; for
   anything worth protecting, escalate (signed-link webhook, DECISIONS 2026-10-01).

**Repricing:** processors often treat a price as immutable. Create the new price and
attach it to the link. If that changes the link URL, update the content too. Old
receipts keep the old price; that's correct.

**Retiring:** deactivate the link (never delete it, so its history stays), remove the
item or its button from content, and for dated events add a TODOS.md reminder to
deactivate it the day after.

## Validate

- `npm run build`. The schema rejects a malformed URL or price.
- Read the link back from the processor (dashboard or MCP): product name, amount,
  currency, recurrence, redirect target, custom fields. Each must equal the inputs.
- **First link for a client:** at go-live, make one real low-value purchase end to end
  (receipt arrives, redirect lands, the order shows in the dashboard), then refund it.
  After that, the read-back is enough per link.

## PR & reply

The PR lists each item as product · price · one-time/recurring · what happens after
payment, plus the processor link. The preview reply to the client (pipeline step 11)
states the price in plain terms, so the person who sets prices confirms it. At step 13,
after the owner's okay: merge, deploy, **activate the link**, and check the live page's
button reaches an active checkout.

## How the client sees orders

There's no admin panel of ours, and none is needed. The processor's dashboard is the
client's order screen:

- **Dashboard → Payments** (Stripe; Square's equivalent is Transactions): every order,
  with buyer, amount, product, custom-field answers, receipt, and a refund button.
  Filterable by date, status or product; exportable as CSV for rosters or accounting.
- **Per link:** opening a payment link shows only its own payments, which works as an
  event roster.
- **Customers:** each buyer's purchase history in one place.
- **Notifications:** the processor emails the account on each successful payment, and
  its phone app pushes them.
- **Subscriptions:** a list of active, past-due and cancelled renewals.

Tell the client this at go-live, in one line: *"Your orders now live in your Stripe
dashboard (or app). That's where to see, export or refund them."*

**Migrating from a platform store:** if the old store already charged through the
client's processor, its payment history is already in that dashboard. Export the old
platform's own order list (product names, shipping or fulfilment notes) before
cancelling it. We don't import it anywhere.

## Edge cases seen coming

- **Two processors on the old site** (scripts for both loaded): the platform's
  checkout settings name the one that actually takes money. Use that one.
- **Installment plans:** not a payment-link feature. Escalate. Usually the answer is a
  subscription with a fixed number of cycles, or an invoice from the dashboard.
- **Discounts:** use processor promotion codes on the link, not a second price. The
  site never shows "sale" prices it can't enforce.
- **Refunds, disputes, payouts, taxes:** the client's business, done in their
  dashboard. We don't touch money.
- **Never** take card details on a spoke page, store order data, or put a processor
  secret key in a repo or a Pages secret for this. Payment links need no keys on the
  site.

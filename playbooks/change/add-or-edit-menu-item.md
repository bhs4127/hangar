# Change playbook — add or edit a menu item

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md). Steps
1–5 (identify client, classify, clarity gate, pull spoke, branch) and 7–12 (validate,
PR, preview, approve, reply, state layer) are identical for every change.

## Use when

The client asks to add, change, or remove a menu item, or any of its fields.
*"Add a pollo asado taco, $4.50." "Carnitas is $14 now." "Take the flan off."*

## Inputs required — stop and ask if any is missing (rules 4–5)

| Field | Rule |
|---|---|
| Section | Must resolve to an existing section in `menu.json` (recipe step 2). |
| Item name | Exact, in the client's wording. |
| Price | **Verbatim from the client**, format `$N` or `$N.NN`. Never inferred, rounded, or carried over from "similar items". |
| Description | Optional. The client's words, light copyedit OK. Don't write marketing copy they didn't say. |
| Tags | Optional, only from the schema enum: `vegetarian` `vegan` `gluten-free` `spicy` `popular` `new`. Apply only when stated or unambiguous ("it's our veggie taco" → `vegetarian` is fine; guessing spice level is not). |

For **edits**: change only the fields the request mentions. "Carnitas is $14 now"
touches `price` and nothing else.

## Recipe

1. Open `src/content/data/menu.json` in the spoke.
2. Locate the target section by name:
   - Exact match → proceed.
   - Near match (request says "Appetizers", menu has "Starters") → ask: *"Your menu
     section is called 'Starters' — same thing?"*
   - No match → ask whether to create the section and where it sits in the section
     order. **Never create a section silently.**
3. Add the item (default position: end of the section, unless the client says where) or
   update the named fields of the existing item.
4. **Removal** only on an explicit request to remove. Echo exactly what's being removed
   in the PR and the reply.
5. **Duplicates:** if an item with that name already exists in the section, ask whether
   this is an edit to it or genuinely a second item.

## Validate

`npm run build` in the spoke. The schema rejects malformed prices, unknown tags, and
empty sections. If validation fails: fix the content. If the schema can't represent
something real the client said (see edge cases), escalate — that's a schema decision for
DECISIONS.md, not a workaround.

## PR & reply

PR title `content(menu): …`; description quotes the original request and lists exact
field changes (old → new). Reply draft:
*"Added Pollo Asado ($4.50) to Tacos — preview here: <link>. Look right?"*

## Edge cases seen coming

- **"Market price" / "ask your server"** — the schema requires `$N`, by decision
  (DECISIONS.md, 2026-06-10): strictness is the safety feature. Escalate to the owner;
  never extend the schema without a new decision.
- **Two sizes/prices** ("cup $4 / bowl $7") — one price per item, by the same decision.
  The strict-format answer is two items ("Tortilla Soup — Cup" / "— Bowl") with the
  client's OK; otherwise escalate.
- **A price change with no matching item anywhere** — likely a transcription mismatch
  with the printed menu. Ask, listing the closest item names.

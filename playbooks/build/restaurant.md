# Build playbook — restaurant

> **Extends [_base.md](_base.md).** Read that first: stack, layout, accessibility,
> performance, the contact form, structured data, build steps and the base definition of
> done all live there. This file holds only what's specific to restaurants. Restaurant was
> the first vertical built, and its schema
> ([schemas/restaurant.ts](../../schemas/restaurant.ts)) is the reference implementation
> of the base primitives.

**What this produces:** a one-page site that answers a hungry person's three questions —
*what do you serve, are you open, where are you* — in under ten seconds.

## Opinions this playbook adds

1. **Canonical order:** **hero → about → menu → hours → location → contact.** The menu is
   the offerings section; hours and location are the practicalities. Optional add-ons:
   **testimonials** (slots after about) and **gallery** (slots after menu), both OFF
   unless the client asks and supplies material. Restaurants stay one page.
2. **The menu is HTML, never a PDF** (base opinion 2). If the client only has a PDF or a
   photo of the printed menu, transcribe it — and confirm the prices back to them before
   shipping (rule 5).
3. **The phone number is the primary CTA.** Tap-to-call `tel:` link in the sticky header,
   the hero, and the contact section. Local restaurants convert by phone and feet, not by
   contact form.
4. **Hours have one source of truth** — `hours.json` — rendered in both the hours section
   and the footer from the same data. Hours are the single most common change request;
   updating them must be a one-file edit.
5. **JS budget in practice:** three tiny inline scripts: hours-today highlight, form
   time-trap, reveal observer.

## Spoke content files

On top of the base layout, `src/content/data/` holds:

```
menu.json        # sections → items → prices
hours.json       # the one source of truth for hours
location.json
ordering.json    # only if the dormant slot is filled
```

Schema: copy [schemas/restaurant.ts](../../schemas/restaurant.ts). An empty `ordering`
collection logs a harmless build warning — that's the dormant slot working.

## Sections — restaurant specifics

Field-level precision lives in [schemas/restaurant.ts](../../schemas/restaurant.ts);
this is the intent behind each section. Hero, about and contact follow the base.

### Hero
The photo is the food or the room, never a stock storefront. CTA default is the phone
(`tel:`, "Call to order"). If the `ordering` slot is filled, "Order Online" becomes the
primary CTA and the call link goes secondary.

### Menu
Sections (Tacos, Sides, Drinks, …) each holding items: name, optional ≤ 200-character
description, price, optional tags rendered as small badges (vegetarian / vegan /
gluten-free / spicy / popular / new). Prices are display strings ("$14", "$9.50"),
right-aligned. Menus longer than ~3 sections get in-page jump links at the top of the
section.

### Hours
Weekly table from `hours.json`: per-day open/close, or closed. Stored as 24-hour strings
("21:30"), rendered 12-hour ("9:30 PM"). Today's row highlighted (inline script).
Optional client-supplied notes line ("Closed major holidays").

### Location
Full street address; the **parking note rendered prominently** — it's the #2 pre-visit
question after hours. Map per the base Practicalities section.

### Contact
A reservation link takes the base's booking-link slot. Catering questions and party
bookings are what the form usually carries.

### Ordering — the dormant slot
`ordering` in the schema: `{ provider, urlOrEmbed, label }`, optional. Absent → renders
nothing, zero visual trace. Present → an "Order Online" CTA in the hero and sticky
header pointing at the provider (Square, Toast, ChowNow, …). **We never build ordering
ourselves** — this is a hand-off slot for an embeddable third-party system, present from
day one so enabling it is a content edit, never a redesign (DECISIONS.md).

### Structured data
Type `Restaurant`. Base field mapping, plus `hasMenu` → the page's `#menu` URL, and an
`OrderAction` `potentialAction` pointing at the provider only when `ordering` is filled.
Hours with identical open/close times share one `OpeningHoursSpecification`. Never
`servesCuisine` or `priceRange`: the schema has no client-confirmed slot for either, so
the Rich Results Test's warnings about them are expected.

## Intake questions

Ask the base's universal questions ([_base.md](_base.md) § Universal intake questions)
— for a restaurant, address and hours are always required — plus these:

1. One sentence: cuisine and vibe? *(replaces the base's "what you do")*
2. The menu: sections → items with **exact prices**. A photo of the printed menu is fine —
   we transcribe and confirm prices back.
3. Reservation link (if any)?
4. Social handles to check for: Instagram / Facebook / TikTok / Yelp / Google.
5. Photos: food, room, people.
6. Already doing online ordering with a provider? If yes, the link — it fills the
   dormant `ordering` slot.

## Definition of done — restaurant additions

On top of the base list:

- [ ] All six sections render in canonical order
- [ ] Hours match the intake answers and the client confirmed them
- [ ] Every menu price confirmed back to the client
- [ ] `ordering` filled only if the client supplied a provider link

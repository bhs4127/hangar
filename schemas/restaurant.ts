/**
 * Reference Zod schema for a restaurant spoke.
 *
 * This is hangar's reference copy. When a spoke is born (playbooks/onboard-client.md), this
 * file is COPIED into the spoke and wired into Astro Content Collections
 * (src/content.config.ts), one data collection per top-level key, so every build
 * validates every content file. The spoke's copy is the live contract; this one is the
 * canonical starting point for future spokes.
 *
 * The schema is the safety mechanism that makes agent-made edits shippable: a malformed
 * change (bad price string, missing alt text, invalid time) fails the spoke's build and
 * therefore cannot reach production. Never loosen a constraint to make one piece of
 * content pass — fix the content, or escalate (DECISIONS.md).
 */

import { z } from "zod";

/** Display price, verbatim from the client: "$14", "$9.50". One price per item — sizes,
 *  "market price", etc. are deliberately unrepresentable (decided 2026-06-10,
 *  DECISIONS.md); candidates parked in TODOS.md until a real menu demands them. */
export const priceSchema = z
  .string()
  .regex(/^\$\d{1,3}(\.\d{2})?$/, 'Prices are display strings like "$14" or "$9.50"');

/** 24-hour wall-clock time, local to the restaurant: "11:00", "21:30".
 *  Rendered 12-hour ("9:30 PM") by the site. */
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times are 24-hour "HH:MM" strings');

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Six-digit hex like "#C8401A"');

/** Every image carries alt text. Empty alt is allowed ONLY as an explicit
 *  decorative-image decision (playbooks/change/replace-an-image.md), never a default. */
const imageSchema = z.object({
  src: z.string().min(1), // path within the spoke, e.g. "/src/assets/hero-tacos.jpg"
  alt: z.string(),
});

const brandTokensSchema = z.object({
  primary: hexColor,
  secondary: hexColor,
  accent: hexColor,
  fontHeading: z.string().min(1), // e.g. "Fraunces" — self-hosted in the spoke
  fontBody: z.string().min(1), // e.g. "Inter"
});

export const siteSchema = z.object({
  name: z.string().min(1),
  tagline: z.string().min(1),
  logo: imageSchema,
  domain: z.string().min(3), // "marisols-taqueria.com" — no protocol
  brandTokens: brandTokensSchema,
});

export const heroSchema = z.object({
  headline: z.string().min(1).max(80), // it's a banner, not a paragraph
  subheadline: z.string().max(160).optional(),
  image: imageSchema,
  /** Optional override. Default behavior when absent: "Call to order" tel: CTA, or
   *  "Order Online" if the ordering slot is filled (build playbook, Hero section). */
  cta: z.object({ label: z.string().min(1), href: z.string().min(1) }).optional(),
});

export const aboutSchema = z.object({
  heading: z.string().default("Our Story"),
  body: z.string().min(80), // 2–3 real sentences minimum — keeps lorem ipsum out
  image: imageSchema.optional(),
});

const menuTagSchema = z.enum([
  "vegetarian",
  "vegan",
  "gluten-free",
  "spicy",
  "popular",
  "new",
]);

export const menuItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().max(200).optional(),
  price: priceSchema,
  tags: z.array(menuTagSchema).optional(),
});

export const menuSchema = z.object({
  note: z.string().optional(), // e.g. "Prices subject to change" — client-supplied only
  sections: z
    .array(
      z.object({
        name: z.string().min(1), // "Tacos", "Sides", "Drinks"
        description: z.string().optional(),
        items: z.array(menuItemSchema).min(1),
      }),
    )
    .min(1),
});

/** A day is either fully specified or explicitly closed — no half-filled days. */
const dayHoursSchema = z.union([
  z.object({ closed: z.literal(true) }),
  z.object({ open: timeSchema, close: timeSchema }),
]);

export const hoursSchema = z.object({
  monday: dayHoursSchema,
  tuesday: dayHoursSchema,
  wednesday: dayHoursSchema,
  thursday: dayHoursSchema,
  friday: dayHoursSchema,
  saturday: dayHoursSchema,
  sunday: dayHoursSchema,
  /** Free-text, client-supplied only ("Closed major holidays"). Also the escape hatch
   *  for one-off exceptions like "Closed July 4" (decided 2026-06-10, DECISIONS.md) —
   *  see playbooks/change/update-hours.md edge cases. */
  notes: z.string().optional(),
});

export const locationSchema = z.object({
  address: z.object({
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().length(2), // "TX"
    zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  }),
  parking: z.string().optional(), // "Free lot behind the building" — render prominently
  mapEmbedUrl: z.string().url().optional(), // static map image preferred; embed if client insists
  coords: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
});

export const contactSchema = z.object({
  /** E.164 so tel: links are unambiguous; the site formats it for display. */
  phone: z.string().regex(/^\+1\d{10}$/, 'E.164, e.g. "+15125550143"'),
  email: z.string().email(),
  reservationUrl: z.string().url().optional(),
  socials: z
    .object({
      instagram: z.string().url().optional(),
      facebook: z.string().url().optional(),
      tiktok: z.string().url().optional(),
      yelp: z.string().url().optional(),
      google: z.string().url().optional(),
    })
    .optional(),
});

/**
 * Dormant ordering slot — a HAND-OFF, not a feature we build (DECISIONS.md).
 * Absent: renders nothing, zero visual trace. Present: "Order Online" becomes the
 * primary CTA in the hero and sticky header, pointing at the third-party provider.
 * Filling this slot is a content edit, never a redesign.
 */
export const orderingSchema = z.object({
  provider: z.enum(["square", "toast", "chownow", "doordash", "ubereats", "other"]),
  urlOrEmbed: z.string().min(1), // provider URL, or an embed snippet if that's what they give us
  label: z.string().default("Order Online"),
});

export const restaurantSchema = z.object({
  site: siteSchema,
  hero: heroSchema,
  about: aboutSchema,
  menu: menuSchema,
  hours: hoursSchema,
  location: locationSchema,
  contact: contactSchema,
  ordering: orderingSchema.optional(),
});

export type Restaurant = z.infer<typeof restaurantSchema>;

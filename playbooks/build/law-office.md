# Build playbook — law office

> **STUB — not yet written.** Tracked in TODOS.md (P3); gets written for real after the
> first restaurant build proves the loop. It will follow the exact shape of
> [restaurant.md](restaurant.md): opinions → canonical layout → sections (content model +
> rendering) → intake questions → build steps → definition of done.

## Known differences to encode when this is written

- **Sections:** hero → about the firm → practice areas → attorneys (bios + photos) →
  results/testimonials *(bar-rule constraints vary by state — verify before including)* →
  contact. No menu, no ordering slot.
- **Required disclaimers:** "attorney advertising" where applicable; the contact form
  must state that submitting it does **not** create an attorney–client relationship and
  to send no confidential information. These are schema-enforced fields, not optional
  copy.
- **Never invent legal claims** (CLAUDE.md rule 5 at maximum strength): practice-area
  descriptions, credentials, bar admissions, and case results come from the client
  verbatim.
- **Design defaults:** conservative typography and palette; credibility over vibrancy.
- **Accessibility is non-negotiable** — law firms are a common ADA-complaint target;
  the restaurant playbook's accessibility floor is the minimum, audited harder.
- **Contact form** is the same Pages Function pattern — customer→client mail forwarded
  to the firm's email, never into the intake pipeline (DECISIONS.md, 2026-06-10) — plus
  the disclaimer above.
- **Schema:** `schemas/law-office.ts` (TODO, alongside this playbook) — `site`, `hero`,
  `about`, `practiceAreas[]`, `attorneys[]`, `disclaimers`, `location`, `contact`.

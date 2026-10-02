# Build playbook — law office

> **STUB — not yet written.** Tracked in TODOS.md (P4). It will **extend
> [_base.md](_base.md)** the way [restaurant.md](restaurant.md) does: the vertical's own
> opinions, content files, sections, intake questions and definition-of-done additions,
> nothing the base already covers.

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
  the base playbook's accessibility floor is the minimum, audited harder.
- **Contact form** is the same Pages Function pattern — customer→client mail forwarded
  to the firm's email, never into the intake pipeline (DECISIONS.md, 2026-06-10) — plus
  the disclaimer above.
- **Structured data:** `LegalService` JSON-LD, built the same way as the restaurant's
  (_base.md § Structured data): only from validated content, never ratings.
- **Schema:** `schemas/law-office.ts` (TODO, alongside this playbook) — `site`, `hero`,
  `about`, `practiceAreas[]`, `attorneys[]`, `disclaimers`, `location`, `contact`.

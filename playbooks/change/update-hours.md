# Change playbook — update hours

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md); all
other steps are shared.

## Use when

The posted weekly hours change: open/close times, a day becoming closed or open.
*"We're closing at 9 on Fridays now." "Closed Mondays going forward."*

## Inputs required — stop and ask if any is missing (rules 4–5)

- **Which day(s)?** Expand ranges explicitly — "weekdays" / "Mon–Thu" — and echo the
  expansion back in the PR and reply.
- **New open AND close time** per affected day, or "closed". *"We close at 9 now"* — for
  which days? Ask if the request doesn't say.
- **AM/PM when ambiguous.** "Open at 7" could be either for some businesses. Confirm
  rather than assume.

## Recipe

1. Open `src/content/data/hours.json` in the spoke.
2. Update **only the named days**. Each day is `{"open":"11:00","close":"21:30"}`
   (24-hour strings — schema-enforced) or `{"closed":true}`.
3. Convert the client's phrasing to 24-hour: "9pm" → `"21:00"`, "9:30 at night" →
   `"21:30"`.
4. Untouched days stay byte-identical.
5. **Future-dated changes** ("starting next month"): there's no scheduling. Ask whether
   to ship now or hold the PR until the date; if held, note it in HQ's TODOS.md with the
   date.

## Validate

`npm run build` — the schema rejects malformed times and half-filled days (an `open`
with no `close`).

## PR & reply

The PR lists per-day old → new in **12-hour wording**, because that's what the client
will check: *"Friday: 11 AM–10 PM → 11 AM–9 PM."* The reply draft echoes the full new
week back — the person who knows the real hours is the error-catcher of last resort.

## Edge cases seen coming

- **One-off exceptions** ("closed July 4") — the weekly schema can't represent dates,
  by decision (DECISIONS.md, 2026-06-10). Put it in `hours.notes` ("Closed July 4") and
  add a TODOS.md reminder to remove the note afterward. A dated-exceptions schema stays
  in the parking lot unless notes-juggling becomes a recurring chore.
- **Split hours** ("11–2, then 5–9") — not representable; one open/close per day.
  Escalate; known limitation, candidate v2 schema change.
- **Time zones:** hours are local to the restaurant. Never convert them.

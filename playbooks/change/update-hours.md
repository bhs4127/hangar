# Change playbook — update hours

This recipe is **step 6** of the pipeline in [playbooks/README.md](../README.md); all
other steps are shared.

## Use when

The posted weekly hours change: open/close times, a day becoming closed or open.
*"We're closing at 9 on Fridays now." "Closed Mondays going forward."*

## Inputs — assume what's missing and name it in the preview email (rules 4–5)

- **Which day(s)?** Expand ranges explicitly — "weekdays" / "Mon–Thu" — and echo the
  expansion back in the PR and reply.
- **New open AND close time** per affected day, or "closed". *"We close at 9 now"* with no
  days named → every day that now closes later than that, and say so.
- **AM/PM when ambiguous.** "Open at 7" could be either for some businesses. Pick the one
  that fits their other hours, and say so.

## Recipe

1. Open `src/content/data/hours.json` in the spoke.
2. Update **only the named days**. Each day is `{"open":"11:00","close":"21:30"}`
   (24-hour strings — schema-enforced) or `{"closed":true}`.
3. Convert the client's phrasing to 24-hour: "9pm" → `"21:00"`, "9:30 at night" →
   `"21:30"`.
4. Untouched days stay byte-identical.
5. **Future-dated changes** ("starting next month"): there's no scheduling. Build and
   preview it now, and hold the merge until the date unless the client says otherwise; note it in hangar's private/TODOS.md with the
   date.

## Validate

`npm run build` — the schema rejects malformed times and half-filled days (an `open`
with no `close`).

## PR & reply

The PR lists per-day old → new in **12-hour wording**, because that's what the client
will check: *"Friday: 11 AM–10 PM → 11 AM–9 PM."* The preview email (pipeline step 11)
echoes the full new week back. The person who knows the real hours is the error-catcher
of last resort, and their "looks good" is what publishes it.

## Edge cases seen coming

- **One-off exceptions** ("closed July 4") — the weekly schema can't represent dates,
  by decision (DECISIONS.md, 2026-06-10). Put it in `hours.notes` ("Closed July 4") and
  add a private/TODOS.md reminder to remove the note afterward. A dated-exceptions schema stays
  in the parking lot unless notes-juggling becomes a recurring chore.
- **Split hours** ("11–2, then 5–9") — not representable; one open/close per day.
  Escalate; known limitation, candidate v2 schema change.
- **Time zones:** hours are local to the restaurant. Never convert them.

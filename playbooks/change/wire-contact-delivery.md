# Wire contact-form delivery (Resend)

## Use when

A spoke's contact form validates and spam-checks but only logs — the state every site
ships in until this runs. Do it as part of go-live, before the site is promoted to the
client.

This is **customer→client** mail: a visitor writes, the *client* receives. It never
enters the agent's intake pipeline and the agency never sees the submissions
(DECISIONS, 2026-06-10). Client→agency change requests are the other flow
([../setup-email-intake.md](../setup-email-intake.md)).

## Inputs required

| Input | Where from | Never |
|---|---|---|
| Client's destination address | The client record (ask the client if absent — rule 5) | Never guess or reuse the owner's address |
| Intake/agency domain | `FLEET.md` § Intake | — |
| Resend API key | `~/.config/hangar/resend-token` | Never in the repo, the PR, or a content file |

The form sends **from your agency domain** (e.g. `forms@<intake-domain>`) with the
visitor as `Reply-To`, not from the client's domain: the free tier allows 3 verified
domains total, and sending as a domain you don't control invites DMARC failures. The
client sees the visitor's name in the subject and hits Reply to answer them directly.

## Recipe

1. **Branch** in the spoke: `change/<yyyymmdd>-contact-delivery`.
2. **Set the Pages secrets** on the project (both, production and preview):

   ```bash
   npx wrangler pages secret put RESEND_API_KEY --project-name <slug>
   npx wrangler pages secret put CONTACT_FORWARD_TO --project-name <slug>
   npx wrangler pages secret put CONTACT_FROM_DOMAIN --project-name <slug>
   ```

   `CONTACT_FORWARD_TO` is the client's address; `CONTACT_FROM_DOMAIN` is the agency
   domain from `FLEET.md` (kept a secret rather than hardcoded so no real domain lands
   in a tracked file — rule 9). Secrets are set on the project, not in the repo —
   nothing here is committed.
3. **Replace the `TODO(delivery)` block** in `functions/api/contact.ts`. Keep the
   honeypot and time-trap checks above it exactly as they are:

   ```ts
   const sent = await fetch("https://api.resend.com/emails", {
     method: "POST",
     headers: {
       Authorization: `Bearer ${env.RESEND_API_KEY}`,
       "Content-Type": "application/json",
     },
     body: JSON.stringify({
       from: `<site name> forms <forms@${env.CONTACT_FROM_DOMAIN}>`,
       to: [env.CONTACT_FORWARD_TO],
       reply_to: replyTo,
       subject: `New message from ${name}`,
       text: `From: ${name} <${replyTo}>\n\n${message}`,
     }),
   });

   // A delivery failure must never look like success to the visitor, and must never
   // lose the message: log the full submission so it can be recovered from tail logs.
   if (!sent.ok) {
     console.error("contact delivery failed", sent.status, await sent.text(), { name, replyTo, message });
     return new Response("Sorry — that didn't send. Please email us directly.", { status: 502 });
   }
   ```

4. **Keep the redirect to `/thanks`** on success, and keep spam rejections redirecting
   there too (bots learn nothing).

## Validate

1. `npm run build` in the spoke.
2. Deploy the branch preview and **submit the form for real** — fill it slowly (the
   time-trap needs >3s). Confirm the mail arrives at the destination and that **Reply**
   addresses the visitor, not the agency.
3. Check the delivery in Resend (Emails → sent) and `npx wrangler pages deployment tail
   --project-name <slug>` for the function's logs.
4. Negative test: a submission with the honeypot filled should redirect to `/thanks`
   and send nothing.

## PR & reply

PR states which address receives submissions (the client's own), that the mail sends
from the agency domain with visitor Reply-To, and includes the successful test. Never
paste the API key or a real submission body into the PR.

Client reply: "Your contact form now delivers to <their address>; reply straight to the
sender. Test message sent — check it arrived."

## Edge cases

- **Client changes their address** → update `CONTACT_FORWARD_TO` (a secret change, no
  code change, no PR — note it in the client record and CHANGELOG).
- **Volume:** the free tier is 3,000/month and **100/day across the whole fleet**,
  contact forms plus intake replies together. A site that gets popular can exhaust it —
  watch this as clients accumulate; it's the first thing that will force a paid plan.
- **Client wants mail *from* their own domain** (not just Reply-To) → their domain must
  be verified in Resend with its own DKIM/SPF records, which counts against the 3-domain
  cap and needs DNS access. Treat as a project decision, not a routine change.
- **Attachments / file uploads** are out of scope; the form is text-only by design.

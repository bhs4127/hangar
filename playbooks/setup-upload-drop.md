# Setup — the upload drop

## Use when

A client has more photos than an email can carry: a photo shoot, a new gallery, a
season's worth of products. Mail clients cap attachments at 20–25MB and quietly turn
anything bigger into a Drive, OneDrive, or iCloud link. The intake loop doesn't follow
links in an email body, so those photos would otherwise arrive as links we can't use.

The upload drop is one place we control: each client gets a personal link to a page
that accepts photos and nothing else. Files land in a private R2 bucket, are listed by
the mail sweep, and are pulled into a spoke by the normal image playbook. Uploads are
deleted automatically after **30 days**. Whatever ships lives in the spoke repo
(DECISIONS 2026-10-07).

A few photos still go by email. The drop is for batches.

## The rules that make it safe

1. **An upload is not a request.** Photos in the drop make nothing happen. What they're
   for arrives by email from a verified sender, through the normal loop (rules 6–7). The
   page has no message box, on purpose. Photos with no matching email wait. If they sit
   unexplained, ask the client.
2. **A link is not identity.** Anyone holding a client's link can upload with it (a
   forwarded email, a staff member). That's acceptable because of rule 1. If a link leaks,
   or uploads arrive that the client didn't send, **revoke and re-mint** it.
3. **Uploaded files are untrusted.** The Worker only stores files whose first bytes
   identify them as JPEG, PNG, WebP, HEIC, AVIF, or TIFF, up to 50MB each. That's a
   filter, not a guarantee. Open and check every file before it goes near a spoke, and
   let [change/replace-an-image.md](change/replace-an-image.md) re-encode it (which
   strips metadata such as GPS) and size it.
4. **The sweep only lists.** `mail-sweep.mjs` can list uploads. It can't download them,
   mint links, or revoke them. Those are attended commands in `upload-drop.mjs`.

## How it fits together

| Piece | Where | Tracked? |
|---|---|---|
| Worker code (page, upload, admin API) | `automation/upload-drop/worker.js` | shared |
| Operator CLI | `automation/upload-drop.mjs` | shared |
| Sweep's list-only view | `automation/mail-sweep.mjs uploads-new` | shared |
| Deploy config (account, domain, agency name) | `private/upload-drop/wrangler.jsonc` (seed: `private.example/upload-drop/`) | private |
| Drop URL | `~/.config/hangar/upload-drop-url`, and `private/FLEET.md` § Intake | outside every repo / private |
| Admin token | `~/.config/hangar/upload-admin-token` and the Worker secret `ADMIN_TOKEN` | outside every repo |
| A client's link | the client record, § Channels notes ("upload link") | private |

Bucket layout: `links/<sha256 of token>.json` holds `{ slug, label, created }` and never
expires. `uploads/<slug>/<yyyy-mm-dd>/<time>-<rand>-<name>.<ext>` holds the files and
expires after 30 days. The bucket stores only a hash of each token, so a lost link can't
be recovered from it. Re-send the one in the client record, or mint a new one.

Limits per client per UTC day: 300 files and 2GB. The free tier covers 10GB stored,
and 30-day expiry keeps the bucket well under it.

## One-time setup

Run from the hangar root. Wrangler must be logged in to the account in
`private/FLEET.md` (`npx wrangler login`, interactive, once per machine).

1. **Enable R2** on the account if it isn't already (dashboard → R2 → enable the free
   plan; Cloudflare asks for a payment method even on the free tier). This is a
   dashboard click the owner makes.
2. **Create the bucket and the 30-day rule.** The rule is scoped to `uploads/` so links
   never expire:

   ```bash
   npx wrangler r2 bucket create hangar-uploads
   npx wrangler r2 bucket lifecycle add hangar-uploads expire-uploads uploads/ --expire-days 30 --force
   ```

3. **Seed the private config.** `private/upload-drop/wrangler.jsonc` comes from
   `private.example/upload-drop/`. Fill in the account ID, `upload.<intake-domain>`, and
   the agency name from `private/FLEET.md`.
4. **Deploy.** The custom domain is created with the deploy, because the intake domain's
   zone is already on the account. Until step 5 sets the secret, the admin API refuses
   every call, so this order is safe (and `secret put` needs the Worker to exist):

   ```bash
   npx wrangler deploy -c private/upload-drop/wrangler.jsonc
   ```

5. **Set the admin token.** Generate it into the config file, then hand the same file to
   wrangler. The value never appears on screen:

   ```bash
   node -e "process.stdout.write(require('crypto').randomBytes(32).toString('base64url'))" > ~/.config/hangar/upload-admin-token && chmod 600 ~/.config/hangar/upload-admin-token
   ```

   ```bash
   npx wrangler secret put ADMIN_TOKEN -c private/upload-drop/wrangler.jsonc < ~/.config/hangar/upload-admin-token
   ```

6. **Record the URL.** Write `https://upload.<intake-domain>` to
   `~/.config/hangar/upload-drop-url` and add it to `private/FLEET.md` § Intake.
7. **Start the sweep's upload watermark** at "now", so the first sweep reports nothing
   old:

   ```bash
   node -e "require('fs').writeFileSync(require('os').homedir()+'/.config/hangar/upload-sweep-state.json', JSON.stringify({last_uploaded:new Date().toISOString(),last_key:'',updated_at:new Date().toISOString().slice(0,10)})+'\n',{mode:0o600})"
   ```

8. **Smoke test.** Mint a link for a test client, upload one photo from a phone, then
   `list` it, `fetch` it, `revoke` the link, and confirm the page now says the link
   isn't active.

Redeploying after a code change is step 4 again. The secret and the bucket stay.

## Per client

```bash
node automation/upload-drop.mjs link <slug> "<client name as they'd recognise it>"
```

This prints the link **once**. Put it in the client record's Channels notes with the
date. The label is shown on the page ("For Marisol's Taqueria"), so the client can see
they're in the right place. Then it goes in the welcome email
([setup-email-intake.md](setup-email-intake.md) § The welcome email), or in a reply when
a client tries to send a batch by email.

| Command | Does |
|---|---|
| `node automation/upload-drop.mjs links` | every active link: slug, label, created |
| `node automation/upload-drop.mjs revoke <slug>` | kills every link for that client; uploads stay until they expire |
| `node automation/upload-drop.mjs list [<slug>] [<since>]` | what's in the bucket |
| `node automation/upload-drop.mjs fetch uploads/<slug>/<date>/ <scratch dir>` | download a day's batch (or one key) to a scratch directory, never into a repo |

## When photos arrive

1. The mail sweep reports them ("Marisol: 34 files, 210MB") next to any email from the
   same client. Reporting is all the sweep does.
2. In an attended session, take the matching email through the normal loop. The
   request says what the photos are for. If there is no email yet, wait. If they've sat
   for a few days, draft a short question for the owner to send.
3. `fetch` the batch to a scratch directory, look at every file, and continue with the
   change playbook ([change/replace-an-image.md](change/replace-an-image.md), or the
   build playbook for a new gallery).

## Retiring a client

At handoff or departure, `revoke` their link and note it in the record. There's nothing
to transfer: anything still in the bucket expires within 30 days.

## Known gaps

- **No upload notification.** Uploads wait for the next sweep, the same as mail.
- **One link per client.** Revoking it locks out everyone at that client until the new
  link reaches them.
- **No resumable uploads.** A dropped connection fails that one file, and the page says
  to try again. Files are sent one by one, up to three at a time, so a dropped
  connection costs one file, not the batch.

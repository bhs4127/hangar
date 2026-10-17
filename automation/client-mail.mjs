#!/usr/bin/env node
// Client email from a client's intake alias: preview links, "it's live" notes, clarifying
// questions, welcome and handoff notes (playbooks/README.md steps 11 and 14,
// setup-email-intake.md). Attended sessions only, and only after the owner has okayed
// that email (DECISIONS 2026-10-17). The unattended mail sweep never calls this: its
// allow rule covers automation/mail-sweep.mjs alone, so keep sending out of that file.
//
//   node automation/client-mail.mjs send --slug <slug> --to <addr>[,<addr>] [--cc <addr>,...]
//        --text-file <path> (--reply-to-received <resend-id> | --subject "<subject>")
//        [--references "<msg-id> <msg-id>"] [--send]
//   node automation/client-mail.mjs status <email-id>
//
// `send` is a dry run unless --send is given: it prints exactly what would go out.
// With --send it sends, then waits for Resend to report delivered (or bounced).
//
// Guards, so a slip can't mail the wrong person:
//   - every To/Cc address must be an `email` channel in private/clients/<slug>.md (rule 7);
//   - From is always "<agency name>" <slug>@requests.<intake domain>, both read from
//     private/FLEET.md at call time (rule 9), so replies land back in intake;
//   - --reply-to-received threads the email under that inbound message (In-Reply-To,
//     References, "Re: <subject>") and refuses if it was sent to a different alias.
//
// Secret: ~/.config/hangar/resend-token (full access), read at call time, never printed.
// Exit codes: 0 ok · 1 usage/validation error · 3 Resend failed · 4 bounced/not delivered

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESEND = "https://api.resend.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL = /^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/;

function die(code, msg) {
  process.stderr.write(`client-mail: ${msg}\n`);
  process.exit(code);
}

function read(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    die(1, `${label} not readable at ${path}`);
  }
}

const resendKey = () => read(join(homedir(), ".config", "hangar", "resend-token"), "Resend key").trim();

async function resend(method, path, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(RESEND + path, {
      method,
      headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
    if (res?.ok) return res.json();
    // Never retry a send that may have gone through; only retry reads and clear 5xx.
    if (method !== "GET" && res && res.status < 500) die(3, `Resend ${res.status}: ${await res.text()}`);
    if (method !== "GET" && !res) die(3, "send timed out: check Resend before retrying, it may have gone");
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  die(3, `Resend ${method} ${path} failed after retries`);
}

/** Agency display name + intake domain from private/FLEET.md (never hard-coded here). */
function fleet() {
  const text = read(join(ROOT, "private", "FLEET.md"), "private/FLEET.md");
  const row = (key) => text.split("\n").find((l) => l.includes(`**${key}**`))?.split("|")[2]?.trim() ?? "";
  const agency = row("Agency / operator name").replace(/\s*\(.*$/, "").replace(/`/g, "").trim();
  const domain = row("Intake domain").match(/`([^`]+)`/)?.[1] ?? "";
  if (!agency || agency === "TBD") die(1, "FLEET.md has no agency name");
  if (!domain || domain === "TBD") die(1, "FLEET.md has no intake domain");
  return { agency, domain };
}

/** The `email` rows of the client's Channels table: the only addresses we may write to. */
function registered(slug) {
  const text = read(join(ROOT, "private", "clients", `${slug}.md`), `client record ${slug}.md`);
  const out = new Set();
  for (const line of text.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells[1] === "email") cells[2].match(/`([^`]+)`/g)?.forEach((m) => out.add(m.slice(1, -1).toLowerCase()));
  }
  return out;
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) die(1, `unexpected argument: ${a}`);
    const k = a.slice(2);
    if (k === "send") o.send = true;
    else if (i + 1 < argv.length) o[k] = argv[++i];
    else die(1, `${a} needs a value`);
  }
  return o;
}

const list = (v) => (v ? v.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : []);

async function waitDelivered(id) {
  for (let i = 0; i < 12; i++) {
    const m = await resend("GET", `/emails/${id}`);
    if (m.last_event && !["queued", "sent", "scheduled"].includes(m.last_event)) return m.last_event;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return "sent (no delivery event yet)";
}

async function send(o) {
  if (!SLUG.test(o.slug ?? "")) die(1, "--slug <client-slug> is required");
  if (!o["text-file"]) die(1, "--text-file <path> is required (write the body in a scratch dir, never a repo)");
  const to = list(o.to), cc = list(o.cc);
  if (!to.length) die(1, "--to is required");
  const allowed = registered(o.slug);
  for (const a of [...to, ...cc]) {
    if (!EMAIL.test(a)) die(1, `not an email address: ${a}`);
    if (!allowed.has(a)) die(1, `${a} is not a registered email channel of ${o.slug} (rule 7)`);
  }
  const { agency, domain } = fleet();
  const alias = `${o.slug}@requests.${domain}`;
  const text = read(o["text-file"], "text file");
  if (!text.trim()) die(1, "text file is empty");

  let subject = o.subject, headers;
  if (o["reply-to-received"]) {
    if (!UUID.test(o["reply-to-received"])) die(1, "--reply-to-received takes a Resend id");
    const m = await resend("GET", `/emails/receiving/${o["reply-to-received"]}`);
    const sentTo = (m.to ?? []).map((a) => String(a).toLowerCase());
    if (!sentTo.includes(alias)) die(1, `that message was sent to ${sentTo.join(", ")}, not ${alias}`);
    if (!m.message_id) die(1, "that message has no Message-ID to thread under");
    const refs = [o.references, m.message_id].filter(Boolean).join(" ");
    headers = { "In-Reply-To": m.message_id, References: refs };
    subject ??= /^re:/i.test(m.subject ?? "") ? m.subject : `Re: ${m.subject ?? ""}`.trim();
  } else if (o.references) {
    die(1, "--references needs --reply-to-received");
  }
  if (!subject) die(1, "--subject is required when not replying to a received message");

  const email = { from: `"${agency}" <${alias}>`, to, ...(cc.length && { cc }), subject, text, ...(headers && { headers }) };
  if (!o.send) {
    process.stdout.write(`DRY RUN (add --send to send)\n${JSON.stringify(email, null, 2)}\n`);
    return;
  }
  const { id } = await resend("POST", "/emails", email);
  const event = await waitDelivered(id);
  process.stdout.write(`${JSON.stringify({ id, to, cc, subject, last_event: event })}\n`);
  if (event !== "delivered" && !event.startsWith("sent")) process.exit(4);
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === "send") await send(args(rest));
else if (cmd === "status") {
  if (!UUID.test(rest[0] ?? "")) die(1, "status <email-id>");
  const m = await resend("GET", `/emails/${rest[0]}`);
  process.stdout.write(`${JSON.stringify({ id: m.id, to: m.to, subject: m.subject, last_event: m.last_event, created_at: m.created_at })}\n`);
} else die(1, "usage: send --slug … --to … --text-file … (--reply-to-received <id> | --subject …) [--send] · status <id>");

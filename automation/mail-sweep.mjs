#!/usr/bin/env node
// The daily mail sweep's only door to the outside world (playbooks/daily-mail-sweep.md).
//
// The unattended sweep calls this script and nothing else, so one permission rule
// (`Bash(node automation/mail-sweep.mjs:*)`) covers every run, and the script's
// surface is the sweep's surface: it can READ received mail from Resend, LIST (never
// download) what clients put in the upload drop, send ONE Telegram message to the owner,
// and move the two watermarks. It cannot send email, delete anything in Resend, mint or
// revoke upload links, fetch an uploaded file, or reach any other host. Keep it that
// way. Widening this file widens what an unattended run can do (DECISIONS 2026-09-30,
// 2026-10-07).
//
//   node automation/mail-sweep.mjs list-new            → JSON: messages newer than the watermark, oldest first
//   node automation/mail-sweep.mjs get <id>            → JSON: one message (auth, text, attachment metadata)
//   node automation/mail-sweep.mjs push '<line>' ...   → send the digest to the owner on Telegram (one arg per line)
//   node automation/mail-sweep.mjs advance <id>        → move the watermark to that message (must be newer)
//   node automation/mail-sweep.mjs status              → print the watermark
//   node automation/mail-sweep.mjs uploads-new         → JSON: upload-drop files newer than the upload watermark, per client
//   node automation/mail-sweep.mjs advance-uploads <iso> <key> → move the upload watermark to that file (must be newer)
//
// Secrets are read from files at call time and never printed:
//   ~/.config/hangar/resend-token, ~/.config/hangar/telegram-chat-id,
//   ~/.claude/channels/telegram/.env (TELEGRAM_BOT_TOKEN=),
//   ~/.config/hangar/upload-drop-url, ~/.config/hangar/upload-admin-token
// Exit codes: 0 ok · 1 usage/validation error · 2 watermark missing/unreadable · 3 upstream failed after retries

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const HOME = homedir();
const CONFIG = join(HOME, ".config", "hangar");
const WATERMARK = join(CONFIG, "mail-sweep-state.json");
const UPLOAD_WATERMARK = join(CONFIG, "upload-sweep-state.json");
const RESEND = "https://api.resend.com";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ATTEMPTS = 8; // Resend's receiving endpoints throw frequent 500s; backoff 1,2,4,8 then 15s steps (~60s total)
const TIMEOUT_MS = 20_000;
const PAGE = 10;

function die(code, msg) {
  process.stderr.write(`mail-sweep: ${msg}\n`);
  process.exit(code);
}

function secret(path, label) {
  try {
    const v = readFileSync(path, "utf8").trim();
    if (!v) throw new Error("empty");
    return v;
  } catch {
    die(1, `${label} not readable at ${path}`);
  }
}

const resendKey = () => secret(join(CONFIG, "resend-token"), "Resend key");

function readWatermark() {
  let w;
  try {
    w = JSON.parse(readFileSync(WATERMARK, "utf8"));
  } catch {
    die(2, `watermark missing or unreadable at ${WATERMARK}; stop the sweep, do not sweep everything`);
  }
  if (!w.last_created_at || !w.last_id || Number.isNaN(Date.parse(w.last_created_at)))
    die(2, `watermark at ${WATERMARK} lacks a valid last_created_at/last_id`);
  return w;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, init, what) {
  let last = "";
  for (let i = 0; i < ATTEMPTS; i++) {
    if (i) await sleep(Math.min(1000 * 2 ** (i - 1), 15_000));
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok) return res.json();
      last = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break; // a 4xx won't fix itself
    } catch (e) {
      last = e.name === "TimeoutError" ? "timeout" : e.message;
    }
  }
  die(3, `${what} failed after retries (${last})`);
}

const resendGet = (path) =>
  request(`${RESEND}${path}`, { headers: { Authorization: `Bearer ${resendKey()}` } }, `Resend GET ${path.split("?")[0]}`);

const newer = (e, w) => {
  const a = Date.parse(e.created_at), b = Date.parse(w.last_created_at);
  return a > b || (a === b && e.id !== w.last_id && e.id > w.last_id);
};

async function listNew() {
  const w = readWatermark();
  const found = [];
  let after = null;
  // Resend lists newest first. Page until we reach the watermark or run out.
  for (let page = 0; page < 200; page++) {
    // Small pages on purpose: limit=100 times out server-side (~10s) and comes back as a 500.
    const q = new URLSearchParams({ limit: String(PAGE) });
    if (after) q.set("after", after);
    const res = await resendGet(`/emails/receiving?${q}`);
    const data = res.data ?? [];
    let reached = false;
    for (const e of data) {
      if (newer(e, w)) found.push(e);
      else reached = true;
    }
    if (reached || !res.has_more || !data.length) break;
    after = data[data.length - 1].id;
  }
  found.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const out = found.map(({ id, created_at, from, to, subject }) => ({ id, created_at, from, to, subject }));
  console.log(JSON.stringify({ watermark: w.last_created_at, count: out.length, messages: out }, null, 2));
}

async function get(id) {
  if (!UUID.test(id ?? "")) die(1, "get needs a Resend message id (uuid)");
  const m = await resendGet(`/emails/receiving/${id}`);
  // Attachment download URLs are dropped on purpose: the sweep never downloads.
  const attachments = (m.attachments ?? []).map(({ filename, content_type, size }) => ({ filename, content_type, size }));
  const { html, text } = m;
  console.log(JSON.stringify({
    id: m.id, created_at: m.created_at, from: m.from, to: m.to, cc: m.cc, reply_to: m.reply_to,
    subject: m.subject, message_id: m.message_id, authentication: m.authentication,
    attachments,
    text: text || null,
    html: text ? undefined : (html ?? null), // only when there is no plain-text part
  }, null, 2));
}

async function push(text) {
  if (!text?.trim()) die(1, "push needs the digest lines as arguments, one per line");
  const env = secret(join(HOME, ".claude", "channels", "telegram", ".env"), "Telegram .env");
  const token = env.match(/^TELEGRAM_BOT_TOKEN=(.+)$/m)?.[1]?.trim();
  if (!token) die(1, "TELEGRAM_BOT_TOKEN not found in the Telegram plugin's .env");
  const chat = secret(join(CONFIG, "telegram-chat-id"), "Telegram chat id");
  await request(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: text.slice(0, 4000), disable_web_page_preview: true }),
  }, "Telegram sendMessage");
  console.log("pushed");
}

async function advance(id) {
  if (!UUID.test(id ?? "")) die(1, "advance needs the Resend id of the newest reported message");
  const w = readWatermark();
  const m = await resendGet(`/emails/receiving/${id}`); // the position must be a real message
  if (!newer(m, w)) die(1, `${id} (${m.created_at}) is not newer than the watermark (${w.last_created_at}); refusing to move backwards`);
  // Overwrite, never append: the file holds one position and stays a few hundred bytes.
  const next = { last_created_at: m.created_at, last_id: m.id, updated_at: new Date().toISOString().slice(0, 10) };
  const tmp = `${WATERMARK}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, WATERMARK);
  console.log(JSON.stringify(next));
}

// ---------- upload drop: list only ----------

function readUploadWatermark() {
  let w;
  try {
    w = JSON.parse(readFileSync(UPLOAD_WATERMARK, "utf8"));
  } catch {
    die(2, `upload watermark missing or unreadable at ${UPLOAD_WATERMARK}; skip uploads, do not report everything`);
  }
  if (!w.last_uploaded || Number.isNaN(Date.parse(w.last_uploaded)) || typeof w.last_key !== "string")
    die(2, `upload watermark at ${UPLOAD_WATERMARK} lacks a valid last_uploaded/last_key`);
  return w;
}

const uploadNewer = (u, w) => u.uploaded > w.last_uploaded || (u.uploaded === w.last_uploaded && u.key > w.last_key);

async function uploadsSince(w) {
  const base = secret(join(CONFIG, "upload-drop-url"), "upload drop URL").replace(/\/+$/, "");
  const key = secret(join(CONFIG, "upload-admin-token"), "upload admin token");
  // since= is a coarse server-side filter; the exact cut (ties included) is uploadNewer.
  const since = new Date(Date.parse(w.last_uploaded) - 1).toISOString();
  const data = await request(`${base}/admin/uploads?since=${encodeURIComponent(since)}`,
    { headers: { Authorization: `Bearer ${key}` } }, "upload drop list");
  return (data.uploads ?? []).filter((u) => uploadNewer(u, w));
}

async function uploadsNew() {
  const w = readUploadWatermark();
  const found = await uploadsSince(w);
  // Grouped per client. Keys are generated by the Worker (no client-written text beyond a
  // slugified filename), but they still stay out of the Telegram digest.
  const clients = {};
  for (const u of found) {
    const c = (clients[u.slug] ??= { slug: u.slug, files: 0, bytes: 0, first: u.uploaded, last: u.uploaded, keys: [] });
    c.files++; c.bytes += u.size; c.last = u.uploaded; c.keys.push(u.key);
  }
  const newest = found.at(-1);
  console.log(JSON.stringify({
    watermark: w.last_uploaded, count: found.length,
    newest: newest ? { uploaded: newest.uploaded, key: newest.key } : null,
    clients: Object.values(clients),
  }, null, 2));
}

async function advanceUploads(iso, key) {
  if (Number.isNaN(Date.parse(iso ?? "")) || !key?.startsWith("uploads/"))
    die(1, "advance-uploads needs the newest reported upload's time and key (from uploads-new → newest)");
  const w = readUploadWatermark();
  const target = { uploaded: new Date(iso).toISOString(), key };
  if (!uploadNewer(target, w)) die(1, `${key} is not newer than the upload watermark (${w.last_uploaded}); refusing to move backwards`);
  // The position must be a real file the drop still holds.
  if (!(await uploadsSince(w)).some((u) => u.key === target.key && u.uploaded === target.uploaded))
    die(1, `${key} at ${target.uploaded} is not an upload newer than the watermark`);
  const next = { last_uploaded: target.uploaded, last_key: key, updated_at: new Date().toISOString().slice(0, 10) };
  const tmp = `${UPLOAD_WATERMARK}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, UPLOAD_WATERMARK);
  console.log(JSON.stringify(next));
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  "list-new": () => listNew(),
  get: () => get(args[0]),
  push: () => push(args.join("\n")),
  advance: () => advance(args[0]),
  status: () => console.log(JSON.stringify(readWatermark())),
  "uploads-new": () => uploadsNew(),
  "advance-uploads": () => advanceUploads(args[0], args[1]),
};
if (!commands[cmd])
  die(1, "usage: mail-sweep.mjs list-new | get <id> | push '<line>' ... | advance <id> | status | uploads-new | advance-uploads <iso> <key>");
await commands[cmd]();

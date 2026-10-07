#!/usr/bin/env node
// Meta (Instagram + Facebook Page) publishing for the agency's own social accounts.
//
// Uses the Instagram API *with Facebook Login*: one Page access token covers the Facebook
// Page and the Instagram professional account linked to it, and it is the only path that
// accepts a Reel uploaded straight from a local file (resumable upload), so nothing has to
// be hosted first. Standard Access is enough because the app only serves accounts the
// operator owns, so no App Review. Every post is owner-approved before it runs: publishing
// needs --publish, and the default is a dry run that changes nothing.
//
//   node automation/meta.mjs auth                         → short-lived user token → long-lived Page token; finds the IG account
//   node automation/meta.mjs status                       → token validity + scopes, IG account, publishing quota
//   node automation/meta.mjs reel <file.mp4> <caption.txt> [--cover-ms N] [--publish]
//                                                         → dry run checks the file; --publish uploads, waits, publishes
//
// Files (outside every repo, chmod 600, never printed):
//   ~/.config/hangar/meta-app.json         {"app_id": "...", "app_secret": "..."}  (owner writes, from the App Dashboard)
//   ~/.config/hangar/meta-user-token       short-lived user token from Graph API Explorer; `auth` consumes and deletes it
//   ~/.config/hangar/meta-page.json        Page token + IDs, written by `auth`
// Which Page to use, when the user manages several: private/FLEET.md § Meta "Facebook Page".
// Exit codes: 0 ok · 1 usage/config error · 3 upstream failed

import { readFileSync, writeFileSync, chmodSync, rmSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG = join(homedir(), ".config", "hangar");
const APP_FILE = join(CONFIG, "meta-app.json");
const USER_TOKEN_FILE = join(CONFIG, "meta-user-token");
const PAGE_FILE = join(CONFIG, "meta-page.json");
const FLEET = join(dirname(fileURLToPath(import.meta.url)), "..", "private", "FLEET.md");
const VERSION = "v26.0"; // Graph API; bump deliberately, not silently
const GRAPH = `https://graph.facebook.com/${VERSION}`;
const SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_posts",
  "instagram_basic", "instagram_content_publish", "business_management"];

function die(code, msg) {
  process.stderr.write(`meta: ${msg}\n`);
  process.exit(code);
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { die(1, `${label} not readable at ${path}`); }
}

function writeSecret(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
}

async function graph(path, { method = "GET", token, params = {}, headers = {}, body } = {}) {
  const url = new URL(path.startsWith("http") ? path : GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method, body,
    headers: { ...(token ? { Authorization: `OAuth ${token}` } : {}), ...headers } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    die(3, `${method} ${url.pathname} → ${res.status} ${e.type || ""} ${e.code || ""}: ${e.message || JSON.stringify(json)}`);
  }
  return json;
}

function fleetPageName() {
  try {
    const row = readFileSync(FLEET, "utf8").split("\n").find(l => /\*\*Facebook Page\*\*/.test(l));
    const m = row?.match(/`([^`]+)`/);
    return m && m[1] !== "TBD" ? m[1] : null;
  } catch { return null; }
}

async function auth() {
  const app = readJson(APP_FILE, "Meta app credentials");
  if (!app.app_id || !app.app_secret) die(1, `${APP_FILE} needs app_id and app_secret`);
  let short;
  try { short = readFileSync(USER_TOKEN_FILE, "utf8").trim(); } catch {
    die(1, `no user token at ${USER_TOKEN_FILE}. In Graph API Explorer, pick the app, add these permissions, ` +
      `Generate Access Token, copy it, then: pbpaste > ${USER_TOKEN_FILE}\n  ${SCOPES.join(", ")}`);
  }
  // 60-day user token → Page tokens derived from it carry no expiry (status confirms)
  const long = await graph("/oauth/access_token", { params: { grant_type: "fb_exchange_token",
    client_id: app.app_id, client_secret: app.app_secret, fb_exchange_token: short } });
  const pages = (await graph("/me/accounts", { token: long.access_token, params: {
    fields: "id,name,access_token,instagram_business_account{id,username}", limit: "100" } })).data || [];
  if (!pages.length) die(1, "the token sees no Pages: was pages_show_list granted, and the Page selected in the consent dialog?");
  const want = fleetPageName();
  const matches = want ? pages.filter(p => p.name === want) : pages;
  if (matches.length !== 1) {
    die(1, `${want ? `FLEET names "${want}"; ` : ""}found ${matches.length} matching of ${pages.length} Pages: ` +
      `${pages.map(p => `"${p.name}"`).join(", ")}. Set FLEET.md § Meta "Facebook Page" to the exact name.`);
  }
  const page = matches[0];
  const ig = page.instagram_business_account;
  writeSecret(PAGE_FILE, { page_id: page.id, page_name: page.name, page_token: page.access_token,
    ig_user_id: ig?.id || null, ig_username: ig?.username || null, graph_version: VERSION,
    created: new Date().toISOString() });
  rmSync(USER_TOKEN_FILE, { force: true });
  console.log(`Page: ${page.name} (${page.id})`);
  console.log(ig ? `Instagram: @${ig.username} (${ig.id})` :
    "Instagram: none linked. Link the IG professional account to this Page, then re-run auth.");
  console.log(`Token stored at ${PAGE_FILE}; the short-lived token file was deleted.`);
}

function pageCreds({ needIg = true } = {}) {
  const c = readJson(PAGE_FILE, "Page credentials (run `auth` first)");
  if (needIg && !c.ig_user_id) die(1, "no Instagram account on record: link it to the Page and re-run auth");
  return c;
}

async function status() {
  const c = pageCreds({ needIg: false });
  const app = readJson(APP_FILE, "Meta app credentials");
  const dbg = (await graph("/debug_token", { params: { input_token: c.page_token,
    access_token: `${app.app_id}|${app.app_secret}` } })).data;
  const exp = dbg.expires_at ? new Date(dbg.expires_at * 1000).toISOString() : "never";
  console.log(`Token: ${dbg.is_valid ? "valid" : "INVALID"} · type ${dbg.type} · expires ${exp}`);
  const missing = SCOPES.filter(s => !dbg.scopes?.includes(s));
  console.log(`Scopes: ${dbg.scopes?.join(", ")}${missing.length ? `\n  missing: ${missing.join(", ")}` : ""}`);
  console.log(`Page: ${c.page_name} (${c.page_id})`);
  if (!c.ig_user_id) return console.log("Instagram: none linked");
  const ig = await graph(`/${c.ig_user_id}`, { token: c.page_token,
    params: { fields: "username,name,followers_count,media_count,account_type" } });
  console.log(`Instagram: @${ig.username} · ${ig.followers_count} followers · ${ig.media_count} posts`);
  const q = (await graph(`/${c.ig_user_id}/content_publishing_limit`, { token: c.page_token,
    params: { fields: "quota_usage,config" } })).data?.[0];
  if (q) console.log(`Publishing quota: ${q.quota_usage} used of ${q.config?.quota_total} per ${q.config?.quota_duration / 3600}h`);
}

function probe(file) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json",
    "-show_streams", "-show_format", file], { encoding: "utf8" }));
  const v = out.streams.find(s => s.codec_type === "video");
  const a = out.streams.find(s => s.codec_type === "audio");
  return { v, a, duration: Number(out.format.duration), size: Number(out.format.size) };
}

async function reel(file, captionFile, flags) {
  if (!file || !captionFile) die(1, "usage: reel <file.mp4> <caption.txt> [--cover-ms N] [--publish]");
  if (!existsSync(file)) die(1, `no such file: ${file}`);
  const caption = readFileSync(captionFile, "utf8").trim();
  if (caption.length > 2200) die(1, `caption is ${caption.length} chars; Instagram's limit is 2,200`);
  const { v, a, duration, size } = probe(file);
  const problems = [];
  if (v?.codec_name !== "h264") problems.push(`video codec ${v?.codec_name}, want h264`);
  if (v && Math.abs(v.width / v.height - 9 / 16) > 0.01) problems.push(`aspect ${v.width}x${v.height}, want 9:16`);
  if (a && a.codec_name !== "aac") problems.push(`audio codec ${a.codec_name}, want aac`);
  console.log(`File: ${file} · ${v?.width}x${v?.height} ${v?.codec_name} · ${a ? a.codec_name : "no audio"} · ` +
    `${duration.toFixed(1)}s · ${(size / 1e6).toFixed(1)} MB`);
  console.log(`Caption (${caption.length} chars):\n---\n${caption}\n---`);
  if (problems.length) die(1, `not uploading: ${problems.join("; ")}`);

  const c = pageCreds();
  console.log(`Target: @${c.ig_username} (Instagram), as a Reel`);
  if (!flags.publish) return console.log("Dry run: nothing uploaded. Re-run with --publish once the owner approves.");

  const params = { upload_type: "resumable", media_type: "REELS", caption };
  if (flags.coverMs != null) params.thumb_offset = String(flags.coverMs);
  const container = await graph(`/${c.ig_user_id}/media`, { method: "POST", token: c.page_token, params });
  const bytes = readFileSync(file);
  await graph(container.uri || `https://rupload.facebook.com/ig-api-upload/${VERSION}/${container.id}`, {
    method: "POST", token: c.page_token, body: bytes,
    headers: { offset: "0", file_size: String(statSync(file).size) } });
  console.log(`Uploaded to container ${container.id}; waiting for processing…`);

  const deadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    const s = await graph(`/${container.id}`, { token: c.page_token, params: { fields: "status_code,status" } });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") die(3, `processing ${s.status_code}: ${s.status || ""}`);
    if (Date.now() > deadline) die(3, `still ${s.status_code} after 10 min; container ${container.id} can be published later`);
    await new Promise(r => setTimeout(r, 15000));
  }
  const pub = await graph(`/${c.ig_user_id}/media_publish`, { method: "POST", token: c.page_token,
    params: { creation_id: container.id } });
  const media = await graph(`/${pub.id}`, { token: c.page_token, params: { fields: "permalink,media_product_type" } });
  console.log(`Published ${media.media_product_type}: ${media.permalink}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = { publish: rest.includes("--publish") };
const ci = rest.indexOf("--cover-ms");
if (ci !== -1) flags.coverMs = Number(rest[ci + 1]);
const positional = rest.filter((x, i) => !x.startsWith("--") && rest[i - 1] !== "--cover-ms");

if (cmd === "auth") await auth();
else if (cmd === "status") await status();
else if (cmd === "reel") await reel(positional[0], positional[1], flags);
else die(1, "usage: meta.mjs auth | status | reel <file.mp4> <caption.txt> [--cover-ms N] [--publish]");

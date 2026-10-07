#!/usr/bin/env node
// Operator CLI for the upload drop (playbooks/setup-upload-drop.md). Attended use only:
// minting and revoking links and downloading files are owner-session work. The unattended
// mail sweep sees uploads through automation/mail-sweep.mjs, which can only list them.
//
//   node automation/upload-drop.mjs link <slug> "<label>"   → mint a client's upload link (prints the URL once)
//   node automation/upload-drop.mjs links                  → every active link: slug, label, created
//   node automation/upload-drop.mjs revoke <slug>           → kill every link for that client
//   node automation/upload-drop.mjs list [<slug>] [<since>] → uploads still in the bucket (≤ 30 days)
//   node automation/upload-drop.mjs fetch <key|prefix/> <dir> → download one file, or all under a prefix
//
// Reads ~/.config/hangar/upload-drop-url and ~/.config/hangar/upload-admin-token at call
// time and never prints the token. UPLOAD_DROP_URL / UPLOAD_ADMIN_TOKEN override both,
// for testing against `wrangler dev` only.
// Exit codes: 0 ok · 1 usage/validation error · 3 upstream failed

import { readFileSync, mkdirSync, createWriteStream, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, basename, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const CONFIG = join(homedir(), ".config", "hangar");
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

function die(code, msg) {
  process.stderr.write(`upload-drop: ${msg}\n`);
  process.exit(code);
}

function setting(env, file, label) {
  if (process.env[env]) return process.env[env].trim();
  try {
    const v = readFileSync(join(CONFIG, file), "utf8").trim();
    if (v) return v;
  } catch {}
  die(1, `${label} not readable at ${join(CONFIG, file)} (setup: playbooks/setup-upload-drop.md)`);
}

const base = () => setting("UPLOAD_DROP_URL", "upload-drop-url", "upload drop URL").replace(/\/+$/, "");
const token = () => setting("UPLOAD_ADMIN_TOKEN", "upload-admin-token", "upload admin token");

async function call(path, init = {}) {
  let res;
  try {
    res = await fetch(`${base()}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token()}` },
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    die(3, `${path.split("?")[0]} failed (${e.message})`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    die(res.status < 500 ? 1 : 3, `${init.method ?? "GET"} ${path.split("?")[0]} → HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  return res;
}

const print = (x) => console.log(JSON.stringify(x, null, 2));

async function link(slug, label) {
  if (!SLUG.test(slug ?? "") || !label) die(1, 'usage: link <slug> "<label shown on the page, e.g. the client name>"');
  const res = await call("/admin/links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug, label }),
  });
  print(await res.json());
}

async function list(slug, since) {
  if (slug && !SLUG.test(slug) && !Number.isNaN(Date.parse(slug))) [slug, since] = [undefined, slug];
  if (slug && !SLUG.test(slug)) die(1, "usage: list [<slug>] [<since ISO date>]");
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  const data = await (await call(`/admin/uploads${q}`)).json();
  const uploads = slug ? data.uploads.filter((u) => u.slug === slug) : data.uploads;
  print({ count: uploads.length, bytes: uploads.reduce((n, u) => n + u.size, 0), uploads });
}

async function fetchFiles(target, dir) {
  if (!target?.startsWith("uploads/") || !dir) die(1, "usage: fetch <uploads/…key | uploads/<slug>/[<date>/]> <dir>");
  let keys = [target];
  if (target.endsWith("/")) {
    const data = await (await call("/admin/uploads")).json();
    keys = data.uploads.filter((u) => u.key.startsWith(target)).map((u) => u.key);
    if (!keys.length) die(1, `nothing under ${target} (uploads expire after 30 days)`);
  }
  const out = resolve(dir);
  mkdirSync(out, { recursive: true });
  const saved = [];
  for (const key of keys) {
    const path = join(out, basename(key));
    if (existsSync(path)) die(1, `${path} already exists; refusing to overwrite`);
    const res = await call(`/admin/file?key=${encodeURIComponent(key)}`);
    await pipeline(Readable.fromWeb(res.body), createWriteStream(path, { flags: "wx" }));
    saved.push(path);
  }
  print({ dir: out, saved: saved.length, files: saved });
}

const [cmd, ...args] = process.argv.slice(2);
const commands = {
  link: () => link(args[0], args.slice(1).join(" ").trim()),
  links: async () => print(await (await call("/admin/links")).json()),
  revoke: async () => {
    if (!SLUG.test(args[0] ?? "")) die(1, "usage: revoke <slug>");
    print(await (await call(`/admin/links/${args[0]}`, { method: "DELETE" })).json());
  },
  list: () => list(args[0], args[1]),
  fetch: () => fetchFiles(args[0], args[1]),
};
if (!commands[cmd]) die(1, 'usage: upload-drop.mjs link <slug> "<label>" | links | revoke <slug> | list [<slug>] [<since>] | fetch <key|prefix/> <dir>');
await commands[cmd]();

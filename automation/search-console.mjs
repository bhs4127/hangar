#!/usr/bin/env node
// Search Console automation for playbooks/change/register-search-console.md.
//
// Registers a live domain as a Search Console *Domain property* end to end: it asks
// Google for the DNS verification token, adds that TXT record to the domain's
// Cloudflare zone (additive only, never replacing a record), waits for it to resolve
// publicly, verifies ownership, adds the property, and submits the sitemap. It runs as
// the agency Google account in FLEET.md § Google.
//
//   node automation/search-console.mjs auth                 → one-time browser consent; stores the refresh token
//   node automation/search-console.mjs register <domain>    → verify + add property + submit sitemap (idempotent)
//   node automation/search-console.mjs status [<domain>]    → properties, permission level, sitemap status
//
// What it can't do, because Google has no API for it: give a client access to the
// reports (Search Console → Settings → Users), or Bing's import from Search Console.
//
// Files (outside every repo, chmod 600, never printed):
//   ~/.config/hangar/google-oauth-client.json  Desktop OAuth client from Google Cloud (owner downloads)
//   ~/.config/hangar/google-token.json         refresh token, written by `auth`
//   ~/.config/hangar/cloudflare-token          scoped token (DNS:Edit) for the TXT record
// Exit codes: 0 ok · 1 usage/config error · 3 upstream failed

import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG = join(homedir(), ".config", "hangar");
const CLIENT_FILE = join(CONFIG, "google-oauth-client.json");
const TOKEN_FILE = join(CONFIG, "google-token.json");
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters",
  "https://www.googleapis.com/auth/siteverification",
];
const GSC = "https://www.googleapis.com/webmasters/v3";
const VERIFY = "https://www.googleapis.com/siteVerification/v1";
const CF = "https://api.cloudflare.com/client/v4";
const DOMAIN = /^(?!-)[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/;
const SITEMAP = "sitemap-index.xml"; // what @astrojs/sitemap emits; robots.txt points here (build DoD)

function die(code, msg) {
  process.stderr.write(`search-console: ${msg}\n`);
  process.exit(code);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    die(1, `${label} not readable at ${path}`);
  }
}

function oauthClient() {
  const c = readJson(CLIENT_FILE, "OAuth client").installed;
  if (!c?.client_id || !c?.client_secret) die(1, `${CLIENT_FILE} is not a Desktop ("installed") OAuth client`);
  return c;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(url, init, what) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await r.text();
  if (!r.ok) die(3, `${what} failed: HTTP ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

// ---------- Google auth ----------

async function auth() {
  const c = oauthClient();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("hex");

  // Loopback redirect (Google's flow for Desktop clients): a one-shot server on 127.0.0.1.
  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1");
      if (u.pathname !== "/") return res.writeHead(404).end();
      const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
      res.writeHead(ok ? 200 : 400, { "content-type": "text/plain" });
      res.end(ok ? "Hangar is authorized. You can close this tab." : "Authorization failed. Check the terminal.");
      server.close();
      ok ? resolve({ code: u.searchParams.get("code"), redirectUri }) : reject(new Error(u.searchParams.get("error") || "state mismatch"));
    });
    let redirectUri;
    server.listen(0, "127.0.0.1", () => {
      redirectUri = `http://127.0.0.1:${server.address().port}`;
      const url = new URL(c.auth_uri);
      url.search = new URLSearchParams({
        client_id: c.client_id,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state,
      });
      process.stderr.write(`Opening the browser. Sign in as the agency Google account (FLEET.md).\nIf it doesn't open: ${url}\n`);
      spawn("open", [url.toString()], { stdio: "ignore", detached: true }).on("error", () => {});
    });
    setTimeout(() => { server.close(); reject(new Error("timed out after 15 minutes")); }, 900_000).unref();
  }).catch((e) => die(1, `consent: ${e.message}`));

  const t = await call(c.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: redirectUri }),
  }, "token exchange");
  if (!t.refresh_token) die(3, "Google returned no refresh token; remove the app's access at myaccount.google.com/permissions and run auth again");
  const granted = (t.scope || "").split(" ");
  const missing = SCOPES.filter((s) => !granted.includes(s));
  if (missing.length) die(3, `consent didn't grant: ${missing.join(", ")}. Run auth again and tick every box`);
  writeFileSync(TOKEN_FILE, JSON.stringify({ refresh_token: t.refresh_token, scope: t.scope, created: new Date().toISOString() }, null, 2));
  chmodSync(TOKEN_FILE, 0o600);
  console.log(`authorized; refresh token stored at ${TOKEN_FILE}`);
}

async function accessToken() {
  const c = oauthClient();
  const { refresh_token } = readJson(TOKEN_FILE, "refresh token (run `auth` first)");
  const t = await call(c.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token, grant_type: "refresh_token" }),
  }, "token refresh (invalid_grant is expected weekly: the consent screen is in Testing on purpose, so tokens last 7 days; run `auth` again)");
  return t.access_token;
}

const google = (token) => (url, init = {}, what) =>
  call(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...init.headers } }, what);

// ---------- Cloudflare TXT (additive only) ----------

async function ensureTxt(domain, value) {
  let tok;
  try { tok = readFileSync(join(CONFIG, "cloudflare-token"), "utf8").trim(); } catch { die(1, "Cloudflare token not readable"); }
  const cf = (path, init = {}, what) => call(`${CF}${path}`, { ...init, headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" } }, what);
  const zones = await cf(`/zones?name=${domain}`, {}, "Cloudflare zone lookup");
  const zone = zones.result?.[0];
  if (!zone) die(1, `${domain} is not a zone on this Cloudflare account; add the TXT record wherever its DNS lives (playbook § Edge cases)`);
  const recs = await cf(`/zones/${zone.id}/dns_records?type=TXT&name=${domain}&per_page=100`, {}, "TXT lookup");
  const unquote = (s) => s.replace(/^"|"$/g, "");
  if (recs.result.some((r) => unquote(r.content) === value)) return "already present";
  await cf(`/zones/${zone.id}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "TXT", name: domain, content: `"${value}"`, ttl: 1, comment: "Search Console — agency account" }),
  }, "TXT create");
  return "added";
}

async function waitForTxt(domain, value) {
  for (let i = 0; i < 24; i++) {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${domain}&type=TXT`, { headers: { accept: "application/dns-json" } }).then((x) => x.json()).catch(() => ({}));
    if ((r.Answer || []).some((a) => a.data.replace(/"/g, "") === value)) return true;
    await sleep(5_000);
  }
  return false;
}

// ---------- commands ----------

async function register(domain) {
  if (!DOMAIN.test(domain || "")) die(1, "usage: register <domain>  (bare domain, e.g. example.com)");
  const g = google(await accessToken());
  const site = { type: "INET_DOMAIN", identifier: domain };
  const property = `sc-domain:${domain}`;

  const { token } = await g(`${VERIFY}/token`, { method: "POST", body: JSON.stringify({ site, verificationMethod: "DNS_TXT" }) }, "verification token");
  console.log(`TXT record: ${await ensureTxt(domain, token)}`);
  if (!(await waitForTxt(domain, token))) die(3, "TXT record not visible on public DNS after 2 minutes; run register again shortly");
  console.log("TXT record: resolves publicly");

  // Google's resolvers can lag the public one by a little; retry the verify a few times.
  for (let i = 0; ; i++) {
    const r = await fetch(`${VERIFY}/webResource?verificationMethod=DNS_TXT`, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: JSON.stringify({ site }),
    });
    if (r.ok) break;
    if (i === 5) die(3, `verification failed: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);
    await sleep(15_000);
  }
  console.log("ownership: verified");

  await g(`${GSC}/sites/${encodeURIComponent(property)}`, { method: "PUT" }, "add property");
  console.log(`property: ${property}`);

  const sitemap = `https://${domain}/${SITEMAP}`;
  const probe = await fetch(sitemap).catch(() => null);
  const isXml = probe?.ok && /xml/.test(probe.headers.get("content-type") || "");
  if (!isXml) {
    console.log(`sitemap: NOT submitted. ${sitemap} isn't serving XML (fix the spoke first, per the build DoD)`);
    return;
  }
  await g(`${GSC}/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(sitemap)}`, { method: "PUT" }, "submit sitemap");
  console.log(`sitemap: submitted ${sitemap}`);
}

async function status(domain) {
  if (domain && !DOMAIN.test(domain)) die(1, "usage: status [<domain>]");
  const g = google(await accessToken());
  const { siteEntry = [] } = await g(`${GSC}/sites`, {}, "list properties");
  const entries = domain ? siteEntry.filter((s) => s.siteUrl === `sc-domain:${domain}`) : siteEntry;
  if (!entries.length) return console.log(domain ? `sc-domain:${domain}: not a property on this account` : "no properties");
  for (const s of entries) {
    console.log(`${s.siteUrl}  (${s.permissionLevel})`);
    const { sitemap = [] } = await g(`${GSC}/sites/${encodeURIComponent(s.siteUrl)}/sitemaps`, {}, "list sitemaps");
    if (!sitemap.length) console.log("  sitemaps: none submitted");
    for (const m of sitemap) {
      const urls = (m.contents || []).reduce((n, c) => n + Number(c.submitted || 0), 0);
      const state = m.isPending ? "pending" : `${m.errors || 0} errors, ${m.warnings || 0} warnings`;
      console.log(`  ${m.path}  last read ${m.lastDownloaded || "never"}  ${state}  ${urls} URLs`);
    }
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "auth") await auth();
else if (cmd === "register") await register(args[0]);
else if (cmd === "status") await status(args[0]);
else die(1, "usage: auth | register <domain> | status [<domain>]");

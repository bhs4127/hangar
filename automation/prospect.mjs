#!/usr/bin/env node
// Prospect finder for playbooks/prospect.md: find local businesses, audit their current
// website, and rank the ones whose site is dated *and* who publish a way to reach them.
//
// It only ever READS public pages: OpenStreetMap (Overpass), each business's own site
// (homepage + up to two contact/about pages, robots.txt respected), and optionally
// Google's PageSpeed API. It never submits a form, never sends a message, and never
// guesses an email address: an address is recorded only if the business published it.
// Every scored signal stores its evidence, so a draft can quote what was actually seen
// and nothing more.
//
//   node automation/prospect.mjs find "<area>" [food|retail|services|professional|all]
//                                              → seed from OSM (independents with a website), merge into the list
//   node automation/prospect.mjs add <url> <vertical> [name…] → add one by hand (a directory, a referral, Places)
//   node automation/prospect.mjs audit [<domain>…]           → audit named, else unaudited or >30 days stale
//   node automation/prospect.mjs psi <n>                     → PageSpeed (mobile) on the top n that lack it
//   node automation/prospect.mjs top [n] [--all] [--json]    → ranked shortlist: contactable, not yet approached
//   node automation/prospect.mjs show <domain>               → one full record, JSON
//   node automation/prospect.mjs mark <domain> <status> [note…]
//                                              → drafted|sent|followed-up|replied|declined|won|skip
//   node automation/prospect.mjs followups                   → sent ≥7 days ago with no follow-up or reply
//   node automation/prospect.mjs suppress <domain|email>     → never contact again (opt-outs, declines, bounces)
//
// Data names real businesses, so it lives in the private layer (CLAUDE.md rule 9):
//   private/marketing/prospects.json   the list, keyed by domain
//   private/marketing/suppression.txt  one domain or email per line; checked before every fetch and listing
// Optional: ~/.config/hangar/pagespeed-key (PSI works without a key, at a low quota).
// Exit codes: 0 ok · 1 usage error · 2 private layer missing · 3 upstream failed

import { readFileSync, writeFileSync, renameSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "private", "marketing");
const LIST = join(DIR, "prospects.json");
const SUPPRESS = join(DIR, "suppression.txt");
const PSI_KEY = join(homedir(), ".config", "hangar", "pagespeed-key");
const OVERPASS = "https://overpass-api.de/api/interpreter";
const PSI = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const UA = "Mozilla/5.0 (compatible; hangar-prospect/1.0; one-time homepage check)";
const API_UA = "hangar-prospect/1.0"; // Overpass answers 406 to browser-style agents
const TIMEOUT_MS = 15_000;
const BODY_CAP = 2_000_000;
const CONCURRENCY = 4;
const STALE_DAYS = 30;
const FOLLOWUP_DAYS = 7;
const YEAR = new Date().getFullYear();
const STATUSES = ["drafted", "sent", "followed-up", "replied", "declined", "won", "skip"];

// Hosts that aren't the business's own site: social pages, directories, and ordering
// portals. A listing whose "website" is one of these has no real site, which is itself
// the finding. (A builder site like square.site or wordpress.com *is* their own site.)
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|linktr\.ee|yelp\.com|tiktok\.com|x\.com|twitter\.com|google\.com|business\.site|nextdoor\.com|foodeist\.com|res-menu\.net|menufy\.com|toasttab\.com|doordash\.com|ubereats\.com|grubhub\.com|allmenus\.com|menupix\.com|tripadvisor\.com)$/;
// Addresses that are never the business: platform, placeholder, and tracking domains.
const JUNK_EMAIL_DOMAIN = /(^|\.)(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com|godaddy\.com|squarespace\.com|schema\.org|wordpress\.(com|org)|w3\.org|mysite\.com)$/;
const JUNK_EMAIL_LOCAL = /^(no-?reply|do-?not-?reply|mailer-daemon|postmaster|abuse|webmaster)$/;
// TLS failures a browser would also refuse. Others (a missing intermediate, say) many
// browsers repair silently, so they're noted, never scored.
const CERT_DEFINITE = new Set(["CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN"]);

function die(code, msg) {
  process.stderr.write(`prospect: ${msg}\n`);
  process.exit(code);
}

// ---------- the list ----------

function load() {
  if (!existsSync(join(ROOT, "private"))) die(2, "private/ is missing; seed it (cp -R private.example private) before prospecting");
  if (!existsSync(LIST)) return { updated_at: null, prospects: {} };
  try {
    return JSON.parse(readFileSync(LIST, "utf8"));
  } catch {
    die(2, `${LIST} is unreadable; fix or restore it from the private repo, don't start over`);
  }
}

function save(db) {
  mkdirSync(DIR, { recursive: true });
  db.updated_at = new Date().toISOString();
  const tmp = `${LIST}.tmp`;
  writeFileSync(tmp, JSON.stringify(db, null, 2) + "\n");
  renameSync(tmp, LIST);
}

function suppression() {
  if (!existsSync(SUPPRESS)) return new Set();
  return new Set(
    readFileSync(SUPPRESS, "utf8")
      .split("\n")
      .map((l) => l.replace(/#.*/, "").trim().toLowerCase())
      .filter(Boolean),
  );
}

// Listings whose "website" is a social page are keyed by OSM id, so declining one
// suppresses that business, never all of facebook.com.
function keyOf(id, p) {
  const d = domainOf(p.website);
  return SOCIAL.test(d) ? id : d;
}
const isSuppressed = (sup, key) => sup.has(key);
const liveEmails = (sup, p) => (p.audit?.emails || []).filter((e) => !sup.has(e.address) && !sup.has(e.address.split("@")[1]));

function domainOf(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ---------- fetching ----------

async function readCapped(res) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.length;
    if (n >= BODY_CAP) {
      await reader.cancel();
      break;
    }
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function get(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,*/*;q=0.5" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = res.headers.get("content-type") || "";
    const body = /html|text\/plain/i.test(type) ? await readCapped(res) : (await res.body?.cancel(), "");
    return { ok: res.ok, status: res.status, finalUrl: res.url, body, headers: res.headers };
  } catch (err) {
    const code = err.name === "TimeoutError" ? "TIMEOUT" : err.cause?.code || err.code || err.message;
    return { ok: false, status: 0, error: String(code) };
  }
}

// RFC 9309 patterns: `*` matches anything, a trailing `$` anchors the end, else a prefix.
function robotsPattern(rule) {
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

// robots.txt rules for `*` (and for us by name). Longest match wins, Allow on a tie.
async function robotsFor(origin) {
  const r = await get(`${origin}/robots.txt`);
  if (!r.ok || !r.body) return () => true;
  const rules = [];
  let applies = false;
  let inAgents = false;
  for (const raw of r.body.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^(user-agent|allow|disallow)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [key, val] = [m[1].toLowerCase(), m[2].trim()];
    if (key === "user-agent") {
      if (!inAgents) applies = false;
      inAgents = true;
      if (val === "*" || /hangar-prospect/i.test(val)) applies = true;
    } else {
      inAgents = false;
      if (applies && val) rules.push({ allow: key === "allow", len: val.length, re: robotsPattern(val) });
    }
  }
  return (path) => {
    let best = null;
    for (const rule of rules)
      if (rule.re.test(path) && (!best || rule.len > best.len || (rule.len === best.len && rule.allow))) best = rule;
    return !best || best.allow;
  };
}

// ---------- reading a page ----------

const decodeEntities = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&")
    .replace(/&copy;/gi, "©")
    .replace(/&nbsp;/gi, " ");

const visibleText = (html) =>
  decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");

function links(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      out.push({ url: new URL(decodeEntities(m[1]), base), text: visibleText(m[2]).trim() });
    } catch {}
  }
  return out;
}

// Cloudflare's email obfuscation: hex string, first byte is the XOR key.
function cfDecode(hex) {
  const key = parseInt(hex.slice(0, 2), 16);
  let s = "";
  for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return s;
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

function emailsIn(html) {
  const found = new Set();
  for (const m of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) found.add(decodeURIComponent(decodeEntities(m[1])));
  for (const m of html.matchAll(/data-cfemail\s*=\s*["']([0-9a-f]+)["']/gi)) found.add(cfDecode(m[1]));
  for (const m of html.matchAll(/email-protection#([0-9a-f]+)/gi)) found.add(cfDecode(m[1]));
  for (const m of visibleText(html).matchAll(EMAIL)) found.add(m[0]);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi))
    for (const e of m[1].matchAll(EMAIL)) found.add(e[0]);
  return [...found]
    .map((e) => e.trim().toLowerCase().replace(/^mailto:/, ""))
    .filter((e) => {
      const [local, dom] = e.split("@");
      if (!local || !dom || JUNK_EMAIL_DOMAIN.test(dom) || JUNK_EMAIL_LOCAL.test(local)) return false;
      return !/\.(png|jpe?g|gif|webp|svg|avif)$/.test(e); // retina filenames: logo@2x.png
    });
}

const hasForm = (html) => /<form\b[\s\S]*?(<textarea\b|type\s*=\s*["']?email)[\s\S]*?<\/form>/i.test(html);

// Signals: { id, points, label, evidence }. Points say how strongly it reads as "dated"
// to the business owner, not how bad it is technically. Evidence is what a draft may quote.
function pageSignals(html, url, vertical) {
  const s = [];
  const notes = [];
  const text = visibleText(html);

  if (!/<meta\b[^>]*name\s*=\s*["']?viewport/i.test(html))
    s.push({ id: "no_viewport", points: 3, label: "not built for phones", evidence: `no viewport meta tag on ${url}` });

  if (/<frameset\b|<frame\b/i.test(html))
    s.push({ id: "frames", points: 3, label: "built with frames", evidence: `<frameset>/<frame> on ${url}` });

  if (/\.swf\b|application\/x-shockwave-flash/i.test(html))
    s.push({ id: "flash", points: 3, label: "uses Flash", evidence: `Flash object on ${url}` });

  const years = [];
  for (const m of text.matchAll(/(?:©|copyright)\s*(?:\d{4}\s*[-–—]\s*)?((?:19|20)\d{2})/gi)) years.push(Number(m[1]));
  if (years.length) {
    const latest = Math.max(...years);
    if (latest <= YEAR - 3)
      s.push({ id: "stale_copyright", points: 1, label: `footer says © ${latest}`, evidence: `newest copyright year on ${url} is ${latest}` });
  }

  const pdfs = links(html, url).filter(
    (l) => /\.pdf(\?|$)/i.test(l.url.pathname + l.url.search) && /menu|price|rates|services/i.test(l.url.pathname + " " + l.text),
  );
  if (pdfs.length) {
    const isMenu = pdfs.some((l) => /menu/i.test(l.url.pathname + " " + l.text));
    s.push({
      id: isMenu ? "pdf_menu" : "pdf_prices",
      points: vertical === "food" && isMenu ? 2 : 1,
      label: isMenu ? "menu is a PDF" : "prices are in a PDF",
      evidence: pdfs.map((l) => l.url.href).slice(0, 3).join(" "),
    });
  }

  const phone = text.match(/\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/);
  if (phone && !/href\s*=\s*["']tel:/i.test(html))
    s.push({ id: "no_tap_to_call", points: 1, label: "phone number isn't tappable", evidence: `"${phone[0]}" shown as plain text, no tel: link, on ${url}` });

  const jq = html.match(/jquery[.-]?(1\.\d+(?:\.\d+)?)(?:\.min)?\.js/i);
  if (jq) s.push({ id: "old_jquery", points: 1, label: `jQuery ${jq[1]}`, evidence: `jQuery ${jq[1]} loaded on ${url}` });

  if (/<!doctype\s+html\s+public/i.test(html) && !/<(main|header|nav|section|article)\b/i.test(html))
    s.push({ id: "pre_html5", points: 1, label: "pre-HTML5 markup", evidence: `legacy doctype, no HTML5 sections, on ${url}` });

  const gen = html.match(/<meta\b[^>]*name\s*=\s*["']generator["'][^>]*content\s*=\s*["']([^"']+)/i);
  if (gen) notes.push(`generator: ${gen[1]}`);

  return { signals: s, notes };
}

// ---------- audit one prospect ----------

async function audit(p) {
  const at = new Date().toISOString();
  const host = domainOf(p.website);
  if (SOCIAL.test(host))
    return {
      at,
      status: "ok",
      final_url: p.website,
      signals: [{ id: "site_is_social", points: 3, label: "no website of its own", evidence: `listed website is ${p.website}` }],
      notes: [],
      emails: [],
      form: null,
      pages: [],
    };

  const signals = [];
  const notes = [];
  const seed = new URL(/^https?:\/\//i.test(p.website) ? p.website : `https://${p.website}`);
  const path = seed.pathname || "/";

  let home = await get(`https://${seed.host}${path}`);
  if (!home.ok && home.status === 0) {
    const httpsErr = home.error;
    const plain = await get(`http://${seed.host}${path}`);
    if (!plain.ok && plain.status === 0)
      return { at, status: "unreachable", error: `https: ${httpsErr}; http: ${plain.error}`, signals: [], notes: [], emails: [], form: null, pages: [] };
    home = plain;
    if (CERT_DEFINITE.has(httpsErr))
      signals.push({ id: "https_broken", points: 2, label: "browsers warn the site isn't secure", evidence: `https certificate error ${httpsErr}; site only loads over http` });
    else if (/CERT|SSL|TLS/i.test(httpsErr)) notes.push(`https certificate problem (${httpsErr}); many browsers repair this one, so not scored`);
    else signals.push({ id: "no_https", points: 2, label: "no https", evidence: `https failed (${httpsErr}); site only loads over http` });
  }

  const blocked =
    [403, 429, 503].includes(home.status) &&
    (home.headers?.get("cf-mitigated") || /challenge-platform|just a moment|captcha/i.test(home.body || ""));
  if (blocked) return { at, status: "blocked", error: `HTTP ${home.status} bot challenge`, signals: [], notes, emails: [], form: null, pages: [] };
  if (!home.ok) return { at, status: "http_error", error: `HTTP ${home.status}`, signals: [], notes, emails: [], form: null, pages: [] };

  const final = new URL(home.finalUrl);
  if (final.protocol === "http:" && !signals.some((x) => x.id === "no_https" || x.id === "https_broken"))
    signals.push({ id: "no_https", points: 2, label: "no https", evidence: `${seed.host} redirects to ${final.href}` });
  if (SOCIAL.test(final.hostname.replace(/^www\./, "")))
    signals.push({ id: "site_is_social", points: 3, label: "no website of its own", evidence: `${seed.host} redirects to ${final.href}` });

  const allowed = await robotsFor(final.origin);
  if (!allowed(final.pathname)) return { at, status: "robots_disallow", final_url: final.href, signals: [], notes, emails: [], form: null, pages: [] };

  const page = pageSignals(home.body, final.href, p.vertical);
  signals.push(...page.signals);
  notes.push(...page.notes);

  const emails = new Map();
  const addEmails = (html, where) => {
    for (const e of emailsIn(html)) if (!emails.has(e)) emails.set(e, where);
  };
  addEmails(home.body, final.href);
  let form = hasForm(home.body) ? final.href : null;
  const pages = [final.href];

  const contactish = links(home.body, final.href)
    .filter((l) => l.url.hostname === final.hostname && /contact|about|location|visit|find-us|reach/i.test(l.url.pathname + " " + l.text))
    .filter((l) => l.url.href.split("#")[0] !== final.href && allowed(l.url.pathname))
    .map((l) => l.url.href.split("#")[0]);
  for (const url of [...new Set(contactish)].slice(0, 2)) {
    const r = await get(url);
    if (!r.ok || !r.body) continue;
    pages.push(url);
    addEmails(r.body, url);
    if (!form && hasForm(r.body)) form = url;
  }

  // The business's own domain first: info@theirplace.com beats a personal Gmail.
  const own = (e) => e.endsWith(`@${host}`) || e.endsWith(`.${host}`);
  const list = [...emails].map(([address, where]) => ({ address, where, own_domain: own(address) }));
  list.sort((a, b) => b.own_domain - a.own_domain);

  return { at, status: "ok", final_url: final.href, signals, notes, emails: list, form, pages };
}

const score = (p) => [...(p.audit?.signals || []), ...(p.psi?.signal ? [p.psi.signal] : [])].reduce((n, s) => n + s.points, 0);

async function pool(items, fn) {
  let i = 0;
  const run = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, run));
}

// ---------- OSM seed ----------

const FOOD_AMENITY = /^(restaurant|cafe|bar|pub|fast_food|ice_cream|biergarten)$/;
const FOOD_SHOP = /^(bakery|deli|butcher|confectionery|coffee|tea|pastry|seafood|cheese|chocolate)$/;
const PRO_OFFICE = /^(lawyer|accountant|tax_advisor|insurance|estate_agent|financial_advisor|notary|architect|therapist|surveyor)$/;
const PRO_AMENITY = /^(dentist|doctors|clinic|veterinary)$/;
const SERVICE_SHOP = /^(hairdresser|beauty|massage|tattoo|dry_cleaning|laundry|car_repair|tailor|optician|pet_grooming)$/;

function classify(t) {
  if (FOOD_AMENITY.test(t.amenity || "") || FOOD_SHOP.test(t.shop || "")) return "food";
  if (PRO_OFFICE.test(t.office || "") || PRO_AMENITY.test(t.amenity || "") || t.healthcare) return "professional";
  if (SERVICE_SHOP.test(t.shop || "") || t.craft) return "services";
  if (t.shop && t.shop !== "vacant") return "retail";
  return null;
}

async function find(area, want) {
  if (!area || /["\\]/.test(area)) die(1, 'usage: find "<area name>" [food|retail|services|professional|all]');
  if (!["food", "retail", "services", "professional", "all"].includes(want)) die(1, `unknown vertical "${want}"`);
  const key = '[~"^(website|contact:website)$"~"."]';
  const q = `[out:json][timeout:180];
area["boundary"="administrative"]["name"="${area}"]->.a;
(nwr(area.a)${key}[amenity]; nwr(area.a)${key}[shop]; nwr(area.a)${key}[office]; nwr(area.a)${key}[craft]; nwr(area.a)${key}[healthcare];);
out tags;`;
  let res;
  for (let i = 0; i < 4; i++) {
    if (i) await new Promise((r) => setTimeout(r, 15_000 * i)); // 504/429 mean "busy", and they pass
    res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "user-agent": API_UA, "content-type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(200_000),
    }).catch((e) => ({ ok: false, status: e.cause?.code || e.message }));
    if (res.ok || ![429, 502, 503, 504].includes(res.status)) break;
  }
  if (!res.ok) die(3, `Overpass failed (${res.status}); it's a shared free service, retry later`);
  const els = (await res.json()).elements || [];
  if (!els.length) die(1, `no OSM features with a website in "${area}". Check the exact admin-area name, e.g. "Travis County", not "Travis"`);

  // Chains: anything brand-tagged, or a website shared by 3+ locations in the area.
  const perSite = new Map();
  for (const e of els) {
    const d = domainOf(e.tags.website || e.tags["contact:website"]);
    if (d) perSite.set(d, (perSite.get(d) || 0) + 1);
  }

  const db = load();
  const sup = suppression();
  const tally = { added: 0, known: 0, chain: 0, suppressed: 0, other_vertical: 0 };
  for (const e of els) {
    const t = e.tags;
    const website = t.website || t["contact:website"];
    const domain = domainOf(website);
    const vertical = classify(t);
    if (!domain || !vertical) continue;
    if (want !== "all" && vertical !== want) { tally.other_vertical++; continue; }
    if (t.brand || t["brand:wikidata"] || (perSite.get(domain) >= 3 && !SOCIAL.test(domain))) { tally.chain++; continue; }
    const id = SOCIAL.test(domain) ? `${domain}/${e.type}/${e.id}` : domain; // many listings share facebook.com
    if (isSuppressed(sup, id)) { tally.suppressed++; continue; }
    if (db.prospects[id]) { tally.known++; continue; }
    db.prospects[id] = {
      name: t.name || domain,
      website,
      vertical,
      area,
      source: `osm:${e.type}/${e.id}`,
      found_at: new Date().toISOString(),
    };
    tally.added++;
  }
  save(db);
  console.log(`find "${area}" (${want}): ${els.length} OSM features with a website → ${JSON.stringify(tally)}`);
  console.log(`next: node automation/prospect.mjs audit`);
}

// ---------- commands ----------

async function cmdAudit(domains) {
  const db = load();
  const sup = suppression();
  const cutoff = Date.now() - STALE_DAYS * 864e5;
  const ids = domains.length
    ? domains.map((d) => (db.prospects[d] ? d : die(1, `${d} isn't in the list (add it first)`)))
    : Object.keys(db.prospects).filter((id) => !db.prospects[id].audit || Date.parse(db.prospects[id].audit.at) < cutoff);
  const todo = ids.filter((id) => !isSuppressed(sup, keyOf(id, db.prospects[id])) && !db.prospects[id].outreach);
  console.error(`auditing ${todo.length} site(s), ${CONCURRENCY} at a time…`);
  let done = 0;
  await pool(todo, async (id) => {
    db.prospects[id].audit = await audit(db.prospects[id]);
    if (++done % 10 === 0) {
      save(db); // a long run that dies keeps what it finished
      console.error(`  ${done}/${todo.length}`);
    }
  });
  save(db);
  const by = {};
  for (const id of todo) by[db.prospects[id].audit.status] = (by[db.prospects[id].audit.status] || 0) + 1;
  const withEmail = todo.filter((id) => liveEmails(sup, db.prospects[id]).length).length;
  console.log(`audited ${todo.length}: ${JSON.stringify(by)}; ${withEmail} publish an email`);
}

function ranked(db, sup, { all = false } = {}) {
  return Object.entries(db.prospects)
    .filter(([id, p]) => p.audit?.status === "ok" && !p.outreach && !isSuppressed(sup, keyOf(id, p)))
    .filter(([, p]) => all || liveEmails(sup, p).length || p.audit.form)
    .map(([id, p]) => ({ id, p, score: score(p) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name));
}

function cmdTop(args) {
  const n = Number(args.find((a) => /^\d+$/.test(a)) || 10);
  const db = load();
  const sup = suppression();
  const rows = ranked(db, sup, { all: args.includes("--all") }).slice(0, n);
  if (args.includes("--json")) {
    console.log(JSON.stringify(rows.map(({ id, p, score }) => ({ id, score, ...p, emails: liveEmails(sup, p) })), null, 2));
    return;
  }
  if (!rows.length) return console.log("nothing ranked: run find + audit first, or everyone contactable has been approached");
  for (const { id, p, score } of rows) {
    const email = liveEmails(sup, p)[0];
    const contact = email ? email.address + (email.own_domain ? "" : " (not their domain)") : p.audit.form ? `form: ${p.audit.form}` : "no contact found";
    const signals = [...p.audit.signals, ...(p.psi?.signal ? [p.psi.signal] : [])].map((s) => s.label).join("; ");
    console.log(`${String(score).padStart(2)}  ${p.name} (${id}, ${p.vertical})\n    contact: ${contact}\n    ${signals}`);
  }
}

async function cmdPsi(args) {
  const n = Number(args[0]);
  if (!n) die(1, "usage: psi <n>");
  const db = load();
  const sup = suppression();
  const key = existsSync(PSI_KEY) ? readFileSync(PSI_KEY, "utf8").trim() : null;
  const rows = ranked(db, sup).filter((r) => !r.p.psi && !r.p.audit.signals.some((s) => s.id === "site_is_social")).slice(0, n);
  for (const { id, p } of rows) {
    const q = new URLSearchParams({ url: p.audit.final_url, strategy: "mobile", category: "performance" });
    if (key) q.set("key", key);
    const res = await fetch(`${PSI}?${q}`, { signal: AbortSignal.timeout(90_000) }).catch((e) => ({ ok: false, status: e.message }));
    if (!res.ok) {
      console.error(`  ${id}: PageSpeed failed (${res.status})${key ? "" : "; no key at ~/.config/hangar/pagespeed-key, so the shared quota may be spent"}`);
      continue;
    }
    const lh = (await res.json()).lighthouseResult;
    const perf = Math.round((lh?.categories?.performance?.score ?? NaN) * 100);
    const lcp = lh?.audits?.["largest-contentful-paint"]?.numericValue;
    if (Number.isNaN(perf)) continue;
    const lcpS = lcp ? Math.round(lcp / 100) / 10 : null;
    const signal =
      perf < 50
        ? { id: "psi_slow", points: 2, label: `slow on phones (PageSpeed ${perf})`, evidence: `Google PageSpeed mobile performance ${perf}/100, LCP ${lcpS}s, ${new Date().toISOString().slice(0, 10)}` }
        : perf < 70
          ? { id: "psi_slow", points: 1, label: `sluggish on phones (PageSpeed ${perf})`, evidence: `Google PageSpeed mobile performance ${perf}/100, LCP ${lcpS}s, ${new Date().toISOString().slice(0, 10)}` }
          : null;
    p.psi = { at: new Date().toISOString(), performance: perf, lcp_s: lcpS, signal };
    save(db);
    console.log(`  ${id}: ${perf}/100, LCP ${lcpS}s`);
  }
}

function cmdMark(args) {
  const [id, status, ...note] = args;
  if (!id || !STATUSES.includes(status)) die(1, `usage: mark <domain> <${STATUSES.join("|")}> [note…]`);
  const db = load();
  const p = db.prospects[id] || die(1, `${id} isn't in the list`);
  const entry = { status, at: new Date().toISOString(), ...(note.length ? { note: note.join(" ") } : {}) };
  p.outreach = { ...entry, history: [...(p.outreach?.history || []), entry] };
  save(db);
  if (status === "declined") cmdSuppress([keyOf(id, p)], "declined");
  console.log(`${id} → ${status}`);
}

function cmdSuppress([target], why = "manual") {
  const t = (target || "").trim().toLowerCase();
  if (!t || /\s/.test(t) || !(t.includes("@") || t.includes("."))) die(1, "usage: suppress <domain|email>");
  if (suppression().has(t)) return console.log(`${t} already suppressed`);
  mkdirSync(DIR, { recursive: true });
  appendFileSync(SUPPRESS, `${t}  # ${why} ${new Date().toISOString().slice(0, 10)}\n`);
  console.log(`${t} suppressed`);
}

function cmdFollowups() {
  const db = load();
  const sup = suppression();
  const cutoff = Date.now() - FOLLOWUP_DAYS * 864e5;
  const due = Object.entries(db.prospects).filter(
    ([id, p]) => p.outreach?.status === "sent" && Date.parse(p.outreach.at) < cutoff && !isSuppressed(sup, keyOf(id, p)),
  );
  if (!due.length) return console.log("no follow-ups due");
  for (const [id, p] of due) console.log(`${id}  ${p.name}  sent ${p.outreach.at.slice(0, 10)}`);
}

function cmdAdd([url, vertical, ...name]) {
  const domain = domainOf(url || "");
  if (!domain || !["food", "retail", "services", "professional"].includes(vertical)) die(1, "usage: add <url> <food|retail|services|professional> [name…]");
  // A social page is keyed by its path (facebook.com/somecafe), like OSM's per-listing ids.
  const id = SOCIAL.test(domain) ? domain + new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).pathname.replace(/\/+$/, "") : domain;
  if (isSuppressed(suppression(), id)) die(1, `${id} is suppressed`);
  const db = load();
  if (db.prospects[id]) return console.log(`${id} already listed`);
  db.prospects[id] = { name: name.join(" ") || domain, website: url, vertical, source: "manual", found_at: new Date().toISOString() };
  save(db);
  console.log(`${id} added; audit it with: node automation/prospect.mjs audit ${id}`);
}

const [cmd, ...args] = process.argv.slice(2);
switch (cmd) {
  case "find": await find(args[0], args[1] || "all"); break;
  case "add": cmdAdd(args); break;
  case "audit": await cmdAudit(args); break;
  case "psi": await cmdPsi(args); break;
  case "top": cmdTop(args); break;
  case "show": console.log(JSON.stringify(load().prospects[args[0]] || die(1, `${args[0]} isn't in the list`), null, 2)); break;
  case "mark": cmdMark(args); break;
  case "followups": cmdFollowups(); break;
  case "suppress": cmdSuppress(args); break;
  default: die(1, "usage: find | add | audit | psi | top | show | mark | followups | suppress (see the header of this file)");
}

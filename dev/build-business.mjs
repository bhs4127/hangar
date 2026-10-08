#!/usr/bin/env node
/**
 * Generates private/business.html — the business seen by role (sales, marketing, finance,
 * delivery, client relations, operations, legal, IT), interactive and self-contained.
 * Derives entirely from the repo's own files so it can't drift:
 *
 *   - Current state per role: the "## Business" table in private/STATUS.md
 *     (columns: Role | Item | Status | Detail | As of)
 *   - Revenue journey: the "## Price list" table in private/STATUS.md
 *     (columns: Offer | Price | Stage | Status | Notes)
 *   - Open work, "your move", "waiting on clients": private/TODOS.md, routed to a role by
 *     the generic keyword rules below
 *   - Client board: private/clients/REGISTRY.md
 *   - Sales funnel: private/marketing/prospects.json (+ `prospect.mjs top --json`), if present
 *   - Decisions + activity per role: DECISIONS.md and private/CHANGELOG.md
 *
 * Drift: unknown roles or statuses, roles with no rows, open TODOs no rule can route, and
 * rows not confirmed in 14 days. Shown on the page and on stdout.
 *
 * Run from anywhere: `node dev/build-business.mjs`. Zero dependencies.
 * The HTML is generated — never hand-edit it (CLAUDE.md state-layer ritual).
 */

import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  ROOT, PRIVATE, read, stripMd, tableUnderHeading, parseRegistry, parsePipeline,
  parseTodos, parseDecisions, parseChangelog,
} from "./lib/state.mjs";

const OUT = join(PRIVATE, "business.html");
const STALE_DAYS = 14;

// ---------- roles (generic: no client or account names belong here) ----------

const ROLES = [
  { id: "sales", name: "Sales", blurb: "Offers, the prospect pipeline, leads, and closing",
    kw: ["prospect", "outreach", "cold email", "\\bleads?\\b(?!@)", "\\boffers?\\b", "competitor", "\\bpitch", "deposit", "pricing card", "\\bsales\\b", "referral", "walk-in", "funnel", "enquir"] },
  { id: "marketing", name: "Marketing", blurb: "Being found: the agency site, search, social, listings, and ads",
    kw: ["\\bseo\\b", "search console", "json-ld", "rich results", "sitemap", "social", "instagram", "facebook", "linkedin", "\\bmeta\\b", "\\breels?\\b", "business profile", "\\bgbp\\b", "google ads", "\\bads\\b", "campaign", "share card", "\\bog\\b", "\\bblog\\b", "analytics", "\\bbing\\b", "director(y|ies)", "marketing", "index(ing|ed)", "structured data", "\\btitles?\\b"] },
  { id: "finance", name: "Finance", blurb: "Prices, costs, billing, and what gets invoiced",
    kw: ["\\$\\d", "\\bprices?\\b", "pricing", "invoic", "\\bfees?\\b", "billing", "payment", "budget", "\\bspend\\b", "\\bcosts?\\b", "revenue", "renewal", "\\bpaid\\b", "paying", "stripe", "checkout", "free tier"] },
  { id: "delivery", name: "Client delivery", blurb: "Building and changing client sites",
    kw: ["\\bpr #?\\d", "preview", "\\bbuild\\b", "deploy", "\\bmerge", "\\b404\\b", "playbook", "schema", "vertical", "placeholder", "palette", "\\bimages?\\b", "photos?", "headshot", "navbar", "lighthouse", "\\bspokes?\\b", "go-live", "\\bcopy\\b", "content", "contact delivery", "\\bwire\\b"] },
  { id: "clients", name: "Client relations", blurb: "Who we're waiting on and what they've been told",
    kw: ["welcome", "\\breply\\b", "waiting on", "watch for", "client approv", "client confirm", "intake answers", "alias", "announce", "primary contact", "permission", "\\bclient's\\b"] },
  { id: "operations", name: "Operations", blurb: "The machinery: intake, the sweep, approvals, and hosts",
    kw: ["sweep", "intake", "pipeline", "upload drop", "upload batch", "telegram", "persistent host", "always-on", "scheduled", "watermark", "automation", "\\binbox\\b", "digest", "approvals", "operator session"] },
  { id: "legal", name: "Legal & compliance", blurb: "Entity, email law, ownership, accessibility, and consent",
    kw: ["can-spam", "postal address", "registrant", "\\bllc\\b", "\\bdba\\b", "\\baup\\b", "\\bterms\\b", "privacy", "consent", "hipaa", "\\bftc\\b", "disclosure", "accessibility", "compliance", "licen[cs]e", "registered agent", "\\blegal\\b", "handoff-ready"] },
  { id: "it", name: "IT & infrastructure", blurb: "Accounts, tokens, DNS, hosting, and security",
    kw: ["cloudflare", "\\btokens?\\b", "\\bdns\\b", "\\bmx\\b", "resend", "\\bworkers?\\b", "\\br2\\b", "wrangler", "\\bapi\\b", "\\bscopes?\\b", "oauth", "\\bmcp\\b", "redirect", "\\bwww\\b", "backup", "turnstile", "\\bspam\\b", "\\bzone\\b", "\\bdomains?\\b", "nameserver", "\\bssl\\b", "certificate", "hosting", "\\bpages\\b", "function"] },
];
const ROLE_RE = ROLES.map((r) => ({ id: r.id, res: r.kw.map((k) => new RegExp(k, "gi")) }));
const STATUSES = ["waiting-owner", "waiting-client", "blocked", "in-progress", "on-hold", "planned", "decided", "live"];

// Client sections ("Active — <client> (`vertical` …)") say nothing about the role of the
// work under them, so they route by the item text alone; anything waiting on a client is
// client relations whatever else it mentions.
function route(text, heading = "", { clientSection = false } = {}) {
  if (waitsOnClient(text, clientSection)) return "clients";
  if (clientSection) heading = "";
  const score = {};
  for (const { id, res } of ROLE_RE) {
    let s = 0;
    for (const re of res) {
      s += (text.match(re) || []).length;
      s += 2 * (heading.match(re) || []).length;
    }
    score[id] = s;
  }
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

const OWNER_RE = /(^|\W)owner(:|'s call| decision| decides| steps?| to | asks| will)|ask (the )?owner|needs the owner|\bask first\b/i;
const CLIENT_RE = /watch for|waiting on|client approv|client confirm|needs? (the )?client|intake answers|their reply|her reply|his reply/i;
const HOLD_RE = /\bon hold\b|\bparked\b|\bpinned\b|\bblocked\b/i;
const live = (t) => t.replace(/~~[^~]*~~/g, ""); // struck-through text is done, not pending
// Outside a client's own section, only an explicit "watch for" / "waiting on" means we're
// waiting; "needs client approval" there describes future work, not a current wait.
const waitsOnClient = (t, clientSection) => (clientSection ? CLIENT_RE : /watch for|waiting on/i).test(live(t));
const flagsOf = (t, clientSection) => ({ owner: OWNER_RE.test(live(t)), client: waitsOnClient(t, clientSection), hold: HOLD_RE.test(live(t)) });

// ---------- sources ----------

function parseBusiness(md) {
  const t = tableUnderHeading(md, /^##\s+Business\s*$/i);
  return t ? t.rows.filter((c) => c.length >= 4).map((c) => ({
    role: c[0].toLowerCase(), item: c[1], status: c[2].toLowerCase(), detail: c[3], asOf: c[4] || "",
  })) : [];
}

function parsePrices(md) {
  const t = tableUnderHeading(md, /^##\s+Price list/i);
  return t ? t.rows.filter((c) => c.length >= 4).map((c) => ({
    offer: c[0], price: c[1], stage: c[2].toLowerCase(), status: c[3].toLowerCase(), notes: c[4] || "",
  })) : [];
}

function agencyName(md) {
  const row = md.split("\n").find((l) => /^\|\s*\*\*Agency/i.test(l));
  return row ? stripMd(row.split("|")[2] || "").replace(/\s*\(.*$/, "") || null : null;
}

function prospectFunnel() {
  const file = join(PRIVATE, "marketing", "prospects.json");
  if (!existsSync(file)) return null;
  let db;
  try {
    db = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const all = Object.values(db.prospects || {});
  const st = (s) => all.filter((p) => p.outreach?.status === s || p.outreach?.history?.some((h) => h.status === s)).length;
  let ranked = null;
  try {
    const out = execFileSync(process.execPath, [join(ROOT, "automation", "prospect.mjs"), "top", "9999", "--json"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20000,
    });
    ranked = /^\s*\[/.test(out) ? JSON.parse(out).length : 0;
  } catch {
    ranked = null;
  }
  const verticals = {};
  for (const p of all) verticals[p.vertical || "?"] = (verticals[p.vertical || "?"] || 0) + 1;
  return {
    updated: db.updated_at || null,
    verticals,
    stages: [
      { k: "Found", n: all.length },
      { k: "Site audited OK", n: all.filter((p) => p.audit?.status === "ok").length },
      { k: "Publishes an email", n: all.filter((p) => p.audit?.emails?.length).length },
      ...(ranked == null ? [] : [{ k: "Ranked + contactable", n: ranked }]),
      { k: "Drafted", n: st("drafted") },
      { k: "Sent", n: st("sent") },
      { k: "Replied", n: st("replied") },
      { k: "Won", n: st("won") },
    ],
  };
}

// ---------- assemble ----------

const statusMd = read(join(PRIVATE, "STATUS.md"));
const rows = parseBusiness(statusMd);
const prices = parsePrices(statusMd);
const registry = parseRegistry(read(join(PRIVATE, "clients", "REGISTRY.md")));
const pipeline = parsePipeline(read(join(ROOT, "playbooks", "README.md")));
const todos = parseTodos(read(join(PRIVATE, "TODOS.md")));
const decisions = parseDecisions(read(join(ROOT, "DECISIONS.md")));
const changelog = parseChangelog(read(join(PRIVATE, "CHANGELOG.md")));
const agency = agencyName(read(join(PRIVATE, "FLEET.md"))) || "The business";

const clientKeys = registry.flatMap((c) => [c.name.replace(/[,(].*$/, "").trim(), c.slug]).map((k) => k.toLowerCase()).filter((k) => k.length >= 4);
const isClientSection = (h) => clientKeys.some((k) => h.toLowerCase().includes(k));
const openTodos = todos.items.filter((t) => !t.done).map((t) => ({
  ...t, role: route(t.text, t.section, { clientSection: isClientSection(t.section) }) || (isClientSection(t.section) ? "delivery" : null), flags: flagsOf(t.text, isClientSection(t.section)),
}));
const today = new Date();
const ageDays = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? Math.floor((today - new Date(d + "T12:00:00")) / 864e5) : null);
for (const r of rows) {
  r.age = ageDays(r.asOf);
  r.stale = r.age == null || r.age > STALE_DAYS;
}

const drift = [];
const roleIds = new Set(ROLES.map((r) => r.id));
if (!rows.length) drift.push('STATUS.md has no "## Business" table');
if (!prices.length) drift.push('STATUS.md has no "## Price list" table');
for (const r of rows) {
  if (!roleIds.has(r.role)) drift.push(`Business row "${r.item}" has unknown role "${r.role}"`);
  if (!STATUSES.includes(r.status)) drift.push(`Business row "${r.item}" has unknown status "${r.status}"`);
}
for (const role of ROLES) if (rows.length && !rows.some((r) => r.role === role.id)) drift.push(`Role "${role.id}" has no rows in § Business`);
const stale = rows.filter((r) => r.stale);
if (stale.length) drift.push(`${stale.length} business row(s) not confirmed in ${STALE_DAYS} days: ${stale.map((r) => r.item).join("; ")}`);
const unrouted = openTodos.filter((t) => !t.role);

const DATA = {
  agency,
  generatedAt: today.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }),
  today: today.toISOString().slice(0, 10),
  staleDays: STALE_DAYS,
  roles: ROLES.map(({ id, name, blurb }) => ({ id, name, blurb })),
  statuses: STATUSES,
  rows,
  prices,
  registry,
  pipeline: pipeline.map(({ n, title, lane, gate }) => ({ n, title, lane, gate })),
  todos: openTodos,
  decisions: decisions.map((d) => ({ ...d, role: route(`${d.title} ${d.body}`, d.title) })),
  changelog: changelog.map((e) => ({ ...e, role: route(e.text) })),
  funnel: prospectFunnel(),
  drift,
};

// ---------- page ----------

const CSS = `
:root {
  --bg: #f6f7f9; --panel: #ffffff; --panel-2: #f1f4f8; --ink: #0f172a; --muted: #5b6678; --line: #dde3ea;
  --accent: #2563eb; --shadow: 0 1px 2px rgba(15,23,42,.06), 0 4px 14px rgba(15,23,42,.05); --warn: #b91c1c;
  --live: #15803d; --decided: #0e7490; --in-progress: #2563eb; --planned: #7c8799; --on-hold: #a16207;
  --waiting-owner: #c2410c; --waiting-client: #7c3aed; --blocked: #b91c1c;
  --concept: #0e7490; --test: #7c3aed; --building: #2563eb; --unknown: #7c8799;
  --client: #7c3aed; --owner: #c2410c; --agent: #2563eb;
  --r-sales: #c2410c; --r-marketing: #db2777; --r-finance: #15803d; --r-delivery: #2563eb;
  --r-clients: #7c3aed; --r-operations: #0e7490; --r-legal: #a16207; --r-it: #475569;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #0d1117; --panel: #151b23; --panel-2: #1b2330; --ink: #e6edf3; --muted: #9aa6b5; --line: #2a3441;
  --accent: #60a5fa; --shadow: none; --warn: #f87171;
  --live: #4ade80; --decided: #22d3ee; --in-progress: #60a5fa; --planned: #94a3b8; --on-hold: #facc15;
  --waiting-owner: #fb923c; --waiting-client: #c4b5fd; --blocked: #f87171;
  --concept: #22d3ee; --test: #c4b5fd; --building: #60a5fa; --unknown: #94a3b8;
  --client: #c4b5fd; --owner: #fb923c; --agent: #60a5fa;
  --r-sales: #fb923c; --r-marketing: #f472b6; --r-finance: #4ade80; --r-delivery: #60a5fa;
  --r-clients: #c4b5fd; --r-operations: #22d3ee; --r-legal: #facc15; --r-it: #94a3b8;
} }
:root[data-theme="dark"] {
  --bg: #0d1117; --panel: #151b23; --panel-2: #1b2330; --ink: #e6edf3; --muted: #9aa6b5; --line: #2a3441;
  --accent: #60a5fa; --shadow: none; --warn: #f87171;
  --live: #4ade80; --decided: #22d3ee; --in-progress: #60a5fa; --planned: #94a3b8; --on-hold: #facc15;
  --waiting-owner: #fb923c; --waiting-client: #c4b5fd; --blocked: #f87171;
  --concept: #22d3ee; --test: #c4b5fd; --building: #60a5fa; --unknown: #94a3b8;
  --client: #c4b5fd; --owner: #fb923c; --agent: #60a5fa;
  --r-sales: #fb923c; --r-marketing: #f472b6; --r-finance: #4ade80; --r-delivery: #60a5fa;
  --r-clients: #c4b5fd; --r-operations: #22d3ee; --r-legal: #facc15; --r-it: #94a3b8;
}
* { box-sizing: border-box; }
html, body { margin: 0; }
body { background: var(--bg); color: var(--ink); font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: var(--accent); }
code { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--panel-2); padding: 1px 4px; border-radius: 4px; }
button { font: inherit; color: inherit; }
.wrap { max-width: 1480px; margin: 0 auto; padding: 24px 16px 48px; }
header.top { display: flex; flex-wrap: wrap; gap: 12px 24px; align-items: flex-end; justify-content: space-between; }
h1 { margin: 0; font-size: 22px; letter-spacing: -.01em; }
h2.sec { font-size: 14px; margin: 22px 0 10px; }
.sub, .hint { color: var(--muted); font-size: 12.5px; }
.top-actions { display: flex; gap: 8px; }
.icon-btn { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; cursor: pointer; text-decoration: none; color: var(--ink); font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 18px 0 14px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--c, var(--line)); border-radius: 10px; padding: 10px 12px; box-shadow: var(--shadow); text-align: left; cursor: pointer; }
.tile .v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile .k { color: var(--muted); font-size: 12px; }
nav.tabs { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: 1px solid var(--line); margin-bottom: 16px; position: sticky; top: 0; background: var(--bg); z-index: 20; padding-top: 6px; }
nav.tabs button { border: 0; background: none; padding: 8px 11px; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; font-weight: 600; display: inline-flex; gap: 6px; align-items: center; }
nav.tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--rc, var(--accent)); }
nav.tabs .count { font-weight: 500; font-size: 11px; color: var(--muted); }
section.view { display: none; }
section.view.on { display: block; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; box-shadow: var(--shadow); }
.grid2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.grid-wheel { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
@media (max-width: 980px) { .grid2, .grid-wheel { grid-template-columns: 1fr; } }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }
.badge { display: inline-block; color: #fff; font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
:root[data-theme="dark"] .badge { color: #0d1117; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .badge { color: #0d1117; } }
.flag { display: inline-block; font-size: 10px; font-weight: 700; border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; margin-right: 4px; }
.flag.owner { color: var(--owner); } .flag.client { color: var(--client); } .flag.hold { color: var(--on-hold); } .flag.stale { color: var(--muted); }
input[type="search"] { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; color: var(--ink); min-width: 220px; font: inherit; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.chip[aria-pressed="true"] { border-color: var(--accent); background: var(--panel-2); }

/* wheel */
.wheel svg { width: 100%; height: auto; display: block; max-width: 640px; margin: 0 auto; }
.wheel g.seg { cursor: pointer; }
.wheel g.seg path.base { fill: var(--panel-2); stroke: var(--bg); stroke-width: 3; transition: fill .15s; }
.wheel g.seg:hover path.base, .wheel g.seg:focus path.base { fill: color-mix(in srgb, var(--rc) 22%, var(--panel-2)); }
.wheel text { fill: var(--ink); }
.wheel text.small { fill: var(--muted); font-size: 11px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); margin-top: 8px; justify-content: center; }
.legend span { display: inline-flex; align-items: center; gap: 5px; }

/* boards + lists */
.move-group { margin-bottom: 12px; }
.move-group h4 { margin: 0 0 6px; font-size: 12px; display: flex; gap: 6px; align-items: center; }
.item { display: block; width: 100%; text-align: left; background: var(--panel); border: 1px solid var(--line); border-left: 3px solid var(--c, var(--line)); border-radius: 8px; padding: 7px 10px; margin-bottom: 6px; cursor: pointer; font-size: 12.5px; }
.item:hover { border-color: var(--accent); }
.item .t { font-weight: 600; }
.item .d { color: var(--muted); font-size: 12px; margin-top: 2px; }
.board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(200px, 1fr); gap: 10px; overflow-x: auto; padding-bottom: 6px; }
.col { background: var(--panel-2); border-radius: 10px; padding: 8px; min-height: 80px; }
.col h4 { margin: 2px 2px 8px; font-size: 12px; display: flex; gap: 6px; align-items: center; justify-content: space-between; }
.card { display: block; width: 100%; text-align: left; background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--c); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; box-shadow: var(--shadow); }
.card:hover { box-shadow: 0 0 0 2px var(--c); }
.card .t { font-weight: 650; font-size: 12.5px; }
.card .d { color: var(--muted); font-size: 12px; margin-top: 3px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.card .meta { margin-top: 5px; font-size: 11px; color: var(--muted); }
table.heat { border-collapse: separate; border-spacing: 3px; width: 100%; font-size: 12px; }
table.heat th { font-weight: 600; color: var(--muted); font-size: 11px; text-align: center; padding: 2px; }
table.heat th.rn { text-align: left; color: var(--ink); white-space: nowrap; }
table.heat td { text-align: center; border-radius: 6px; padding: 7px 4px; font-variant-numeric: tabular-nums; cursor: pointer; }
table.heat td.z { color: var(--line); cursor: default; }
.spark { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
.spark .s { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; cursor: pointer; }
.spark svg { width: 100%; height: 38px; display: block; }
.spark .n { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; }
details.todo { background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; margin-bottom: 6px; }
details.todo summary { cursor: pointer; list-style: none; font-size: 12.5px; }
details.todo summary::-webkit-details-marker { display: none; }
details.todo .sec { color: var(--muted); font-size: 11px; }
details.todo .body { margin-top: 6px; color: var(--muted); font-size: 12.5px; }
details.dec { background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; margin-bottom: 6px; }
details.dec summary { cursor: pointer; font-size: 12.5px; font-weight: 600; }
details.dec .body { color: var(--muted); font-size: 12.5px; }
.entry { font-size: 12.5px; padding: 7px 0; border-top: 1px solid var(--line); }
.entry:first-child { border-top: 0; }
.entry .d { color: var(--muted); font-size: 11px; font-weight: 700; margin-right: 6px; }

/* role hero */
.hero { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; align-items: center; margin-bottom: 14px; }
.hero .ic { width: 44px; height: 44px; border-radius: 12px; background: var(--rc); grid-row: 1 / 3; }
.hero h2 { margin: 0; font-size: 20px; }
.mix { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--panel-2); margin-top: 8px; }

/* diagrams */
.funnel svg, .journey svg { width: 100%; height: auto; display: block; }
.funnel text { fill: var(--ink); font-size: 12px; }
.funnel text.n { font-weight: 700; font-size: 13px; }
.journey { display: grid; grid-template-columns: repeat(var(--cols), minmax(170px, 1fr)); gap: 0 34px; position: relative; }
.journey .stage h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.journey .stage { position: relative; }
.journey .stage:not(:last-child)::after { content: "→"; position: absolute; right: -26px; top: 46%; color: var(--muted); font-size: 20px; }
.offer { display: block; width: 100%; text-align: left; background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--c); border-radius: 10px; padding: 10px; margin-bottom: 10px; cursor: pointer; }
.offer .p { font-size: 18px; font-weight: 750; letter-spacing: -.01em; }
.offer .o { font-weight: 600; font-size: 12.5px; }
.offer .nt { color: var(--muted); font-size: 11.5px; margin-top: 4px; }
.pass { margin-top: 14px; border-top: 1px dashed var(--line); padding-top: 12px; }
.pipe-strip { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pipe-strip .st { border: 1px solid var(--line); border-left: 3px solid var(--c); background: var(--panel); border-radius: 7px; padding: 4px 8px; font-size: 11.5px; }
.pipe-strip .ar { color: var(--muted); }
.relation { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.rel { background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 10px; padding: 10px 12px; cursor: pointer; text-align: left; width: 100%; }
.rel .t { font-weight: 700; }
.rel .d { color: var(--muted); font-size: 12px; }
.rel ul { margin: 6px 0 0; padding-left: 16px; font-size: 12px; }
.rel .age { font-size: 11px; color: var(--muted); margin-top: 6px; }
.rel .age.cold { color: var(--waiting-owner); font-weight: 600; }

/* drawer */
.drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(480px, 100vw); background: var(--panel); border-left: 1px solid var(--line); box-shadow: -10px 0 30px rgba(0,0,0,.12); transform: translateX(105%); transition: transform .2s ease; z-index: 50; overflow-y: auto; padding: 18px 18px 40px; }
.drawer.open { transform: none; }
.drawer h3 { margin: 8px 0 4px; font-size: 18px; }
.drawer h4 { margin: 18px 0 6px; font-size: 11.5px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.drawer .close { position: absolute; top: 12px; right: 12px; }
.drawer ul { margin: 0; padding-left: 18px; }
.drawer li { margin-bottom: 6px; font-size: 13px; }
.drawer p { font-size: 13px; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; }
footer { margin-top: 28px; color: var(--muted); font-size: 12px; }
`;

/* eslint-disable no-undef -- runs in the browser, serialised into the page */
function client(DATA) {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const inline = (s) => String(s ?? "").split("`").map((seg, i) => i % 2 ? `<code>${esc(seg)}</code>` : esc(seg)
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => /^https?:/.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : `<span>${t}</span>`)
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")).join("");
  const md = (s) => String(s ?? "").split(/\n\s*\n/).map((p) => `<p>${p.split("\n").map((l, i) => (i && /^([-*]|\d+\.)\s/.test(l) ? "<br>" : " ") + inline(l)).join("").trim()}</p>`).join("");
  const first = (s) => {
    const t = String(s).replace(/\*\*/g, "").replace(/\s*\n\s*/g, " ").split(/(?<=[.!?])\s(?=[A-Z(*`])/)[0];
    return t.length > 180 ? t.slice(0, 177).replace(/\s+\S*$/, "") + "…" : t;
  };
  const col = (k) => `var(--${k}, var(--unknown))`;
  const rc = (id) => `var(--r-${id})`;
  const LABEL = { "waiting-owner": "your move", "waiting-client": "waiting on client", blocked: "blocked", "in-progress": "in progress", "on-hold": "on hold", planned: "planned", decided: "decided", live: "live" };
  const badge = (k, label) => `<span class="badge" style="background:${col(k)}">${esc(label ?? LABEL[k] ?? k)}</span>`;
  const flagHtml = (f) => `${f.owner ? `<span class="flag owner">YOU</span>` : ""}${f.client ? `<span class="flag client">CLIENT</span>` : ""}${f.hold ? `<span class="flag hold">HOLD</span>` : ""}`;
  const ROLE = Object.fromEntries(DATA.roles.map((r) => [r.id, r]));
  const byRole = (id) => DATA.rows.filter((r) => r.role === id);
  const todosOf = (id) => DATA.todos.filter((t) => t.role === id);
  const words = (s) => [...new Set(String(s).toLowerCase().replace(/[^a-z0-9$ -]/g, " ").split(/\s+/).filter((w) => w.length >= 5))];

  // ---------- theme ----------
  const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const saved = store.get("biz-theme");
  if (saved) document.documentElement.dataset.theme = saved;
  $("#theme").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("biz-theme", next);
  });

  // ---------- drawer ----------
  const drawer = $("#drawer");
  const openDrawer = (html) => { $("#drawer-body").innerHTML = html; drawer.classList.add("open"); drawer.focus(); };
  const closeDrawer = () => drawer.classList.remove("open");
  $("#drawer .close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

  function related(text, max = 6) {
    const ws = words(text).filter((w) => !/^(about|after|their|there|which|would|still|being|until|where|those|these|other|every|client|owner|clients)$/.test(w));
    const hit = (t) => ws.filter((w) => t.toLowerCase().includes(w)).length;
    const todos = DATA.todos.map((t) => [t, hit(t.text)]).filter(([, h]) => h >= 2).sort((a, b) => b[1] - a[1]).slice(0, max).map(([t]) => t);
    const log = DATA.changelog.map((e) => [e, hit(e.text)]).filter(([, h]) => h >= 2).sort((a, b) => b[1] - a[1] || (a[0].date < b[0].date ? 1 : -1)).slice(0, max).map(([e]) => e);
    return { todos, log };
  }
  const todoLi = (t) => `<li>${flagHtml(t.flags)}${inline(first(t.text))} <span class="hint">· ${esc(t.section)}</span></li>`;
  const logLi = (e) => `<li><span class="hint">${e.date}</span> ${inline(first(e.text))}</li>`;
  function showRow(r) {
    const rel = related(`${r.item} ${r.detail}`);
    openDrawer(`${badge(r.status)} <span class="hint">${esc(ROLE[r.role]?.name || r.role)}</span>
      <h3>${inline(r.item)}</h3>${md(r.detail)}
      <dl class="kv"><dt>As of</dt><dd>${esc(r.asOf || "—")}${r.stale ? ` <span class="flag stale">NOT CONFIRMED IN ${DATA.staleDays}+ DAYS</span>` : ""}</dd></dl>
      <h4>Related open TODOs · ${rel.todos.length}</h4>${rel.todos.length ? `<ul>${rel.todos.map(todoLi).join("")}</ul>` : `<p class="hint">none matched</p>`}
      <h4>Related activity · ${rel.log.length}</h4>${rel.log.length ? `<ul>${rel.log.map(logLi).join("")}</ul>` : `<p class="hint">none matched</p>`}`);
  }
  function showTodo(t) {
    const [head, ...rest] = t.text.split("\n");
    openDrawer(`${flagHtml(t.flags)} <span class="hint">${esc(ROLE[t.role]?.name || "unrouted")} · ${esc(t.section)}</span>
      <h3 style="font-size:15px">${inline(head)}</h3>${md(rest.join("\n"))}<p class="hint">From private/TODOS.md</p>`);
  }
  function showPrice(p) {
    openDrawer(`${badge(p.status)} <span class="hint">Price list · ${esc(p.stage)}</span><h3>${esc(p.offer)}</h3>
      <p style="font-size:22px;font-weight:750;margin:6px 0">${esc(p.price)}</p>${md(p.notes)}
      <p class="hint">Prices are owner-set business facts. Change them only on the owner's word, then update STATUS.md § Price list.</p>`);
  }

  // ---------- derived sets ----------
  const yourMove = [
    ...DATA.rows.filter((r) => r.status === "waiting-owner").map((r) => ({ kind: "row", role: r.role, r })),
    ...DATA.todos.filter((t) => t.flags.owner && !t.flags.hold).map((t) => ({ kind: "todo", role: t.role, t })),
  ];
  const waitingClients = [
    ...DATA.rows.filter((r) => r.status === "waiting-client").map((r) => ({ kind: "row", role: r.role, r })),
    ...DATA.todos.filter((t) => t.flags.client).map((t) => ({ kind: "todo", role: t.role, t })),
  ];
  const onHold = DATA.rows.filter((r) => r.status === "on-hold" || r.status === "blocked");
  const inProd = DATA.registry.filter((c) => ["live", "concept", "test"].includes(c.category)).length;

  // ---------- tiles ----------
  const tiles = [
    { v: yourMove.length, k: "your move (decisions + steps)", c: "var(--waiting-owner)", go: () => scrollToId("move") },
    { v: waitingClients.length, k: "waiting on clients", c: "var(--waiting-client)", go: () => show("clients") },
    { v: onHold.length, k: "on hold or blocked", c: "var(--on-hold)", go: () => scrollToId("heat") },
    { v: `${inProd}/${DATA.registry.length}`, k: "client sites in production", c: "var(--live)", go: () => show("delivery") },
    { v: DATA.todos.length, k: "open TODOs, routed by role", c: "var(--accent)", go: () => scrollToId("heat") },
    { v: DATA.changelog[0]?.date ?? "—", k: `last activity · ${DATA.changelog.length} entries`, c: "var(--line)", go: () => scrollToId("pulse") },
  ];
  if (DATA.drift.length) tiles.push({ v: DATA.drift.length, k: "drift / staleness warnings", c: "var(--warn)", go: showDrift });
  for (const t of tiles) {
    const el = document.createElement("button");
    el.className = "tile";
    el.style.setProperty("--c", t.c);
    el.innerHTML = `<div class="v">${esc(t.v)}</div><div class="k">${esc(t.k)}</div>`;
    el.addEventListener("click", t.go);
    $("#tiles").append(el);
  }
  function showDrift() {
    openDrawer(`${badge("blocked", "drift")}<h3>The map and the records disagree</h3>
      <p class="hint">Fix the source: STATUS.md § Business / § Price list (or TODOS.md), then regenerate.</p>
      <ul>${DATA.drift.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`);
  }
  function scrollToId(id) { show("overview"); requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" })); }

  // ---------- tabs ----------
  const TABS = [["overview", "Overview", null], ...DATA.roles.map((r) => [r.id, r.name, r.id])];
  for (const [id, label, role] of TABS) {
    const n = role ? byRole(role).length : null;
    const b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.dataset.tab = id;
    if (role) b.style.setProperty("--rc", rc(role));
    b.innerHTML = `${role ? `<span class="dot" style="background:${rc(role)}"></span>` : ""}${esc(label)}${n != null ? `<span class="count">${n}</span>` : ""}`;
    b.addEventListener("click", () => show(id));
    $("#tabs").append(b);
  }
  function show(id) {
    if (!TABS.some((t) => t[0] === id)) id = "overview";
    $$("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    $$("section.view").forEach((s) => s.classList.toggle("on", s.id === "v-" + id));
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    window.scrollTo({ top: 0 });
  }
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  // ---------- overview: wheel ----------
  function arc(cx, cy, r0, r1, a0, a1) {
    const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
    return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
  }
  (function wheel() {
    const W = 640, cx = W / 2, cy = W / 2, R = 300, ring = 26, r0 = 118, n = DATA.roles.length, gap = 0.012;
    let s = `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="The business by role">`;
    DATA.roles.forEach((role, i) => {
      const a0 = -Math.PI / 2 + (i / n) * 2 * Math.PI + gap, a1 = -Math.PI / 2 + ((i + 1) / n) * 2 * Math.PI - gap;
      const rows = byRole(role.id);
      const mv = yourMove.filter((m) => m.role === role.id).length;
      s += `<g class="seg" tabindex="0" role="button" data-role="${role.id}" style="--rc:${rc(role.id)}" aria-label="${esc(role.name)}">`;
      s += `<path class="base" d="${arc(cx, cy, r0, R - ring - 4, a0, a1)}"/>`;
      let a = a0;
      const total = rows.length || 1;
      for (const st of DATA.statuses) {
        const k = rows.filter((r) => r.status === st).length;
        if (!k) continue;
        const b = a + (a1 - a0) * (k / total);
        s += `<path d="${arc(cx, cy, R - ring, R, a, b)}" style="fill:${col(st)}"><title>${esc(role.name)}: ${k} ${esc(LABEL[st])}</title></path>`;
        a = b;
      }
      if (!rows.length) s += `<path d="${arc(cx, cy, R - ring, R, a0, a1)}" style="fill:var(--line)"/>`;
      s += `<path d="${arc(cx, cy, r0 - 10, r0 - 4, a0, a1)}" style="fill:${rc(role.id)}"/>`;
      const am = (a0 + a1) / 2, rm = (r0 + R - ring) / 2;
      const x = cx + rm * Math.cos(am), y = cy + rm * Math.sin(am);
      s += `<text x="${x}" y="${y - 8}" text-anchor="middle" style="font-weight:700;font-size:13.5px">${esc(role.name)}</text>`;
      s += `<text class="small" x="${x}" y="${y + 8}" text-anchor="middle">${rows.length} items · ${todosOf(role.id).length} TODOs</text>`;
      if (mv) s += `<text x="${x}" y="${y + 24}" text-anchor="middle" style="fill:var(--waiting-owner);font-size:11.5px;font-weight:700">${mv} your move</text>`;
      s += `</g>`;
    });
    s += `<circle cx="${cx}" cy="${cy}" r="${r0 - 16}" style="fill:var(--ink)"/>
      <text x="${cx}" y="${cy - 6}" text-anchor="middle" style="fill:var(--bg);font-weight:800;font-size:16px">${esc(DATA.agency)}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" style="fill:var(--bg);font-size:11px;opacity:.8">${DATA.rows.length} items · ${DATA.roles.length} roles</text></svg>`;
    const legend = DATA.statuses.map((st) => `<span><span class="dot" style="background:${col(st)}"></span>${esc(LABEL[st])}</span>`).join("");
    $("#wheel").innerHTML = `${s}<div class="legend">${legend}</div><p class="hint" style="text-align:center">Outer ring: each role's items by status. Click a role to open it.</p>`;
    $("#wheel").addEventListener("click", (e) => { const g = e.target.closest("[data-role]"); if (g) show(g.dataset.role); });
    $("#wheel").addEventListener("keydown", (e) => { const g = e.target.closest("[data-role]"); if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); show(g.dataset.role); } });
  })();

  // ---------- overview: your move ----------
  function moveList(list, el, emptyText) {
    const groups = DATA.roles.map((r) => [r, list.filter((m) => m.role === r.id)]).filter(([, l]) => l.length);
    const un = list.filter((m) => !m.role);
    if (un.length) groups.push([{ id: "", name: "Unrouted" }, un]);
    el.innerHTML = groups.length ? groups.map(([r, l]) => `<div class="move-group"><h4><span class="dot" style="background:${r.id ? rc(r.id) : "var(--muted)"}"></span>${esc(r.name)} · ${l.length}</h4>${l.map((m, i) => m.kind === "row"
      ? `<button class="item" style="--c:${col(m.r.status)}" data-k="row" data-i="${DATA.rows.indexOf(m.r)}"><div class="t">${inline(m.r.item)}</div><div class="d">${inline(m.r.detail)}</div></button>`
      : `<button class="item" style="--c:var(--owner)" data-k="todo" data-i="${DATA.todos.indexOf(m.t)}"><div class="t">${flagHtml(m.t.flags)}${inline(first(m.t.text))}</div><div class="d">${esc(m.t.section)}</div></button>`).join("")}</div>`).join("")
      : `<p class="hint">${emptyText}</p>`;
  }
  moveList(yourMove, $("#move-list"), "Nothing is waiting on you.");
  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]");
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.dataset.k === "row") showRow(DATA.rows[i]);
    else if (b.dataset.k === "todo") showTodo(DATA.todos[i]);
    else if (b.dataset.k === "price") showPrice(DATA.prices[i]);
    else if (b.dataset.k === "client") showClient(DATA.registry[i]);
  });

  // ---------- overview: heatmap ----------
  (function heat() {
    let h = `<table class="heat"><thead><tr><th></th>${DATA.statuses.map((s) => `<th>${esc(LABEL[s])}</th>`).join("")}<th>open TODOs</th></tr></thead><tbody>`;
    const max = Math.max(1, ...DATA.roles.flatMap((r) => DATA.statuses.map((s) => byRole(r.id).filter((x) => x.status === s).length)));
    const tmax = Math.max(1, ...DATA.roles.map((r) => todosOf(r.id).length));
    for (const r of DATA.roles) {
      h += `<tr><th class="rn"><span class="dot" style="background:${rc(r.id)}"></span> ${esc(r.name)}</th>`;
      for (const s of DATA.statuses) {
        const k = byRole(r.id).filter((x) => x.status === s).length;
        h += k ? `<td data-go="${r.id}" style="background:color-mix(in srgb, ${col(s)} ${18 + (k / max) * 62}%, transparent)">${k}</td>` : `<td class="z">·</td>`;
      }
      const t = todosOf(r.id).length;
      h += `<td data-go="${r.id}" style="background:color-mix(in srgb, var(--accent) ${t ? 10 + (t / tmax) * 50 : 0}%, transparent)">${t}</td></tr>`;
    }
    const un = DATA.todos.filter((t) => !t.role).length;
    h += `</tbody></table>${un ? `<p class="hint">${un} open TODO(s) matched no role rule; they show under "Unrouted" in the lists.</p>` : ""}`;
    $("#heat").innerHTML = h;
    $("#heat").addEventListener("click", (e) => { const td = e.target.closest("[data-go]"); if (td) show(td.dataset.go); });
  })();

  // ---------- overview: pulse (activity per role) ----------
  const DAYS = 30;
  const dayList = (() => {
    const end = new Date((DATA.changelog[0]?.date || DATA.today) + "T12:00:00");
    return Array.from({ length: DAYS }, (_, i) => { const d = new Date(end); d.setDate(d.getDate() - (DAYS - 1 - i)); return d.toISOString().slice(0, 10); });
  })();
  function sparkSvg(entries, color) {
    const counts = dayList.map((d) => entries.filter((e) => e.date === d).length);
    const max = Math.max(1, ...counts), W = 300, H = 38, bw = W / counts.length;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${counts.map((c, i) => `<rect x="${i * bw + 1}" y="${H - (c / max) * (H - 2)}" width="${bw - 2}" height="${(c / max) * (H - 2)}" style="fill:${color};opacity:${c ? 0.85 : 0}"><title>${dayList[i]}: ${c}</title></rect>`).join("")}</svg>`;
  }
  $("#pulse").innerHTML = `<div class="spark">${DATA.roles.map((r) => {
    const es = DATA.changelog.filter((e) => e.role === r.id);
    const recent = es.filter((e) => dayList.includes(e.date)).length;
    return `<div class="s" data-go="${r.id}"><div class="n"><span><span class="dot" style="background:${rc(r.id)}"></span> ${esc(r.name)}</span><span class="hint">${recent} in ${DAYS}d</span></div>${sparkSvg(es, rc(r.id))}</div>`;
  }).join("")}</div>`;
  $("#pulse").addEventListener("click", (e) => { const s = e.target.closest("[data-go]"); if (s) show(s.dataset.go); });

  // ---------- role views ----------
  const BOARD_ORDER = ["waiting-owner", "waiting-client", "blocked", "in-progress", "on-hold", "planned", "decided", "live"];
  function stateBoard(rows) {
    const cols = BOARD_ORDER.filter((s) => rows.some((r) => r.status === s));
    return `<div class="board">${cols.map((s) => `<div class="col"><h4><span>${badge(s)}</span><span class="hint">${rows.filter((r) => r.status === s).length}</span></h4>${rows.filter((r) => r.status === s).map((r) =>
      `<button class="card" style="--c:${col(r.status)}" data-k="row" data-i="${DATA.rows.indexOf(r)}"><div class="t">${inline(r.item)}</div><div class="d">${inline(r.detail)}</div><div class="meta">as of ${esc(r.asOf || "—")}${r.stale ? ` · <span class="flag stale">STALE</span>` : ""}</div></button>`).join("")}</div>`).join("")}</div>`;
  }
  function funnelSvg(f) {
    const W = 760, rowH = 40, H = f.stages.length * rowH + 6, max = Math.max(1, f.stages[0].n);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Prospect funnel">`;
    f.stages.forEach((st, i) => {
      const w = Math.max(st.n ? 26 : 4, (st.n / max) * (W - 260)), x = 170 + (W - 260 - w) / 2, y = i * rowH + 4;
      s += `<text x="160" y="${y + 23}" text-anchor="end">${esc(st.k)}</text>
        <rect x="${x}" y="${y}" width="${w}" height="${rowH - 8}" rx="6" style="fill:var(--r-sales);opacity:${st.n ? 0.25 + 0.75 * (1 - i / f.stages.length) : 0.2}"/>
        <text class="n" x="${170 + (W - 260) / 2}" y="${y + 23}" text-anchor="middle">${st.n}</text>`;
      if (i) { const prev = f.stages[i - 1].n; if (prev) s += `<text x="${W - 80}" y="${y + 23}" style="fill:var(--muted);font-size:11px">${Math.round((st.n / prev) * 100)}% of prev</text>`; }
    });
    return s + `</svg>`;
  }
  function journey() {
    const stages = ["start", "build", "ongoing", "exit"].filter((s) => DATA.prices.some((p) => p.stage === s));
    const card = (p) => `<button class="offer" style="--c:${col(p.status)}" data-k="price" data-i="${DATA.prices.indexOf(p)}"><div class="o">${esc(p.offer)}</div><div class="p">${esc(p.price)}</div><div>${badge(p.status)}</div><div class="nt">${inline(p.notes)}</div></button>`;
    const pass = DATA.prices.filter((p) => p.stage === "pass-through");
    return `<div class="journey" style="--cols:${stages.length}">${stages.map((s) => `<div class="stage"><h4>${esc(s)}</h4>${DATA.prices.filter((p) => p.stage === s).map(card).join("")}</div>`).join("")}</div>
      ${pass.length ? `<div class="pass"><h4 style="margin:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">Pass-through · the client pays a third party</h4><div class="journey" style="--cols:${Math.max(2, pass.length)}">${pass.map((p) => `<div>${card(p)}</div>`).join("")}</div></div>` : ""}`;
  }
  const CAT_ORDER = ["building", "test", "concept", "live"];
  const CAT_LABEL = { live: "live", concept: "live · concept", test: "test", building: "building" };
  function clientSectionTodos(c) {
    const keys = [c.name, c.name.replace(/[,(].*$/, "").trim(), c.slug].map((k) => k.toLowerCase()).filter((k) => k.length >= 4);
    return DATA.todos.filter((t) => keys.some((k) => t.section.toLowerCase().includes(k)));
  }
  function lastTouch(c) {
    const keys = [c.slug, c.name, c.repo].filter((k) => k && k.length >= 6).map((k) => k.toLowerCase());
    return DATA.changelog.find((e) => keys.some((k) => e.text.toLowerCase().includes(k)))?.date || null;
  }
  function showClient(c) {
    const ts = clientSectionTodos(c);
    const lt = lastTouch(c);
    openDrawer(`${badge(c.category, CAT_LABEL[c.category] || c.category)}<h3>${esc(c.label)}</h3>
      <dl class="kv"><dt>Vertical</dt><dd>${esc(c.vertical)}</dd><dt>Status</dt><dd>${esc(c.status)}</dd>
      <dt>Domain</dt><dd>${c.domainUrl ? `<a href="${esc(c.domainUrl)}" target="_blank" rel="noopener">${esc(c.domain)}</a>` : esc(c.domain)}</dd>
      <dt>Spoke</dt><dd>${c.repoUrl ? `<a href="${esc(c.repoUrl)}" target="_blank" rel="noopener">${esc(c.repo)}</a>` : esc(c.repo)}</dd>
      <dt>Last activity</dt><dd>${lt || "—"}</dd></dl>
      <h4>Open TODOs · ${ts.length}</h4>${ts.length ? `<ul>${ts.map(todoLi).join("")}</ul>` : `<p class="hint">none</p>`}`);
  }
  function clientBoard() {
    const cats = CAT_ORDER.filter((k) => DATA.registry.some((c) => c.category === k)).concat([...new Set(DATA.registry.map((c) => c.category))].filter((k) => !CAT_ORDER.includes(k)));
    return `<div class="board">${cats.map((k) => `<div class="col"><h4>${badge(k, CAT_LABEL[k] || k)}<span class="hint">${DATA.registry.filter((c) => c.category === k).length}</span></h4>${DATA.registry.filter((c) => c.category === k).map((c) => {
      const ts = clientSectionTodos(c);
      return `<button class="card" style="--c:${col(c.category)}" data-k="client" data-i="${DATA.registry.indexOf(c)}"><div class="t">${esc(c.label)}</div><div class="d">${esc(c.vertical)} · ${esc(c.domain.replace(/\s*\(.*$/, ""))}</div><div class="meta">${ts.length} open · ${ts.filter((t) => t.flags.client).length ? `<span class="flag client">WAITING</span>` : ""}${ts.filter((t) => t.flags.owner).length ? `<span class="flag owner">YOU</span>` : ""}</div></button>`;
    }).join("")}</div>`).join("")}</div>`;
  }
  function relationships() {
    return `<div class="relation">${DATA.registry.map((c) => {
      const ts = clientSectionTodos(c).filter((t) => t.flags.client || t.flags.owner);
      const lt = lastTouch(c);
      const age = lt ? Math.round((new Date(DATA.today) - new Date(lt)) / 864e5) : null;
      return `<button class="rel" style="--c:${col(c.category)}" data-k="client" data-i="${DATA.registry.indexOf(c)}"><div class="t">${esc(c.label)}</div><div class="d">${esc(c.status)}</div>
        ${ts.length ? `<ul>${ts.slice(0, 4).map((t) => `<li>${flagHtml(t.flags)}${inline(first(t.text))}</li>`).join("")}</ul>` : `<div class="d" style="margin-top:6px">nothing waiting</div>`}
        <div class="age${age != null && age > 7 ? " cold" : ""}">${lt ? `last activity ${lt} (${age} day${age === 1 ? "" : "s"} ago)` : "no activity logged"}</div></button>`;
    }).join("")}</div>`;
  }
  function pipeStrip() {
    return `<div class="pipe-strip">${DATA.pipeline.map((s, i) => `${i ? `<span class="ar">→</span>` : ""}<span class="st" style="--c:${col(s.lane)}" title="${esc(s.lane)}">${s.n}. ${esc(s.title)}${s.gate ? " ◆" : ""}</span>`).join("")}</div>
      <div class="legend" style="justify-content:flex-start"><span><span class="dot" style="background:var(--client)"></span>client</span><span><span class="dot" style="background:var(--owner)"></span>owner</span><span><span class="dot" style="background:var(--agent)"></span>agent</span><span>◆ gate</span></div>`;
  }
  const SPECIAL = {
    sales: () => `${DATA.funnel ? `<div class="panel funnel"><h2 class="sec" style="margin-top:0">Prospect funnel</h2>${funnelSvg(DATA.funnel)}<p class="hint">From private/marketing/prospects.json${DATA.funnel.updated ? `, updated ${esc(DATA.funnel.updated.slice(0, 10))}` : ""} · ${Object.entries(DATA.funnel.verticals).map(([k, v]) => `${esc(k)} ${v}`).join(", ")}</p></div>` : ""}
      <h2 class="sec">What we sell</h2><div class="panel">${journey()}</div>`,
    finance: () => `<h2 class="sec" style="margin-top:0">Revenue journey · from STATUS.md § Price list</h2><div class="panel">${journey()}</div>`,
    delivery: () => `<h2 class="sec" style="margin-top:0">Client sites · from the registry</h2>${clientBoard()}<h2 class="sec">How a change ships</h2><div class="panel">${pipeStrip()}</div>`,
    clients: () => `<h2 class="sec" style="margin-top:0">Relationships · what's waiting, and how recently we touched each</h2>${relationships()}`,
    operations: () => `<h2 class="sec" style="margin-top:0">The change pipeline the machinery runs</h2><div class="panel">${pipeStrip()}</div>`,
  };
  for (const role of DATA.roles) {
    const rows = byRole(role.id);
    const todos = todosOf(role.id);
    const decs = DATA.decisions.filter((d) => d.role === role.id).slice().reverse();
    const log = DATA.changelog.filter((e) => e.role === role.id);
    const mix = DATA.statuses.map((s) => { const k = rows.filter((r) => r.status === s).length; return k ? `<span style="flex:${k};background:${col(s)}" title="${esc(LABEL[s])}: ${k}"></span>` : ""; }).join("");
    const sec = document.createElement("section");
    sec.className = "view";
    sec.id = "v-" + role.id;
    sec.style.setProperty("--rc", rc(role.id));
    sec.innerHTML = `<div class="hero"><div class="ic"></div><h2>${esc(role.name)}</h2><div class="hint">${esc(role.blurb)} · ${rows.length} items · ${todos.length} open TODOs · ${decs.length} decisions · ${log.length} activity entries</div></div>
      <div class="mix">${mix}</div>
      <h2 class="sec">Current state</h2>${rows.length ? stateBoard(rows) : `<p class="hint">No rows for this role in STATUS.md § Business.</p>`}
      ${SPECIAL[role.id] ? `<div style="margin-top:18px">${SPECIAL[role.id]()}</div>` : ""}
      <div class="grid2" style="margin-top:18px">
        <div><h2 class="sec" style="margin-top:0">Open TODOs · ${todos.length}</h2>
          <div class="toolbar"><input type="search" placeholder="Filter…" aria-label="Filter TODOs" data-filter="${role.id}"><button class="chip" aria-pressed="false" data-only="${role.id}">only your move</button></div>
          <div data-list="${role.id}"></div></div>
        <div><h2 class="sec" style="margin-top:0">Activity · last ${DAYS} days</h2><div class="panel">${sparkSvg(log, rc(role.id))}${log.slice(0, 12).map((e) => `<div class="entry"><span class="d">${e.date}</span>${inline(first(e.text))}</div>`).join("") || `<p class="hint">none</p>`}</div>
          <h2 class="sec">Decisions · ${decs.length}</h2>${decs.map((d) => `<details class="dec"><summary><span class="hint">${d.date}</span> ${inline(d.title)}</summary><div class="body">${md(d.body)}</div></details>`).join("") || `<p class="hint">none routed here</p>`}</div>
      </div>`;
    $("#views").append(sec);
    const list = $(`[data-list="${role.id}"]`, sec), q = $(`[data-filter="${role.id}"]`, sec), only = $(`[data-only="${role.id}"]`, sec);
    const draw = () => {
      const s = q.value.trim().toLowerCase(), o = only.getAttribute("aria-pressed") === "true";
      const items = todos.filter((t) => (!s || t.text.toLowerCase().includes(s)) && (!o || t.flags.owner));
      list.innerHTML = items.map((t) => {
        const [head, ...rest] = t.text.split("\n");
        return `<details class="todo"><summary>${flagHtml(t.flags)}${inline(head)}<div class="sec">${esc(t.section)}</div></summary>${rest.length ? `<div class="body">${md(rest.join("\n"))}</div>` : ""}</details>`;
      }).join("") || `<p class="hint">Nothing matches.</p>`;
    };
    q.addEventListener("input", draw);
    only.addEventListener("click", () => { only.setAttribute("aria-pressed", String(only.getAttribute("aria-pressed") !== "true")); draw(); });
    draw();
  }

  show(location.hash.slice(1) || "overview");
}

const json = JSON.stringify(DATA).replace(/</g, "\\u003c");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(agency)} business map</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>${esc(agency)} — the business by role</h1>
      <div class="sub">Current state of sales, marketing, finance, delivery, clients, operations, legal, and IT. Generated ${DATA.generatedAt}.</div>
    </div>
    <div class="top-actions"><a class="icon-btn" href="architecture.html">System architecture →</a><button class="icon-btn" id="theme" aria-label="Toggle light or dark theme">◐ theme</button></div>
  </header>
  <div class="tiles" id="tiles"></div>
  <nav class="tabs" id="tabs" role="tablist"></nav>
  <div id="views">
    <section class="view" id="v-overview">
      <div class="grid-wheel">
        <div class="panel wheel" id="wheel"></div>
        <div class="panel" id="move"><h2 class="sec" style="margin-top:0">Your move</h2><p class="hint" style="margin-top:-6px">Decisions and steps only you can take: § Business rows marked waiting-owner, plus TODOs that name the owner (holds excluded).</p><div id="move-list"></div></div>
      </div>
      <h2 class="sec">Roles × status <span class="hint">· click a row to open the role</span></h2>
      <div class="panel" id="heat"></div>
      <h2 class="sec">Pulse <span class="hint">· CHANGELOG entries per role, last 30 days</span></h2>
      <div id="pulse"></div>
    </section>
  </div>
  <footer>Generated by <code>dev/build-business.mjs</code> from STATUS.md (§ Business, § Price list), TODOS.md, REGISTRY.md, CHANGELOG.md, DECISIONS.md, playbooks/README.md, and the prospect list. Do not hand-edit.</footer>
</div>
<aside class="drawer" id="drawer" tabindex="-1" aria-label="Details"><button class="icon-btn close" aria-label="Close details">✕</button><div id="drawer-body"></div></aside>
<script id="data" type="application/json">${json}</script>
<script>(${client.toString()})(JSON.parse(document.getElementById("data").textContent));</script>
</body>
</html>
`;

writeFileSync(OUT, html);
const byStatus = {};
for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
console.log(
  `wrote private/business.html — ${rows.length} business rows (${Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(", ")}), ` +
    `${prices.length} prices, ${openTodos.length} open todos (${unrouted.length} unrouted)`,
);
if (drift.length) {
  console.log(`drift: ${drift.length} — the business map disagrees with the records; fix STATUS.md § Business / § Price list:`);
  for (const d of drift) console.log(`  - ${d}`);
}

#!/usr/bin/env node
/**
 * Generates private/architecture.html — a self-contained, interactive map of the
 * hub-and-spoke system. Derives entirely from the repo's own files so it can't drift:
 *
 *   - System diagram nodes: the "## Architecture nodes" table in private/STATUS.md
 *     (columns: Node | Group | Status | Notes; group: intake|hangar|spokes|delivery|infra;
 *      status: built|in-progress|stubbed|planned)
 *   - System diagram edges: the "## Architecture edges" table in private/STATUS.md
 *     (columns: From | To | Label; optional)
 *   - Fleet map: the client table in private/clients/REGISTRY.md
 *   - Change pipeline: the numbered steps under "## The pipeline" in playbooks/README.md
 *   - Queue: checkbox items in private/TODOS.md
 *   - Decisions timeline: "## YYYY-MM-DD — title" entries in DECISIONS.md
 *   - Activity: "- YYYY-MM-DD — …" entries in private/CHANGELOG.md
 *   - File tree: the repo itself, annotated from the Map table in CLAUDE.md
 *
 * It also reports drift: tracked playbooks/automation/schemas and registry clients that no
 * node mentions, and edges that name an unknown node. Drift shows on the page and on stdout.
 *
 * Run from anywhere: `node dev/build-architecture.mjs`. Zero dependencies.
 * The HTML is generated — never hand-edit it (CLAUDE.md state-layer ritual).
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRIVATE = join(ROOT, "private");
const OUT = join(PRIVATE, "architecture.html");

const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

// ---------- markdown helpers ----------

const cellsOf = (line) => line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
const isSeparator = (cells) => cells.every((c) => /^[-: ]*$/.test(c));

/** The first table at or after line index `from` (stopping at the next `## ` heading). */
function tableFrom(lines, from) {
  let i = from;
  while (i < lines.length && !/^\|/.test(lines[i])) {
    if (i > from && /^##\s/.test(lines[i])) return null;
    i++;
  }
  const rows = [];
  for (; i < lines.length && /^\|/.test(lines[i]); i++) {
    const cells = cellsOf(lines[i]);
    if (!isSeparator(cells)) rows.push(cells);
  }
  return rows.length ? { header: rows[0], rows: rows.slice(1) } : null;
}

function tableUnderHeading(md, headingRe) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  return start === -1 ? null : tableFrom(lines, start + 1);
}

const stripMd = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
const firstUrl = (s) => (s.match(/\]\((https?:[^)\s]+)\)/) || [])[1] || null;

/** Lines from a `## heading` (matching re) up to the next `## ` heading. */
function section(md, headingRe) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) out.push(lines[i]);
  return out;
}

// ---------- sources ----------

function parseNodes(md) {
  const t = tableUnderHeading(md, /^##\s+Architecture nodes/i);
  if (!t) throw new Error('STATUS.md is missing the "## Architecture nodes" table');
  const nodes = t.rows
    .filter((c) => c.length >= 4)
    .map((c) => ({ name: c[0], group: c[1].toLowerCase(), status: c[2].toLowerCase(), notes: c[3] }));
  if (!nodes.length) throw new Error("No rows parsed from the Architecture nodes table");
  return nodes;
}

function parseEdges(md) {
  const t = tableUnderHeading(md, /^##\s+Architecture edges/i);
  return t ? t.rows.filter((c) => c.length >= 2).map((c) => ({ from: c[0], to: c[1], label: c[2] || "" })) : [];
}

function parseRegistry(md) {
  const lines = md.split("\n");
  const at = lines.findIndex((l) => /^\|\s*Client\s*\|\s*Slug\s*\|/i.test(l));
  if (at === -1) return [];
  const t = tableFrom(lines, at);
  const col = (name) => t.header.findIndex((h) => h.toLowerCase().startsWith(name));
  const [cName, cSlug, cVert, cRepo, cDomain, cStatus, cRecord] = [
    "client", "slug", "vertical", "spoke", "domain", "status", "record",
  ].map(col);
  return t.rows.map((r) => {
    const statusText = stripMd(r[cStatus] || "");
    const s = statusText.toLowerCase();
    const category = /^test/.test(s)
      ? "test"
      : /^building|^onboarding/.test(s)
        ? "building"
        : /^live/.test(s) && /concept/.test(s)
          ? "concept"
          : /^live/.test(s)
            ? "live"
            : s.split(/\s/)[0] || "unknown";
    return {
      name: stripMd(r[cName] || "").replace(/\s*\((test|owner|agency's own site)\)\s*$/i, ""),
      label: stripMd(r[cName] || ""),
      slug: stripMd(r[cSlug] || ""),
      vertical: stripMd(r[cVert] || ""),
      repo: stripMd(r[cRepo] || ""),
      repoUrl: firstUrl(r[cRepo] || ""),
      domain: stripMd(r[cDomain] || ""),
      domainUrl: firstUrl(r[cDomain] || ""),
      status: statusText,
      category,
      record: stripMd(r[cRecord] || ""),
    };
  });
}

function parsePipeline(md) {
  const steps = [];
  for (const line of section(md, /^##\s+The pipeline/i)) {
    const m = line.match(/^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/);
    if (m) steps.push({ n: Number(m[1]), title: m[2].replace(/[.:]$/, ""), body: m[3] });
    else if (steps.length && line.trim() && !/^```/.test(line)) steps.at(-1).body += "\n" + line.trim();
    else if (steps.length && !line.trim()) steps.at(-1).body += "\n\n";
  }
  for (const s of steps) {
    s.body = s.body.trim();
    s.lane = /request arrives|client answers/i.test(s.title) ? "client" : /^owner/i.test(s.title) ? "owner" : "agent";
    s.gate = /gate|identify|validate/i.test(s.title);
  }
  return steps;
}

function parseTodos(md) {
  const items = [];
  const sections = [];
  let sec = "";
  let cur = null;
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+)/);
    if (h) {
      sec = h[1].trim();
      sections.push(sec);
      cur = null;
      continue;
    }
    const m = line.match(/^(\s*)[-*]\s+\[( |x|X)\]\s+(.+)/);
    if (m) {
      cur = { section: sec, depth: m[1].length, done: m[2] !== " ", text: m[3].trim() };
      items.push(cur);
    } else if (cur && line.trim() && /^\s/.test(line)) {
      cur.text += "\n" + line.trim();
    } else if (!line.trim()) {
      cur = null;
    }
  }
  return { items, sections };
}

function parseDecisions(md) {
  const out = [];
  let cur = null;
  for (const line of md.split("\n")) {
    const m = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(.+)$/);
    if (m) {
      cur = { date: m[1], title: m[2].trim(), body: "" };
      out.push(cur);
    } else if (/^##\s/.test(line)) cur = null;
    else if (cur) cur.body += line + "\n";
  }
  for (const d of out) d.body = d.body.trim();
  return out;
}

function parseChangelog(md) {
  const out = [];
  let cur = null;
  for (const line of md.split("\n")) {
    const m = line.match(/^-\s+(\d{4}-\d{2}-\d{2})\s+[—–-]\s+(.*)$/);
    if (m) {
      cur = { date: m[1], text: m[2].trim() };
      out.push(cur);
    } else if (cur && line.trim() && /^\s/.test(line)) cur.text += "\n" + line.trim();
    else cur = null;
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function parseMap(md) {
  const t = tableUnderHeading(md, /^##\s+Map/i);
  const map = {};
  if (!t) return map;
  for (const [paths, what] of t.rows) {
    for (const [, p] of (paths || "").matchAll(/`([^`]+)`/g)) map[p.replace(/\/$/, "")] = stripMd(what || "");
  }
  return map;
}

// ---------- file tree ----------

const SKIP = new Set([".git", "node_modules", ".DS_Store", ".idea", ".wrangler", ".claude", ".playwright-mcp"]);

function buildTree(dir, map) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => !SKIP.has(e.name))
    .sort((a, b) =>
      a.isDirectory() === b.isDirectory() ? a.name.localeCompare(b.name) : a.isDirectory() ? -1 : 1,
    )
    .map((e) => {
      const full = join(dir, e.name);
      const rel = relative(ROOT, full);
      const node = { name: e.name, path: rel, dir: e.isDirectory() };
      if (map[rel]) node.desc = map[rel];
      if (e.isDirectory()) node.children = buildTree(full, map);
      return node;
    });
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (SKIP.has(e.name)) return [];
    const full = join(dir, e.name);
    return e.isDirectory() ? listFiles(full) : [relative(ROOT, full)];
  });
}

// ---------- drift ----------

const STOP = new Set(["add", "edit", "setup", "wire", "update", "replace", "register", "attach", "item", "an", "or", "the"]);

function findDrift(nodes, edges, registry) {
  const drift = [];
  const names = new Set(nodes.map((n) => n.name));
  for (const e of edges) {
    for (const end of [e.from, e.to]) {
      if (!names.has(end)) drift.push({ kind: "edge", text: `Edge "${e.from} → ${e.to}" names an unknown node "${end}"` });
    }
  }
  const hay = nodes.map((n) => `${n.name} ${n.notes}`).join(" ").toLowerCase();
  for (const c of registry) {
    if (c.slug && !hay.includes(c.slug.toLowerCase())) {
      drift.push({ kind: "client", text: `Registry client "${c.slug}" isn't mentioned in any node (Client spokes?)` });
    }
  }
  const tracked = ["playbooks", "automation", "schemas"].flatMap((d) => {
    try {
      return listFiles(join(ROOT, d));
    } catch {
      return [];
    }
  });
  for (const f of tracked) {
    const base = basename(f).replace(/\.[^.]+$/, "");
    if (/^readme$/i.test(base)) continue;
    const tokens = base.toLowerCase().split(/[-_.]+/).filter((t) => t.length >= 4 && !STOP.has(t));
    if (tokens.length && !tokens.some((t) => hay.includes(t))) {
      drift.push({ kind: "file", text: `${f} isn't mentioned in any node` });
    }
  }
  return drift;
}

// ---------- assemble ----------

const statusMd = read(join(PRIVATE, "STATUS.md"));
const nodes = parseNodes(statusMd);
const edges = parseEdges(statusMd);
const registry = parseRegistry(read(join(PRIVATE, "clients", "REGISTRY.md")));
const pipeline = parsePipeline(read(join(ROOT, "playbooks", "README.md")));
const todos = parseTodos(read(join(PRIVATE, "TODOS.md")));
const decisions = parseDecisions(read(join(ROOT, "DECISIONS.md")));
const changelog = parseChangelog(read(join(PRIVATE, "CHANGELOG.md")));
const map = parseMap(read(join(ROOT, "CLAUDE.md")));
const tree = buildTree(ROOT, map);
const changePlaybooks = (() => {
  try {
    return readdirSync(join(ROOT, "playbooks", "change")).filter((f) => f.endsWith(".md"));
  } catch {
    return [];
  }
})();
const drift = findDrift(nodes, edges, registry);
const validEdges = edges.filter((e) => nodes.some((n) => n.name === e.from) && nodes.some((n) => n.name === e.to));

const DATA = {
  root: basename(ROOT),
  generatedAt: new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" }),
  nodes,
  edges: validEdges,
  registry,
  pipeline,
  changePlaybooks,
  todos,
  decisions,
  changelog,
  tree,
  drift,
};

// ---------- page (client code is serialised from the functions below) ----------

const CSS = `
:root {
  --bg: #f6f7f9; --panel: #ffffff; --panel-2: #f1f4f8; --ink: #0f172a; --muted: #5b6678; --line: #dde3ea;
  --accent: #2563eb; --edge: #b6c0cd; --edge-hi: #0f172a; --shadow: 0 1px 2px rgba(15,23,42,.06), 0 4px 14px rgba(15,23,42,.05);
  --built: #15803d; --in-progress: #2563eb; --stubbed: #b45309; --planned: #7c8799;
  --live: #15803d; --concept: #0e7490; --test: #7c3aed; --building: #2563eb; --unknown: #7c8799;
  --client: #7c3aed; --owner: #b45309; --agent: #2563eb; --warn: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #0d1117; --panel: #151b23; --panel-2: #1b2330; --ink: #e6edf3; --muted: #9aa6b5; --line: #2a3441;
    --accent: #60a5fa; --edge: #3a4656; --edge-hi: #e6edf3; --shadow: none;
    --built: #4ade80; --in-progress: #60a5fa; --stubbed: #fbbf24; --planned: #94a3b8;
    --live: #4ade80; --concept: #22d3ee; --test: #c4b5fd; --building: #60a5fa; --unknown: #94a3b8;
    --client: #c4b5fd; --owner: #fbbf24; --agent: #60a5fa; --warn: #f87171;
  }
}
:root[data-theme="dark"] {
  --bg: #0d1117; --panel: #151b23; --panel-2: #1b2330; --ink: #e6edf3; --muted: #9aa6b5; --line: #2a3441;
  --accent: #60a5fa; --edge: #3a4656; --edge-hi: #e6edf3; --shadow: none;
  --built: #4ade80; --in-progress: #60a5fa; --stubbed: #fbbf24; --planned: #94a3b8;
  --live: #4ade80; --concept: #22d3ee; --test: #c4b5fd; --building: #60a5fa; --unknown: #94a3b8;
  --client: #c4b5fd; --owner: #fbbf24; --agent: #60a5fa; --warn: #f87171;
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
.sub { color: var(--muted); font-size: 13px; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 18px 0 14px; }
.tile { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; box-shadow: var(--shadow); text-align: left; cursor: pointer; }
.tile .v { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.tile .k { color: var(--muted); font-size: 12px; }
.tile .bar { display: flex; height: 5px; border-radius: 3px; overflow: hidden; margin-top: 6px; background: var(--panel-2); }
.tile.warn .v { color: var(--warn); }
.icon-btn { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
nav.tabs { display: flex; gap: 4px; flex-wrap: wrap; border-bottom: 1px solid var(--line); margin-bottom: 16px; position: sticky; top: 0; background: var(--bg); z-index: 20; padding-top: 6px; }
nav.tabs button { border: 0; background: none; padding: 8px 12px; border-bottom: 2px solid transparent; color: var(--muted); cursor: pointer; font-weight: 600; }
nav.tabs button[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--accent); }
nav.tabs .count { font-weight: 500; font-size: 11px; color: var(--muted); margin-left: 4px; }
section.view { display: none; }
section.view.on { display: block; }
.toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); background: var(--panel); border-radius: 999px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
.chip[aria-pressed="false"] { opacity: .45; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: 0 0 auto; }
input[type="search"] { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; color: var(--ink); min-width: 220px; font: inherit; }
.hint { color: var(--muted); font-size: 12px; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; box-shadow: var(--shadow); }
.badge { display: inline-block; color: #fff; font-size: 10.5px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
:root[data-theme="dark"] .badge { color: #0d1117; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .badge { color: #0d1117; } }

/* system diagram */
.sys { position: relative; isolation: isolate; }
.sys svg.edges { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: visible; }
.lanes { display: grid; grid-template-columns: 1fr 2fr 1fr 1fr; gap: 56px; }
.lane { border: 1px dashed var(--line); border-radius: 12px; padding: 10px; background: color-mix(in srgb, var(--panel) 55%, transparent); }
.lane h3 { margin: 0; font-size: 13px; }
.lane .lsub { color: var(--muted); font-size: 11.5px; margin: 1px 0 10px; }
.lane .stack { display: grid; gap: 10px; }
.lane.hangar .stack { grid-template-columns: 1fr 1fr; }
.lane.infra { margin-top: 56px; }
.lane.infra .stack { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.node { position: relative; z-index: 2; background: var(--panel); border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 9px; padding: 7px 9px; cursor: pointer; box-shadow: var(--shadow); transition: opacity .15s, transform .15s, box-shadow .15s; text-align: left; width: 100%; }
.node:hover, .node:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--c); }
.node .nh { display: flex; justify-content: space-between; gap: 6px; align-items: baseline; }
.node .nn { font-weight: 650; font-size: 12.5px; }
.node .nd { color: var(--muted); font-size: 11.5px; margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.node .deg { color: var(--muted); font-size: 10.5px; white-space: nowrap; }
.sys.focus .node:not(.hi) { opacity: .22; }
.sys .node.off { opacity: .12; }
.sys .node.sel { box-shadow: 0 0 0 2px var(--c), 0 6px 18px rgba(0,0,0,.15); }
path.edge { fill: none; stroke: var(--edge); stroke-width: 1.4; transition: opacity .15s; }
path.edge.soft { stroke-dasharray: 4 4; opacity: .55; }
path.edge.hi { stroke: var(--edge-hi); stroke-width: 2; opacity: 1; }
.sys.focus path.edge:not(.hi), path.edge.off { opacity: .08; }
text.elabel { font-size: 10.5px; fill: var(--ink); paint-order: stroke; stroke: var(--bg); stroke-width: 4px; stroke-linejoin: round; display: none; }
.sys.labels text.elabel, text.elabel.hi { display: block; }
.sys.focus text.elabel:not(.hi) { display: none; }
@media (max-width: 960px) { .lanes { grid-template-columns: 1fr; gap: 28px; } .lane.hangar .stack { grid-template-columns: 1fr; } }

/* fleet */
.fleet { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }
.fleet svg { width: 100%; height: auto; display: block; }
.fleet .spoke { stroke: var(--edge); stroke-width: 2; }
.fleet .spoke.dashed { stroke-dasharray: 5 5; }
.fleet g.client { cursor: pointer; }
.fleet g.client circle.ring { fill: var(--panel); stroke-width: 3; }
.fleet g.client:hover circle.ring, .fleet g.client:focus circle.ring { stroke-width: 5; }
.fleet text { fill: var(--ink); font-size: 12px; }
.fleet text.small { fill: var(--muted); font-size: 10.5px; }
.cards { display: grid; gap: 8px; }
.ccard { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 10px; align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 9px 11px; cursor: pointer; text-align: left; width: 100%; }
.ccard:hover { border-color: var(--accent); }
.ccard .meta { grid-column: 2 / 4; color: var(--muted); font-size: 12px; }
.verts { margin-top: 14px; }
.verts .row { display: flex; align-items: center; gap: 8px; padding: 4px 0; border-top: 1px solid var(--line); font-size: 12.5px; }
.verts .row:first-of-type { border-top: 0; }
.verts .row .grow { flex: 1; }
@media (max-width: 960px) { .fleet { grid-template-columns: 1fr; } }

/* pipeline */
.pipe-scroll { overflow-x: auto; padding-bottom: 6px; }
.pipe { position: relative; isolation: isolate; display: grid; grid-template-columns: 90px repeat(var(--n), 128px); grid-template-rows: repeat(3, minmax(92px, auto)); column-gap: 34px; row-gap: 0; min-width: max-content; }
.pipe svg.edges { position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none; overflow: visible; }
.pipe .lanehead { grid-column: 1; display: flex; align-items: center; font-weight: 700; font-size: 12px; color: var(--lc); border-top: 1px dashed var(--line); }
.pipe .laneband { grid-column: 2 / -1; border-top: 1px dashed var(--line); }
.pipe .laneband.r1, .pipe .lanehead.r1 { border-top: 0; }
.step { position: relative; z-index: 2; align-self: center; margin: 10px 0; background: var(--panel); border: 1px solid var(--line); border-top: 3px solid var(--lc); border-radius: 9px; padding: 6px 8px; cursor: pointer; text-align: left; box-shadow: var(--shadow); }
.step:hover { box-shadow: 0 0 0 2px var(--lc); }
.step .sn { font-size: 10.5px; color: var(--muted); font-weight: 700; display: flex; justify-content: space-between; }
.step .st { font-size: 12px; font-weight: 600; line-height: 1.3; }
.step .gate { color: var(--warn); font-size: 10px; }
path.pedge { fill: none; stroke: var(--edge); stroke-width: 1.6; }

/* queue */
.queue { display: grid; grid-template-columns: minmax(260px, 380px) 1fr; gap: 16px; align-items: start; }
.secbar { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; padding: 6px 8px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; width: 100%; background: none; text-align: left; }
.secbar:hover { background: var(--panel-2); }
.secbar[aria-pressed="true"] { border-color: var(--accent); background: var(--panel-2); }
.secbar .nm { font-size: 12px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.secbar .ct { font-size: 11px; color: var(--muted); font-variant-numeric: tabular-nums; }
.secbar .track { grid-column: 1 / 3; display: flex; height: 6px; border-radius: 3px; overflow: hidden; background: var(--panel-2); }
.secbar .open { background: var(--accent); }
.secbar .done { background: var(--built); opacity: .55; }
details.item { background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; margin-bottom: 7px; }
details.item summary { cursor: pointer; list-style: none; }
details.item summary::-webkit-details-marker { display: none; }
details.item .sec { color: var(--accent); font-size: 11px; font-weight: 600; }
details.item .body { margin-top: 6px; color: var(--muted); font-size: 12.5px; }
details.item.nested { margin-left: 18px; }
@media (max-width: 960px) { .queue { grid-template-columns: 1fr; } }

/* decisions + activity */
.hist { width: 100%; height: 120px; display: block; }
.hist rect.b { fill: var(--accent); opacity: .75; cursor: pointer; }
.hist rect.b:hover, .hist rect.b.sel { opacity: 1; fill: var(--ink); }
.hist text { fill: var(--muted); font-size: 10px; }
.timeline { position: relative; margin-left: 10px; padding-left: 20px; border-left: 2px solid var(--line); }
.timeline .tdate { position: relative; font-size: 12px; font-weight: 700; color: var(--muted); margin: 14px 0 6px; }
.timeline .tdate::before { content: ""; position: absolute; left: -27px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg); }
.timeline details { background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; margin-bottom: 6px; }
.timeline summary { cursor: pointer; font-weight: 600; font-size: 13px; }
.timeline .body { color: var(--muted); font-size: 12.5px; margin-top: 6px; }
.entry { background: var(--panel); border: 1px solid var(--line); border-radius: 9px; padding: 8px 11px; margin-bottom: 6px; font-size: 12.5px; }
.entry .d { color: var(--muted); font-size: 11px; font-weight: 700; margin-right: 6px; }

/* files */
.tree { font: 12.5px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; }
.tree details { margin-left: 16px; }
.tree > details { margin-left: 0; }
.tree summary { cursor: pointer; }
.tree .f { margin-left: 30px; }
.tree .desc { font-family: ui-sans-serif, system-ui, sans-serif; color: var(--muted); font-size: 12px; margin-left: 10px; }
.tree .priv { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 10px; color: var(--owner); border: 1px solid currentColor; border-radius: 4px; padding: 0 4px; margin-left: 6px; }

/* drawer */
.drawer { position: fixed; top: 0; right: 0; height: 100%; width: min(460px, 100vw); background: var(--panel); border-left: 1px solid var(--line); box-shadow: -10px 0 30px rgba(0,0,0,.12); transform: translateX(105%); transition: transform .2s ease; z-index: 50; overflow-y: auto; padding: 18px 18px 40px; }
.drawer.open { transform: none; }
.drawer h2 { margin: 6px 0 4px; font-size: 18px; }
.drawer h4 { margin: 18px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
.drawer .close { position: absolute; top: 12px; right: 12px; }
.drawer ul { margin: 0; padding-left: 18px; }
.drawer li { margin-bottom: 6px; font-size: 13px; }
.drawer .link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; text-align: left; }
.drawer p { font-size: 13px; }
.kv { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: 13px; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; }
footer { margin-top: 28px; color: var(--muted); font-size: 12px; }
`;

/* eslint-disable no-undef -- runs in the browser, serialised into the page */
function client(DATA) {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const h = (tag, attrs = {}, html = "") => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "style") el.style.cssText = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v != null) el.setAttribute(k, v);
    }
    if (html) el.innerHTML = html;
    return el;
  };
  function inline(s) {
    return String(s ?? "")
      .split("`")
      .map((seg, i) => {
        if (i % 2) return `<code>${esc(seg)}</code>`;
        return esc(seg)
          .replace(/~~([^~]+)~~/g, "<del>$1</del>")
          .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
          .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) =>
            /^https?:/.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : `<span>${t}</span>`,
          )
          .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
      })
      .join("");
  }
  const md = (s) =>
    String(s ?? "")
      .split(/\n\s*\n/)
      .map((p) => `<p>${p.split("\n").map((l, i) => (i && /^([-*]|\d+\.|\|)\s/.test(l) ? "<br>" : " ") + inline(l)).join("").trim()}</p>`)
      .join("");
  const firstSentence = (s) => s.replace(/\*\*/g, "").replace(/\s*\n\s*/g, " ").split(/(?<=[.!?])\s(?=[A-Z(*`])/)[0];
  const color = (k) => `var(--${k}, var(--unknown))`;
  const STATUS = ["built", "in-progress", "stubbed", "planned"];
  const STATUS_LABEL = { built: "built", "in-progress": "in progress", stubbed: "stubbed", planned: "planned" };
  const badge = (k, label) => `<span class="badge" style="background:${color(k)}">${esc(label ?? STATUS_LABEL[k] ?? k)}</span>`;

  // ---------- theme ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const savedTheme = store.get("arch-theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  $("#theme").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("arch-theme", next);
    requestAnimationFrame(redrawAll);
  });

  // ---------- drawer ----------
  const drawer = $("#drawer");
  function openDrawer(html) {
    $("#drawer-body").innerHTML = html;
    drawer.classList.add("open");
    drawer.focus();
  }
  function closeDrawer() {
    drawer.classList.remove("open");
    clearSelection();
  }
  $("#drawer .close").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());
  drawer.addEventListener("click", (e) => {
    const t = e.target.closest("[data-goto]");
    if (t) selectNode(t.dataset.goto, true);
    const c = e.target.closest("[data-client]");
    if (c) showClient(c.dataset.client);
  });

  // ---------- tiles ----------
  const counts = Object.fromEntries(STATUS.map((s) => [s, DATA.nodes.filter((n) => n.status === s).length]));
  const openTodos = DATA.todos.items.filter((t) => !t.done);
  const inProd = DATA.registry.filter((c) => ["live", "concept", "test"].includes(c.category)).length;
  const lastDay = DATA.changelog[0]?.date ?? "—";
  const statusBar = STATUS.map((s) => `<span style="flex:${counts[s]};background:${color(s)}"></span>`).join("");
  const tiles = [
    { v: `${counts.built}/${DATA.nodes.length}`, k: "components built", bar: statusBar, tab: "system" },
    { v: `${inProd}/${DATA.registry.length}`, k: "client sites in production", tab: "fleet" },
    { v: DATA.pipeline.length, k: "pipeline steps", tab: "pipeline" },
    { v: openTodos.length, k: "open TODOs", tab: "queue" },
    { v: DATA.decisions.length, k: "decisions", tab: "decisions" },
    { v: lastDay, k: `last activity · ${DATA.changelog.length} entries`, tab: "activity" },
  ];
  if (DATA.drift.length) tiles.push({ v: DATA.drift.length, k: "drift warnings", warn: true, drift: true });
  const tileBox = $("#tiles");
  for (const t of tiles) {
    const el = h("button", { class: `tile${t.warn ? " warn" : ""}` }, `<div class="v">${esc(t.v)}</div><div class="k">${esc(t.k)}</div>${t.bar ? `<div class="bar">${t.bar}</div>` : ""}`);
    el.addEventListener("click", () => (t.drift ? showDrift() : show(t.tab)));
    tileBox.append(el);
  }
  function showDrift() {
    openDrawer(`${badge("warn", "drift")}<h2>The map and the repo disagree</h2>
      <p class="hint">Fix the source, not this page: add or update a row in STATUS.md § Architecture nodes / edges, then regenerate.</p>
      <ul>${DATA.drift.map((d) => `<li>${esc(d.text)}</li>`).join("")}</ul>`);
  }

  // ---------- tabs ----------
  const TABS = [
    ["system", "System", DATA.nodes.length],
    ["fleet", "Fleet", DATA.registry.length],
    ["pipeline", "Change pipeline", DATA.pipeline.length],
    ["queue", "Queue", openTodos.length],
    ["decisions", "Decisions", DATA.decisions.length],
    ["activity", "Activity", DATA.changelog.length],
    ["files", "Files", ""],
  ];
  const nav = $("#tabs");
  for (const [id, label, n] of TABS) {
    nav.append(h("button", { role: "tab", "data-tab": id, onclick: () => show(id) }, `${esc(label)}${n !== "" ? `<span class="count">${n}</span>` : ""}`));
  }
  function show(id) {
    if (!TABS.some((t) => t[0] === id)) id = "system";
    $$("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id)));
    $$("section.view").forEach((s) => s.classList.toggle("on", s.id === id));
    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    requestAnimationFrame(redrawAll);
  }

  // ---------- shared: connector geometry ----------
  function connector(a, b, sameLane) {
    const ax = (a.left + a.right) / 2, ay = (a.top + a.bottom) / 2;
    const bx = (b.left + b.right) / 2, by = (b.top + b.bottom) / 2;
    const xOverlap = !(a.right < b.left || b.right < a.left);
    const yOverlap = !(a.bottom < b.top || b.bottom < a.top);
    let p0, p1, c0, c1;
    if (sameLane && xOverlap) {
      const x = Math.max(a.right, b.right);
      const bulge = 22 + Math.min(70, Math.abs(by - ay) * 0.12);
      p0 = [a.right, ay]; p1 = [b.right, by];
      c0 = [x + bulge, ay]; c1 = [x + bulge, by];
    } else if (!xOverlap && (yOverlap || Math.abs(bx - ax) >= Math.abs(by - ay))) {
      const dir = bx > ax ? 1 : -1;
      p0 = [dir > 0 ? a.right : a.left, ay]; p1 = [dir > 0 ? b.left : b.right, by];
      const k = Math.max(30, Math.abs(p1[0] - p0[0]) * 0.45);
      c0 = [p0[0] + dir * k, ay]; c1 = [p1[0] - dir * k, by];
    } else {
      const dir = by > ay ? 1 : -1;
      p0 = [ax, dir > 0 ? a.bottom : a.top]; p1 = [bx, dir > 0 ? b.top : b.bottom];
      const k = Math.max(30, Math.abs(p1[1] - p0[1]) * 0.45);
      c0 = [ax, p0[1] + dir * k]; c1 = [bx, p1[1] - dir * k];
    }
    const mid = [0.125 * p0[0] + 0.375 * c0[0] + 0.375 * c1[0] + 0.125 * p1[0], 0.125 * p0[1] + 0.375 * c0[1] + 0.375 * c1[1] + 0.125 * p1[1]];
    return { d: `M${p0} C${c0} ${c1} ${p1}`, mid };
  }
  const relRect = (el, box) => {
    const r = el.getBoundingClientRect();
    return { left: r.left - box.left, right: r.right - box.left, top: r.top - box.top, bottom: r.bottom - box.top };
  };
  const ARROWS = `<defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--edge)"/></marker>
    <marker id="arr-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--edge-hi)"/></marker></defs>`;

  // ---------- system ----------
  const GROUPS = [
    ["intake", "Intake", "one adapter per channel → one pipeline"],
    ["hangar", "hangar (this repo)", "mission control: playbooks + guardrails"],
    ["spokes", "Spokes", "one repo per client site"],
    ["delivery", "Delivery", "hosting, previews, what the site does"],
  ];
  const known = new Set([...GROUPS.map((g) => g[0]), "infra"]);
  const groupOf = (n) => (known.has(n.group) ? n.group : "infra");
  const nodeIdx = new Map(DATA.nodes.map((n, i) => [n.name, i]));
  const out = DATA.nodes.map(() => []), inn = DATA.nodes.map(() => []);
  DATA.edges.forEach((e, i) => {
    out[nodeIdx.get(e.from)].push(i);
    inn[nodeIdx.get(e.to)].push(i);
  });
  const sys = $("#sys");
  const lanesEl = h("div", { class: "lanes" });
  const nodeEls = [];
  const mkLane = (id, title, sub) => {
    const lane = h("div", { class: `lane ${id}` }, `<h3>${esc(title)}</h3><div class="lsub">${esc(sub)}</div>`);
    const stack = h("div", { class: "stack" });
    DATA.nodes.forEach((n, i) => {
      if (groupOf(n) !== id) return;
      const deg = out[i].length + inn[i].length;
      const el = h("button", { class: "node", style: `--c:${color(n.status)}`, "data-i": i, title: n.name },
        `<div class="nh"><span class="nn">${esc(n.name)}</span>${deg ? `<span class="deg">${deg} ⇄</span>` : ""}</div><div class="nd">${inline(n.notes)}</div>`);
      el.addEventListener("mouseenter", () => focusNode(i));
      el.addEventListener("mouseleave", () => focusNode(selected));
      el.addEventListener("focus", () => focusNode(i));
      el.addEventListener("click", () => selectNode(n.name, true));
      nodeEls[i] = el;
      stack.append(el);
    });
    lane.append(stack);
    return lane;
  };
  for (const [id, t, s] of GROUPS) lanesEl.append(mkLane(id, t, s));
  sys.append(lanesEl, mkLane("infra", "Supporting infrastructure", "tools and hosts the pipeline leans on"));
  const sysSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  sysSvg.setAttribute("class", "edges");
  sys.prepend(sysSvg);
  let edgeEls = [];
  function drawSystem() {
    if (!sys.offsetParent) return;
    const box = sys.getBoundingClientRect();
    sysSvg.innerHTML = ARROWS;
    edgeEls = DATA.edges.map((e) => {
      const a = nodeIdx.get(e.from), b = nodeIdx.get(e.to);
      const { d, mid } = connector(relRect(nodeEls[a], box), relRect(nodeEls[b], box), groupOf(DATA.nodes[a]) === groupOf(DATA.nodes[b]));
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      p.setAttribute("class", /^extends$/i.test(e.label) ? "edge soft" : "edge");
      p.setAttribute("marker-end", "url(#arr)");
      const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
      t.setAttribute("class", "elabel");
      t.setAttribute("x", mid[0]);
      t.setAttribute("y", mid[1]);
      t.setAttribute("text-anchor", "middle");
      t.textContent = e.label;
      sysSvg.append(p, t);
      return { p, t, a, b };
    });
    applyFilters();
    focusNode(selected);
  }
  let selected = null;
  function focusNode(i) {
    sys.classList.toggle("focus", i != null);
    const nb = new Set(i == null ? [] : [i, ...out[i].map((k) => nodeIdx.get(DATA.edges[k].to)), ...inn[i].map((k) => nodeIdx.get(DATA.edges[k].from))]);
    nodeEls.forEach((el, k) => {
      el.classList.toggle("hi", nb.has(k));
      el.classList.toggle("sel", k === selected);
    });
    edgeEls.forEach((e) => {
      const on = i != null && (e.a === i || e.b === i);
      e.p.classList.toggle("hi", on);
      e.t.classList.toggle("hi", on);
      e.p.setAttribute("marker-end", on ? "url(#arr-hi)" : "url(#arr)");
    });
  }
  function selectNode(name, open) {
    const i = nodeIdx.get(name);
    if (i == null) return;
    if (!$("#system").classList.contains("on")) show("system");
    selected = i;
    focusNode(i);
    nodeEls[i].scrollIntoView({ block: "nearest", behavior: "smooth" });
    if (!open) return;
    const n = DATA.nodes[i];
    const list = (idxs, end, arrow) =>
      idxs.length
        ? `<ul>${idxs.map((k) => {
            const e = DATA.edges[k];
            return `<li>${arrow} <button class="link" data-goto="${esc(e[end])}">${esc(e[end])}</button>${e.label ? ` <span class="hint">· ${esc(e.label)}</span>` : ""}</li>`;
          }).join("")}</ul>`
        : `<p class="hint">none</p>`;
    const g = GROUPS.find((x) => x[0] === groupOf(n));
    openDrawer(`${badge(n.status)} <span class="hint">${esc(g ? g[1] : "Supporting infrastructure")}</span>
      <h2>${esc(n.name)}</h2>${md(n.notes)}
      <h4>Feeds into</h4>${list(out[i], "to", "→")}
      <h4>Fed by</h4>${list(inn[i], "from", "←")}`);
  }
  function clearSelection() {
    selected = null;
    focusNode(null);
  }
  sys.addEventListener("click", (e) => {
    if (!e.target.closest(".node")) closeDrawer();
  });
  const off = new Set();
  const sysTools = $("#sys-tools");
  for (const s of STATUS) {
    const chip = h("button", { class: "chip", "aria-pressed": "true" }, `<span class="dot" style="background:${color(s)}"></span>${STATUS_LABEL[s]} · ${counts[s]}`);
    chip.addEventListener("click", () => {
      off.has(s) ? off.delete(s) : off.add(s);
      chip.setAttribute("aria-pressed", String(!off.has(s)));
      applyFilters();
    });
    sysTools.append(chip);
  }
  const sysQ = h("input", { type: "search", placeholder: "Filter components…", "aria-label": "Filter components" });
  sysQ.addEventListener("input", applyFilters);
  const lblBtn = h("button", { class: "chip", "aria-pressed": "false" }, "edge labels");
  lblBtn.addEventListener("click", () => {
    const on = !sys.classList.contains("labels");
    sys.classList.toggle("labels", on);
    lblBtn.setAttribute("aria-pressed", String(on));
  });
  sysTools.append(sysQ, lblBtn, h("span", { class: "hint" }, "Hover to trace connections · click for details"));
  function applyFilters() {
    const q = sysQ.value.trim().toLowerCase();
    const hidden = DATA.nodes.map((n) => off.has(n.status) || (q && !`${n.name} ${n.notes}`.toLowerCase().includes(q)));
    nodeEls.forEach((el, i) => el.classList.toggle("off", hidden[i]));
    edgeEls.forEach((e) => e.p.classList.toggle("off", hidden[e.a] || hidden[e.b]));
  }

  // ---------- fleet ----------
  const CAT_LABEL = { live: "live", concept: "live · concept", test: "test", building: "building" };
  const vertNode = (v) => DATA.nodes.find((n) => n.name.toLowerCase().startsWith(v.toLowerCase() + " build playbook") || (v === "law" && /law-office/i.test(n.name)));
  function clientMentions(c) {
    const keys = [c.slug, c.name, c.repo, c.slug.split("-")[0]].filter((k) => k && k.length >= 6).map((k) => k.toLowerCase());
    return DATA.changelog.filter((e) => keys.some((k) => e.text.toLowerCase().includes(k)));
  }
  function clientTodos(c) {
    const keys = [c.name, c.name.replace(/[,(].*$/, "").trim(), c.slug].map((k) => k.toLowerCase()).filter((k) => k.length >= 4);
    return DATA.todos.items.filter((t) => !t.done && keys.some((k) => t.section.toLowerCase().includes(k)));
  }
  function showClient(slug) {
    const c = DATA.registry.find((x) => x.slug === slug);
    if (!c) return;
    const vn = vertNode(c.vertical);
    const todos = clientTodos(c);
    const log = clientMentions(c);
    openDrawer(`${badge(c.category, CAT_LABEL[c.category] || c.category)}
      <h2>${esc(c.label)}</h2>
      <dl class="kv">
        <dt>Vertical</dt><dd>${esc(c.vertical)}${vn ? ` · playbook <button class="link" data-goto="${esc(vn.name)}">${esc(vn.status)}</button>` : ""}</dd>
        <dt>Status</dt><dd>${esc(c.status)}</dd>
        <dt>Spoke</dt><dd>${c.repoUrl ? `<a href="${esc(c.repoUrl)}" target="_blank" rel="noopener">${esc(c.repo)}</a>` : esc(c.repo)}</dd>
        <dt>Domain</dt><dd>${c.domainUrl ? `<a href="${esc(c.domainUrl)}" target="_blank" rel="noopener">${esc(c.domain)}</a>` : esc(c.domain)}</dd>
        <dt>Record</dt><dd><code>private/clients/${esc(c.record)}</code></dd>
      </dl>
      <h4>Open TODOs · ${todos.length}</h4>${todos.length ? `<ul>${todos.map((t) => `<li>${inline(firstSentence(t.text))}</li>`).join("")}</ul>` : `<p class="hint">none in a client section</p>`}
      <h4>Recent activity · ${log.length} entries</h4>${log.length ? `<ul>${log.slice(0, 8).map((e) => `<li><span class="hint">${e.date}</span> ${inline(firstSentence(e.text))}</li>`).join("")}</ul>` : `<p class="hint">none</p>`}`);
  }
  (function drawFleet() {
    const W = 760, H = 600, cx = W / 2, cy = H / 2, R = 215;
    const n = DATA.registry.length;
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hub and spoke: hangar and its client sites">`;
    let nodesSvg = "";
    DATA.registry.forEach((c, i) => {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      svg += `<line class="spoke${c.category === "building" ? " dashed" : ""}" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`;
      const below = Math.sin(a) > -0.2;
      const ty = below ? y + 52 : y - 66;
      nodesSvg += `<g class="client" tabindex="0" role="button" data-slug="${esc(c.slug)}" aria-label="${esc(c.label)}">
        <circle class="ring" cx="${x}" cy="${y}" r="34" style="stroke:${color(c.category)}"/>
        <text x="${x}" y="${y + 4}" text-anchor="middle" style="font-weight:700;fill:${color(c.category)}">${esc(c.vertical)}</text>
        <text x="${x}" y="${ty}" text-anchor="middle" style="font-weight:650">${esc(c.name)}</text>
        <text class="small" x="${x}" y="${ty + 14}" text-anchor="middle">${esc(c.domain.replace(/\s*\(.*$/, ""))}</text>
        <text class="small" x="${x}" y="${ty + 27}" text-anchor="middle">${esc(CAT_LABEL[c.category] || c.category)}</text></g>`;
    });
    svg += `<circle cx="${cx}" cy="${cy}" r="58" style="fill:var(--ink)"/>
      <text x="${cx}" y="${cy - 2}" text-anchor="middle" style="fill:var(--bg);font-weight:800;font-size:16px">hangar</text>
      <text x="${cx}" y="${cy + 15}" text-anchor="middle" style="fill:var(--bg);font-size:10.5px;opacity:.8">playbooks · registry</text>${nodesSvg}</svg>`;
    const cats = [...new Set(DATA.registry.map((c) => c.category))];
    const legend = cats.map((k) => `<span class="chip" style="cursor:default"><span class="dot" style="background:${color(k)}"></span>${esc(CAT_LABEL[k] || k)} · ${DATA.registry.filter((c) => c.category === k).length}</span>`).join(" ");
    const verts = [...new Set(DATA.registry.map((c) => c.vertical))];
    const vertRows = verts.map((v) => {
      const vn = vertNode(v);
      const who = DATA.registry.filter((c) => c.vertical === v).map((c) => c.name).join(", ");
      return `<div class="row"><strong>${esc(v)}</strong><span class="grow hint">${esc(who)}</span>${vn ? `<button class="link" style="background:none;border:0;cursor:pointer" data-goto="${esc(vn.name)}">${badge(vn.status)}</button>` : badge("planned", "no playbook node")}</div>`;
    }).join("");
    const cards = DATA.registry.map((c) => `<button class="ccard" data-client="${esc(c.slug)}"><span class="dot" style="background:${color(c.category)}"></span><strong>${esc(c.label)}</strong><span class="hint">${esc(c.vertical)}</span><span class="meta">${esc(c.status)}</span></button>`).join("");
    $("#fleet-body").innerHTML = `<div class="panel"><div class="toolbar">${legend}<span class="hint">Click a client for its record, TODOs, and history</span></div>${svg}</div>
      <div><div class="cards">${cards}</div><div class="panel verts"><h3 style="margin:0 0 6px;font-size:13px">Verticals → build playbook</h3>${vertRows}</div></div>`;
    $("#fleet-body").addEventListener("click", (e) => {
      const g = e.target.closest("[data-slug],[data-client]");
      if (g) return showClient(g.dataset.slug || g.dataset.client);
      const v = e.target.closest("[data-goto]");
      if (v) selectNode(v.dataset.goto, true);
    });
    $("#fleet-body").addEventListener("keydown", (e) => {
      const g = e.target.closest("[data-slug]");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); showClient(g.dataset.slug); }
    });
  })();

  // ---------- pipeline ----------
  const LANES = [["client", "Client"], ["owner", "Owner"], ["agent", "Agent"]];
  const pipe = $("#pipe");
  pipe.style.setProperty("--n", DATA.pipeline.length);
  LANES.forEach(([id, label], r) => {
    pipe.append(
      h("div", { class: `lanehead${r ? "" : " r1"}`, style: `grid-row:${r + 1};--lc:${color(id)}` }, esc(label)),
      h("div", { class: `laneband${r ? "" : " r1"}`, style: `grid-row:${r + 1}` }),
    );
  });
  const stepEls = DATA.pipeline.map((s, i) => {
    const r = LANES.findIndex((l) => l[0] === s.lane) + 1;
    const el = h("button", { class: "step", style: `grid-column:${i + 2};grid-row:${r};--lc:${color(s.lane)}` },
      `<div class="sn"><span>${s.n}</span>${s.gate ? `<span class="gate">◆ gate</span>` : ""}</div><div class="st">${esc(s.title)}</div>`);
    el.addEventListener("click", () => {
      const extra = /apply the playbook/i.test(s.title) && DATA.changePlaybooks.length
        ? `<h4>Recipes that plug in here · ${DATA.changePlaybooks.length}</h4><ul>${DATA.changePlaybooks.map((f) => `<li><code>playbooks/change/${esc(f)}</code></li>`).join("")}</ul>`
        : "";
      openDrawer(`${badge(s.lane, LANES.find((l) => l[0] === s.lane)[1])} ${s.gate ? badge("warn", "gate") : ""}<h2>${s.n}. ${esc(s.title)}</h2>${md(s.body)}${extra}`);
    });
    pipe.append(el);
    return el;
  });
  const pipeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  pipeSvg.setAttribute("class", "edges");
  pipe.prepend(pipeSvg);
  function drawPipe() {
    if (!pipe.offsetParent) return;
    const box = pipe.getBoundingClientRect();
    let s = ARROWS;
    for (let i = 0; i + 1 < stepEls.length; i++) {
      const { d } = connector(relRect(stepEls[i], box), relRect(stepEls[i + 1], box), false);
      s += `<path class="pedge" d="${d}" marker-end="url(#arr)"/>`;
    }
    pipeSvg.innerHTML = s;
  }

  // ---------- queue ----------
  const secs = DATA.todos.sections.filter((s) => DATA.todos.items.some((t) => t.section === s));
  let secFilter = null;
  const secBox = $("#q-secs");
  const maxSec = Math.max(1, ...secs.map((s) => DATA.todos.items.filter((t) => t.section === s).length));
  for (const s of secs) {
    const all = DATA.todos.items.filter((t) => t.section === s);
    const o = all.filter((t) => !t.done).length, d = all.length - o;
    const b = h("button", { class: "secbar", "aria-pressed": "false", title: s },
      `<span class="nm">${esc(s)}</span><span class="ct">${o} open · ${d} done</span>
       <span class="track" style="width:${Math.max(8, (all.length / maxSec) * 100)}%"><span class="open" style="flex:${o}"></span><span class="done" style="flex:${d}"></span></span>`);
    b.addEventListener("click", () => {
      secFilter = secFilter === s ? null : s;
      $$(".secbar", secBox).forEach((x) => x.setAttribute("aria-pressed", String(x === b && secFilter === s)));
      drawQueue();
    });
    secBox.append(b);
  }
  const qQ = $("#q-search"), qDone = $("#q-done");
  qQ.addEventListener("input", drawQueue);
  qDone.addEventListener("change", drawQueue);
  function drawQueue() {
    const q = qQ.value.trim().toLowerCase();
    const items = DATA.todos.items.filter((t) => (qDone.checked || !t.done) && (!secFilter || t.section === secFilter) && (!q || t.text.toLowerCase().includes(q)));
    $("#q-count").textContent = `${items.length} shown`;
    $("#q-list").innerHTML = items.map((t) => {
      const [head, ...rest] = t.text.split("\n");
      return `<details class="item${t.depth ? " nested" : ""}"><summary><span class="sec">${esc(t.section)}</span>${t.done ? " ✓" : ""}<br>${inline(head)}</summary>${rest.length ? `<div class="body">${md(rest.join("\n"))}</div>` : ""}</details>`;
    }).join("") || `<p class="hint">Nothing matches.</p>`;
  }
  drawQueue();

  // ---------- histogram (decisions by month, activity by day) ----------
  function histogram(el, buckets, onPick) {
    const W = 1000, H = 120, pad = 18, n = buckets.length, max = Math.max(1, ...buckets.map((b) => b.n));
    const bw = (W - pad * 2) / n;
    let s = "";
    buckets.forEach((b, i) => {
      const bh = (b.n / max) * (H - 38);
      s += `<rect class="b" data-k="${esc(b.k)}" x="${pad + i * bw + 1}" y="${H - 20 - bh}" width="${Math.max(2, bw - 2)}" height="${Math.max(b.n ? 2 : 0, bh)}"><title>${esc(b.label)}: ${b.n}</title></rect>`;
      if (b.tick) s += `<text x="${pad + i * bw + bw / 2}" y="${H - 6}" text-anchor="middle">${esc(b.tick)}</text>`;
    });
    el.setAttribute("viewBox", `0 0 ${W} ${H}`);
    el.setAttribute("preserveAspectRatio", "none");
    el.innerHTML = s;
    el.addEventListener("click", (e) => {
      const r = e.target.closest("rect.b");
      if (!r) return;
      const was = r.classList.contains("sel");
      $$("rect.b", el).forEach((x) => x.classList.remove("sel"));
      if (!was) r.classList.add("sel");
      onPick(was ? null : r.dataset.k);
    });
  }

  // ---------- decisions ----------
  const months = [...new Set(DATA.decisions.map((d) => d.date.slice(0, 7)))].sort();
  const allMonths = [];
  if (months.length) {
    let [y, m] = months[0].split("-").map(Number);
    const [ey, em] = months.at(-1).split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      allMonths.push(`${y}-${String(m).padStart(2, "0")}`);
      if (++m > 12) { m = 1; y++; }
    }
  }
  let decMonth = null;
  histogram($("#d-hist"), allMonths.map((k) => ({ k, n: DATA.decisions.filter((d) => d.date.startsWith(k)).length, label: k, tick: k })), (k) => { decMonth = k; drawDecisions(); });
  $("#d-search").addEventListener("input", drawDecisions);
  function drawDecisions() {
    const q = $("#d-search").value.trim().toLowerCase();
    const list = DATA.decisions.filter((d) => (!decMonth || d.date.startsWith(decMonth)) && (!q || `${d.title} ${d.body}`.toLowerCase().includes(q))).slice().reverse();
    let html = "", last = "";
    for (const d of list) {
      if (d.date !== last) { html += `<div class="tdate">${d.date}</div>`; last = d.date; }
      html += `<details><summary>${inline(d.title)}</summary><div class="body">${md(d.body)}</div></details>`;
    }
    $("#d-count").textContent = `${list.length} shown`;
    $("#d-list").innerHTML = html || `<p class="hint">Nothing matches.</p>`;
  }
  drawDecisions();

  // ---------- activity ----------
  const days = [];
  if (DATA.changelog.length) {
    const end = new Date(DATA.changelog[0].date + "T00:00:00");
    for (let i = 59; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }
  }
  let actDay = null;
  histogram($("#a-hist"), days.map((k, i) => ({ k, n: DATA.changelog.filter((e) => e.date === k).length, label: k, tick: i % 7 === 0 || i === days.length - 1 ? k.slice(5) : "" })), (k) => { actDay = k; drawActivity(); });
  $("#a-search").addEventListener("input", drawActivity);
  function drawActivity() {
    const q = $("#a-search").value.trim().toLowerCase();
    const list = DATA.changelog.filter((e) => (!actDay || e.date === actDay) && (!q || e.text.toLowerCase().includes(q)));
    $("#a-count").textContent = `${list.length} shown${actDay ? ` on ${actDay}` : ""} · last 60 days charted`;
    $("#a-list").innerHTML = list.slice(0, 200).map((e) => `<div class="entry"><span class="d">${e.date}</span>${md(e.text).replace(/^<p>|<\/p>$/g, "")}</div>`).join("") || `<p class="hint">Nothing matches.</p>`;
  }
  drawActivity();

  // ---------- files ----------
  function treeHtml(nodes, depth) {
    return nodes.map((n) => {
      const desc = n.desc ? `<span class="desc">${esc(n.desc)}</span>` : "";
      const priv = depth === 0 && n.name === "private" ? `<span class="priv">private repo</span>` : "";
      if (!n.dir) return `<div class="f">${esc(n.name)}${desc}</div>`;
      return `<details${depth < 1 ? " open" : ""}><summary>${esc(n.name)}/${priv}${desc}</summary>${treeHtml(n.children, depth + 1)}</details>`;
    }).join("");
  }
  $("#tree").innerHTML = `<div style="margin-bottom:4px"><strong>${esc(DATA.root)}/</strong></div>${treeHtml(DATA.tree, 0)}`;

  // ---------- boot ----------
  function redrawAll() {
    drawSystem();
    drawPipe();
  }
  new ResizeObserver(() => requestAnimationFrame(redrawAll)).observe(document.body);
  window.addEventListener("hashchange", () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || "system");
  document.fonts?.ready.then(redrawAll);
}

const json = JSON.stringify(DATA).replace(/</g, "\\u003c");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hangar architecture</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>hangar — system architecture</h1>
      <div class="sub">Hub-and-spoke: hangar holds the knowledge; each client site is its own repo. Generated ${DATA.generatedAt}.</div>
    </div>
    <button class="icon-btn" id="theme" aria-label="Toggle light or dark theme">◐ theme</button>
  </header>
  <div class="tiles" id="tiles"></div>
  <nav class="tabs" id="tabs" role="tablist"></nav>

  <section class="view" id="system">
    <div class="toolbar" id="sys-tools"></div>
    <div class="sys" id="sys"></div>
  </section>

  <section class="view" id="fleet">
    <div class="fleet" id="fleet-body"></div>
  </section>

  <section class="view" id="pipeline">
    <div class="toolbar"><span class="hint">The anatomy of a change (playbooks/README.md). ◆ marks a gate that can stop the change. Click a step for the full text.</span></div>
    <div class="panel pipe-scroll"><div class="pipe" id="pipe"></div></div>
  </section>

  <section class="view" id="queue">
    <div class="queue">
      <div class="panel"><div class="toolbar" style="margin-bottom:6px"><strong style="font-size:13px">Sections</strong><span class="hint">click to filter</span></div><div id="q-secs"></div></div>
      <div>
        <div class="toolbar"><input type="search" id="q-search" placeholder="Search TODOs…" aria-label="Search TODOs"><label class="hint"><input type="checkbox" id="q-done"> include done</label><span class="hint" id="q-count"></span></div>
        <div id="q-list"></div>
      </div>
    </div>
  </section>

  <section class="view" id="decisions">
    <div class="panel" style="margin-bottom:12px"><div class="hint">Decisions per month · click a bar to filter</div><svg class="hist" id="d-hist"></svg></div>
    <div class="toolbar"><input type="search" id="d-search" placeholder="Search decisions…" aria-label="Search decisions"><span class="hint" id="d-count"></span></div>
    <div class="timeline" id="d-list"></div>
  </section>

  <section class="view" id="activity">
    <div class="panel" style="margin-bottom:12px"><div class="hint">CHANGELOG entries per day · click a bar to filter</div><svg class="hist" id="a-hist"></svg></div>
    <div class="toolbar"><input type="search" id="a-search" placeholder="Search the changelog…" aria-label="Search the changelog"><span class="hint" id="a-count"></span></div>
    <div id="a-list"></div>
  </section>

  <section class="view" id="files">
    <div class="panel tree" id="tree"></div>
  </section>

  <footer>Generated by <code>dev/build-architecture.mjs</code> from STATUS.md, REGISTRY.md, TODOS.md, CHANGELOG.md, DECISIONS.md, playbooks/README.md, CLAUDE.md, and the file tree. Do not hand-edit.</footer>
</div>
<aside class="drawer" id="drawer" tabindex="-1" aria-label="Details"><button class="icon-btn close" aria-label="Close details">✕</button><div id="drawer-body"></div></aside>
<script id="data" type="application/json">${json}</script>
<script>(${client.toString()})(JSON.parse(document.getElementById("data").textContent));</script>
</body>
</html>
`;

writeFileSync(OUT, html);
const counts = {};
for (const n of nodes) counts[n.status] = (counts[n.status] ?? 0) + 1;
console.log(
  `wrote private/architecture.html — ${nodes.length} nodes (${Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ")}), ${validEdges.length} edges, ${registry.length} clients, ${todos.items.filter((t) => !t.done).length} open todos`,
);
if (drift.length) {
  console.log(`drift: ${drift.length} — the map disagrees with the repo; fix STATUS.md § Architecture nodes/edges:`);
  for (const d of drift) console.log(`  - ${d.text}`);
}

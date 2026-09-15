#!/usr/bin/env node
/**
 * Generates dev/architecture.html — a self-contained, status-color-coded overview of
 * the hub-and-spoke system. Derives entirely from the state files so it can't drift:
 *
 *   - Nodes + statuses: the "## Architecture nodes" table in STATUS.md
 *     (columns: Node | Group | Status | Notes; group: intake|hangar|spokes|delivery|infra;
 *      status: built|in-progress|stubbed|planned)
 *   - Open queue: unchecked items in TODOS.md
 *   - File tree: the repo itself
 *
 * Run from anywhere: `node dev/build-architecture.mjs`. Zero dependencies.
 * The HTML is generated — never hand-edit it (CLAUDE.md state-layer ritual).
 */

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dev", "architecture.html");

// ---------- parse STATUS.md architecture-nodes table ----------

function parseNodes(md) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => /^##\s+Architecture nodes/i.test(l));
  if (start === -1) throw new Error('STATUS.md is missing the "## Architecture nodes" section');
  const nodes = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s/.test(line)) break;
    const m = line.match(/^\|(.+)\|\s*$/);
    if (!m) continue;
    const cells = m[1].split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    if (/^[-: ]*$/.test(cells[0]) || /^node$/i.test(cells[0])) continue; // separator / header row
    nodes.push({
      name: cells[0],
      group: cells[1].toLowerCase(),
      status: cells[2].toLowerCase(),
      notes: cells[3],
    });
  }
  if (nodes.length === 0) throw new Error("No rows parsed from the Architecture nodes table");
  return nodes;
}

// ---------- parse TODOS.md unchecked items ----------

function parseTodos(md) {
  const items = [];
  let section = "";
  for (const line of md.split("\n")) {
    const h = line.match(/^##\s+(.+)/);
    if (h) section = h[1].trim();
    const m = line.match(/^[-*]\s+\[ \]\s+(.+)/);
    if (m) {
      // first sentence only, markdown bold stripped — this is a glanceable queue
      const text = m[1].replace(/\*\*/g, "").split(/(?<=\.)\s/)[0].trim();
      items.push({ section, text });
    }
  }
  return items;
}

// ---------- file tree ----------

const SKIP = new Set([".git", "node_modules", ".DS_Store"]);

function buildTree(dir, prefix = "") {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((e) => !SKIP.has(e.name))
    .sort((a, b) =>
      a.isDirectory() === b.isDirectory()
        ? a.name.localeCompare(b.name)
        : a.isDirectory()
          ? -1
          : 1,
    );
  let out = "";
  entries.forEach((e, i) => {
    const last = i === entries.length - 1;
    out += `${prefix}${last ? "└── " : "├── "}${e.name}${e.isDirectory() ? "/" : ""}\n`;
    if (e.isDirectory()) out += buildTree(join(dir, e.name), prefix + (last ? "    " : "│   "));
  });
  return out;
}

// ---------- render ----------

const STATUS_META = {
  built: { label: "built", color: "#16a34a" },
  "in-progress": { label: "in progress", color: "#2563eb" },
  stubbed: { label: "stubbed", color: "#d97706" },
  planned: { label: "planned", color: "#94a3b8" },
};

const FLOW_GROUPS = [
  { id: "intake", title: "Intake", sub: "one adapter per channel → one pipeline" },
  { id: "hangar", title: "hangar (this repo)", sub: "mission control — playbooks & guardrails" },
  { id: "spokes", title: "Spokes", sub: "one repo per client site" },
  { id: "delivery", title: "Delivery", sub: "hosting & preview deploys" },
];
const INFRA_ID = "infra";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function card(n) {
  const meta = STATUS_META[n.status] ?? { label: n.status, color: "#64748b" };
  return `<div class="card" style="border-left-color:${meta.color}">
    <div class="card-head"><span class="card-name">${esc(n.name)}</span>
    <span class="badge" style="background:${meta.color}">${esc(meta.label)}</span></div>
    <div class="card-notes">${esc(n.notes)}</div></div>`;
}

const status = readFileSync(join(ROOT, "STATUS.md"), "utf8");
const todosMd = readFileSync(join(ROOT, "TODOS.md"), "utf8");
const nodes = parseNodes(status);
const todos = parseTodos(todosMd);
const tree = buildTree(ROOT);
const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });

const counts = {};
for (const n of nodes) counts[n.status] = (counts[n.status] ?? 0) + 1;
const knownGroups = new Set([...FLOW_GROUPS.map((g) => g.id), INFRA_ID]);
const infraNodes = nodes.filter((n) => n.group === INFRA_ID || !knownGroups.has(n.group));

const flowCols = FLOW_GROUPS.map((g, i) => {
  const cards = nodes.filter((n) => n.group === g.id).map(card).join("\n");
  const arrow = i < FLOW_GROUPS.length - 1 ? `<div class="arrow">→</div>` : "";
  return `<div class="col"><div class="col-title">${esc(g.title)}</div>
    <div class="col-sub">${esc(g.sub)}</div>${cards}</div>${arrow}`;
}).join("\n");

const legend = Object.entries(STATUS_META)
  .map(
    ([k, m]) =>
      `<span class="legend-item"><span class="dot" style="background:${m.color}"></span>${m.label}${counts[k] ? ` (${counts[k]})` : ""}</span>`,
  )
  .join("");

const todoShow = todos.slice(0, 8);
const todoList = todoShow
  .map((t) => `<li><span class="todo-sec">${esc(t.section)}</span> ${esc(t.text)}</li>`)
  .join("\n");
const todoMore = todos.length > todoShow.length ? `<p class="more">+ ${todos.length - todoShow.length} more in TODOS.md</p>` : "";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>hangar — architecture</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font: 15px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; background: #f8fafc; color: #0f172a; }
  h1 { margin: 0; font-size: 22px; }
  .meta { color: #64748b; font-size: 13px; margin: 4px 0 6px; }
  .legend { display: flex; gap: 16px; flex-wrap: wrap; margin: 10px 0 24px; font-size: 13px; color: #334155; }
  .legend-item { display: inline-flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .flow { display: flex; gap: 10px; align-items: flex-start; }
  .col { flex: 1; min-width: 0; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .col-title { font-weight: 700; font-size: 14px; }
  .col-sub { color: #64748b; font-size: 12px; margin: 2px 0 12px; }
  .arrow { align-self: center; color: #94a3b8; font-size: 22px; padding: 0 2px; flex: 0 0 auto; }
  .card { border: 1px solid #e2e8f0; border-left-width: 4px; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; background: #fff; }
  .card-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .card-name { font-weight: 600; font-size: 13px; }
  .badge { color: #fff; font-size: 10px; padding: 2px 7px; border-radius: 999px; white-space: nowrap; }
  .card-notes { color: #64748b; font-size: 12px; margin-top: 3px; }
  .band { margin-top: 14px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .band .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; margin-top: 10px; }
  .band .card { margin-bottom: 0; }
  .lower { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; margin-top: 14px; }
  .panel { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; }
  .panel h2 { margin: 0 0 10px; font-size: 14px; }
  .panel ul { margin: 0; padding-left: 18px; }
  .panel li { margin-bottom: 7px; font-size: 13px; }
  .todo-sec { color: #2563eb; font-weight: 600; font-size: 11px; margin-right: 4px; }
  .more { color: #64748b; font-size: 12px; margin: 8px 0 0; }
  pre { margin: 0; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; color: #334155; overflow-x: auto; }
  footer { margin-top: 18px; color: #94a3b8; font-size: 12px; }
  @media (max-width: 900px) { .flow { flex-direction: column; } .arrow { transform: rotate(90deg); align-self: center; } .lower { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<h1>hangar — system architecture</h1>
<div class="meta">Hub-and-spoke: hangar holds the knowledge; each client site is its own repo. Last generated: ${esc(generatedAt)}</div>
<div class="legend">${legend}</div>

<div class="flow">
${flowCols}
</div>

<div class="band">
  <div class="col-title">Supporting infrastructure</div>
  <div class="cards">
${infraNodes.map(card).join("\n")}
  </div>
</div>

<div class="lower">
  <div class="panel">
    <h2>Top of the queue (from TODOS.md)</h2>
    <ul>
${todoList}
    </ul>
    ${todoMore}
  </div>
  <div class="panel">
    <h2>File tree</h2>
    <pre>${esc(basename(ROOT))}/
${esc(tree)}</pre>
  </div>
</div>

<footer>Generated by <code>dev/build-architecture.mjs</code> from STATUS.md, TODOS.md, and the file tree — do not hand-edit.</footer>
</body>
</html>
`;

writeFileSync(OUT, html);
console.log(
  `wrote dev/architecture.html — ${nodes.length} nodes (${Object.entries(counts)
    .map(([k, v]) => `${v} ${k}`)
    .join(", ")}), ${todos.length} open todos`,
);

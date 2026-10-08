// Shared readers for the state files. Used by dev/build-architecture.mjs and
// dev/build-business.mjs so both pages parse STATUS, TODOS, CHANGELOG, DECISIONS, the
// registry, and the pipeline the same way. Zero dependencies.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRIVATE = join(ROOT, "private");

export const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

// ---------- markdown helpers ----------

export const cellsOf = (line) => line.replace(/^\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
export const isSeparator = (cells) => cells.every((c) => /^[-: ]*$/.test(c));

/** The first table at or after line index `from` (stopping at the next `## ` heading). */
export function tableFrom(lines, from) {
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

export function tableUnderHeading(md, headingRe) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  return start === -1 ? null : tableFrom(lines, start + 1);
}

export const stripMd = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*`_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
export const firstUrl = (s) => (s.match(/\]\((https?:[^)\s]+)\)/) || [])[1] || null;

/** Lines from a `## heading` (matching re) up to the next `## ` heading. */
export function section(md, headingRe) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return [];
  const out = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) out.push(lines[i]);
  return out;
}

// ---------- sources ----------

export function parseNodes(md) {
  const t = tableUnderHeading(md, /^##\s+Architecture nodes/i);
  if (!t) throw new Error('STATUS.md is missing the "## Architecture nodes" table');
  const nodes = t.rows
    .filter((c) => c.length >= 4)
    .map((c) => ({ name: c[0], group: c[1].toLowerCase(), status: c[2].toLowerCase(), notes: c[3] }));
  if (!nodes.length) throw new Error("No rows parsed from the Architecture nodes table");
  return nodes;
}

export function parseEdges(md) {
  const t = tableUnderHeading(md, /^##\s+Architecture edges/i);
  return t ? t.rows.filter((c) => c.length >= 2).map((c) => ({ from: c[0], to: c[1], label: c[2] || "" })) : [];
}

export function parseRegistry(md) {
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

export function parsePipeline(md) {
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

export function parseTodos(md) {
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

export function parseDecisions(md) {
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

export function parseChangelog(md) {
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

export function parseMap(md) {
  const t = tableUnderHeading(md, /^##\s+Map/i);
  const map = {};
  if (!t) return map;
  for (const [paths, what] of t.rows) {
    for (const [, p] of (paths || "").matchAll(/`([^`]+)`/g)) map[p.replace(/\/$/, "")] = stripMd(what || "");
  }
  return map;
}

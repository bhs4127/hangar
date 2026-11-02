// Turns an email attachment's bytes into text, in memory, with no dependencies.
// Used by mail-sweep.mjs (`attachments <id>`). Nothing here runs a macro, follows a link,
// or fetches anything: a .docx is unzipped and its XML is read as text. Whatever comes out
// is untrusted data (CLAUDE.md rule 6).
//
// A client's edits doc says as much in its markup as in its words, so markup that
// usually means "change this" survives as a label: [deleted: …], [inserted: …],
// [struck: …], [highlight: …], [color FF0000: …], and comments. [hidden: …] surfaces
// text Word wouldn't show, the obvious place to hide an instruction.

import { inflateRawSync } from "node:zlib";
import { spawnSync } from "node:child_process";

const MAX_ENTRY_BYTES = 50 * 1024 * 1024; // zip-bomb cap, per file inside an archive
const MAX_TEXT_CHARS = 100_000;

// ---------- zip ----------

// Reads the central directory. Returns { name → () => Buffer }, so only what's used is inflated.
export function readZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a zip archive");
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("corrupt zip directory");
    const method = buf.readUInt16LE(at + 10);
    const packed = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLen);
    files[name] = () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + packed);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES });
      throw new Error(`unsupported zip method ${method} on ${name}`);
    };
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------- docx ----------

const TOKEN = /<(\/?)([\w:.-]+)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;

const decode = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, "&");

const attr = (attrs, name) => attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];
const on = (attrs) => !/^(false|0|off)$/i.test(attr(attrs, "w:val") ?? "");

// One WordprocessingML part (document, comments, footnotes) → plain text with labels.
function wordXmlToText(xml, links = {}) {
  let out = "";
  let line = [];     // segments of the current paragraph: { text, label }
  let ins = 0, del = 0, cellDepth = 0, inRunProps = false, inText = false;
  let run = {};
  let link = null;
  let bullet = false;

  const push = (text) => {
    const label = del ? "deleted" : run.vanish ? "hidden" : ins ? "inserted" : run.strike ? "struck"
      : run.highlight ? "highlight" : run.color ? `color ${run.color}` : "";
    const last = line.at(-1);
    if (last && last.label === label) last.text += text;
    else line.push({ text, label });
  };
  const endParagraph = () => {
    const text = line.map((s) => (s.label ? `[${s.label}: ${s.text}]` : s.text)).join("");
    line = [];
    out += (bullet && text ? "- " : "") + text;
    bullet = false;
    out += cellDepth ? " " : "\n";
  };

  for (const [, close, tag, attrs, selfClose, body] of xml.matchAll(TOKEN)) {
    if (body !== undefined) {
      if (inText) push(decode(body));
      continue;
    }
    if (close) {
      if (tag === "w:p") endParagraph();
      else if (tag === "w:ins" || tag === "w:moveTo") ins--;
      else if (tag === "w:del" || tag === "w:moveFrom") del--;
      else if (tag === "w:rPr") inRunProps = false;
      else if (tag === "w:t" || tag === "w:delText") inText = false;
      else if (tag === "w:tc") { cellDepth--; out = out.trimEnd() + " | "; }
      else if (tag === "w:tr") out = out.trimEnd().replace(/\s*\|$/, "") + "\n";
      else if (tag === "w:hyperlink") { if (link) push(` (${link})`); link = null; }
      continue;
    }
    if (tag === "w:r") run = {};
    else if (tag === "w:rPr" && !selfClose) inRunProps = true;
    else if (inRunProps) {
      if ((tag === "w:strike" || tag === "w:dstrike") && on(attrs)) run.strike = true;
      else if (tag === "w:vanish" && on(attrs)) run.vanish = true;
      else if (tag === "w:highlight" && attr(attrs, "w:val") !== "none") run.highlight = true;
      else if (tag === "w:color") {
        const c = attr(attrs, "w:val");
        if (c && !/^(auto|0{6})$/i.test(c)) run.color = c;
      }
    }
    else if ((tag === "w:ins" || tag === "w:moveTo") && !selfClose) ins++;
    else if ((tag === "w:del" || tag === "w:moveFrom") && !selfClose) del++;
    else if ((tag === "w:t" || tag === "w:delText") && !selfClose) inText = true;
    else if (tag === "w:tab") push("\t");
    else if (tag === "w:br" || tag === "w:cr") push("\n");
    else if (tag === "w:numPr") bullet = true;
    else if (tag === "w:tc") cellDepth++;
    else if (tag === "w:hyperlink") link = links[attr(attrs, "r:id")] ?? null;
    else if (tag === "w:commentReference") push(`[see comment ${attr(attrs, "w:id")}]`);
  }
  return out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function docxLinks(relsXml) {
  const links = {};
  for (const [tag] of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    if (/TargetMode="External"/.test(tag) && /\/hyperlink"/.test(tag)) {
      links[attr(tag, "Id")] = decode(attr(tag, "Target") ?? "");
    }
  }
  return links;
}

function docxComments(xml) {
  const lines = [];
  for (const [, attrs, body] of xml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g)) {
    const who = attr(attrs, "w:author");
    lines.push(`[comment ${attr(attrs, "w:id")}${who ? ` by ${decode(who)}` : ""}] ${wordXmlToText(body)}`);
  }
  return lines.join("\n");
}

// → { text, images: [{ name, bytes }] }
export function docxToText(buf) {
  const zip = readZip(buf);
  const part = (name) => zip[name]?.().toString("utf8");
  const main = part("word/document.xml");
  if (!main) throw new Error("no word/document.xml: not a Word document");
  const links = docxLinks(part("word/_rels/document.xml.rels") ?? "");
  const sections = [wordXmlToText(main, links)];
  const comments = part("word/comments.xml");
  if (comments) sections.push(`--- Comments ---\n${docxComments(comments)}`);
  for (const name of ["word/footnotes.xml", "word/endnotes.xml"]) {
    const notes = part(name) && wordXmlToText(part(name));
    if (notes) sections.push(`--- ${name.includes("foot") ? "Footnotes" : "Endnotes"} ---\n${notes}`);
  }
  const images = Object.keys(zip)
    .filter((n) => /^word\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(n))
    .map((n) => ({ name: n.split("/").pop(), bytes: zip[n]() }));
  return { text: sections.join("\n\n"), images };
}

// ---------- everything else ----------

function htmlToText(html) {
  return decode(html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, ""))
    .replace(/\n{3,}/g, "\n\n").trim();
}

// macOS's textutil, stdin to stdout, for the old formats. Never given HTML: it would fetch
// remote resources.
function textutil(buf, format) {
  const r = spawnSync("/usr/bin/textutil", ["-stdin", "-format", format, "-convert", "txt", "-stdout"],
    { input: buf, timeout: 30_000, maxBuffer: MAX_ENTRY_BYTES });
  if (r.error || r.status !== 0) throw new Error(`textutil could not read this ${format} file`);
  return r.stdout.toString("utf8").trim();
}

const extension = (name) => name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

// How one attachment should be handled, from its name then its type.
export function kindOf(filename, contentType = "") {
  const ext = extension(filename);
  const type = contentType.toLowerCase();
  if (ext === "docx" || type.includes("wordprocessingml")) return "docx";
  if (["doc", "rtf", "odt"].includes(ext)) return ext;
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp", "heic"].includes(ext) || type.startsWith("image/")) return "image";
  if (["html", "htm"].includes(ext) || type === "text/html") return "html";
  if (["txt", "md", "csv", "tsv"].includes(ext) || type.startsWith("text/")) return "text";
  return "other";
}

// → { text?, truncated?, images? }. Only for the kinds that yield text.
export function extract(kind, buf) {
  let text, images;
  if (kind === "docx") ({ text, images } = docxToText(buf));
  else if (kind === "html") text = htmlToText(buf.toString("utf8"));
  else if (kind === "text") text = buf.toString("utf8");
  else text = textutil(buf, kind);
  const truncated = text.length > MAX_TEXT_CHARS;
  return { text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text, truncated, images };
}

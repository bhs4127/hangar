// Upload drop: one place clients send batches of photos too big for email
// (playbooks/setup-upload-drop.md, DECISIONS 2026-10-07).
//
// Public side: each client has one unguessable link, /u/<token>. It serves a page that
// accepts image files only, checked by their first bytes, not the name or the browser's
// claimed type, and writes them to R2 under uploads/<slug>/<date>/. That's all a link can
// do. It can't read, list, or delete anything, and an upload is never a request: what
// the photos are for still arrives by email from a verified sender (rules 6–7).
//
// Admin side: /admin/*, bearer token (Worker secret ADMIN_TOKEN). Mint, list, and
// revoke links; list uploads; download one file. Called only by automation/upload-drop.mjs
// and automation/mail-sweep.mjs (list only).
//
// Storage layout in the bucket (binding UPLOADS):
//   links/<sha256(token)>.json        { slug, label, created }   never expires
//   uploads/<slug>/<yyyy-mm-dd>/…      the files                  lifecycle rule: 30 days
//
// Nothing here names a client, a domain, or an account. Those live in the private
// wrangler config (private/upload-drop/wrangler.jsonc). AGENCY_NAME is a var from there.

const MAX_FILE = 50 * 1024 * 1024; // a full-size camera JPEG is 10–25MB; RAW isn't accepted
const DAILY_BYTES = 2 * 1024 ** 3; // per client per UTC day; the bucket's free tier is 10GB
const DAILY_FILES = 300;
const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

// ---------- helpers ----------

const enc = new TextEncoder();

async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// The token is in the URL path, so the page must never leak it: no referrer, no caching,
// no indexing, nothing loaded from another origin.
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
  "x-content-type-options": "nosniff",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; " +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

// Image types we accept, by magic bytes. Anything else is refused before it's stored.
function sniff(b) {
  const at = (i, ...xs) => xs.every((x, j) => b[i + j] === x);
  const ascii = (i, s) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (at(0, 0xff, 0xd8, 0xff)) return { ext: "jpg", mime: "image/jpeg" };
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return { ext: "png", mime: "image/png" };
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return { ext: "webp", mime: "image/webp" };
  if (at(0, 0x49, 0x49, 0x2a, 0x00) || at(0, 0x4d, 0x4d, 0x00, 0x2a)) return { ext: "tif", mime: "image/tiff" };
  if (ascii(4, "ftyp")) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (brand === "avif" || brand === "avis") return { ext: "avif", mime: "image/avif" };
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand))
      return { ext: "heic", mime: "image/heic" };
  }
  return null;
}

// A client-chosen filename is kept only as a hint for the operator, never trusted.
function cleanName(raw) {
  let s = String(raw ?? "").split(/[\\/]/).pop();
  s = s.replace(/\.[^.]*$/, "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-");
  s = s.replace(/^-+|-+$/g, "").slice(0, 60);
  return s || "photo";
}

async function linkFor(env, token) {
  if (!TOKEN.test(token)) return null;
  const obj = await env.UPLOADS.get(`links/${await sha256hex(token)}.json`);
  return obj ? obj.json() : null;
}

async function listAll(env, prefix, include) {
  const out = [];
  let cursor;
  do {
    const page = await env.UPLOADS.list({ prefix, cursor, include, limit: 1000 });
    out.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}

// ---------- public: the upload page and the upload itself ----------

async function upload(request, env, link, rawName) {
  const len = Number(request.headers.get("content-length"));
  if (!Number.isFinite(len) || len <= 0) return json({ error: "length-required" }, 411);
  if (len > MAX_FILE) return json({ error: "too-big" }, 413);

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const dir = `uploads/${link.slug}/${day}/`;
  const today = await listAll(env, dir);
  const used = today.reduce((n, o) => n + o.size, 0);
  if (today.length >= DAILY_FILES || used + len > DAILY_BYTES) return json({ error: "daily-limit" }, 429);

  // Read just enough to identify the file, then stream the rest straight to R2.
  const reader = request.body.getReader();
  let head = new Uint8Array(0);
  while (head.length < 16) {
    const { value, done } = await reader.read();
    if (done) break;
    const next = new Uint8Array(head.length + value.length);
    next.set(head);
    next.set(value, head.length);
    head = next;
  }
  const type = sniff(head);
  if (!type) {
    await reader.cancel();
    return json({ error: "not-an-image" }, 415);
  }

  const stamp = now.toISOString().slice(11, 19).replace(/:/g, "");
  const rand = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const key = `${dir}${stamp}-${rand}-${cleanName(rawName)}.${type.ext}`;

  const { readable, writable } = new FixedLengthStream(len);
  const writer = writable.getWriter();
  const pump = (async () => {
    try {
      await writer.write(head);
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
      await writer.close();
    } catch (e) {
      await writer.abort(e).catch(() => {});
    }
  })();
  try {
    await Promise.all([
      env.UPLOADS.put(key, readable, { httpMetadata: { contentType: type.mime } }),
      pump,
    ]);
  } catch {
    return json({ error: "incomplete" }, 400); // body shorter or longer than its Content-Length
  }
  return json({ ok: true });
}

function deadPage(env) {
  const body = `<main><h1>This upload link isn't active</h1>
<p>It may have been replaced with a new one. Reply to our last email and we'll send you a fresh link.</p></main>`;
  return new Response(shell("Link not active", body, env), { status: 404, headers: PAGE_HEADERS });
}

function shell(title, main, env, script = "") {
  const agency = env.AGENCY_NAME ? esc(env.AGENCY_NAME) : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}${agency ? ` · ${agency}` : ""}</title>
<style>
:root { --bg: #f7f6f3; --card: #fff; --ink: #1d1d1b; --muted: #55534e; --line: #d9d6cf;
  --accent: #1f4e79; --accent-ink: #fff; --ok: #1e6b3a; --bad: #a3271f; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #161615; --card: #201f1d; --ink: #f1efe9;
  --muted: #b9b5ac; --line: #3a3833; --accent: #8cb8e6; --accent-ink: #10202f; --ok: #7fd39b; --bad: #ff9a90; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 40rem; margin: 0 auto; padding: 2.5rem 1rem 4rem; }
h1 { font-size: 1.7rem; line-height: 1.2; margin: 0 0 .5rem; }
p { margin: 0 0 1rem; }
.muted { color: var(--muted); }
.drop { margin: 1.5rem 0; padding: 2rem 1rem; border: 2px dashed var(--line); border-radius: 12px; background: var(--card); text-align: center; }
.drop.over { border-color: var(--accent); }
.button { display: inline-block; padding: .75rem 1.25rem; border-radius: 8px; background: var(--accent); color: var(--accent-ink); font-weight: 600; cursor: pointer; border: 0; font: inherit; }
.button:focus-within, .button:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
input[type=file] { position: absolute; width: 1px; height: 1px; opacity: 0; }
ul { list-style: none; padding: 0; margin: 0; }
li { display: flex; justify-content: space-between; gap: 1rem; padding: .6rem 0; border-bottom: 1px solid var(--line); }
li span:first-child { overflow-wrap: anywhere; }
li span:last-child { white-space: nowrap; color: var(--muted); }
li.done span:last-child { color: var(--ok); }
li.failed span:last-child { color: var(--bad); white-space: normal; text-align: right; }
.summary { font-weight: 600; margin: 1.5rem 0 .5rem; }
footer { margin-top: 3rem; font-size: .9rem; color: var(--muted); }
</style>
</head>
<body>
${main}
${script}
</body>
</html>`;
}

function uploadPage(env, link) {
  const agency = env.AGENCY_NAME ? esc(env.AGENCY_NAME) : "us";
  const main = `<main>
<h1>Send us your photos</h1>
<p>For <strong>${esc(link.label)}</strong>. Full size is best: don't shrink them first.</p>
<p class="muted">Photos only (JPEG, PNG, HEIC, WebP, AVIF or TIFF), up to 50 MB each.</p>
<div class="drop" id="drop">
  <label class="button">Choose photos<input id="pick" type="file" accept="image/*,.heic,.heif" multiple></label>
  <p class="muted" style="margin:.75rem 0 0">or drag them here</p>
</div>
<p class="summary" id="summary" role="status" aria-live="polite"></p>
<ul id="list" aria-label="Your photos"></ul>
<p id="next" hidden><strong>All done.</strong> Now reply to our email and tell us what they're for. We won't use them until you do.</p>
<footer>This link is just for you. It only accepts photos. You can't see or change what's already been sent, so it's safe to use again later.<br>${agency === "us" ? "" : agency}</footer>
</main>`;
  const script = `<script>
(() => {
  const MAX = ${MAX_FILE};
  const reasons = { "too-big": "Too big (over 50 MB)", "not-an-image": "Not a photo we can use",
    "daily-limit": "Daily limit reached, try again tomorrow", "length-required": "Couldn't read this file" };
  const list = document.getElementById("list"), summary = document.getElementById("summary");
  const next = document.getElementById("next"), drop = document.getElementById("drop");
  const queue = []; let total = 0, ok = 0, bad = 0, active = 0;
  const mb = (n) => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  function status() {
    const left = total - ok - bad;
    summary.textContent = left ? "Uploading… " + ok + " of " + total + " done" :
      ok + " of " + total + " uploaded" + (bad ? ", " + bad + " couldn't be sent" : "") + ".";
    next.hidden = left > 0 || ok === 0;
  }
  function finish(item, good, text) {
    item.li.className = good ? "done" : "failed"; item.state.textContent = text;
    good ? ok++ : bad++; active--; status(); pump();
  }
  function send(item) {
    active++;
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", location.pathname.replace(/\\/$/, "") + "/files?name=" + encodeURIComponent(item.file.name));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) item.state.textContent = Math.floor(e.loaded / e.total * 100) + "%"; };
    xhr.onload = () => {
      let err; try { err = JSON.parse(xhr.responseText).error; } catch {}
      xhr.status === 200 ? finish(item, true, "Sent") : finish(item, false, reasons[err] || "Didn't send, try again");
    };
    xhr.onerror = () => finish(item, false, "Connection lost, try again");
    xhr.send(item.file);
  }
  function pump() { while (active < 3 && queue.length) send(queue.shift()); }
  function add(files) {
    for (const file of files) {
      const li = document.createElement("li"), name = document.createElement("span"), state = document.createElement("span");
      name.textContent = file.name; state.textContent = mb(file.size);
      li.append(name, state); list.append(li); total++;
      const item = { file, li, state };
      if (file.size > MAX) { active++; finish(item, false, reasons["too-big"]); continue; } // finish() decrements
      queue.push(item); state.textContent = "Waiting";
    }
    status(); pump();
  }
  document.getElementById("pick").addEventListener("change", (e) => { add(e.target.files); e.target.value = ""; });
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", (e) => add(e.dataTransfer.files));
  window.addEventListener("beforeunload", (e) => { if (total - ok - bad > 0) e.preventDefault(); });
})();
</script>`;
  return new Response(shell("Send us your photos", main, env, script), { headers: PAGE_HEADERS });
}

// ---------- admin ----------

async function authorized(request, env) {
  const got = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!env.ADMIN_TOKEN || !got) return false;
  const [a, b] = await Promise.all([got, env.ADMIN_TOKEN].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function admin(request, env, url, parts) {
  if (!(await authorized(request, env))) return json({ error: "unauthorized" }, 401);
  const [, what, arg] = parts; // ["admin", what, arg]
  const method = request.method;

  if (what === "links" && method === "POST") {
    const { slug, label } = await request.json().catch(() => ({}));
    if (!SLUG.test(slug ?? "")) return json({ error: "slug must be kebab-case" }, 400);
    if (!label || typeof label !== "string" || label.length > 100) return json({ error: "label required (≤100 chars)" }, 400);
    const token = newToken();
    const record = { slug, label, created: new Date().toISOString() };
    await env.UPLOADS.put(`links/${await sha256hex(token)}.json`, JSON.stringify(record), {
      httpMetadata: { contentType: "application/json" },
    });
    return json({ ...record, url: `${url.origin}/u/${token}` });
  }

  if (what === "links" && method === "GET") {
    const objs = await listAll(env, "links/");
    const links = await Promise.all(objs.map(async (o) => ({
      id: o.key.slice(6, 18), ...(await (await env.UPLOADS.get(o.key)).json()),
    })));
    return json({ links: links.sort((a, b) => a.slug.localeCompare(b.slug) || a.created.localeCompare(b.created)) });
  }

  if (what === "links" && method === "DELETE") {
    if (!SLUG.test(arg ?? "")) return json({ error: "DELETE /admin/links/<slug>" }, 400);
    const objs = await listAll(env, "links/");
    const doomed = [];
    for (const o of objs) if ((await (await env.UPLOADS.get(o.key)).json()).slug === arg) doomed.push(o.key);
    if (doomed.length) await env.UPLOADS.delete(doomed);
    return json({ slug: arg, revoked: doomed.length });
  }

  if (what === "uploads" && method === "GET") {
    const since = url.searchParams.get("since");
    const after = since ? Date.parse(since) : 0;
    if (Number.isNaN(after)) return json({ error: "since must be an ISO date" }, 400);
    const objs = await listAll(env, "uploads/", ["httpMetadata"]);
    const uploads = objs
      .filter((o) => o.uploaded.getTime() > after)
      .map((o) => ({
        key: o.key, slug: o.key.split("/")[1], size: o.size,
        uploaded: o.uploaded.toISOString(), type: o.httpMetadata?.contentType ?? null,
      }))
      .sort((a, b) => a.uploaded.localeCompare(b.uploaded) || a.key.localeCompare(b.key));
    return json({ count: uploads.length, uploads });
  }

  if (what === "file" && method === "GET") {
    const key = url.searchParams.get("key") ?? "";
    if (!key.startsWith("uploads/") || key.includes("..")) return json({ error: "key must be under uploads/" }, 400);
    const obj = await env.UPLOADS.get(key);
    if (!obj) return json({ error: "not found (uploads expire after 30 days)" }, 404);
    return new Response(obj.body, {
      headers: { "content-type": "application/octet-stream", "content-length": String(obj.size), "cache-control": "no-store" },
    });
  }

  return json({ error: "not found" }, 404);
}

// ---------- router ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    if (parts[0] === "admin") return admin(request, env, url, parts);

    if (parts[0] === "u" && parts[1]) {
      const link = await linkFor(env, parts[1]);
      if (parts.length === 2 && request.method === "GET") return link ? uploadPage(env, link) : deadPage(env);
      if (parts.length === 3 && parts[2] === "files" && request.method === "PUT") {
        if (!link) return json({ error: "link-inactive" }, 404);
        return upload(request, env, link, url.searchParams.get("name"));
      }
      return json({ error: "not found" }, 404);
    }

    return new Response("Not found\n", { status: 404, headers: { "content-type": "text/plain", "x-robots-tag": "noindex" } });
  },
};

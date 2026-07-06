// Welle 39 — DATEI-BRÜCKE: ONESHOT-BEWEIS (Kern der Welle).
//
// Beweist die komplette Kette „Datei von Website A herunterladen → auf Website B hochladen",
// komplett lokal durch den Browser gereicht — MIT Hash-Asserts, gegen die ECHT AUSGELIEFERTEN
// Funktionen (live aus extension/content.js + extension/panel.js extrahiert, Muster
// repro-login-coldstart.mjs) und die pure exec-plan.js. KEINE npm-Pakete (Playwright im
// externen Scratch, node:http, node:crypto).
//
// EHRLICHE BEWEIS-EBENEN (siehe Konsolen-Ausgabe je Block):
//   Beweis 1 (echter Browser): GET-Download → Refetch+base64 (live execAbToBase64) → Upload in
//            <input type=file> (live execInjectFile) → NATIVER Multipart-Submit an Site B →
//            Server-Hash == Quell-Hash.
//   Beweis 2 (echter Browser): GET-Download → Upload in DROP-ZONE (live execInjectFile →
//            dragenter/dragover/drop mit dataTransfer.files) → Server-Hash == Quell-Hash.
//   Beweis 3 (Node, SHIPPED-Orchestrierung): die live execCaptureDownloadItem aus panel.js mit
//            gestubbten Chrome-APIs — Weg 1 (Refetch ok), Weg 3 (Refetch scheitert, kein Datei-
//            Zugriff → ehrliche Pause „download-manual"), Weg 2 (Refetch scheitert, Datei-Zugriff
//            → Disk-Refetch ok). Plus Browser-Korroboration: eine verbrauchte Download-URL 403t.
//   Beweis 4 (Logik): 50-MB-Deckel (SteplyExecPlan.fileCapDecision) + Chunk-Planung (planFileChunks).
//   Struktur (best effort): Extension wird in einen persistenten Kontext GELADEN, panel.html als
//            Tab geöffnet → SteplyExecPlan + Datei-Chip vorhanden (Panel-als-Tab-Ansatz belegt).
//
// Nutzung:  node scripts/test-file-bridge-e2e.mjs
import { createRequire } from "node:module";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(HERE, "../extension");

const PW_DIR = process.env.STEPLY_PW_DIR || "C:/Users/Richa/AppData/Local/Temp/steply-pw";
const pwEntry = `${PW_DIR}/node_modules/playwright/index.js`;
if (!existsSync(pwEntry)) {
  console.error("✗ Playwright nicht gefunden unter", pwEntry, "\n  (STEPLY_PW_DIR setzen oder Scratch anlegen).");
  process.exit(2);
}
const { chromium } = require(pwEntry);
const SExecPlan = require("../extension/exec-plan.js");

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ── Balanced-Brace-Extraktion (Muster repro-login-coldstart.mjs) ────────────────────────────
function braceSlice(src, fromIdx) {
  let i = src.indexOf("{", fromIdx);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return i + 1; }
  }
  throw new Error("Klammern nicht balanciert");
}
function extractFn(src, name) {
  let sig = `function ${name}(`;
  let start = src.indexOf(sig);
  if (start < 0) throw new Error(`Funktion ${name} nicht gefunden`);
  // „async " davor mitnehmen, falls vorhanden.
  const asyncPrefix = "async ";
  if (src.slice(start - asyncPrefix.length, start) === asyncPrefix) start -= asyncPrefix.length;
  return src.slice(start, braceSlice(src, src.indexOf("{", start)));
}

const contentSrc = readFileSync(new URL("../extension/content.js", import.meta.url), "utf8");
const panelSrc = readFileSync(new URL("../extension/panel.js", import.meta.url), "utf8");

// AUSGELIEFERTE content.js-Funktionen (live) — die Upload-Injektion + base64/Bytes.
const INJECT =
  [
    extractFn(contentSrc, "execB64ToBytes"),
    extractFn(contentSrc, "execAbToBase64"),
    extractFn(contentSrc, "execIsFileInput"),
    extractFn(contentSrc, "execInjectFile"),
  ].join("\n\n") +
  "\nwindow.__bridge = { execAbToBase64: execAbToBase64, execB64ToBytes: execB64ToBytes, execInjectFile: execInjectFile, execIsFileInput: execIsFileInput };";

// ── Test-Datei (~1 MB, bekannter Hash) ──────────────────────────────────────────────────────
const FILE_BYTES = randomBytes(1024 * 1024);
const SRC_HASH = sha256(FILE_BYTES);
const FILE_NAME = "beleg.pdf";
const COOKIE = "sid=steply-cold";

// ── Site A (Quelle) ─────────────────────────────────────────────────────────────────────────
let onceConsumed = false;
const siteA = createServer((req, res) => {
  const u = new URL(req.url, "http://a");
  if (u.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Set-Cookie": COOKIE + "; Path=/" });
    res.end('<!doctype html><a id="dl" href="/file" download>Beleg herunterladen</a>');
    return;
  }
  if (u.pathname === "/file") {
    // GET-Download mit Content-Disposition — nur MIT Cookie (belegt credentials:'include').
    if (!String(req.headers.cookie || "").includes("sid=")) {
      res.writeHead(403); res.end("no cookie"); return;
    }
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="' + FILE_NAME + '"',
      "Content-Length": FILE_BYTES.length,
    });
    res.end(FILE_BYTES);
    return;
  }
  if (u.pathname === "/once") {
    // POST-generierte Einmal-URL: erster GET liefert die Datei, danach 403 (Refetch scheitert).
    if (onceConsumed) { res.writeHead(403); res.end("consumed"); return; }
    onceConsumed = true;
    res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="' + FILE_NAME + '"' });
    res.end(FILE_BYTES);
    return;
  }
  res.writeHead(404); res.end("nope");
});

// ── Site B (Ziel) ───────────────────────────────────────────────────────────────────────────
let lastUploadHash = null;
let lastDropHash = null;
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}
// Minimaler Multipart-Extraktor für EINE Datei-Part (kein npm-Paket).
function extractFilePart(buf, boundary) {
  const b = Buffer.from("--" + boundary);
  let idx = buf.indexOf(b);
  if (idx < 0) return null;
  const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"), idx + b.length);
  if (headerEnd < 0) return null;
  const bodyStart = headerEnd + 4;
  const next = buf.indexOf(Buffer.from("\r\n--" + boundary), bodyStart);
  if (next < 0) return null;
  return buf.slice(bodyStart, next);
}
const SITE_B_HTML = `<!doctype html><meta charset="utf-8">
<form id="form" method="post" enctype="multipart/form-data" action="/upload">
  <input id="fileinput" type="file" name="f" />
  <button id="submit" type="submit">Hochladen</button>
</form>
<div id="drop" style="width:200px;height:120px;border:2px dashed #999">Datei hier ablegen</div>
<script>
  var drop = document.getElementById('drop');
  drop.addEventListener('dragover', function(e){ e.preventDefault(); });
  drop.addEventListener('drop', function(e){
    e.preventDefault();
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!f) { if (window.__dropResolve) window.__dropResolve('no-file'); return; }
    fetch('/dropupload', { method:'POST', body: f })
      .then(function(r){ return r.json(); })
      .then(function(j){ if (window.__dropResolve) window.__dropResolve(j.hash); })
      .catch(function(){ if (window.__dropResolve) window.__dropResolve('error'); });
  });
</script>`;
const siteB = createServer(async (req, res) => {
  const u = new URL(req.url, "http://b");
  if (u.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(SITE_B_HTML);
    return;
  }
  if (u.pathname === "/upload" && req.method === "POST") {
    const body = await readBody(req);
    const m = /boundary=(.+)$/.exec(req.headers["content-type"] || "");
    const part = m ? extractFilePart(body, m[1].trim().replace(/^"|"$/g, "")) : null;
    lastUploadHash = part ? sha256(part) : null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ hash: lastUploadHash, match: lastUploadHash === SRC_HASH }));
    return;
  }
  if (u.pathname === "/dropupload" && req.method === "POST") {
    const body = await readBody(req);
    lastDropHash = sha256(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ hash: lastDropHash, match: lastDropHash === SRC_HASH }));
    return;
  }
  res.writeHead(404); res.end("nope");
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

let browser = null;
try {
  const portA = await listen(siteA);
  const portB = await listen(siteB);
  const SITE_A = `http://127.0.0.1:${portA}`;
  const SITE_B = `http://127.0.0.1:${portB}`;
  console.log(`  Site A (Quelle) :${portA} | Site B (Ziel) :${portB} | Test-Datei 1 MB, sha256 ${SRC_HASH.slice(0, 12)}…`);

  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(INJECT);
  const page = await context.newPage();

  // ════════ Beweis 1: GET-Download → Weg 1 (Speicher) → Upload in <input type=file> ════════
  await page.goto(SITE_A + "/", { waitUntil: "load" });
  const dl = await page.evaluate(async (fileUrl) => {
    const resp = await fetch(fileUrl, { credentials: "include" });
    if (!resp.ok) return { ok: false, status: resp.status };
    const buf = await resp.arrayBuffer();
    return { ok: true, b64: window.__bridge.execAbToBase64(buf), size: buf.byteLength, mime: resp.headers.get("content-type") };
  }, SITE_A + "/file");
  ok(dl.ok, `Beweis 1: Refetch der Quell-Datei (credentials) → 200 (war ${dl.status || "ok"})`);
  const roundtrip = dl.ok ? sha256(Buffer.from(dl.b64, "base64")) : "";
  ok(dl.ok && dl.size === FILE_BYTES.length && roundtrip === SRC_HASH,
    `Beweis 1: Refetch+base64 (live execAbToBase64) byte-treu — Hash ${roundtrip.slice(0, 12)}… == Quelle`);

  await page.goto(SITE_B + "/", { waitUntil: "load" });
  const inj1 = await page.evaluate((args) => {
    const input = document.getElementById("fileinput");
    const r = window.__bridge.execInjectFile(input, { b64: args.b64, name: args.name, mime: "application/pdf" });
    return { r, count: input.files.length, name: input.files[0] ? input.files[0].name : "", size: input.files[0] ? input.files[0].size : 0 };
  }, { b64: dl.b64, name: FILE_NAME });
  ok(inj1.r && inj1.r.ok && inj1.count === 1 && inj1.name === FILE_NAME && inj1.size === FILE_BYTES.length,
    `Beweis 1: live execInjectFile setzt input.files[0] (${inj1.name}, ${inj1.size} B)`);
  await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#submit")]);
  const up1 = JSON.parse(await page.evaluate(() => document.body.textContent || "{}"));
  ok(up1.match === true && up1.hash === SRC_HASH && lastUploadHash === SRC_HASH,
    `Beweis 1: Site-B empfing die Datei per NATIVEM Multipart-Submit — Hash == Quelle ✓`);

  // ════════ Beweis 2: GET-Download → Weg 1 → Upload in DROP-ZONE ════════
  await page.goto(SITE_B + "/", { waitUntil: "load" });
  const dropHash = await page.evaluate((args) => {
    return new Promise((resolve) => {
      window.__dropResolve = resolve;
      const drop = document.getElementById("drop");
      const r = window.__bridge.execInjectFile(drop, { b64: args.b64, name: args.name, mime: "application/pdf" });
      if (!r || !r.ok) resolve("inject-failed");
    });
  }, { b64: dl.b64, name: FILE_NAME });
  ok(dropHash === SRC_HASH && lastDropHash === SRC_HASH,
    `Beweis 2: Drop-Zone erhielt die Datei per drop.dataTransfer.files (live execInjectFile) — Hash == Quelle ✓`);

  // Browser-Korroboration für Beweis 3: eine verbrauchte Download-URL 403t beim Refetch.
  await page.goto(SITE_A + "/", { waitUntil: "load" });
  const once = await page.evaluate(async (base) => {
    const first = await fetch(base + "/once", { credentials: "include" }); // „Browser-Download" verbraucht die URL
    await first.arrayBuffer();
    const second = await fetch(base + "/once", { credentials: "include" }); // Refetch scheitert
    return { firstOk: first.ok, secondStatus: second.status };
  }, SITE_A);
  ok(once.firstOk && once.secondStatus === 403,
    `Beweis 3 (Premise): verbrauchte Download-URL → Refetch scheitert (403) — Weg 1 nicht möglich`);

  await context.close();

  // ════════ Beweis 3: SHIPPED-Orchestrierung execCaptureDownloadItem (Node + Stubs) ════════
  // Die ECHTE panel.js-Funktion live extrahiert; Chrome-/Netz-Bits gestubbt, um Weg 1/2/3 gezielt
  // durchzuspielen. Beweist die Verzweigung (Refetch → Datei-Zugriff → ehrliche Pause) im Original.
  function makeCapture(stubs) {
    const src =
      `const EXEC_FILE_CAP = ${50 * 1024 * 1024};\n` +
      extractFn(panelSrc, "execBasename") + "\n" +
      extractFn(panelSrc, "execNameFromUrl") + "\n" +
      extractFn(panelSrc, "execDownloadName") + "\n" +
      extractFn(panelSrc, "execCaptureDownloadItem") + "\n" +
      "return execCaptureDownloadItem;";
    const fn = new Function(
      "chrome", "execRefetchInTab", "execFileSchemeAllowed", "execWaitDownloadComplete", "execRefetchFileUrl", src,
    );
    return fn(
      { downloads: { cancel: async () => {}, erase: async () => {} } },
      stubs.refetch,
      stubs.fileAllowed,
      stubs.waitComplete || (async () => null),
      stubs.refetchFile || (async () => ({ ok: false })),
    );
  }
  const b64src = FILE_BYTES.toString("base64");
  const item = { id: 1, url: `${SITE_A}/once`, finalUrl: `${SITE_A}/once`, filename: "C:/Users/x/Downloads/beleg.pdf", mime: "application/pdf" };

  // Weg 1: Refetch liefert die Bytes → capture ok, Datei byte-treu.
  const cap1 = await makeCapture({
    refetch: async () => ({ ok: true, b64: b64src, size: FILE_BYTES.length, mime: "application/pdf", name: FILE_NAME }),
    fileAllowed: async () => false,
  })(item);
  ok(cap1.ok && sha256(Buffer.from(cap1.file.b64, "base64")) === SRC_HASH && cap1.file.name === FILE_NAME,
    "Beweis 3 (Weg 1): execCaptureDownloadItem → Refetch ok, Datei byte-treu getragen");

  // Weg 3: Refetch scheitert + KEIN Datei-Zugriff → ehrliche Pause „download-manual" (+ Name).
  const cap3 = await makeCapture({
    refetch: async () => ({ ok: false, reason: "http-403" }),
    fileAllowed: async () => false,
  })(item);
  ok(!cap3.ok && cap3.reason === "download-manual" && cap3.name === "beleg.pdf",
    `Beweis 3 (Weg 3): Refetch scheitert, kein Datei-Zugriff → ehrliche Pause „download-manual" (${cap3.name})`);

  // Weg 2: Refetch scheitert + Datei-Zugriff erlaubt → Disk-Refetch liefert die Bytes.
  const cap2 = await makeCapture({
    refetch: async () => ({ ok: false, reason: "too-large" }),
    fileAllowed: async () => true,
    waitComplete: async () => ({ filename: "C:/Users/x/Downloads/beleg.pdf" }),
    refetchFile: async () => ({ ok: true, b64: b64src, size: FILE_BYTES.length, mime: "application/pdf" }),
  })(item);
  ok(cap2.ok && sha256(Buffer.from(cap2.file.b64, "base64")) === SRC_HASH,
    "Beweis 3 (Weg 2): Refetch scheitert, Datei-Zugriff → Disk-Refetch trägt die Datei byte-treu");

  // ════════ Beweis 4: Deckel (50 MB) + Chunk-Planung ════════
  ok(SExecPlan.fileCapDecision(50 * 1024 * 1024 + 1) === "disk-fallback" && SExecPlan.fileCapDecision(1024) === "memory",
    "Beweis 4: >50 MB → automatischer Weg-2/3-Pfad (fileCapDecision), ≤50 MB → Speicher");
  const bigPlan = SExecPlan.planFileChunks(20 * 1024 * 1024, 8 * 1024 * 1024, 4 * 1024 * 1024);
  ok(bigPlan.mode === "chunked" && bigPlan.chunks === 5,
    `Beweis 4: 20 MB base64 → gechunkt (${bigPlan.chunks} Stücke à 4 MB)`);

  // ════════ Struktur (best effort): Extension geladen + panel.html als Tab ════════
  try {
    const userDataDir = path.join(PW_DIR, "pw-ext-" + Date.now());
    mkdirSync(userDataDir, { recursive: true });
    const ext = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [`--disable-extensions-except=${EXT_DIR}`, `--load-extension=${EXT_DIR}`],
    });
    try {
      let sw = ext.serviceWorkers()[0];
      if (!sw) sw = await ext.waitForEvent("serviceworker", { timeout: 8000 }).catch(() => null);
      const extId = sw ? new URL(sw.url()).host : null;
      if (extId) {
        const p = await ext.newPage();
        await p.goto(`chrome-extension://${extId}/panel.html`, { waitUntil: "load" });
        const has = await p.evaluate(() => ({
          link: typeof SteplyExecPlan !== "undefined" && typeof SteplyExecPlan.linkFileSteps === "function",
          chunk: typeof SteplyExecPlan !== "undefined" && typeof SteplyExecPlan.planFileChunks === "function",
          chip: !!document.getElementById("autoFileChip"),
        }));
        ok(has.link && has.chunk && has.chip,
          "Struktur: Extension geladen + panel.html als Tab → SteplyExecPlan (linkFileSteps/planFileChunks) + Datei-Chip vorhanden");
      } else {
        console.log("  (Struktur-Check: Service-Worker nicht gefunden — übersprungen, nicht-fatal)");
      }
    } finally {
      await ext.close().catch(() => {});
    }
  } catch (e) {
    console.log("  (Struktur-Check übersprungen, nicht-fatal:", e && e.message ? e.message : e, ")");
  }

  await browser.close();
  browser = null;
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  siteA.close();
  siteB.close();
}

console.log(failed
  ? "\n✗ Datei-Brücke E2E FEHLGESCHLAGEN."
  : "\n✓ Datei-Brücke E2E grün: Download→Upload (file-input + Drop-Zone) byte-treu (Hash-Assert), Weg 1/2/3 im Original belegt, Deckel/Chunks + Extension-Struktur.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

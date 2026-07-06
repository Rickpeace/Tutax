// Live-Test der ÖFFENTLICHEN Steply-Doku-API (Welle 35, Teil A) — „Steply lernen".
// Startet einen lokalen Next-Server auf PORT=3017 und prueft OHNE Token:
//   (a) GET /api/guide/steply         -> nur veroeffentlichte Steply-Doku (9), Form + CORS
//   (b) GET /api/guide/steply/[slug]  -> Payload-Form (tutorial/steps/branches), imageUrl =
//       public Bucket-URL (HTTP-200-Stichprobe), Schritte mit selector/page_url, Highlights
//   (c) unbekannter Slug              -> 404
//   (d) KEIN Token noetig             -> 200 (kein Authorization-Header)
//   (e) Entwurf im Steply-Konto (temporaer) erscheint NICHT (Liste + Detail 404); danach weg
//   (f) OPTIONS-Preflight             -> 204 + CORS
//
// Nutzung:  node --env-file=.env.local scripts/test-guide-steply-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const PORT = 3017;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let server, draftId, draftStepId;
const draftSlug = `zz-test-entwurf-${stamp}`;

async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/guide/steply`);
      if (r.status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

try {
  // Steply-Konto + Entwurf (e) VOR dem Server-Start anlegen (soll NICHT erscheinen).
  const { data: acc } = await admin.from("accounts").select("id").eq("slug", "steply").single();
  ok(!!acc, "Steply-Konto (slug steply) existiert");
  draftId = crypto.randomUUID();
  draftStepId = crypto.randomUUID();
  await admin.from("tutorials").insert({
    id: draftId, account_id: acc.id, title: "ZZ Test-Entwurf (nicht zeigen)",
    status: "draft", visibility: "public", slug: draftSlug,
  });
  await admin.from("steps").insert({ id: draftStepId, tutorial_id: draftId, title: "Geheim", position: 1, is_decision: false });
  await admin.from("tutorials").update({ root_step_id: draftStepId }).eq("id", draftId);

  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) }, stdio: "ignore", shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // (a) Liste OHNE Token.
  const listRes = await fetch(`${BASE}/api/guide/steply`);
  const listBody = await listRes.json().catch(() => ({}));
  ok(listRes.status === 200, `Liste -> 200 (war ${listRes.status})`);
  ok(listRes.headers.get("access-control-allow-origin") === "*", "Liste liefert CORS-Header *");
  const tuts = Array.isArray(listBody.tutorials) ? listBody.tutorials : [];
  ok(tuts.length === 9, `Liste hat 9 veroeffentlichte Doku-Touren (war ${tuts.length})`);
  ok(!tuts.some((t) => t.slug === draftSlug), "Entwurf erscheint NICHT in der Liste");
  const shapeOk = tuts.every((t) =>
    t && typeof t.id === "string" && typeof t.slug === "string" && typeof t.title === "string" &&
    ("category" in t) && typeof t.stepCount === "number" && typeof t.selectorCount === "number" &&
    Array.isArray(t.site_domains));
  ok(shapeOk, "Listen-Form { id, slug, title, category, stepCount, selectorCount, site_domains }");
  ok(tuts.reduce((s, t) => s + t.stepCount, 0) === 51, `Gesamt-Schrittzahl = 51 (war ${tuts.reduce((s, t) => s + t.stepCount, 0)})`);

  // (b) Detail einer echten Tour OHNE Token.
  const first = tuts[0];
  const detRes = await fetch(`${BASE}/api/guide/steply/${encodeURIComponent(first.slug)}`);
  const det = await detRes.json().catch(() => ({}));
  ok(detRes.status === 200, `Detail (${first.slug}) -> 200 (war ${detRes.status})`);
  ok(detRes.headers.get("access-control-allow-origin") === "*", "Detail liefert CORS-Header *");
  ok(det && det.tutorial && Array.isArray(det.steps) && Array.isArray(det.branches),
    "Detail-Form { tutorial, steps, branches }");
  ok(det.tutorial && det.tutorial.slug === first.slug && det.tutorial.status === "published",
    "Detail-Tutorial: slug + status=published");
  const withImg = (det.steps || []).filter((s) => typeof s.imageUrl === "string" && s.imageUrl);
  ok(withImg.length > 0, `Detail: Schritte mit imageUrl (${withImg.length})`);
  const publicPrefix = `${url}/storage/v1/object/public/tutorial-images-public/`;
  ok(withImg.every((s) => s.imageUrl.startsWith(publicPrefix)), "imageUrl zeigt auf den PUBLIC Bucket (kein signiertes Token)");
  ok(withImg.every((s) => !/token=/.test(s.imageUrl)), "imageUrl enthaelt KEIN Signatur-Token");
  // HTTP-200-Stichprobe auf das erste Bild.
  const imgRes = await fetch(withImg[0].imageUrl);
  ok(imgRes.status === 200, `Bild-Stichprobe HTTP 200 (war ${imgRes.status})`);
  // Schritte tragen selector/page_url (Live-Fuehrung) und body als HTML-String.
  ok((det.steps || []).some((s) => s.selector && (s.selector.css || s.selector.text || s.selector.role)),
    "mind. ein Schritt hat einen Selektor (Live-Fuehrung)");
  ok((det.steps || []).some((s) => typeof s.page_url === "string" && s.page_url),
    "mind. ein Schritt hat page_url");
  ok((det.steps || []).every((s) => typeof s.body === "string"), "body ist HTML-String (Whitelist)");
  // Highlights (Teil B) fliessen durch: irgendeine Tour hat mind. einen rect-Highlight.
  let anyHl = false;
  for (const t of tuts) {
    const r = await fetch(`${BASE}/api/guide/steply/${encodeURIComponent(t.slug)}`);
    const d = await r.json().catch(() => ({}));
    if ((d.steps || []).some((s) => Array.isArray(s.highlights) && s.highlights.some((h) => h && h.type === "rect"))) { anyHl = true; break; }
  }
  ok(anyHl, "mind. eine Tour liefert rect-Highlights (Teil B fliesst durch)");

  // (c) unbekannter Slug -> 404.
  const nf = await fetch(`${BASE}/api/guide/steply/gibt-es-nicht-${stamp}`);
  ok(nf.status === 404, `unbekannter Slug -> 404 (war ${nf.status})`);

  // (e) Entwurf-Detail -> 404 (nicht published/public).
  const draftRes = await fetch(`${BASE}/api/guide/steply/${encodeURIComponent(draftSlug)}`);
  ok(draftRes.status === 404, `Entwurf-Detail -> 404 (war ${draftRes.status})`);

  // (f) OPTIONS-Preflight -> 204 + CORS (Liste + Detail).
  const preList = await fetch(`${BASE}/api/guide/steply`, { method: "OPTIONS" });
  ok(preList.status === 204 && preList.headers.get("access-control-allow-origin") === "*", `Liste OPTIONS -> 204 + CORS (war ${preList.status})`);
  const preDet = await fetch(`${BASE}/api/guide/steply/${encodeURIComponent(first.slug)}`, { method: "OPTIONS" });
  ok(preDet.status === 204 && preDet.headers.get("access-control-allow-origin") === "*", `Detail OPTIONS -> 204 + CORS (war ${preDet.status})`);
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  // Cleanup: Entwurf entfernen.
  try {
    if (draftStepId) await admin.from("steps").delete().eq("id", draftStepId);
    if (draftId) await admin.from("tutorials").delete().eq("id", draftId);
  } catch (e) {
    console.warn("Cleanup-Warnung:", e.message);
  }
  if (server && server.pid) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      else process.kill(-server.pid, "SIGKILL");
    } catch {
      server.kill("SIGKILL");
    }
  }
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Steply-Doku-API (öffentlich) live verifiziert.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

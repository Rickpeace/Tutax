// Live-Test der Live-Führungs-API (Welle 31, §5). Startet einen lokalen Next-Server auf
// PORT=3014 und prüft die drei Recorder-Routen der Live-Führung:
//   (a) GET  /api/recorder/tutorials       — falscher Token -> 401; Liste NUR Konto-Tutorials,
//       mit stepCount/selectorCount/site_domains; CORS + OPTIONS.
//   (b) GET  /api/recorder/tutorials/[id]  — steps+branches+selector, signierte imageUrl,
//       Entscheidungs-Frage; fremde ID -> 404; falscher Token -> 401.
//   (c) POST /api/recorder/guide-event     — legt events-Zeile (type='guide') an; falscher
//       Token stört nie (200, keine Zeile); CORS + OPTIONS.
// Danach: Cleanup (events + Tutorials/Storage + zwei Konten/User) und Server beenden.
//
// Nutzung:  node --env-file=.env.local scripts/test-guide-api-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const IMG_BUCKET = "tutorial-images";
const PORT = 3014;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();
const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let server;
const accounts = []; // { userId, accountId }
const imgPaths = [];

async function mkUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  const accountId = (await admin.from("account_members").select("account_id").eq("user_id", data.user.id)).data[0].account_id;
  return { userId: data.user.id, accountId };
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Ohne Token -> 401 zeigt, dass die Route steht.
      const r = await fetch(`${BASE}/api/recorder/tutorials`);
      if (r.status === 401) return true;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

const getAuth = (path, token) =>
  fetch(`${BASE}${path}`, token ? { headers: { Authorization: "Bearer " + token } } : undefined);
const postJson = (path, body) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Ein Test-Tutorial anlegen: 3 Schritte (1 Klick mit Selektor+Bild, 1 Entscheidung, 1 Ende),
// lineare + verzweigte Kanten, root_step_id. Gibt { tutorialId, slug, step1Selector } zurück.
async function seedTutorial(accountId, token) {
  const slug = `guide-live-${token.slice(0, 8)}`;
  const { data: tut } = await admin
    .from("tutorials")
    .insert({
      account_id: accountId,
      title: "Live-Führung Test " + stamp,
      status: "draft",
      slug,
      visibility: "public",
      site_domains: ["example.com"],
    })
    .select("id")
    .single();
  const tutorialId = tut.id;

  // Winziges Bild in den PRIVATEN Bucket (createSignedUrl braucht ein existierendes Objekt).
  const imgPath = `${accountId}/guide-live-${stamp}/0.webp`;
  await admin.storage.from(IMG_BUCKET).upload(imgPath, Buffer.from("webp-" + stamp), {
    contentType: "image/webp",
    upsert: true,
  });
  imgPaths.push(imgPath);

  const step1Selector = { css: "#save", text: "Speichern", role: "button" };
  const s1 = crypto.randomUUID();
  const s2 = crypto.randomUUID();
  const s3 = crypto.randomUUID();
  await admin.from("steps").insert([
    {
      id: s1,
      tutorial_id: tutorialId,
      title: "Klicken Sie auf „Speichern“",
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Klicken Sie hier.", marks: [{ type: "bold" }] }] }] },
      image_path: imgPath,
      image_width: 120,
      image_height: 60,
      highlights: [{ id: crypto.randomUUID(), type: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.1, color: "#ef6a4e", rounded: true }],
      selector: step1Selector,
      page_url: "https://example.com/formular",
      is_decision: false,
      position: 1,
    },
    { id: s2, tutorial_id: tutorialId, title: "Alles korrekt?", highlights: [], is_decision: true, position: 2 },
    { id: s3, tutorial_id: tutorialId, title: "Fertig", highlights: [], is_decision: false, position: 3 },
  ]);
  await admin.from("step_branches").insert([
    { step_id: s1, label: null, target_step_id: s2, position: 0 },
    { step_id: s2, label: "Ja", target_step_id: s3, position: 0 },
    { step_id: s2, label: "Nein", target_step_id: null, position: 1 },
  ]);
  await admin.from("tutorials").update({ root_step_id: s1 }).eq("id", tutorialId);
  return { tutorialId, slug, step1Selector };
}

try {
  const A = await mkUser(`steply-guide-a-${stamp}@example.com`);
  const B = await mkUser(`steply-guide-b-${stamp}@example.com`);
  accounts.push(A, B);
  const tokenA = crypto.randomUUID();
  const tokenB = crypto.randomUUID();
  await admin.from("accounts").update({ recorder_token: tokenA }).eq("id", A.accountId);
  await admin.from("accounts").update({ recorder_token: tokenB }).eq("id", B.accountId);

  const seedA = await seedTutorial(A.accountId, tokenA);
  const seedB = await seedTutorial(B.accountId, tokenB); // Fremd-Tutorial (Konto B)
  ok(!!seedA.tutorialId && !!seedB.tutorialId, "Testdaten angelegt (2 Konten, je 1 Tutorial)");

  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // ── (a) GET /api/recorder/tutorials ─────────────────────────────────────────
  const listBad = await getAuth("/api/recorder/tutorials", crypto.randomUUID());
  ok(listBad.status === 401, `Liste mit falschem Token -> 401 (war ${listBad.status})`);

  const listNone = await getAuth("/api/recorder/tutorials", null);
  ok(listNone.status === 401, `Liste ohne Token -> 401 (war ${listNone.status})`);

  const listPre = await fetch(`${BASE}/api/recorder/tutorials`, { method: "OPTIONS" });
  ok(
    listPre.status === 204 &&
      listPre.headers.get("access-control-allow-origin") === "*" &&
      (listPre.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"),
    `Liste OPTIONS -> 204 + CORS + Authorization (war ${listPre.status})`,
  );

  const listRes = await getAuth("/api/recorder/tutorials", tokenA);
  const listBody = await listRes.json().catch(() => ({}));
  ok(listRes.status === 200 && Array.isArray(listBody.tutorials), `Liste mit Token A -> 200 + Array (war ${listRes.status})`);
  const mine = (listBody.tutorials || []).find((t) => t.id === seedA.tutorialId);
  const foreign = (listBody.tutorials || []).find((t) => t.id === seedB.tutorialId);
  ok(!!mine && !foreign, "Liste enthält NUR eigene Tutorials (Fremd-Tutorial fehlt)");
  ok(mine && mine.stepCount === 3, `stepCount = 3 (war ${mine && mine.stepCount})`);
  ok(mine && mine.selectorCount === 1, `selectorCount = 1 (nur Schritt 1 hat Selektor) (war ${mine && mine.selectorCount})`);
  ok(mine && Array.isArray(mine.site_domains) && mine.site_domains.includes("example.com"), "site_domains übertragen");
  ok(mine && mine.slug === seedA.slug && mine.status === "draft", "slug + status korrekt");

  // ── (b) GET /api/recorder/tutorials/[id] ────────────────────────────────────
  const detBad = await getAuth("/api/recorder/tutorials/" + seedA.tutorialId, crypto.randomUUID());
  ok(detBad.status === 401, `Detail mit falschem Token -> 401 (war ${detBad.status})`);

  const detForeign = await getAuth("/api/recorder/tutorials/" + seedB.tutorialId, tokenA);
  ok(detForeign.status === 404, `Detail eines FREMDEN Tutorials -> 404 (war ${detForeign.status})`);

  const detRes = await getAuth("/api/recorder/tutorials/" + seedA.tutorialId, tokenA);
  const det = await detRes.json().catch(() => ({}));
  ok(detRes.status === 200, `Detail mit Token A -> 200 (war ${detRes.status})`);
  ok(det.tutorial && det.tutorial.id === seedA.tutorialId && det.tutorial.root_step_id, "tutorial + root_step_id vorhanden");
  ok(Array.isArray(det.steps) && det.steps.length === 3, `3 Schritte (war ${det.steps && det.steps.length})`);
  ok(Array.isArray(det.branches) && det.branches.length === 3, `3 Verzweigungs-Kanten (war ${det.branches && det.branches.length})`);

  const s1 = (det.steps || []).find((s) => s.selector);
  // jsonb normalisiert die Schlüssel-Reihenfolge -> Feld für Feld vergleichen (nicht JSON.stringify).
  ok(
    s1 &&
      s1.selector &&
      s1.selector.css === seedA.step1Selector.css &&
      s1.selector.text === seedA.step1Selector.text &&
      s1.selector.role === seedA.step1Selector.role,
    "Schritt 1: selector EXAKT geliefert (css/text/role)",
  );
  ok(s1 && typeof s1.imageUrl === "string" && /^https?:\/\//.test(s1.imageUrl), "Schritt 1: signierte imageUrl (http)");
  ok(s1 && s1.imageWidth === 120 && s1.imageHeight === 60, "Schritt 1: Bildmaße");
  ok(s1 && typeof s1.body === "string" && s1.body.includes("<b>") && s1.body.includes("Klicken Sie hier."), "Schritt 1: body = HTML (b-Tag + Text)");
  ok(s1 && s1.page_url === "https://example.com/formular", "Schritt 1: page_url");
  ok(s1 && Array.isArray(s1.highlights) && s1.highlights.length === 1, "Schritt 1: highlights");

  const dec = (det.steps || []).find((s) => s.is_decision);
  ok(dec && dec.question === "Alles korrekt?", "Entscheidungs-Schritt: question = Titel");
  const decBranches = (det.branches || []).filter((b) => b.step_id === (dec && dec.id));
  const labels = decBranches.map((b) => b.label).sort();
  ok(deepEq(labels, ["Ja", "Nein"]), `Entscheidungs-Antworten als Branch-Labels (war ${JSON.stringify(labels)})`);

  // ── (c) POST /api/recorder/guide-event ──────────────────────────────────────
  const evtPre = await fetch(`${BASE}/api/recorder/guide-event`, { method: "OPTIONS" });
  ok(evtPre.status === 204 && evtPre.headers.get("access-control-allow-origin") === "*", `guide-event OPTIONS -> 204 + CORS (war ${evtPre.status})`);

  const evtRes = await postJson("/api/recorder/guide-event", {
    token: tokenA,
    tutorialSlug: seedA.slug,
    kind: "started",
    stepTitle: "Klicken Sie auf „Speichern“",
  });
  const evtBody = await evtRes.json().catch(() => ({}));
  ok(evtRes.status === 200 && evtBody.ok === true, `guide-event -> 200 {ok:true} (war ${evtRes.status})`);

  const { data: evtRows } = await admin
    .from("events")
    .select("id, type, status, tutorial_slug, question")
    .eq("account_id", A.accountId)
    .eq("type", "guide");
  const row = (evtRows || []).find((e) => e.status === "started");
  ok(!!row, "events-Zeile mit type='guide', status='started' angelegt");
  ok(row && row.tutorial_slug === seedA.slug && row.question === "Klicken Sie auf „Speichern“", "events-Zeile: slug + stepTitle (question) übernommen");

  // Falscher Token stört nie: 200 {ok:true}, aber KEINE Zeile.
  const evtBadToken = crypto.randomUUID();
  const evtBadRes = await postJson("/api/recorder/guide-event", { token: evtBadToken, kind: "completed" });
  const evtBadBody = await evtBadRes.json().catch(() => ({}));
  ok(evtBadRes.status === 200 && evtBadBody.ok === true, `guide-event mit falschem Token -> trotzdem 200 {ok:true} (war ${evtBadRes.status})`);
  const { count: badCount } = await admin.from("events").select("id", { count: "exact", head: true }).eq("status", "completed").eq("type", "guide").eq("account_id", B.accountId);
  ok((badCount ?? 0) === 0, "guide-event mit falschem Token legt KEINE Zeile an");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  try {
    for (const a of accounts) {
      await admin.from("events").delete().eq("account_id", a.accountId);
    }
    if (imgPaths.length) await admin.storage.from(IMG_BUCKET).remove(imgPaths);
    for (const a of accounts) {
      await admin.from("accounts").delete().eq("id", a.accountId); // kaskadiert Tutorials/Steps/Branches
      await admin.auth.admin.deleteUser(a.userId);
    }
  } catch (e) {
    console.warn("Cleanup-Warnung:", e.message);
  }
  if (server && server.pid) {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      } else {
        process.kill(-server.pid, "SIGKILL");
      }
    } catch {
      server.kill("SIGKILL");
    }
  }
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Live-Führungs-API live verifiziert.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

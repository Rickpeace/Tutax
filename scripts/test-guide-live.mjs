// Live-Test der Sofort-Anleitung (Welle 22): /api/recorder/guide-handshake + guide-complete.
// Startet einen lokalen Next-Server auf PORT=3019 und prueft:
//   (a) guide-handshake ohne/mit falschem Token -> 401; count 50 (>40) -> 400
//   (b) guide-handshake gueltig -> N Upload-URLs; PUT eines Mini-WebP -> 2xx, Datei im
//       PRIVATEN Bucket tutorial-images
//   (c) guide-complete mit Fremd-Pfad -> 4xx; gueltig mit 3 Schritten (einer ohne Label)
//       -> Tutorial-Entwurf + 3 Steps mit Bild/Maßen/Highlight-Rechteck + lineare
//       Branch-Kette + root gesetzt + Vorlagen-Titel korrekt
//   (d) rect außerhalb 0..1 wird geclampt
//   (e) Free-Limit: Konto plan=free mit 5 Tutorials -> guide-complete 403
//   (f) Selektor-Vorbau (Welle 24): S1 gueltiger selector -> exakt in steps.selector; S2
//       kaputter selector (falsche Typen/ueberlang/fremde Keys) -> gesaeubert, KEIN 400;
//       S3 ohne selector -> null (Abwaertskompatibilitaet)
// AUFNAHME-ANKER (Welle 27):
//   (b) afterStepId: Draft mit 3 Schritten -> 2 Schritte nach S1 einfuegen -> Kette exakt
//       1,N1,N2,2,3 (ueber null-Label-Branches), root unveraendert.
//   (c) branchId: Weiche seeden -> leeren Ast fuellen (Ast->N1, N1->N2, N2 Blatt) und
//       Rejoin-Ast fuellen (Ast zeigte auf S9 -> M1->M2->S9).
//   (d) fremdes Konto / veroeffentlichtes Tutorial / kaputte Anker -> fallback:true, 200,
//       neues Tutorial, Ziel unveraendert.
//   (e) >40 Schritte gesamt -> fallback:true, neues Tutorial, Ziel unveraendert.
// AUTO-SCHWAERZUNG (Welle 28):
//   (w28-a) Schritt mit gueltigem `sensitive` -> steps.highlights enthaelt zusaetzlich zum
//           Klick-Rechteck je ein blur-Highlight mit suggested:true (normiert/geklemmt).
//   (w28-b) kaputte sensitive-Werte (NaN / >10 Eintraege / fremde Keys / Mini-Flaeche /
//           Nicht-Objekte) -> gesaeubert bzw. ignoriert, KEIN 400.
//   (w28-c) ohne `sensitive` -> unveraendert (nur das Klick-Rechteck, keine blur).
// Danach: vollstaendiges Cleanup (Tutorials/Steps/Branches via Cascade, Storage, Konten).
//
// Nutzung:  node --env-file=.env.local scripts/test-guide-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const BUCKET = "tutorial-images";
// Welle 28: 3013/3016/3017 sind anderweitig belegt -> ab 3019.
const PORT = 3019;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let accId, userId, accFree, userFree, accForeign, userForeign, server;
const tutorialIds = [];
const storagePaths = [];

// Minimaler gueltiger WebP (12 Bytes RIFF-Header + WEBP + VP8-Chunk-Stub). Reicht als
// Upload-Blob; der Server prueft den Inhalt nicht.
const MINI_WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x1a, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  0x56, 0x50, 0x38, 0x20, 0x0e, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

async function mkUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  const accountId = (await admin.from("account_members").select("account_id").eq("user_id", data.user.id)).data[0].account_id;
  return { userId: data.user.id, accountId };
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/recorder/guide-handshake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (r.status === 401 || r.status === 400) return true;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

function post(path, body) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Helfer fuer die Aufnahme-Anker-Tests (Welle 27) ──────────────────────────
// Synthetische, aber GUELTIGE Schritt-Pfade (Praefix = Konto-Ordner). validateGuideSteps
// prueft nur das Praefix + kein Traversal, NICHT die Existenz -> kein Storage/Upload noetig.
function mkSteps(accountId, n, prefix) {
  const folder = `${accountId}/guide-w27-${crypto.randomUUID()}`;
  return Array.from({ length: n }, (_, i) => ({
    path: `${folder}/${i}.webp`,
    label: `${prefix}${i + 1}`,
    action: "click",
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
    url: "https://app.test/x",
    title: "Seite X",
    w: 1200,
    h: 800,
  }));
}

// Linearen Entwurf mit N Schritten seeden (root + null-Label-Kette), direkt via Admin-DB.
async function seedLinearDraft(accountId, titles) {
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title: "Seed W27", status: "draft" })
    .select("id")
    .single();
  const tutId = tut.id;
  tutorialIds.push(tutId);
  const stepRows = titles.map((t, i) => ({
    id: crypto.randomUUID(),
    tutorial_id: tutId,
    title: t,
    position: i + 1,
    is_decision: false,
  }));
  await admin.from("steps").insert(stepRows);
  await admin.from("tutorials").update({ root_step_id: stepRows[0].id }).eq("id", tutId);
  const brs = stepRows.slice(0, -1).map((r, i) => ({
    id: crypto.randomUUID(),
    step_id: r.id,
    label: null,
    target_step_id: stepRows[i + 1].id,
    position: 0,
  }));
  if (brs.length) await admin.from("step_branches").insert(brs);
  return { tutId, stepRows };
}

// Alle Schritte + Branches + root eines Tutorials laden.
async function loadTut(tutId) {
  const { data: steps } = await admin.from("steps").select("id, title, is_decision").eq("tutorial_id", tutId);
  const ids = (steps ?? []).map((s) => s.id);
  const { data: branches } = ids.length
    ? await admin.from("step_branches").select("id, step_id, label, target_step_id, position").in("step_id", ids)
    : { data: [] };
  const { data: tut } = await admin.from("tutorials").select("root_step_id").eq("id", tutId).single();
  return { steps: steps ?? [], branches: branches ?? [], rootId: tut?.root_step_id ?? null };
}

// Lineare Fluss-Reihenfolge ab rootId ueber die null-Label-Kanten (zyklensicher).
function walkLinear(rootId, branches) {
  const nextOf = new Map();
  for (const b of branches) if (b.label === null) nextOf.set(b.step_id, b.target_step_id);
  const order = [];
  const seen = new Set();
  let cur = rootId;
  while (cur && !seen.has(cur)) {
    order.push(cur);
    seen.add(cur);
    cur = nextOf.get(cur) ?? null;
  }
  return order;
}

try {
  // Haupt-Konto (plan=pro, damit das Free-Limit die Happy-Path-Tests nicht stoert).
  const A = await mkUser(`tutax-guide-${stamp}@example.com`);
  accId = A.accountId; userId = A.userId;
  const token = crypto.randomUUID();
  await admin.from("accounts").update({ recorder_token: token, plan: "pro" }).eq("id", accId);
  ok(true, "Setup: Pro-Konto mit recorder_token");

  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // ---------- (a) handshake Auth + count-Grenzen ----------
  const noTok = await post("/api/recorder/guide-handshake", { count: 3 });
  ok(noTok.status === 401, `handshake ohne Token -> 401 (war ${noTok.status})`);
  ok(noTok.headers.get("access-control-allow-origin") === "*", "handshake CORS-Header *");

  const pre = await fetch(`${BASE}/api/recorder/guide-handshake`, { method: "OPTIONS" });
  ok(pre.status === 204, `OPTIONS-Preflight -> 204 (war ${pre.status})`);

  const badTok = await post("/api/recorder/guide-handshake", { token: crypto.randomUUID(), count: 3 });
  ok(badTok.status === 401, `handshake falscher Token -> 401 (war ${badTok.status})`);

  const tooMany = await post("/api/recorder/guide-handshake", { token, count: 50 });
  ok(tooMany.status === 400, `handshake count 50 -> 400 (war ${tooMany.status})`);

  const zero = await post("/api/recorder/guide-handshake", { token, count: 0 });
  ok(zero.status === 400, `handshake count 0 -> 400 (war ${zero.status})`);

  // ---------- (b) handshake gueltig -> N Upload-URLs; PUT -> Datei im PRIVATEN Bucket ----------
  const N = 3;
  const hsRes = await post("/api/recorder/guide-handshake", { token, count: N });
  const hs = await hsRes.json().catch(() => ({}));
  ok(hsRes.status === 200 && Array.isArray(hs.uploads) && hs.uploads.length === N, `handshake gueltig -> ${N} Upload-URLs (${hsRes.status})`);
  const allInAccount = (hs.uploads ?? []).every((u) => typeof u.path === "string" && u.path.startsWith(`${accId}/guide-`) && u.path.endsWith(".webp"));
  ok(allInAccount, "alle Pfade im Konto-Ordner {accId}/guide-…/{i}.webp");
  for (const u of hs.uploads ?? []) storagePaths.push(u.path);

  // Mini-WebP an die erste signierte URL laden.
  const put0 = await fetch(hs.uploads[0].uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/webp" },
    body: MINI_WEBP,
  });
  ok(put0.status >= 200 && put0.status < 300, `PUT WebP an signierte URL -> 2xx (war ${put0.status})`);
  const folder = hs.uploads[0].path.split("/").slice(0, 2).join("/");
  const { data: listed } = await admin.storage.from(BUCKET).list(folder);
  ok(!!listed?.some((f) => f.name === "0.webp"), "WebP existiert im PRIVATEN Bucket tutorial-images");
  // Rest hochladen, damit alle Pfade real sind.
  for (let i = 1; i < N; i++) {
    await fetch(hs.uploads[i].uploadUrl, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: MINI_WEBP });
  }

  // ---------- (c) complete Fremd-Pfad -> 4xx ----------
  const foreignSteps = [{
    path: `${crypto.randomUUID()}/guide-x/0.webp`, label: "Hack", action: "click",
    rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, url: "https://x.test", w: 1280, h: 720,
  }];
  const foreign = await post("/api/recorder/guide-complete", { token, steps: foreignSteps });
  ok(foreign.status >= 400 && foreign.status < 500, `complete Fremd-Pfad -> 4xx (war ${foreign.status})`);

  // ---------- (c/d) complete gueltig: 3 Schritte, einer OHNE Label, rect (d) außerhalb 0..1 ----------
  const steps = [
    // Schritt 1: click mit Label + GUELTIGEM selector (muss exakt ankommen)
    { path: hs.uploads[0].path, label: "Speichern", action: "click", rect: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }, url: "https://app.test/a", title: "Seite A", w: 1280, h: 720,
      selector: { css: "#save", text: "Speichern", role: "button" } },
    // Schritt 2: type mit Label, rect (d) AUSSERHALB 0..1 -> muss geclampt werden; selector
    // KAPUTT (css falscher Typ, text ueberlang, fremder Key) -> gesaeubert, KEIN 400.
    { path: hs.uploads[1].path, label: "E-Mail", action: "type", rect: { x: -0.5, y: 1.5, w: 3, h: 2 }, url: "https://app.test/b", title: "Seite B", w: 1000, h: 800,
      selector: { css: 123, text: "x".repeat(500), role: "textbox", evil: "drop-me", nested: { a: 1 } } },
    // Schritt 3: OHNE Label und OHNE selector -> Titel "Schritt 3", selector null
    { path: hs.uploads[2].path, label: "", action: "click", rect: { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }, url: "https://app.test/b", title: "Seite B", w: 1000, h: 800 },
  ];
  const compRes = await post("/api/recorder/guide-complete", { token, steps });
  const comp = await compRes.json().catch(() => ({}));
  ok(compRes.status === 200 && !!comp.tutorialId, `complete gueltig -> tutorialId (${compRes.status})`);
  // (a) Abwaertskompatibilitaet (Welle 27): OHNE target KEIN fallback-Feld (normale Aufnahme).
  ok(comp.fallback === undefined, "(a) ohne target: kein fallback-Feld (unveraendertes Verhalten)");

  if (comp.tutorialId) {
    tutorialIds.push(comp.tutorialId);
    const { data: tut } = await admin.from("tutorials").select("status, root_step_id, account_id, title").eq("id", comp.tutorialId).single();
    ok(tut?.status === "draft", "Tutorial ist ENTWURF (draft)");
    ok(tut?.account_id === accId, "Tutorial gehoert dem Konto");
    ok(/^Anleitung vom /.test(tut?.title ?? ""), `Default-Titel „Anleitung vom …" (war „${tut?.title}")`);

    const { data: stepRows } = await admin.from("steps").select("*").eq("tutorial_id", comp.tutorialId).order("position", { ascending: true });
    ok(stepRows?.length === 3, `3 Steps angelegt (waren ${stepRows?.length})`);

    if (stepRows?.length === 3) {
      const [s1, s2, s3] = stepRows;

      // root_step_id zeigt auf den ersten Schritt.
      ok(tut?.root_step_id === s1.id, "root_step_id = erster Schritt");

      // Vorlagen-Titel.
      ok(s1.title === "Klicken Sie auf „Speichern“", `Titel S1 „Klicken Sie auf „Speichern““ (war „${s1.title}")`);
      ok(s2.title === "Tragen Sie „E-Mail“ ein", `Titel S2 „Tragen Sie „E-Mail“ ein" (war „${s2.title}")`);
      ok(s3.title === "Schritt 3", `Titel S3 „Schritt 3" (war „${s3.title}")`);

      // Bild/Maße.
      ok(s1.image_path === hs.uploads[0].path && s1.image_width === 1280 && s1.image_height === 720, "S1: Bildpfad + Maße (1280x720)");
      ok(s2.image_width === 1000 && s2.image_height === 800, "S2: Maße (1000x800)");

      // Highlight-Rechteck (Primaerfarbe, rounded).
      const h1 = Array.isArray(s1.highlights) ? s1.highlights[0] : null;
      ok(s1.highlights?.length === 1 && h1?.type === "rect", "S1: genau EIN Highlight-Rechteck");
      // Warm-Redesign (Commit 172717b): GUIDE_HIGHLIGHT_COLOR = Koralle #ef6a4e (vorher Indigo).
      ok(h1?.color === "#ef6a4e" && h1?.rounded === true, "S1: Highlight Primaerfarbe #ef6a4e + rounded");
      ok(Math.abs(h1.x - 0.1) < 1e-6 && Math.abs(h1.y - 0.2) < 1e-6 && Math.abs(h1.w - 0.3) < 1e-6 && Math.abs(h1.h - 0.1) < 1e-6, "S1: Highlight-Werte aus rect uebernommen");

      // (d) rect außerhalb 0..1 -> geclampt: x=0,y=1,w<=1,h<=0 (y+h nie >1).
      const h2 = Array.isArray(s2.highlights) ? s2.highlights[0] : null;
      const clamped = h2 && h2.x >= 0 && h2.x <= 1 && h2.y >= 0 && h2.y <= 1 && h2.w >= 0 && h2.w <= 1 && h2.h >= 0 && h2.h <= 1 && (h2.x + h2.w) <= 1.0001 && (h2.y + h2.h) <= 1.0001;
      ok(clamped, `(d) rect außerhalb 0..1 geclampt (x=${h2?.x}, y=${h2?.y}, w=${h2?.w}, h=${h2?.h})`);

      // Lineare Branch-Kette: S1->S2, S2->S3, label null; S3 hat keinen Branch.
      const { data: br } = await admin.from("step_branches").select("step_id, target_step_id, label").in("step_id", [s1.id, s2.id, s3.id]);
      const b1 = br?.find((b) => b.step_id === s1.id);
      const b2 = br?.find((b) => b.step_id === s2.id);
      const b3 = br?.find((b) => b.step_id === s3.id);
      ok(b1?.target_step_id === s2.id && b1?.label === null, "Branch S1->S2 (label null)");
      ok(b2?.target_step_id === s3.id && b2?.label === null, "Branch S2->S3 (label null)");
      ok(!b3, "S3 hat keinen ausgehenden Branch (Ende)");

      // ---------- Selektor-Vorbau (Welle 24) ----------
      // S1: gueltiger selector kommt EXAKT an.
      ok(
        s1.selector && s1.selector.css === "#save" && s1.selector.text === "Speichern" && s1.selector.role === "button",
        `S1: selector exakt gespeichert (war ${JSON.stringify(s1.selector)})`,
      );
      // S2: kaputter selector wird gesaeubert (css falscher Typ -> weg; text auf <=80 gekappt;
      // fremde Keys evil/nested weg; role bleibt) - und der Request scheitert NICHT.
      const s2sel = s2.selector || {};
      const s2keys = Object.keys(s2sel).sort().join(",");
      ok(
        !("css" in s2sel) &&
          typeof s2sel.text === "string" && s2sel.text.length <= 80 &&
          s2sel.role === "textbox" &&
          !("evil" in s2sel) && !("nested" in s2sel) &&
          (s2keys === "role,text"),
        `S2: kaputter selector gesaeubert, kein 400 (war ${JSON.stringify(s2.selector)})`,
      );
      // S3: ohne selector -> null gespeichert (Abwaertskompatibilitaet).
      ok(s3.selector === null, `S3: ohne selector -> null (war ${JSON.stringify(s3.selector)})`);
    }
  }

  // ═══════════ AUFNAHME-ANKER (Welle 27) ═══════════
  const seedIdsOf = (s) => s.stepRows.map((r) => r.id);

  // ---------- (b) afterStepId: 2 Schritte NACH Schritt 1 -> Kette 1,N1,N2,2,3 ----------
  {
    const seed = await seedLinearDraft(accId, ["S1", "S2", "S3"]);
    const ids = seedIdsOf(seed);
    const res = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 2, "N"),
      target: { tutorialId: seed.tutId, anchor: { afterStepId: ids[0] } },
    });
    const j = await res.json().catch(() => ({}));
    ok(
      res.status === 200 && j.tutorialId === seed.tutId && j.inserted === true && !j.fallback,
      `(b) afterStepId eingefuegt in Ziel-Tutorial, kein fallback (${res.status})`,
    );
    const { branches, rootId } = await loadTut(seed.tutId);
    const order = walkLinear(ids[0], branches);
    ok(order.length === 5, `(b) 5 Schritte in linearer Kette (waren ${order.length})`);
    ok(order[0] === ids[0] && order[3] === ids[1] && order[4] === ids[2], "(b) Reihenfolge exakt S1, N1, N2, S2, S3");
    ok(![ids[0], ids[1], ids[2]].includes(order[1]) && ![ids[0], ids[1], ids[2]].includes(order[2]), "(b) Position 2+3 sind die NEUEN Schritte");
    ok(rootId === ids[0], "(b) root_step_id unveraendert (S1)");
  }

  // ---------- (c) branchId: leeren Ast fuellen + Rejoin-Ast fuellen ----------
  {
    const { data: tut } = await admin
      .from("tutorials")
      .insert({ account_id: accId, title: "Weiche W27", status: "draft" })
      .select("id")
      .single();
    const tutId = tut.id;
    tutorialIds.push(tutId);
    const s1 = crypto.randomUUID();
    const s9 = crypto.randomUUID();
    await admin.from("steps").insert([
      { id: s1, tutorial_id: tutId, title: "Frage", position: 1, is_decision: true },
      { id: s9, tutorial_id: tutId, title: "S9 Ziel", position: 2, is_decision: false },
    ]);
    await admin.from("tutorials").update({ root_step_id: s1 }).eq("id", tutId);
    const brJa = crypto.randomUUID();
    const brNein = crypto.randomUUID();
    await admin.from("step_branches").insert([
      { id: brJa, step_id: s1, label: "Ja", color: "#18a999", target_step_id: null, position: 0 },
      { id: brNein, step_id: s1, label: "Nein", color: "#d3543a", target_step_id: s9, position: 1 },
    ]);

    // (c1) leerer Ast »Ja« -> Ast zeigt auf N1, Kette N1->N2, N2 ist Blatt (kein Rejoin).
    const resJa = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 2, "J"),
      target: { tutorialId: tutId, anchor: { branchId: brJa } },
    });
    const jJa = await resJa.json().catch(() => ({}));
    ok(resJa.status === 200 && jJa.tutorialId === tutId && jJa.inserted && !jJa.fallback, `(c1) leerer Ast gefuellt (${resJa.status})`);
    {
      const { branches } = await loadTut(tutId);
      const ja = branches.find((b) => b.id === brJa);
      const n1 = ja?.target_step_id;
      ok(n1 && ![s1, s9].includes(n1), "(c1) Ast »Ja« zeigt auf ersten neuen Schritt N1");
      const chain = walkLinear(n1, branches);
      ok(chain.length === 2, `(c1) Kette N1->N2 (2 Schritte) (waren ${chain.length})`);
      const n2out = branches.filter((b) => b.step_id === chain[1]);
      ok(n2out.length === 0, "(c1) N2 ist Blatt (leerer Ast: kein Rejoin-Ziel)");
    }

    // (c2) Rejoin-Ast »Nein« (zeigte auf S9) -> Ast zeigt auf M1, Kette M1->M2->S9.
    const resNein = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 2, "M"),
      target: { tutorialId: tutId, anchor: { branchId: brNein } },
    });
    const jNein = await resNein.json().catch(() => ({}));
    ok(resNein.status === 200 && jNein.inserted && !jNein.fallback, `(c2) Rejoin-Ast gefuellt (${resNein.status})`);
    {
      const { branches } = await loadTut(tutId);
      const nein = branches.find((b) => b.id === brNein);
      const m1 = nein?.target_step_id;
      ok(m1 && ![s1, s9].includes(m1), "(c2) Ast »Nein« zeigt auf ersten neuen Schritt M1");
      const chain = walkLinear(m1, branches);
      ok(chain.length === 3 && chain[2] === s9, `(c2) Rejoin: M1->M2->S9 (letzter neuer Schritt zeigt auf S9) (${chain.length})`);
    }
  }

  // ---------- (d) ungueltige Ziele -> fallback:true, neues Tutorial, 200 ----------
  {
    // (d1) fremdes Konto (anderes Tutorial-Eigentum).
    const G = await mkUser(`tutax-guide-foreign-${stamp}@example.com`);
    accForeign = G.accountId;
    userForeign = G.userId;
    const { data: fremd } = await admin
      .from("tutorials")
      .insert({ account_id: accForeign, title: "Fremd", status: "draft" })
      .select("id")
      .single();
    const resD1 = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 1, "D"),
      target: { tutorialId: fremd.id, anchor: { afterStepId: crypto.randomUUID() } },
    });
    const jD1 = await resD1.json().catch(() => ({}));
    ok(resD1.status === 200 && jD1.fallback === true && jD1.tutorialId && jD1.tutorialId !== fremd.id, `(d1) fremdes Konto -> fallback neues Tutorial (${resD1.status})`);
    ok(typeof jD1.fallbackReason === "string" && jD1.fallbackReason.length > 0, "(d1) fallbackReason vorhanden");
    if (jD1.tutorialId) tutorialIds.push(jD1.tutorialId);

    // (d2) veroeffentlichtes eigenes Tutorial (kein Entwurf).
    const { data: pub } = await admin
      .from("tutorials")
      .insert({ account_id: accId, title: "Publik", status: "published" })
      .select("id")
      .single();
    tutorialIds.push(pub.id);
    const resD2 = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 1, "D"),
      target: { tutorialId: pub.id, anchor: { branchId: crypto.randomUUID() } },
    });
    const jD2 = await resD2.json().catch(() => ({}));
    ok(resD2.status === 200 && jD2.fallback === true && jD2.tutorialId !== pub.id, `(d2) veroeffentlichtes Ziel -> fallback (${resD2.status})`);
    const { count: pubCount } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", pub.id);
    ok((pubCount ?? 0) === 0, "(d2) veroeffentlichtes Ziel unveraendert (0 Schritte eingefuegt)");
    if (jD2.tutorialId) tutorialIds.push(jD2.tutorialId);

    // (d3) eigener Entwurf, aber Anker-Schritt gehoert NICHT dazu (kaputter Wert).
    const seedD = await seedLinearDraft(accId, ["A", "B"]);
    const resD3 = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 1, "D"),
      target: { tutorialId: seedD.tutId, anchor: { afterStepId: crypto.randomUUID() } },
    });
    const jD3 = await resD3.json().catch(() => ({}));
    ok(resD3.status === 200 && jD3.fallback === true && jD3.tutorialId !== seedD.tutId, `(d3) fremder Anker-Schritt -> fallback (${resD3.status})`);
    const { count: d3Count } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", seedD.tutId);
    ok((d3Count ?? 0) === 2, "(d3) Ziel-Draft unveraendert (2 Schritte)");
    if (jD3.tutorialId) tutorialIds.push(jD3.tutorialId);

    // (d3b) unbrauchbarer Anker-Wert (keine UUID) -> Form-Parse scheitert -> fallback.
    const resD3b = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 1, "D"),
      target: { tutorialId: seedD.tutId, anchor: { afterStepId: "not-a-uuid" } },
    });
    const jD3b = await resD3b.json().catch(() => ({}));
    ok(resD3b.status === 200 && jD3b.fallback === true, `(d3b) unbrauchbarer Anker-Wert -> fallback (${resD3b.status})`);
    if (jD3b.tutorialId) tutorialIds.push(jD3b.tutorialId);
  }

  // ---------- (e) >40-Grenze beim Einfuegen -> fallback:true, neues Tutorial ----------
  {
    const seedBig = await seedLinearDraft(accId, Array.from({ length: 39 }, (_, i) => `B${i + 1}`));
    const resBig = await post("/api/recorder/guide-complete", {
      token,
      steps: mkSteps(accId, 2, "E"),
      target: { tutorialId: seedBig.tutId, anchor: { afterStepId: seedIdsOf(seedBig)[0] } },
    });
    const jBig = await resBig.json().catch(() => ({}));
    ok(resBig.status === 200 && jBig.fallback === true && jBig.tutorialId !== seedBig.tutId, `(e) >40 Schritte -> fallback neues Tutorial (${resBig.status})`);
    const { count: bigCount } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", seedBig.tutId);
    ok((bigCount ?? 0) === 39, "(e) Ziel-Draft unveraendert bei Ueberschreitung (39 Schritte)");
    if (jBig.tutorialId) tutorialIds.push(jBig.tutorialId);
  }

  // ═══════════ AUTO-SCHWAERZUNG (Welle 28) ═══════════
  {
    // (w28-a) gueltige sensitive -> zusaetzliche blur-Highlights mit suggested:true.
    const base = mkSteps(accId, 1, "S")[0];
    const withSens = {
      ...base,
      sensitive: [
        { x: 0.10, y: 0.10, w: 0.20, h: 0.06 },
        { x: 0.50, y: 0.50, w: 0.15, h: 0.10 },
      ],
    };
    const res = await post("/api/recorder/guide-complete", { token, steps: [withSens] });
    const j = await res.json().catch(() => ({}));
    ok(res.status === 200 && !!j.tutorialId, `(w28-a) sensitive: complete ok (${res.status})`);
    if (j.tutorialId) {
      tutorialIds.push(j.tutorialId);
      const { data: rows } = await admin
        .from("steps")
        .select("highlights")
        .eq("tutorial_id", j.tutorialId)
        .order("position", { ascending: true });
      const hs2 = Array.isArray(rows?.[0]?.highlights) ? rows[0].highlights : [];
      const rect = hs2.filter((h) => h.type === "rect");
      const blur = hs2.filter((h) => h.type === "blur");
      ok(rect.length === 1, `(w28-a) Klick-Highlight (rect) weiterhin genau 1 (${rect.length})`);
      ok(blur.length === 2, `(w28-a) 2 blur-Highlights aus sensitive (${blur.length})`);
      ok(blur.every((h) => h.suggested === true), "(w28-a) blur-Highlights tragen suggested:true");
      ok(
        blur.every(
          (h) =>
            h.x >= 0 && h.y >= 0 && h.w > 0 && h.h > 0 &&
            h.x + h.w <= 1.0001 && h.y + h.h <= 1.0001,
        ),
        "(w28-a) blur-Rects normiert/geklemmt (0..1, im Bild)",
      );
    }

    // (w28-b) kaputte sensitive: NaN, Mini-Flaeche, >10 valide Eintraege, fremde Keys,
    // Nicht-Objekte -> gesaeubert/ignoriert, KEIN 400. Erwartung: genau 10 blur (gekappt),
    // keine fremden Keys, nur endliche Zahlen.
    const many = Array.from({ length: 15 }, (_, i) => ({ x: 0.01 * i, y: 0.20, w: 0.10, h: 0.10, evil: "x" }));
    const withBad = {
      ...mkSteps(accId, 1, "S")[0],
      sensitive: [
        { x: "nope", y: 0.1, w: 0.2, h: 0.1 }, // NaN -> weg
        { x: 0.1, y: 0.1, w: 0.001, h: 0.001 }, // Mini-Flaeche -> weg
        ...many, // 15 valide -> auf 10 gekappt
        "garbage",
        null,
        42, // Nicht-Objekte -> weg
      ],
    };
    const res2 = await post("/api/recorder/guide-complete", { token, steps: [withBad] });
    const j2 = await res2.json().catch(() => ({}));
    ok(res2.status === 200 && !!j2.tutorialId, `(w28-b) kaputte sensitive: kein 400 (${res2.status})`);
    if (j2.tutorialId) {
      tutorialIds.push(j2.tutorialId);
      const { data: rows } = await admin
        .from("steps")
        .select("highlights")
        .eq("tutorial_id", j2.tutorialId)
        .order("position", { ascending: true });
      const blur = (Array.isArray(rows?.[0]?.highlights) ? rows[0].highlights : []).filter((h) => h.type === "blur");
      ok(blur.length === 10, `(w28-b) auf 10 gekappt (war ${blur.length})`);
      ok(blur.every((h) => !("evil" in h)), "(w28-b) fremde Keys entfernt");
      ok(
        blur.every(
          (h) => Number.isFinite(h.x) && Number.isFinite(h.y) && Number.isFinite(h.w) && Number.isFinite(h.h),
        ),
        "(w28-b) nur endliche Zahlen",
      );
    }

    // (w28-c) ohne sensitive -> nur das Klick-Rechteck, KEINE blur (unveraendertes Verhalten).
    const res3 = await post("/api/recorder/guide-complete", { token, steps: [mkSteps(accId, 1, "S")[0]] });
    const j3 = await res3.json().catch(() => ({}));
    ok(res3.status === 200 && !!j3.tutorialId, `(w28-c) ohne sensitive: ok (${res3.status})`);
    if (j3.tutorialId) {
      tutorialIds.push(j3.tutorialId);
      const { data: rows } = await admin
        .from("steps")
        .select("highlights")
        .eq("tutorial_id", j3.tutorialId)
        .order("position", { ascending: true });
      const hs3 = Array.isArray(rows?.[0]?.highlights) ? rows[0].highlights : [];
      ok(hs3.length === 1 && hs3[0].type === "rect", `(w28-c) nur das Klick-Rechteck, keine blur (${hs3.length})`);
    }
  }

  // ---------- (e-alt) Free-Limit ----------
  const F = await mkUser(`tutax-guide-free-${stamp}@example.com`);
  accFree = F.accountId; userFree = F.userId;
  const tokFree = crypto.randomUUID();
  await admin.from("accounts").update({ recorder_token: tokFree, plan: "free" }).eq("id", accFree);
  // 5 Tutorials anlegen (= FREE_TUTORIAL_LIMIT).
  const fillRows = Array.from({ length: 5 }, (_, i) => ({ account_id: accFree, title: `Limit ${i + 1}` }));
  await admin.from("tutorials").insert(fillRows);

  // Fuer den complete-Call brauchen wir einen realen Pfad im Free-Konto.
  const hsF = await (await post("/api/recorder/guide-handshake", { token: tokFree, count: 1 })).json().catch(() => ({}));
  if (hsF.uploads?.[0]) {
    storagePaths.push(hsF.uploads[0].path);
    await fetch(hsF.uploads[0].uploadUrl, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: MINI_WEBP });
    const freeSteps = [{ path: hsF.uploads[0].path, label: "X", action: "click", rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, url: "https://x.test", title: "X", w: 800, h: 600 }];
    const freeRes = await post("/api/recorder/guide-complete", { token: tokFree, steps: freeSteps });
    const freeJson = await freeRes.json().catch(() => ({}));
    ok(freeRes.status === 403, `(e) Free-Limit erreicht -> 403 (war ${freeRes.status})`);
    if (freeJson.tutorialId) tutorialIds.push(freeJson.tutorialId); // sollte nicht passieren
  } else {
    ok(false, "(e) Free-Konto handshake fehlgeschlagen");
  }
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  try {
    // Tutorials loeschen (Cascade -> steps + step_branches).
    for (const id of tutorialIds) await admin.from("tutorials").delete().eq("id", id);
    // Storage-Dateien entfernen.
    if (storagePaths.length) await admin.storage.from(BUCKET).remove(storagePaths);
    // Konten (Cascade -> ihre Tutorials/Steps) + User.
    if (accId) await admin.from("accounts").delete().eq("id", accId);
    if (accFree) await admin.from("accounts").delete().eq("id", accFree);
    if (accForeign) await admin.from("accounts").delete().eq("id", accForeign);
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (userFree) await admin.auth.admin.deleteUser(userFree);
    if (userForeign) await admin.auth.admin.deleteUser(userForeign);
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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Sofort-Anleitung live verifiziert.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

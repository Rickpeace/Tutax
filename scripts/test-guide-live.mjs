// Live-Test der Sofort-Anleitung (Welle 22): /api/recorder/guide-handshake + guide-complete.
// Startet einen lokalen Next-Server auf PORT=3016 und prueft:
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
// Danach: vollstaendiges Cleanup (Tutorials/Steps/Branches via Cascade, Storage, Konten).
//
// Nutzung:  node --env-file=.env.local scripts/test-guide-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const BUCKET = "tutorial-images";
const PORT = 3016;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let accId, userId, accFree, userFree, server;
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

  // ---------- (e) Free-Limit ----------
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
    if (userId) await admin.auth.admin.deleteUser(userId);
    if (userFree) await admin.auth.admin.deleteUser(userFree);
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

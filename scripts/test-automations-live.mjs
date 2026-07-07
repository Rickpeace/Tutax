// Live-Test der Automationen (Welle 36, §5). Startet einen lokalen Next-Server auf
// PORT=3018 und prüft ZWEI Ebenen:
//   (A) Kern-Logik src/lib/automations.ts direkt importiert (server-only wird per
//       Loader-Hook gestubbt, TS via --experimental-strip-types):
//         • 4-Schritt-Tutorial (2 Klick m. Selektor, 1 fill-textbox „E-Mail“, 1 ohne
//           Selektor) → 3 automation_steps (ohne-Selektor übersprungen), fill hat
//           param_key, params enthält {key,label:„E-Mail“,type:'text'}.
//         • Passwort-Label → type 'secret'.
//         • Entscheidungs-Tutorial → sprechender Fehler.
//   (B) Token-APIs der Extension:
//         • GET  /api/recorder/automations       — nur eigenes Konto; falscher Token 401.
//         • GET  /api/recorder/automations/[id]  — Form {key,label,type,required} + Schritte
//           mit signierter imageUrl (null/gesetzt); fremde ID 404; falscher Token 401.
//         • POST /api/recorder/automation-runs    — start→runId (running in DB),
//           finish→status/detail in DB; fremde automationId 404; falscher Token 401.
// Cleanup ausschließlich per ID. Server beenden.
//
// Nutzung:
//   node --env-file=.env.local --experimental-strip-types scripts/test-automations-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { register } from "node:module";

// server-only ist in reinem Node nicht auflösbar (Next aliased es beim Bündeln) → stubben,
// damit die Kern-Logik direkt importierbar ist.
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);
const { convertTutorialToAutomation, sanitizeSchedule } = await import("../src/lib/automations.ts");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const IMG_BUCKET = "tutorial-images";
const PORT = 3018;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let server;
const accounts = []; // { userId, accountId }
const imgPaths = [];
const automationIds = [];
// Bedingter Sprung (Welle 47, Migration 0035): erst true, wenn die jump-Spalte live existiert
// (Preflight unten). seedLinear nimmt jump nur dann in die Insert-Zeilen auf.
let hasJump = false;

async function mkUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  const accountId = (await admin.from("account_members").select("account_id").eq("user_id", data.user.id)).data[0].account_id;
  return { userId: data.user.id, accountId };
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/api/recorder/automations`);
      if (r.status === 401) return true;
    } catch { /* noch nicht bereit */ }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

const getAuth = (path, token) =>
  fetch(`${BASE}${path}`, token ? { headers: { Authorization: "Bearer " + token } } : undefined);
const postJson = (path, body) =>
  fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Ein lineares Tutorial anlegen. `steps` = [{title, selector|null, image_path?}]; verkettet
// mit null-Label-Branches, root = erster Schritt. Gibt tutorialId zurück.
async function seedLinear(accountId, title, steps, { decisionAt } = {}) {
  const { data: tut } = await admin
    .from("tutorials")
    .insert({ account_id: accountId, title, status: "draft", visibility: "public", site_domains: ["abrechnung.example"] })
    .select("id").single();
  const tutorialId = tut.id;
  const ids = steps.map(() => crypto.randomUUID());
  const rows = steps.map((s, i) => ({
    id: ids[i],
    tutorial_id: tutorialId,
    title: s.title,
    image_path: s.image_path ?? null,
    selector: s.selector ?? null,
    page_url: "https://abrechnung.example/login",
    is_decision: decisionAt === i,
    highlights: s.highlights ?? [],
    // Datei-Brücke (Welle 39): {role:download|upload,…} — nur wenn der Schritt eine trägt.
    file_meta: s.file_meta ?? null,
    // Bedingte Schritte (Welle 42): {kind:element|url,…} — nur wenn der Schritt eine trägt.
    condition: s.condition ?? null,
    // Bedingter Sprung (Welle 47): {when,to_position} — nur einfügen, wenn 0035 live ist (sonst
    // würde der INSERT an einer fehlenden Spalte scheitern und den ganzen Test kippen).
    ...(hasJump ? { jump: s.jump ?? null } : {}),
    position: i + 1,
  }));
  await admin.from("steps").insert(rows);
  const branches = [];
  for (let i = 0; i < ids.length - 1; i++) {
    branches.push({ step_id: ids[i], label: null, target_step_id: ids[i + 1], position: 0 });
  }
  await admin.from("step_branches").insert(branches);
  await admin.from("tutorials").update({ root_step_id: ids[0] }).eq("id", tutorialId);
  return tutorialId;
}

try {
  // Preflight: Existieren die Automationen-Tabellen (Migration 0030)?
  const probe = await admin.from("automations").select("id").limit(1);
  if (probe.error) {
    console.log("⚠  Automationen-Tabellen fehlen (Migration 0030 noch nicht live angewandt).");
    console.log("   Grund:", probe.error.message);
    console.log("   Test übersprungen — nach dem Anwenden der Migration erneut ausführen.");
    process.exit(0);
  }

  // Preflight (Welle 37): Existiert automation_steps.highlights (Migration 0031)?
  const probeHl = await admin.from("automation_steps").select("highlights").limit(1);
  if (probeHl.error) {
    console.log("⚠  Spalte automation_steps.highlights fehlt (Migration 0031 noch nicht live angewandt).");
    console.log("   Grund:", probeHl.error.message);
    console.log("   Test übersprungen — nach dem Anwenden der Migration erneut ausführen.");
    process.exit(0);
  }

  // Preflight (Welle 39, Datei-Brücke): Existiert file_meta an steps + automation_steps (0032)?
  const probeFmA = await admin.from("automation_steps").select("file_meta").limit(1);
  const probeFmS = await admin.from("steps").select("file_meta").limit(1);
  if (probeFmA.error || probeFmS.error) {
    console.log("⚠  Spalte file_meta fehlt (Migration 0032 noch nicht live angewandt).");
    console.log("   Grund:", (probeFmA.error || probeFmS.error).message);
    console.log("   Test übersprungen — nach dem Anwenden der Migration erneut ausführen.");
    process.exit(0);
  }

  // Preflight (Welle 41, Zeitplan, Migration 0033): Existieren automations.schedule +
  // automation_runs.trigger? Die Automationen-APIs SELEKTIEREN schedule bereits (wie
  // file_meta/highlights), scheitern also ohne 0033 — daher den GANZEN Test überspringen
  // (wie die 0030/0031/0032-Preflights), bis Richard 0033 live angewandt hat.
  const probeSched = await admin.from("automations").select("schedule").limit(1);
  const probeTrig = await admin.from("automation_runs").select("trigger").limit(1);
  if (probeSched.error || probeTrig.error) {
    console.log("⚠  Spalten schedule/trigger fehlen (Migration 0033 noch nicht live angewandt).");
    console.log("   Grund:", (probeSched.error || probeTrig.error).message);
    console.log("   Test übersprungen — nach dem Anwenden der Migration erneut ausführen.");
    process.exit(0);
  }

  // Preflight (Welle 42, bedingte Schritte, Migration 0034): Existiert condition an steps +
  // automation_steps? Die Konvertierung UND die Detail-API SELEKTIEREN condition (wie file_meta),
  // scheitern also ohne 0034 → den GANZEN Test überspringen, bis Richard 0034 live angewandt hat.
  const probeCondA = await admin.from("automation_steps").select("condition").limit(1);
  const probeCondS = await admin.from("steps").select("condition").limit(1);
  if (probeCondA.error || probeCondS.error) {
    console.log("⚠  Spalte condition fehlt (Migration 0034 noch nicht live angewandt).");
    console.log("   Grund:", (probeCondA.error || probeCondS.error).message);
    console.log("   Test übersprungen — nach dem Anwenden der Migration erneut ausführen.");
    process.exit(0);
  }

  // Preflight (Welle 47, bedingter Sprung, Migration 0035): Existiert jump an steps +
  // automation_steps? Die Konvertierung UND die Detail-API SELEKTIEREN jump (wie condition/file_meta),
  // scheitern also ohne 0035 → den GANZEN Test überspringen, bis Richard 0035 live angewandt hat.
  const probeJumpA = await admin.from("automation_steps").select("jump").limit(1);
  const probeJumpS = await admin.from("steps").select("jump").limit(1);
  if (probeJumpA.error || probeJumpS.error) {
    console.log("⚠  Spalte jump fehlt (Migration 0035 noch nicht live angewandt).");
    console.log("   Grund:", (probeJumpA.error || probeJumpS.error).message);
    console.log("   Test übersprungen — nach dem Anwenden der Migration erneut ausführen.");
    process.exit(0);
  }
  hasJump = true; // ab hier existiert die Spalte → seedLinear darf jump einfügen

  const A = await mkUser(`steply-auto-a-${stamp}@example.com`);
  const B = await mkUser(`steply-auto-b-${stamp}@example.com`);
  accounts.push(A, B);
  const tokenA = crypto.randomUUID();
  const tokenB = crypto.randomUUID();
  await admin.from("accounts").update({ recorder_token: tokenA }).eq("id", A.accountId);
  await admin.from("accounts").update({ recorder_token: tokenB }).eq("id", B.accountId);

  // Ein reales Bild im PRIVATEN Bucket (createSignedUrl braucht ein existierendes Objekt).
  const imgPath = `${A.accountId}/auto-live-${stamp}/0.webp`;
  await admin.storage.from(IMG_BUCKET).upload(imgPath, Buffer.from("webp-" + stamp), { contentType: "image/webp", upsert: true });
  imgPaths.push(imgPath);

  // ── (A) Kern-Logik ─────────────────────────────────────────────────────────────
  // Der „Anmelden"-Schritt trägt Markierungen (inkl. blur) → müssen 1:1 in den Snapshot.
  const seedHl = [
    { id: "hl-rect", type: "rect", x: 0.1, y: 0.2, w: 0.3, h: 0.12, color: "#ef6a4e" },
    { id: "hl-blur", type: "blur", x: 0.5, y: 0.5, w: 0.2, h: 0.08 },
  ];
  const tut4 = await seedLinear(A.accountId, "Belege herunterladen " + stamp, [
    { title: "Anmelden", selector: { role: "button", text: "Anmelden" }, image_path: imgPath, highlights: seedHl },
    { title: "Weiter", selector: { role: "button", text: "Weiter" } },
    { title: "E-Mail eingeben", selector: { role: "textbox", text: "E-Mail" } },
    { title: "Hinweis: fertig", selector: null }, // ohne Selektor → wird übersprungen
  ]);
  const conv = await convertTutorialToAutomation(admin, A.accountId, tut4);
  ok(!!conv.automationId, "convert: automationId zurückgegeben");
  automationIds.push(conv.automationId);
  const autoId = conv.automationId;

  const { data: aSteps } = await admin
    .from("automation_steps").select("position, action, param_key, selector, image_path, highlights")
    .eq("automation_id", autoId).order("position", { ascending: true });
  ok(aSteps.length === 3, `3 automation_steps (Schritt ohne Selektor übersprungen) (war ${aSteps.length})`);
  const fill = aSteps.find((s) => s.action === "fill");
  ok(!!fill && !!fill.param_key, `fill-Schritt hat param_key (${fill && fill.param_key})`);
  ok(aSteps.filter((s) => s.action === "click").every((s) => s.param_key === null), "click-Schritte ohne param_key");

  // Highlights (Welle 37, Fix 4): 1:1 vom Tutorial-Schritt in den Snapshot kopiert (inkl. blur).
  const hlStep = aSteps.find((s) => s.image_path === imgPath);
  ok(hlStep && Array.isArray(hlStep.highlights) && hlStep.highlights.length === 2,
    `Snapshot kopiert highlights (2 inkl. blur) — war ${JSON.stringify(hlStep && hlStep.highlights)}`);
  ok(hlStep && (hlStep.highlights || []).some((h) => h && h.type === "blur"),
    "Snapshot: blur-Highlight mitkopiert");
  ok(hlStep && (hlStep.highlights || []).some((h) => h && h.type === "rect" && h.color === "#ef6a4e"),
    "Snapshot: rect-Highlight mit Farbe 1:1 übernommen");

  const { data: autoRow } = await admin.from("automations").select("params, site_domains, source_tutorial_id, title").eq("id", autoId).single();
  ok(Array.isArray(autoRow.params) && autoRow.params.length === 1, `genau 1 Parameter (war ${autoRow.params && autoRow.params.length})`);
  const p = autoRow.params[0];
  ok(p && p.label === "E-Mail" && p.type === "text" && p.required === true, `Parameter {label:E-Mail,type:text,required} (war ${JSON.stringify(p)})`);
  ok(p && p.key === fill.param_key, "params[].key == param_key des Schritts");
  ok(autoRow.source_tutorial_id === tut4 && Array.isArray(autoRow.site_domains) && autoRow.site_domains.includes("abrechnung.example"), "Automation: source_tutorial_id + site_domains übernommen");

  // Secret-Erkennung.
  const tutSecret = await seedLinear(A.accountId, "Login mit Passwort " + stamp, [
    { title: "Benutzer", selector: { role: "textbox", text: "Benutzername" } },
    { title: "Passwort", selector: { role: "textbox", text: "Passwort" } },
  ]);
  const convS = await convertTutorialToAutomation(admin, A.accountId, tutSecret);
  automationIds.push(convS.automationId);
  const { data: sRow } = await admin.from("automations").select("params").eq("id", convS.automationId).single();
  const secretP = (sRow.params || []).find((x) => x.label === "Passwort");
  ok(secretP && secretP.type === "secret", `Passwort-Label → type 'secret' (war ${secretP && secretP.type})`);

  // ── Datei-Brücke (Welle 39): Download → Upload konvertieren ─────────────────────
  const tutBridge = await seedLinear(A.accountId, "Beleg-Bruecke " + stamp, [
    {
      title: "Beleg herunterladen",
      selector: { role: "link", text: "Beleg herunterladen" },
      image_path: imgPath,
      file_meta: { role: "download", filename: "beleg.pdf", mime: "application/pdf", size: 12345 },
    },
    {
      title: "Datei auswaehlen",
      selector: { css: "#file", role: "textbox", text: "Datei" },
      file_meta: { role: "upload", filename: "beleg.pdf", mime: "application/pdf", size: 12345 },
    },
  ]);
  const convBr = await convertTutorialToAutomation(admin, A.accountId, tutBridge);
  automationIds.push(convBr.automationId);
  const { data: brSteps } = await admin
    .from("automation_steps").select("position, action, param_key, file_meta")
    .eq("automation_id", convBr.automationId).order("position", { ascending: true });
  ok(brSteps.length === 2, `Bruecke: 2 automation_steps (war ${brSteps.length})`);
  const dlStep = brSteps.find((s) => s.file_meta && s.file_meta.role === "download");
  const upStep = brSteps.find((s) => s.file_meta && s.file_meta.role === "upload");
  ok(dlStep && dlStep.action === "click" && dlStep.file_meta.key === "file1",
    `Download-Schritt: action='click' + file_meta.key='file1' (war ${JSON.stringify(dlStep)})`);
  ok(upStep && upStep.action === "upload" && upStep.file_meta.source === "file1",
    `Upload-Schritt: action='upload' + file_meta.source='file1' (war ${JSON.stringify(upStep)})`);
  ok(upStep && upStep.param_key === null, "Upload-Schritt zieht Wert aus der Datei (kein Parameter)");
  const { data: brAuto } = await admin.from("automations").select("params").eq("id", convBr.automationId).single();
  ok(Array.isArray(brAuto.params) && brAuto.params.length === 0,
    `Bruecke: keine Parameter (war ${brAuto.params && brAuto.params.length})`);

  // Upload OHNE vorherigen Download → sprechender Konvertierungsfehler.
  const tutUpOnly = await seedLinear(A.accountId, "Upload ohne Download " + stamp, [
    { title: "Irgendein Klick", selector: { role: "button", text: "Weiter" } },
    { title: "Datei hochladen", selector: { css: "#f", role: "textbox", text: "Datei" }, file_meta: { role: "upload", filename: "x.pdf" } },
  ]);
  let upErr = null;
  try { await convertTutorialToAutomation(admin, A.accountId, tutUpOnly); } catch (e) { upErr = e.message; }
  ok(/lädt eine Datei hoch/.test(upErr || ""), `Upload ohne Download → sprechender Fehler (war ${upErr})`);

  // ── Bedingte Schritte (Welle 42): condition wird 1:1 in den Snapshot kopiert ────
  const condElem = { kind: "element", selector: { css: "#accept", text: "Alle akzeptieren", role: "button" } };
  const condUrl = { kind: "url", pattern: "/app", negate: true };
  const tutCond = await seedLinear(A.accountId, "Cookie-Banner-Ablauf " + stamp, [
    { title: "Start", selector: { role: "button", text: "Start" } },
    { title: "Banner akzeptieren", selector: { css: "#accept", role: "button", text: "Alle akzeptieren" }, condition: condElem },
    { title: "Nur wenn nicht in /app", selector: { role: "button", text: "Weiter" }, condition: condUrl },
    { title: "Ziel", selector: { role: "button", text: "Ziel" } },
  ]);
  const convC = await convertTutorialToAutomation(admin, A.accountId, tutCond);
  automationIds.push(convC.automationId);
  const { data: cSteps } = await admin
    .from("automation_steps").select("position, title, condition")
    .eq("automation_id", convC.automationId).order("position", { ascending: true });
  ok(cSteps.length === 4, `Bedingung: 4 automation_steps (linearer Schritt MIT condition erlaubt) (war ${cSteps.length})`);
  const cElemStep = cSteps.find((s) => s.condition && s.condition.kind === "element");
  const cUrlStep = cSteps.find((s) => s.condition && s.condition.kind === "url");
  ok(cElemStep && cElemStep.condition.selector.css === "#accept" && cElemStep.condition.selector.text === "Alle akzeptieren",
    `Bedingung: Element-condition 1:1 kopiert (war ${JSON.stringify(cElemStep && cElemStep.condition)})`);
  ok(cUrlStep && cUrlStep.condition.pattern === "/app" && cUrlStep.condition.negate === true,
    `Bedingung: URL-condition inkl. negate kopiert (war ${JSON.stringify(cUrlStep && cUrlStep.condition)})`);
  ok(cSteps.filter((s) => !s.condition).length === 2, "Bedingung: Schritte ohne condition bleiben null (immer ausführen)");

  // Detail-API liefert condition je Schritt (für die Extension-Auswertung).
  const condAutoId = convC.automationId;

  // Entscheidung → sprechender Fehler.
  const tutDec = await seedLinear(A.accountId, "Mit Entscheidung " + stamp, [
    { title: "Start", selector: { role: "button", text: "Start" } },
    { title: "Konto vorhanden?", selector: null },
  ], { decisionAt: 1 });
  let decErr = null;
  try { await convertTutorialToAutomation(admin, A.accountId, tutDec); } catch (e) { decErr = e.message; }
  ok(/Verzweigungen/i.test(decErr || ""), `Entscheidungs-Tutorial → sprechender Fehler (war ${decErr})`);

  // Automation im Konto B (für den 404-Fremd-Test).
  const tutB = await seedLinear(B.accountId, "Fremd " + stamp, [
    { title: "Eins", selector: { role: "button" } },
    { title: "Zwei", selector: { role: "button" } },
  ]);
  const convB = await convertTutorialToAutomation(admin, B.accountId, tutB);
  automationIds.push(convB.automationId);

  // ── Server starten ───────────────────────────────────────────────────────────
  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore", shell: true });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // ── (B1) GET /api/recorder/automations ────────────────────────────────────────
  const listBad = await getAuth("/api/recorder/automations", crypto.randomUUID());
  ok(listBad.status === 401, `Liste mit falschem Token → 401 (war ${listBad.status})`);
  const listNone = await getAuth("/api/recorder/automations", null);
  ok(listNone.status === 401, `Liste ohne Token → 401 (war ${listNone.status})`);

  const listPre = await fetch(`${BASE}/api/recorder/automations`, { method: "OPTIONS" });
  ok(listPre.status === 204 && listPre.headers.get("access-control-allow-origin") === "*" &&
    (listPre.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"),
    `Liste OPTIONS → 204 + CORS + Authorization (war ${listPre.status})`);

  const listRes = await getAuth("/api/recorder/automations", tokenA);
  const listBody = await listRes.json().catch(() => ({}));
  ok(listRes.status === 200 && Array.isArray(listBody.automations), `Liste Token A → 200 + Array (war ${listRes.status})`);
  const mine = (listBody.automations || []).find((a) => a.id === autoId);
  const foreign = (listBody.automations || []).find((a) => a.id === convB.automationId);
  ok(!!mine && !foreign, "Liste enthält NUR eigene Automationen (Fremd-Automation fehlt)");
  ok(mine && mine.stepCount === 3 && mine.paramCount === 1, `stepCount=3 + paramCount=1 (war ${mine && mine.stepCount}/${mine && mine.paramCount})`);
  ok(mine && Array.isArray(mine.site_domains) && mine.site_domains.includes("abrechnung.example"), "Liste: site_domains übertragen");

  // ── (B2) GET /api/recorder/automations/[id] ───────────────────────────────────
  const detBad = await getAuth("/api/recorder/automations/" + autoId, crypto.randomUUID());
  ok(detBad.status === 401, `Detail mit falschem Token → 401 (war ${detBad.status})`);
  const detForeign = await getAuth("/api/recorder/automations/" + convB.automationId, tokenA);
  ok(detForeign.status === 404, `Detail einer FREMDEN Automation → 404 (war ${detForeign.status})`);

  const detRes = await getAuth("/api/recorder/automations/" + autoId, tokenA);
  const det = await detRes.json().catch(() => ({}));
  ok(detRes.status === 200 && det.automation && det.automation.id === autoId, `Detail Token A → 200 (war ${detRes.status})`);
  ok(Array.isArray(det.automation.params) && det.automation.params.length === 1, "Detail: params-Array");
  const dp = det.automation.params[0];
  ok(dp && "key" in dp && "label" in dp && "type" in dp && "required" in dp && !("value" in dp),
    `Detail: Parameter-Form {key,label,type,required} OHNE value (war ${JSON.stringify(dp)})`);
  ok(Array.isArray(det.steps) && det.steps.length === 3, `Detail: 3 Schritte (war ${det.steps && det.steps.length})`);
  ok(det.steps.every((s, i) => s.position === i + 1), "Detail: Schritte nach position sortiert");
  const withImg = det.steps.find((s) => typeof s.imageUrl === "string" && /^https?:\/\//.test(s.imageUrl));
  const noImg = det.steps.find((s) => s.imageUrl === null);
  ok(!!withImg, "Detail: mind. ein Schritt mit signierter imageUrl (http)");
  ok(!!noImg, "Detail: mind. ein Schritt mit imageUrl = null");
  // Highlights je Schritt (Welle 37, Fix 4): Array immer, mit blur beim markierten Schritt.
  ok(det.steps.every((s) => Array.isArray(s.highlights)), "Detail: highlights je Schritt immer Array (auch [])");
  const detHl = det.steps.find((s) => Array.isArray(s.highlights) && s.highlights.length === 2);
  ok(detHl && detHl.highlights.some((h) => h.type === "blur"), "Detail: markierter Schritt liefert highlights (inkl. blur)");
  const fillDet = det.steps.find((s) => s.action === "fill");
  ok(fillDet && fillDet.param_key === fill.param_key && fillDet.selector, "Detail: fill-Schritt mit param_key + selector");

  // Datei-Brücke (Welle 39): die API liefert file_meta je Schritt (Download-key / Upload-source).
  const detBrRes = await getAuth("/api/recorder/automations/" + convBr.automationId, tokenA);
  const detBr = await detBrRes.json().catch(() => ({}));
  ok(detBrRes.status === 200 && Array.isArray(detBr.steps), "Detail Bruecke → 200 + Schritte");
  const detDl = (detBr.steps || []).find((s) => s.file_meta && s.file_meta.role === "download");
  const detUp = (detBr.steps || []).find((s) => s.file_meta && s.file_meta.role === "upload");
  ok(detDl && detDl.file_meta.key === "file1", "Detail: Download-Schritt liefert file_meta {role:download,key:file1}");
  ok(detUp && detUp.action === "upload" && detUp.file_meta.source === "file1",
    "Detail: Upload-Schritt file_meta {role:upload,source:file1} + action='upload'");
  ok((detBr.steps || []).every((s) => "file_meta" in s), "Detail: file_meta-Feld je Schritt vorhanden (auch null)");

  // Bedingte Schritte (Welle 42): die API liefert condition je Schritt (Element/URL/null).
  const detCondRes = await getAuth("/api/recorder/automations/" + condAutoId, tokenA);
  const detCond = await detCondRes.json().catch(() => ({}));
  ok(detCondRes.status === 200 && Array.isArray(detCond.steps), "Detail Bedingung → 200 + Schritte");
  ok((detCond.steps || []).every((s) => "condition" in s), "Detail: condition-Feld je Schritt vorhanden (auch null)");
  const detCE = (detCond.steps || []).find((s) => s.condition && s.condition.kind === "element");
  const detCU = (detCond.steps || []).find((s) => s.condition && s.condition.kind === "url");
  ok(detCE && detCE.condition.selector.css === "#accept", "Detail: Element-condition mitgeliefert {kind:element,selector}");
  ok(detCU && detCU.condition.pattern === "/app" && detCU.condition.negate === true, "Detail: URL-condition inkl. negate mitgeliefert");

  // ── Bedingter Sprung (Welle 47): Konvertierung kopiert jump 1:1 + API liefert jump + set/clear ──
  // Gate: NUR wenn 0035 live ist (sonst würde bereits das seedLinear-INSERT scheitern).
  if (hasJump) {
    const jumpWhen = { kind: "element", selector: { css: "#anmelden", text: "Anmelden", role: "link" }, negate: true };
    const tutJump = await seedLinear(A.accountId, "Login mit Sprung " + stamp, [
      // Schritt 1 trägt den Sprung „wenn Anmelden NICHT da → to_position 3" (Login überspringen).
      { title: "Anmelden", selector: { css: "#anmelden", role: "link", text: "Anmelden" }, jump: { when: jumpWhen, to_position: 3 } },
      { title: "Benutzer", selector: { css: "#user", role: "textbox", text: "Benutzer" } },
      { title: "Ziel", selector: { role: "button", text: "Ziel" } },
    ]);
    const convJ = await convertTutorialToAutomation(admin, A.accountId, tutJump);
    automationIds.push(convJ.automationId);

    // Konvertierung: jump 1:1 in den Snapshot (Positionen bleiben im linearen Pfad erhalten).
    const { data: jSteps } = await admin
      .from("automation_steps").select("id, position, title, selector, jump")
      .eq("automation_id", convJ.automationId).order("position", { ascending: true });
    const jStep = jSteps.find((s) => s.jump);
    ok(jStep && jStep.jump.to_position === 3 && jStep.jump.when.negate === true && jStep.jump.when.selector.text === "Anmelden",
      `Sprung: jump 1:1 in Snapshot kopiert (war ${JSON.stringify(jStep && jStep.jump)})`);
    ok(jSteps.filter((s) => !s.jump).length === jSteps.length - 1, "Sprung: Schritte ohne jump bleiben null");

    // Detail-API liefert jump je Schritt (für die Extension-Auswertung im Lauf).
    const detJRes = await getAuth("/api/recorder/automations/" + convJ.automationId, tokenA);
    const detJ = await detJRes.json().catch(() => ({}));
    ok(detJRes.status === 200 && (detJ.steps || []).every((s) => "jump" in s), "Detail: jump-Feld je Schritt vorhanden (auch null)");
    const detJStep = (detJ.steps || []).find((s) => s.jump);
    ok(detJStep && detJStep.jump.to_position === 3 && detJStep.jump.when.negate === true,
      `Detail: jump inkl. when/negate mitgeliefert (war ${JSON.stringify(detJStep && detJStep.jump)})`);

    // setAutomationStepJump-Kern (DB-Effekt): die Server-Action ist auth-gebunden und hier nicht
    // direkt aufrufbar; ihr DB-Ergebnis (jump am Schritt setzen aus dem EIGENEN Selektor → wieder
    // entfernen) wird DB-nah gespiegelt und über die API verifiziert (Set + Clear).
    const step2 = jSteps.find((s) => s.position === 2); // „Benutzer" (hat einen Selektor)
    const step2Jump = { when: { kind: "element", selector: step2.selector, negate: true }, to_position: 3 };
    await admin.from("automation_steps").update({ jump: step2Jump }).eq("id", step2.id);
    const detSet = await (await getAuth("/api/recorder/automations/" + convJ.automationId, tokenA)).json().catch(() => ({}));
    const s2Set = (detSet.steps || []).find((s) => s.position === 2);
    ok(s2Set && s2Set.jump && s2Set.jump.to_position === 3 && s2Set.jump.when.selector.css === "#user",
      `Sprung setzen (DB-Spiegel): jump am Schritt 2 aus eigenem Selektor gesetzt (war ${JSON.stringify(s2Set && s2Set.jump)})`);
    await admin.from("automation_steps").update({ jump: null }).eq("id", step2.id);
    const detClr = await (await getAuth("/api/recorder/automations/" + convJ.automationId, tokenA)).json().catch(() => ({}));
    const s2Clr = (detClr.steps || []).find((s) => s.position === 2);
    ok(s2Clr && s2Clr.jump === null, "Sprung entfernen (DB-Spiegel): jump am Schritt 2 wieder null");
  }

  // ── (B3) POST /api/recorder/automation-runs ───────────────────────────────────
  const runsPre = await fetch(`${BASE}/api/recorder/automation-runs`, { method: "OPTIONS" });
  ok(runsPre.status === 204 && runsPre.headers.get("access-control-allow-origin") === "*", `runs OPTIONS → 204 + CORS (war ${runsPre.status})`);

  const startBad = await postJson("/api/recorder/automation-runs", { token: crypto.randomUUID(), automationId: autoId, event: "start", mode: "semi" });
  ok(startBad.status === 401, `runs start falscher Token → 401 (war ${startBad.status})`);

  const startForeign = await postJson("/api/recorder/automation-runs", { token: tokenA, automationId: convB.automationId, event: "start", mode: "auto" });
  ok(startForeign.status === 404, `runs start fremde automationId → 404 (war ${startForeign.status})`);

  const startRes = await postJson("/api/recorder/automation-runs", { token: tokenA, automationId: autoId, event: "start", mode: "semi" });
  const startBody = await startRes.json().catch(() => ({}));
  ok(startRes.status === 200 && !!startBody.runId, `runs start → runId (${startRes.status})`);
  const runId = startBody.runId;
  const { data: runStart } = await admin.from("automation_runs").select("status, mode, account_id, finished_at").eq("id", runId).single();
  ok(runStart && runStart.status === "running" && runStart.mode === "semi" && runStart.account_id === A.accountId && runStart.finished_at === null,
    `runs: running-Zeile mit korrektem Konto/Modus (war ${JSON.stringify(runStart)})`);

  const finRes = await postJson("/api/recorder/automation-runs", { token: tokenA, runId, event: "finish", status: "failed", currentStep: 2, detail: "Schritt 2: selector-miss" });
  const finBody = await finRes.json().catch(() => ({}));
  ok(finRes.status === 200 && finBody.status === "failed", `runs finish → 200 status=failed (${finRes.status})`);
  const { data: runFin } = await admin.from("automation_runs").select("status, detail, current_step, finished_at").eq("id", runId).single();
  ok(runFin && runFin.status === "failed" && runFin.detail === "Schritt 2: selector-miss" && runFin.current_step === 2 && runFin.finished_at,
    `runs: finish persistiert status/detail/current_step/finished_at (war ${JSON.stringify(runFin)})`);

  const finBadStatus = await postJson("/api/recorder/automation-runs", { token: tokenA, runId, event: "finish", status: "quatsch" });
  ok(finBadStatus.status === 400, `runs finish ungültiger Status → 400 (war ${finBadStatus.status})`);

  // ── (C) Zeitplan + Trigger (Welle 41; 0033 ist hier garantiert live — Preflight oben) ──
  {
    // sanitizeSchedule (pur): Normalisierung + sprechende Fehler.
    ok(sanitizeSchedule(null) === null, "sanitizeSchedule: null → null (kein Zeitplan)");
    const wk = sanitizeSchedule({ enabled: true, freq: "weekly", weekday: 1, hour: 8, minute: 0, day: 99 });
    ok(wk && wk.freq === "weekly" && wk.weekday === 1 && wk.hour === 8 && wk.minute === 0 && !("day" in wk),
      `sanitizeSchedule: weekly normalisiert (day verworfen) (war ${JSON.stringify(wk)})`);
    let schedThrew = false;
    try { sanitizeSchedule({ enabled: true, freq: "weekly", hour: 8, minute: 0 }); } catch { schedThrew = true; }
    ok(schedThrew, "sanitizeSchedule: weekly ohne weekday → wirft (sprechend)");

    // Zeitplan in der DB setzen + über BEIDE Token-APIs zurücklesen (normalisiert | null).
    const sched = sanitizeSchedule({ enabled: true, freq: "monthly", day: 3, hour: 9, minute: 30 });
    await admin.from("automations").update({ schedule: sched }).eq("id", autoId);
    const listS = await getAuth("/api/recorder/automations", tokenA);
    const listSB = await listS.json().catch(() => ({}));
    const mineS = (listSB.automations || []).find((a) => a.id === autoId);
    ok(mineS && mineS.schedule && mineS.schedule.freq === "monthly" && mineS.schedule.day === 3 && mineS.schedule.enabled === true,
      `Liste: schedule mitgeliefert + normalisiert (war ${JSON.stringify(mineS && mineS.schedule)})`);
    const detS = await getAuth("/api/recorder/automations/" + autoId, tokenA);
    const detSB = await detS.json().catch(() => ({}));
    ok(detSB.automation && detSB.automation.schedule && detSB.automation.schedule.day === 3,
      `Detail: schedule mitgeliefert (war ${JSON.stringify(detSB.automation && detSB.automation.schedule)})`);
    // Automation OHNE Zeitplan → schedule: null in der API.
    const detNo = await getAuth("/api/recorder/automations/" + convS.automationId, tokenA);
    const detNoB = await detNo.json().catch(() => ({}));
    ok(detNoB.automation && detNoB.automation.schedule === null, "Detail: ohne Zeitplan → schedule null");

    // Trigger: start scheduled → DB.trigger='scheduled'; start ohne trigger → 'manual'.
    const stSched = await postJson("/api/recorder/automation-runs", { token: tokenA, automationId: autoId, event: "start", mode: "auto", trigger: "scheduled" });
    const stSchedB = await stSched.json().catch(() => ({}));
    ok(stSched.status === 200 && !!stSchedB.runId, `runs start trigger=scheduled → runId (${stSched.status})`);
    const { data: rSched } = await admin.from("automation_runs").select("trigger, mode").eq("id", stSchedB.runId).single();
    ok(rSched && rSched.trigger === "scheduled" && rSched.mode === "auto", `runs: trigger='scheduled' persistiert (war ${JSON.stringify(rSched)})`);
    const stMan = await postJson("/api/recorder/automation-runs", { token: tokenA, automationId: autoId, event: "start", mode: "semi" });
    const stManB = await stMan.json().catch(() => ({}));
    const { data: rMan } = await admin.from("automation_runs").select("trigger").eq("id", stManB.runId).single();
    ok(rMan && rMan.trigger === "manual", `runs: ohne trigger → Default 'manual' (war ${rMan && rMan.trigger})`);
    // Ungültiger trigger-Wert → als 'manual' behandelt (kein 400).
    const stBadTrig = await postJson("/api/recorder/automation-runs", { token: tokenA, automationId: autoId, event: "start", mode: "semi", trigger: "quatsch" });
    const stBadTrigB = await stBadTrig.json().catch(() => ({}));
    const { data: rBadTrig } = await admin.from("automation_runs").select("trigger").eq("id", stBadTrigB.runId).single();
    ok(rBadTrig && rBadTrig.trigger === "manual", `runs: ungültiger trigger → 'manual' (war ${rBadTrig && rBadTrig.trigger})`);
  }
} catch (e) {
  ok(false, "Fehler: " + (e && e.stack ? e.stack : e));
} finally {
  try {
    for (const id of automationIds) await admin.from("automations").delete().eq("id", id);
    if (imgPaths.length) await admin.storage.from(IMG_BUCKET).remove(imgPaths);
    for (const a of accounts) {
      await admin.from("accounts").delete().eq("id", a.accountId); // kaskadiert Tutorials/Steps/Automationen
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
    } catch { server.kill("SIGKILL"); }
  }
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Automationen live verifiziert.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

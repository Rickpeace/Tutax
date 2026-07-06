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
const { convertTutorialToAutomation } = await import("../src/lib/automations.ts");

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
    highlights: [],
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
  const tut4 = await seedLinear(A.accountId, "Belege herunterladen " + stamp, [
    { title: "Anmelden", selector: { role: "button", text: "Anmelden" }, image_path: imgPath },
    { title: "Weiter", selector: { role: "button", text: "Weiter" } },
    { title: "E-Mail eingeben", selector: { role: "textbox", text: "E-Mail" } },
    { title: "Hinweis: fertig", selector: null }, // ohne Selektor → wird übersprungen
  ]);
  const conv = await convertTutorialToAutomation(admin, A.accountId, tut4);
  ok(!!conv.automationId, "convert: automationId zurückgegeben");
  automationIds.push(conv.automationId);
  const autoId = conv.automationId;

  const { data: aSteps } = await admin
    .from("automation_steps").select("position, action, param_key, selector, image_path")
    .eq("automation_id", autoId).order("position", { ascending: true });
  ok(aSteps.length === 3, `3 automation_steps (Schritt ohne Selektor übersprungen) (war ${aSteps.length})`);
  const fill = aSteps.find((s) => s.action === "fill");
  ok(!!fill && !!fill.param_key, `fill-Schritt hat param_key (${fill && fill.param_key})`);
  ok(aSteps.filter((s) => s.action === "click").every((s) => s.param_key === null), "click-Schritte ohne param_key");

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
  const fillDet = det.steps.find((s) => s.action === "fill");
  ok(fillDet && fillDet.param_key === fill.param_key && fillDet.selector, "Detail: fill-Schritt mit param_key + selector");

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

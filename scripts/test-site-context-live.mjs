// Live-Test des Seiten-Kontexts (Welle 31c): guide-complete persistiert steps.page_url und
// säet tutorials.site_domains. Startet einen lokalen Next-Server auf PORT=3015 und prueft:
//   (a) Sofort-Upload (handshake + complete) mit 2 Schritten (URLs login.datev.de +
//       www.datev.de) -> beide steps.page_url gesetzt; site_domains == ['datev.de']
//       (Subdomain + www kollabieren auf die Basis-Domain).
//   (b) zweiter complete mit target-Anker (afterStepId) in DASSELBE Tutorial, Schritt-URL
//       einer ANDEREN Domain (elster.de) -> site_domains ist Union ['datev.de','elster.de'];
//       der eingefuegte Schritt hat page_url gesetzt.
// Danach: vollstaendiges Cleanup (Tutorial/Steps/Branches via Cascade, Storage, Konto/User).
//
// Laeuft die Migration 0029 noch nicht (Spalte fehlt): SAUBER abbrechen mit klarer Meldung
// (exit 2), damit man es nach dem DB-Update erneut versuchen kann.
//
// Nutzung:  node --env-file=.env.local scripts/test-site-context-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const BUCKET = "tutorial-images";
const PORT = 3015;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let accId, userId, server;
const tutorialIds = [];
const storagePaths = [];

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

// count signierte Upload-URLs holen + Mini-WebPs hochladen (reale Pfade). Gibt die Pfade.
async function handshakeUpload(token, count) {
  const hsRes = await post("/api/recorder/guide-handshake", { token, count });
  const hs = await hsRes.json().catch(() => ({}));
  if (!hsRes.ok || !Array.isArray(hs.uploads) || hs.uploads.length !== count) {
    throw new Error("guide-handshake fehlgeschlagen (" + hsRes.status + ")");
  }
  for (const u of hs.uploads) storagePaths.push(u.path);
  for (const u of hs.uploads) {
    await fetch(u.uploadUrl, { method: "PUT", headers: { "Content-Type": "image/webp" }, body: MINI_WEBP });
  }
  return hs.uploads.map((u) => u.path);
}

try {
  // ── Migrations-Guard: fehlen die Spalten, sauber abbrechen ───────────────────────
  const probeT = await admin.from("tutorials").select("site_domains").limit(1);
  const probeS = await admin.from("steps").select("page_url").limit(1);
  if (probeT.error || probeS.error) {
    console.error(
      "\n✗ Migration 0029 (site_context_guide) noch nicht auf der DB angewandt:",
      (probeT.error || probeS.error).message,
      "\n  → Erst die Migration anwenden, dann diesen Test erneut ausfuehren.",
    );
    process.exit(2);
  }
  ok(true, "Migrations-Guard: steps.page_url + tutorials.site_domains vorhanden");

  const A = await mkUser(`tutax-sitectx-${stamp}@example.com`);
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

  // ══════════ (a) neues Tutorial: page_url + site_domains-Seeding ══════════
  const urlLogin = "https://login.datev.de/anmelden";
  const urlWww = "https://www.datev.de/start";
  const paths = await handshakeUpload(token, 2);
  const steps = [
    { path: paths[0], label: "Anmelden", action: "click", rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 }, url: urlLogin, title: "DATEV Login", w: 1280, h: 720 },
    { path: paths[1], label: "Start", action: "click", rect: { x: 0.2, y: 0.2, w: 0.2, h: 0.1 }, url: urlWww, title: "DATEV Start", w: 1280, h: 720 },
  ];
  const compRes = await post("/api/recorder/guide-complete", { token, steps });
  const comp = await compRes.json().catch(() => ({}));
  ok(compRes.status === 200 && !!comp.tutorialId, `(a) complete -> tutorialId (${compRes.status})`);
  const tutId = comp.tutorialId;
  if (tutId) tutorialIds.push(tutId);

  let firstStepId = null;
  if (tutId) {
    const { data: tut } = await admin.from("tutorials").select("site_domains").eq("id", tutId).single();
    const dom = Array.isArray(tut?.site_domains) ? tut.site_domains : [];
    ok(JSON.stringify(dom) === JSON.stringify(["datev.de"]), `(a) site_domains == ['datev.de'] (war ${JSON.stringify(dom)})`);

    const { data: stepRows } = await admin.from("steps").select("id, page_url").eq("tutorial_id", tutId).order("position", { ascending: true });
    firstStepId = stepRows?.[0]?.id ?? null;
    ok(stepRows?.length === 2, `(a) 2 Steps angelegt (waren ${stepRows?.length})`);
    ok(stepRows?.[0]?.page_url === urlLogin, `(a) Step 1 page_url == login-URL (war ${JSON.stringify(stepRows?.[0]?.page_url)})`);
    ok(stepRows?.[1]?.page_url === urlWww, `(a) Step 2 page_url == www-URL (war ${JSON.stringify(stepRows?.[1]?.page_url)})`);
  }

  // ══════════ (b) target-Anker: Union mit anderer Domain ══════════
  if (tutId && firstStepId) {
    const urlElster = "https://www.elster.de/eportal/formulare";
    const [pAnchor] = await handshakeUpload(token, 1);
    const resB = await post("/api/recorder/guide-complete", {
      token,
      steps: [{ path: pAnchor, label: "Formular", action: "click", rect: { x: 0.3, y: 0.3, w: 0.2, h: 0.1 }, url: urlElster, title: "ELSTER", w: 1280, h: 720 }],
      target: { tutorialId: tutId, anchor: { afterStepId: firstStepId } },
    });
    const jB = await resB.json().catch(() => ({}));
    ok(resB.status === 200 && jB.tutorialId === tutId && jB.inserted === true && !jB.fallback, `(b) Anker-Einfuegen in dasselbe Tutorial (${resB.status})`);

    const { data: tut2 } = await admin.from("tutorials").select("site_domains").eq("id", tutId).single();
    const dom2 = Array.isArray(tut2?.site_domains) ? tut2.site_domains : [];
    ok(JSON.stringify(dom2) === JSON.stringify(["datev.de", "elster.de"]), `(b) site_domains Union ['datev.de','elster.de'] (war ${JSON.stringify(dom2)})`);

    const { data: elsterStep } = await admin.from("steps").select("page_url").eq("tutorial_id", tutId).eq("page_url", urlElster).maybeSingle();
    ok(!!elsterStep, "(b) eingefuegter Schritt hat page_url (elster-URL) gesetzt");
  }
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  try {
    for (const id of tutorialIds) await admin.from("tutorials").delete().eq("id", id);
    if (storagePaths.length) await admin.storage.from(BUCKET).remove(storagePaths);
    if (accId) await admin.from("accounts").delete().eq("id", accId);
    if (userId) await admin.auth.admin.deleteUser(userId);
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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Seiten-Kontext live verifiziert.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

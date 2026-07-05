// Live-Test des Steply-Recorder-Direkt-Uploads (§5).
// Startet einen lokalen Next-Server auf PORT=3013, prueft:
//   (a) Token-Rotation (via Admin gesetzt)
//   (b) handshake mit falschem Token -> 401; mit echtem -> uploadUrl + path
//   (c) PUT einer Mini-Datei an die signierte URL -> 2xx, Datei existiert im Bucket
//   (d) complete mit fremdem path-Praefix -> 4xx; mit korrektem path + 2 Klicks ->
//       video_jobs-Row MIT clicks jsonb
//   (e) complete mit kaputten clicks -> Row OHNE clicks
// Danach: Cleanup (Jobs + Storage-Dateien + Konto/User) und Server beenden.
//
// Nutzung:  node --env-file=.env.local scripts/test-recorder-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const BUCKET = "tutorial-videos";
const PORT = 3013;
const BASE = `http://localhost:${PORT}`;

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let accId, userId, server;
const jobIds = [];
const paths = [];

async function mkUser(email) {
  const { data } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  const accountId = (await admin.from("account_members").select("account_id").eq("user_id", data.user.id)).data[0].account_id;
  return { userId: data.user.id, accountId };
}

async function waitForServer(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // handshake ohne Token -> 401 zeigt, dass die Route steht.
      const r = await fetch(`${BASE}/api/recorder/handshake`, {
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
  // Konto + Token anlegen (a).
  const A = await mkUser(`tutax-rec-${stamp}@example.com`);
  accId = A.accountId; userId = A.userId;
  const token = crypto.randomUUID();
  const { error: te } = await admin.from("accounts").update({ recorder_token: token }).eq("id", accId);
  ok(!te, "Token-Rotation: recorder_token gesetzt");

  // Server starten.
  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // (b) handshake mit falschem Token -> 401.
  const bad = await post("/api/recorder/handshake", { token: crypto.randomUUID() });
  ok(bad.status === 401, `handshake mit falschem Token -> 401 (war ${bad.status})`);

  // CORS-Header vorhanden?
  ok(bad.headers.get("access-control-allow-origin") === "*", "handshake liefert CORS-Header *");

  // OPTIONS-Preflight.
  const pre = await fetch(`${BASE}/api/recorder/handshake`, { method: "OPTIONS" });
  ok(pre.status === 204 && pre.headers.get("access-control-allow-origin") === "*", "OPTIONS-Preflight -> 204 + CORS");

  // (b) handshake mit echtem Token -> uploadUrl + path.
  const hsRes = await post("/api/recorder/handshake", { token });
  const hs = await hsRes.json().catch(() => ({}));
  ok(hsRes.status === 200 && !!hs.uploadUrl && !!hs.path, `handshake mit echtem Token -> uploadUrl+path (${hsRes.status})`);
  ok(typeof hs.path === "string" && hs.path.startsWith(`${accId}/`), "path liegt im Konto-Ordner");
  ok(hs.accountName != null, "accountName in der Antwort");
  if (hs.path) paths.push(hs.path);

  // (c) PUT einer Mini-Datei an die signierte URL.
  if (hs.uploadUrl) {
    const put = await fetch(hs.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "video/webm" },
      body: Buffer.from("fake-webm-" + stamp),
    });
    ok(put.status >= 200 && put.status < 300, `PUT an signierte URL -> 2xx (war ${put.status})`);
    // Datei existiert im Bucket?
    const { data: list } = await admin.storage.from(BUCKET).list(accId);
    const fname = hs.path.split("/").pop();
    ok(!!list?.some((f) => f.name === fname), "Datei existiert im Bucket");
  }

  // (d) complete mit fremdem path-Praefix -> 4xx.
  const foreign = await post("/api/recorder/complete", { token, path: `${crypto.randomUUID()}/hack.webm` });
  ok(foreign.status >= 400 && foreign.status < 500, `complete mit fremdem Pfad -> 4xx (war ${foreign.status})`);

  // (d) complete mit korrektem path + 2 gueltigen clicks -> Row MIT clicks.
  const goodClicks = [
    { t: 1.2, x: 0.5, y: 0.4, label: "Speichern" },
    { t: 3.4, x: 0.1, y: 0.9 },
  ];
  const compRes = await post("/api/recorder/complete", { token, path: hs.path, title: "Testaufnahme", clicks: goodClicks });
  const comp = await compRes.json().catch(() => ({}));
  ok(compRes.status === 200 && !!comp.jobId, `complete mit gueltigen clicks -> jobId (${compRes.status})`);
  if (comp.jobId) {
    jobIds.push(comp.jobId);
    const { data: job } = await admin.from("video_jobs").select("clicks, video_path, title, status, account_id").eq("id", comp.jobId).single();
    ok(Array.isArray(job?.clicks) && job.clicks.length === 2, "video_jobs-Row hat clicks jsonb (2 Eintraege)");
    ok(job?.video_path === hs.path && job?.account_id === accId && job?.status === "queued", "Row: korrekter Pfad/Account/Status");
    ok(job?.title === "Testaufnahme", "Row: Titel uebernommen");
  }

  // (e) complete mit kaputten clicks -> Row OHNE clicks (aber Job entsteht).
  const hs2Res = await post("/api/recorder/handshake", { token });
  const hs2 = await hs2Res.json().catch(() => ({}));
  if (hs2.path) paths.push(hs2.path);
  // Mini-Datei hochladen, damit ein realer Pfad existiert (nicht zwingend, aber sauber).
  if (hs2.uploadUrl) {
    await fetch(hs2.uploadUrl, { method: "PUT", headers: { "Content-Type": "video/webm" }, body: Buffer.from("x" + stamp) });
  }
  const brokenClicks = [{ t: -5, x: 99, y: "nope" }, "garbage"];
  const compRes2 = await post("/api/recorder/complete", { token, path: hs2.path, clicks: brokenClicks });
  const comp2 = await compRes2.json().catch(() => ({}));
  ok(compRes2.status === 200 && !!comp2.jobId, `complete mit kaputten clicks -> Job entsteht trotzdem (${compRes2.status})`);
  if (comp2.jobId) {
    jobIds.push(comp2.jobId);
    const { data: job2 } = await admin.from("video_jobs").select("clicks, title").eq("id", comp2.jobId).single();
    ok(job2?.clicks == null, "Row OHNE clicks bei kaputten Klick-Daten");
    ok(job2?.title === "Bildschirmaufnahme", "Default-Titel Bildschirmaufnahme ohne title");
  }

  // ---------- (f) GET /api/recorder/me — Ein-Klick-Pairing-Validierung (Welle 25) ----------
  const { data: accRow } = await admin.from("accounts").select("name, slug").eq("id", accId).single();

  // gueltiger Token -> 200 + Kontoname + slug.
  const meOk = await fetch(`${BASE}/api/recorder/me`, { headers: { Authorization: "Bearer " + token } });
  const meBody = await meOk.json().catch(() => ({}));
  ok(meOk.status === 200, `me mit gueltigem Token -> 200 (war ${meOk.status})`);
  ok(meBody.account === accRow?.name && meBody.slug === accRow?.slug, `me liefert Kontoname+slug (war ${JSON.stringify(meBody)})`);
  ok(meOk.headers.get("access-control-allow-origin") === "*", "me liefert CORS-Header *");

  // falscher Token -> 401.
  const meBad = await fetch(`${BASE}/api/recorder/me`, { headers: { Authorization: "Bearer " + crypto.randomUUID() } });
  ok(meBad.status === 401, `me mit falschem Token -> 401 (war ${meBad.status})`);

  // fehlender Token (kein Authorization-Header) -> 401.
  const meNone = await fetch(`${BASE}/api/recorder/me`);
  ok(meNone.status === 401, `me ohne Authorization -> 401 (war ${meNone.status})`);

  // OPTIONS-Preflight -> 204 + CORS, Authorization-Header erlaubt.
  const mePre = await fetch(`${BASE}/api/recorder/me`, { method: "OPTIONS" });
  ok(mePre.status === 204 && mePre.headers.get("access-control-allow-origin") === "*", `me OPTIONS -> 204 + CORS (war ${mePre.status})`);
  ok((mePre.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"), "me Preflight erlaubt Authorization-Header");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  // Cleanup (Supabase-Query-Builder ist thenable, hat aber kein .catch -> try/catch).
  try {
    for (const id of jobIds) await admin.from("video_jobs").delete().eq("id", id);
    if (paths.length) await admin.storage.from(BUCKET).remove(paths);
    if (accId) await admin.from("accounts").delete().eq("id", accId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  } catch (e) {
    console.warn("Cleanup-Warnung:", e.message);
  }
  // Server beenden (kill des ganzen Baums, npx -> next).
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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Recorder-Direkt-Upload live verifiziert.");
process.exitCode = failed ? 1 : 0;
// Sicherstellen, dass der Prozess wirklich endet (haengende Server-Handles).
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

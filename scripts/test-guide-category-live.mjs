// Live-Test „Titel + Kategorie fuer die Sofort-Anleitung" (Welle 31d, §5). Startet einen
// lokalen Next-Server auf PORT=3016 und prueft:
//   (a) guide-complete mit category:{name:"E2E Kategorie 31d"} -> Tutorial hat category_id,
//       Kategorie existiert mit exakt diesem Namen im Konto.
//   (b) zweiter complete mit gleichem Namen in ANDERER Schreibweise ("e2e kategorie 31d")
//       -> KEINE Duplikat-Kategorie, gleiche category_id.
//   (c) complete mit category:{id:<erfundene uuid>} -> Tutorial entsteht trotzdem,
//       category_id bleibt null (fremde/unbekannte id wird still ignoriert).
//   (d) GET /api/recorder/categories -> Konto-Kategorien (enthaelt die Test-Kategorie),
//       401 bei falschem/fehlendem Token, OPTIONS -> 204 + CORS + Authorization.
// Danach: Cleanup (Tutorials + Test-Kategorie + Storage-Bilder + Konto/User), Server beenden.
//
// Nutzung:  node --env-file=.env.local scripts/test-guide-category-live.mjs
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const admin = createClient(url, secret, { auth: { persistSession: false } });
const IMG_BUCKET = "tutorial-images";
const PORT = 3016;
const BASE = `http://localhost:${PORT}`;
const CAT_NAME = "E2E Kategorie 31d";

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();

let accId, userId, server;
const tutorialIds = [];
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
      const r = await fetch(`${BASE}/api/recorder/categories`);
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

// Vollstaendiger Sofort-Anleitung-Upload (handshake -> PUT webp -> complete) mit
// optionaler Kategorie. Gibt { status, comp } des complete-Requests zurueck.
async function uploadGuideWith(token, category) {
  const hsRes = await postJson("/api/recorder/guide-handshake", { token, count: 1 });
  const hs = await hsRes.json().catch(() => ({}));
  if (!Array.isArray(hs.uploads) || hs.uploads.length !== 1) {
    throw new Error("guide-handshake fehlgeschlagen: " + JSON.stringify(hs));
  }
  const upPath = hs.uploads[0].path;
  imgPaths.push(upPath);
  await fetch(hs.uploads[0].uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/webp" },
    body: Buffer.from("webp-" + stamp + "-" + Math.random()),
  });
  const steps = [
    {
      path: upPath,
      label: "Speichern",
      action: "click",
      rect: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 },
      url: "https://example.com/formular",
      title: "Formular",
      w: 120,
      h: 60,
    },
  ];
  const body = { token, steps };
  if (category !== undefined) body.category = category;
  const res = await postJson("/api/recorder/guide-complete", body);
  const comp = await res.json().catch(() => ({}));
  if (comp && comp.tutorialId) tutorialIds.push(comp.tutorialId);
  return { status: res.status, comp };
}

const catIdOf = async (tutorialId) =>
  (await admin.from("tutorials").select("category_id").eq("id", tutorialId).single()).data?.category_id ?? null;

try {
  const A = await mkUser(`steply-cat-${stamp}@example.com`);
  accId = A.accountId; userId = A.userId;
  const token = crypto.randomUUID();
  const { error: te } = await admin.from("accounts").update({ recorder_token: token }).eq("id", accId);
  ok(!te, "Token-Rotation: recorder_token gesetzt");

  console.log("… Next-Server auf Port", PORT, "wird gestartet (kann einen Moment dauern) …");
  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
    shell: true,
  });
  const up = await waitForServer();
  ok(up, "Server erreichbar");
  if (!up) throw new Error("Server nicht erreichbar");

  // ── (a) complete mit NEUER Kategorie per Name ───────────────────────────────
  const r1 = await uploadGuideWith(token, { name: CAT_NAME });
  ok(r1.status === 200 && !!r1.comp.tutorialId, `complete mit category{name} -> 200 + tutorialId (war ${r1.status})`);
  const cat1 = r1.comp.tutorialId ? await catIdOf(r1.comp.tutorialId) : null;
  ok(!!cat1, "Tutorial (a) hat eine category_id");
  const { data: catRows } = await admin
    .from("categories")
    .select("id, name")
    .eq("account_id", accId)
    .eq("name", CAT_NAME);
  ok((catRows || []).length === 1, `genau EINE Kategorie „${CAT_NAME}" im Konto (war ${(catRows || []).length})`);
  ok(catRows && catRows[0] && catRows[0].id === cat1, "Tutorial (a).category_id zeigt auf die angelegte Kategorie");
  const catId = catRows && catRows[0] ? catRows[0].id : null;

  // ── (b) zweiter complete mit gleichem Namen, andere Schreibweise -> gleiche id ─
  const r2 = await uploadGuideWith(token, { name: "e2e kategorie 31d" });
  ok(r2.status === 200 && !!r2.comp.tutorialId, `zweiter complete (andere Schreibweise) -> 200 (war ${r2.status})`);
  const cat2 = r2.comp.tutorialId ? await catIdOf(r2.comp.tutorialId) : null;
  ok(cat2 === catId, "Tutorial (b) nutzt DIESELBE Kategorie (keine Neuanlage) — case-insensitiv");
  const { count: dupCount } = await admin
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("account_id", accId)
    .ilike("name", "e2e kategorie 31d");
  ok((dupCount ?? 0) === 1, `keine Duplikat-Kategorie (case-insensitiv genau 1, war ${dupCount})`);

  // ── (c) complete mit FREMDER/erfundener category-id -> category_id bleibt null ─
  const r3 = await uploadGuideWith(token, { id: crypto.randomUUID() });
  ok(r3.status === 200 && !!r3.comp.tutorialId, `complete mit fremder category{id} -> Tutorial entsteht trotzdem (war ${r3.status})`);
  const cat3 = r3.comp.tutorialId ? await catIdOf(r3.comp.tutorialId) : "n/a";
  ok(cat3 === null, "Tutorial (c).category_id bleibt null (fremde id still ignoriert)");

  // ── (d) GET /api/recorder/categories ────────────────────────────────────────
  const catBad = await getAuth("/api/recorder/categories", crypto.randomUUID());
  ok(catBad.status === 401, `categories mit falschem Token -> 401 (war ${catBad.status})`);

  const catNone = await getAuth("/api/recorder/categories", null);
  ok(catNone.status === 401, `categories ohne Token -> 401 (war ${catNone.status})`);

  const catPre = await fetch(`${BASE}/api/recorder/categories`, { method: "OPTIONS" });
  ok(
    catPre.status === 204 &&
      catPre.headers.get("access-control-allow-origin") === "*" &&
      (catPre.headers.get("access-control-allow-headers") || "").toLowerCase().includes("authorization"),
    `categories OPTIONS -> 204 + CORS + Authorization (war ${catPre.status})`,
  );

  const catRes = await getAuth("/api/recorder/categories", token);
  const catBody = await catRes.json().catch(() => ({}));
  ok(catRes.status === 200 && Array.isArray(catBody.categories), `categories mit Token -> 200 + Array (war ${catRes.status})`);
  const found = (catBody.categories || []).find((c) => c.id === catId);
  ok(!!found && found.name === CAT_NAME, "categories liefert die Test-Kategorie (id + name)");
  ok(catBody.categories.every((c) => typeof c.id === "string" && typeof c.name === "string"), "categories: nur {id,name}-Objekte");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  // Cleanup: Tutorials + Test-Kategorie + Storage-Bilder + Konto/User.
  try {
    for (const id of tutorialIds) await admin.from("tutorials").delete().eq("id", id);
    await admin.from("categories").delete().eq("account_id", accId).ilike("name", "e2e kategorie 31d");
    if (imgPaths.length) await admin.storage.from(IMG_BUCKET).remove(imgPaths);
    if (accId) await admin.from("accounts").delete().eq("id", accId); // kaskadiert Rest
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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Titel + Kategorie (Welle 31d) live verifiziert.");
process.exitCode = failed ? 1 : 0;
setTimeout(() => process.exit(failed ? 1 : 0), 1500);

// Chatbot grenzt „themenfremd" nach dem Tätigkeitsfeld ab, das er aus den eigenen
// Anleitungs-Titeln ableitet (Steply ist branchenneutral). Zwei Wegwerf-Konten mit
// NEUTRALEN Namen (der Name verrät die Branche nicht), gleiche Fragen:
//   - Kanzlei-Konto:   Steuerfrage ohne Anleitung = Wissenslücke (no_answer), Brot = off_topic
//   - Software-Konto:  Steuerfrage = off_topic, Frage aus dem Fachgebiet = no_answer
// Nur no_answer landet unter „Offene Fragen" — so bleiben dort nur branchenrelevante Lücken.
// Echte DB + echte KI, Dev-Server lokal; Konten werden am Ende gelöscht.
//
// Nutzung:  node --env-file=.env.local scripts/test-chat-topic-e2e.mjs
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

const PORT = 3032;
const BASE = `http://localhost:${PORT}`;
const stamp = String(process.hrtime.bigint()).slice(-8);
const RUNS = 2; // KI ist nicht deterministisch -> jede Frage mehrfach

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(timeoutMs = 180_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(`${BASE}/robots.txt`)).status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await sleep(1000);
  }
  return false;
}

async function ask(slug, question) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountSlug: slug, question }),
  });
  let answer = "";
  let meta = null;
  for (const line of (await r.text()).split("\n").filter(Boolean)) {
    const o = JSON.parse(line);
    if (o.delta) answer += o.delta;
    if (o.answer) answer += o.answer;
    if (o.meta) meta = o.meta;
  }
  return { answer, status: meta?.status };
}

const users = [];
async function makeAccount(name, category, titles) {
  const email = `tutax-topic-${stamp}-${users.length}@example.com`;
  const created = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  if (created.error) throw created.error;
  users.push(created.data.user.id);
  const { data: m } = await admin.from("account_members").select("account_id").eq("user_id", created.data.user.id);
  const accountId = m[0].account_id;
  const slug = `topic-${stamp}-${users.length}`;
  // KI-Assistent ist Pro (23.09.2026) -> Test-Konto wie ein echter Chat-Kunde hochstufen.
  await admin.from("accounts").update({ name, slug, onboarded: true, plan: "pro", escalation: { enabled: false } }).eq("id", accountId);
  const { data: cat } = await admin
    .from("categories")
    .insert({ account_id: accountId, name: category, position: 0 })
    .select("id")
    .single();
  const { error } = await admin.from("tutorials").insert(
    titles.map((title, i) => ({
      account_id: accountId,
      title,
      slug: `t-${i}`,
      status: "published",
      visibility: "public",
      category_id: cat.id,
    })),
  );
  if (error) throw error;
  return { accountId, slug };
}

let server;
const accounts = [];
try {
  const kanzlei = await makeAccount("Nordlicht GmbH", "Buchhaltung & Belege", [
    "DATEV SmartLogin einrichten",
    "Belege mit DATEV Upload mobil hochladen",
    "Lohnabrechnung im Portal freigeben",
    "Steuerbescheid im Postfach finden",
  ]);
  const software = await makeAccount("Südwind GmbH", "Projektverwaltung", [
    "Projekt anlegen",
    "Teammitglieder einladen",
    "Zeiterfassung exportieren",
    "Kanban-Board anpassen",
  ]);
  accounts.push(kanzlei.accountId, software.accountId);

  server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
    cwd: path.join(__dirname, ".."),
    shell: true,
    stdio: "ignore",
  });
  console.log("… Server startet auf", PORT, "…");
  if (!(await waitForServer())) throw new Error("Server nicht erreichbar");

  const cases = [
    [kanzlei, "Kanzlei", "Wie hoch ist der Grundfreibetrag 2026?", "no_answer"],
    [kanzlei, "Kanzlei", "Kann ich mein häusliches Arbeitszimmer absetzen?", "no_answer"],
    [kanzlei, "Kanzlei", "Wie backe ich ein Sauerteigbrot?", "off_topic"],
    [software, "Software", "Wie hoch ist der Grundfreibetrag 2026?", "off_topic"],
    [software, "Software", "Kann ich abgeschlossene Projekte archivieren?", "no_answer"],
    [software, "Software", "Wie backe ich ein Sauerteigbrot?", "off_topic"],
  ];
  for (const [acc, label, q, expected] of cases) {
    const got = [];
    for (let i = 0; i < RUNS; i++) got.push((await ask(acc.slug, q)).status);
    ok(got.every((s) => s === expected), `${label}: „${q}“ → ${expected} (bekam: ${got.join(", ")})`);
  }

  // Nur no_answer wird zur „Offenen Frage" (lib/gaps.ts) — Events prüfen.
  await sleep(1500);
  const { data: ev } = await admin
    .from("events")
    .select("question, status")
    .eq("account_id", software.accountId)
    .eq("type", "chat")
    .eq("status", "no_answer");
  const gapQs = [...new Set((ev ?? []).map((e) => e.question))];
  ok(
    gapQs.length === 1 && gapQs[0].includes("archivieren"),
    `Software-Konto: „Offene Fragen" enthalten nur die Fachfrage (${gapQs.join(" | ") || "–"})`,
  );
} catch (e) {
  console.error("✗ Abbruch:", e instanceof Error ? e.message : e);
  failed = true;
} finally {
  if (server) {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { shell: true });
    else server.kill("SIGTERM");
  }
  for (const id of accounts) await admin.from("accounts").delete().eq("id", id);
  for (const id of users) await admin.auth.admin.deleteUser(id);
}

console.log(failed ? "\n✗ Themen-Abgrenzung: Fehler" : "\n✓ Themen-Abgrenzung live verifiziert.");
process.exit(failed ? 1 : 0);

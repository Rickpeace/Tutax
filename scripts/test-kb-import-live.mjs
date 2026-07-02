// Live-Test Wissens-Import (Welle 12): (a) textToDraftArticles-Kern (echter Mini-KI-Call
// mit gekapptem Text -> Drafts im Wegwerf-Konto, status='draft', Aufräumen); (b) SSRF-
// Ablehnung von Metadata-/localhost-URLs (Logik 1:1 aus src/lib/ssrf.ts); (c) PDF-
// Extraktion (echtes Mini-PDF via unpdf + „kaputtes PDF wird abgelehnt").
// Nutzung:  node --env-file=.env.local scripts/test-kb-import-live.mjs
import { createClient } from "@supabase/supabase-js";
import net from "node:net";
import { lookup } from "node:dns/promises";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const KEY = process.env.OPENAI_API_KEY;
const CHAT_MODEL = "gpt-5.4-mini"; // = AI.models.chat
const admin = createClient(url, secret, { auth: { persistSession: false } });

let failed = false;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) failed = true; };
const stamp = Date.now();
let accountId, userId;

// --- Kern von textToDraftArticles per fetch nachgebaut (node kann @/-Alias + server-only
//     nicht importieren; gleiche Prompt-Idee, JSON-Mode, gekappter Text, Insert als draft). ---
const MAX_INPUT_CHARS = 60_000;
const mkBody = (paragraphs, bullets) => {
  const content = [];
  for (const p of paragraphs.map((s) => s.trim()).filter(Boolean))
    content.push({ type: "paragraph", content: [{ type: "text", text: p }] });
  const b = bullets.map((s) => s.trim()).filter(Boolean);
  if (b.length)
    content.push({ type: "bulletList", content: b.map((i) => ({ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: i }] }] })) });
  if (!content.length) content.push({ type: "paragraph", content: [] });
  return { type: "doc", content };
};

async function textToDraftArticles(accId, sourceLabel, text) {
  const clean = text.trim().slice(0, MAX_INPUT_CHARS);
  const system =
    "Du hilfst einer Organisation, aus ihren eigenen Texten ein strukturiertes Organisations-Wissen " +
    "für einen Kunden-Chatbot zu erstellen. Extrahiere NUR belegbare Fakten. Sie-Form.";
  const user =
    `Quelle: „${sourceLabel}".\n\n` + clean + "\n\n" +
    'Erzeuge 3 bis 8 eigenständige Wissensartikel. Antworte AUSSCHLIESSLICH als JSON: ' +
    '{"articles":[{"title":"...","paragraphs":["..."],"bullets":["..."]}]}';
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
      response_format: { type: "json_object" },
      max_completion_tokens: 2500,
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
  const list = Array.isArray(parsed.articles) ? parsed.articles : [];
  const rows = list
    .filter((a) => a && typeof a === "object" && typeof a.title === "string" && a.title.trim())
    .map((a) => ({
      account_id: accId,
      title: a.title.trim().slice(0, 200),
      body: mkBody(Array.isArray(a.paragraphs) ? a.paragraphs : [], Array.isArray(a.bullets) ? a.bullets : []),
      status: "draft",
    }))
    .slice(0, 8);
  if (!rows.length) throw new Error("Kein verwertbares Wissen abgeleitet.");
  const { data, error } = await admin.from("kb_articles").insert(rows).select("id, title, status");
  if (error) throw new Error(error.message);
  return data;
}

// --- SSRF-Prädikat 1:1 aus src/lib/ssrf.ts (Behavior-Test: dieselben Regeln). ---
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const v = ip.toLowerCase();
  if (v === "::1" || v === "::") return true;
  if (v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb")) return true;
  if (v.startsWith("fc") || v.startsWith("fd")) return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.split(":").pop() ?? "");
  return false;
}
async function isSafePublicUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  if (net.isIP(host)) return !isPrivateIp(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && !addrs.some((a) => isPrivateIp(a.address));
  } catch { return false; }
}

// --- Minimal-PDF ("Hallo Welt aus PDF") als Buffer, für unpdf.extractText. ---
function makeMiniPdf() {
  const objs = [];
  objs.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  objs.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  objs.push("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
  const stream = "BT /F1 18 Tf 20 100 Td (Hallo Welt aus PDF) Tj ET";
  objs.push(`4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`);
  objs.push("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  for (const o of objs) { offsets.push(pdf.length); pdf += o; }
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

try {
  // Wegwerf-Konto anlegen.
  const email = `tutax-kbimport-${stamp}@example.com`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: "Test12345!", email_confirm: true });
  userId = u.user.id;
  accountId = (await admin.from("account_members").select("account_id").eq("user_id", userId)).data[0].account_id;

  // (a) textToDraftArticles: echter Mini-KI-Call mit gekapptem Beispieltext.
  if (!KEY) {
    ok(false, "OPENAI_API_KEY fehlt — (a) kann nicht laufen");
  } else {
    const sample =
      "Steuerkanzlei Muster GmbH. Öffnungszeiten: Mo–Fr 8:00–17:00 Uhr. " +
      "Telefon 0221 123456, E-Mail info@muster.de, Adresse Musterstraße 1, 50667 Köln. " +
      "Leistungen: Einkommensteuererklärung, Buchhaltung, Lohnabrechnung, Existenzgründungsberatung. " +
      "Termine bitte telefonisch vereinbaren. Erstberatung 90 Euro.";
    const created = await textToDraftArticles(accountId, "muster.de", sample);
    ok(Array.isArray(created) && created.length >= 3 && created.length <= 8, `(a) 3–8 Entwürfe erstellt (${created?.length})`);
    ok(created.every((r) => r.status === "draft"), "(a) alle Artikel status='draft' (nie auto-publish)");
    ok(created.every((r) => typeof r.title === "string" && r.title.length > 0), "(a) alle Artikel haben Titel");
    // Gegenprobe in DB.
    const { data: inDb } = await admin.from("kb_articles").select("status").eq("account_id", accountId);
    ok((inDb ?? []).length >= 3 && inDb.every((r) => r.status === "draft"), "(a) in DB nur Drafts");
    console.log("   Titel:", created.map((r) => r.title).join(" | "));
  }

  // (b) SSRF: Metadata-IP und localhost müssen abgelehnt werden, echte Domain erlaubt.
  ok((await isSafePublicUrl("http://169.254.169.254/")) === false, "(b) 169.254.169.254 (Cloud-Metadata) abgelehnt");
  ok((await isSafePublicUrl("http://localhost:3000/")) === false, "(b) localhost:3000 abgelehnt");
  ok((await isSafePublicUrl("ftp://example.com/")) === false, "(b) nicht-http(s)-Protokoll abgelehnt");
  ok((await isSafePublicUrl("https://example.com/")) === true, "(b) öffentliche Domain erlaubt");

  // (c) PDF-Extraktion: echtes Mini-PDF liefert Text; kaputtes PDF wird sauber abgelehnt.
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdfBuf = makeMiniPdf();
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuf));
    const { text } = await extractText(pdf, { mergePages: true });
    const t = Array.isArray(text) ? text.join(" ") : text;
    ok(/Hallo Welt/i.test(t), `(c) Text aus Mini-PDF extrahiert ("${t.trim().slice(0, 30)}…")`);
  } catch (e) {
    ok(false, "(c) Mini-PDF-Extraktion: " + e.message);
  }
  // Kaputtes „PDF" (kein %PDF-Header / Müll) -> unpdf wirft -> Route würde 400 liefern.
  let rejected = false;
  try {
    const bad = await getDocumentProxy(new Uint8Array(Buffer.from("das ist kein pdf, nur text")));
    await extractText(bad, { mergePages: true });
  } catch { rejected = true; }
  ok(rejected, "(c) kaputte Datei wird von unpdf abgelehnt (Route -> 400)");
} catch (e) {
  ok(false, "Fehler: " + e.message);
} finally {
  if (accountId) await admin.from("accounts").delete().eq("id", accountId);
  if (userId) await admin.auth.admin.deleteUser(userId);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Wissens-Import (Welle 12) live verifiziert.");
process.exitCode = failed ? 1 : 0;

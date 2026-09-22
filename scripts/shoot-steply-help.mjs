// v4 (Welle 52a): Screenshots + Auto-Markierungen + Live-Führungs-Selektoren für die Steply-
// Selbstdoku (/h/steply) — gegen die NEUE Oberfläche (Welle 50: Hauptmenü „Anleitungen ·
// Schulungen · Automationen · KI-Assistent“, Einstellungen mit Seitenleiste, Editor-Kopf mit
// Status-Schalter, Erweiterung mit Reitern).
// 09/2026: Editor-Kopf mit „Veröffentlichen“/„✓ Veröffentlicht“ + „…“-Menü (Übersetzen, Aktualität
// prüfen, Link, Zurück auf Entwurf, Texte mit KI verbessern), Zielgruppen-Chips, „+“/Blitz im
// Ablauf, leere Anleitung, „Texte mit KI verbessern“ über dem Ablauf, Prüfen-Bildschirm der
// Erweiterung mit eingetippten Werten („weglassen“), Kategorie-„…“-Menü in der Bibliothek.
//
// WICHTIG — dieses Skript schreibt NICHTS in die Steply-Doku. Es
//   1. startet `next dev` lokal (eigener Port) — oder nutzt --base <url>,
//   2. legt ein WEGWERF-Konto „Muster GmbH“ mit realistischen Beispieldaten an
//      (Anleitungen, Kategorien, Wissen, Fragen, Team-Einladung, Nutzung …),
//   3. fotografiert jede Seite (+ Seitenleiste der Steply-Erweiterung als Montage),
//   4. erfasst je Ziel die Markierungs-Box und — für Ziele der Live-Führung — den Selektor
//      { css, text, role } (gleiche Logik wie die Aufnahme in extension/content.js) und PRÜFT ihn
//      sofort mit extension/guide-resolve.js im echten DOM: er muss genau das fotografierte,
//      sichtbare Element auflösen,
//   5. prüft, dass jede Doku-Anleitung (scripts/steply-help-content.mjs) für JEDEN Schritt ein
//      Bild hat und jede gewünschte Auto-Markierung gefunden wurde,
//   6. schreibt PNGs + manifest.json in den Ausgabe-Ordner und räumt das Wegwerf-Konto
//      (Konto, Nutzer, Storage, Video-Aufträge) im finally wieder ab.
// Eingespielt wird danach mit scripts/apply-steply-help-shots.mjs (liest den Ordner; --dry-run).
//
// Nutzung:
//   node --env-file=<pfad>/.env.local scripts/shoot-steply-help.mjs [--out <ordner>]
//        [--pw <playwright-ordner>] [--port 3052] [--base http://localhost:3000]
// Standard-Ausgabe: scripts/.shots-steply-help/ (gitignored über scripts/.shots-*/).
// Playwright: --pw <ordner mit node_modules/playwright> oder automatisch aus dem npx-Cache.
// Exit 1, wenn eine Prüfung scheitert (dann KEIN Einspielen).
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { TUTORIALS, SHOT_ROUTES, resolveAppUrl, appSiteDomains } from "./steply-help-content.mjs";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Argumente ──────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
// Rückwärtskompatibel: erstes freies Argument = Playwright-Ordner (alte Nutzung).
const positional = argv.find((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
const PW_DIR = argOf("--pw") || positional || null;
const OUT = path.resolve(argOf("--out") || path.join(__dirname, ".shots-steply-help"));
const PORT = Number(argOf("--port") || 3052);
const EXTERNAL_BASE = argOf("--base");
const DUMP_DOM = argv.includes("--dom"); // Fehlersuche: HTML jeder Seite nach <out>/dom/
const BASE = EXTERNAL_BASE || `http://localhost:${PORT}`;

// Die Screenshots zeigen die Adresse der PRODUKTION (Kunden sehen dort ihre echte Adresse),
// nicht localhost. Nur für die Anzeige (Teilen-/Chat-Seite, QR-Code) — steuert nichts.
const APP_URL = resolveAppUrl();
const APP_HOST = new URL(APP_URL).hostname;

const VP = { width: 1440, height: 900 };
const PANEL_W = 400; // Seitenleiste der Steply-Erweiterung in der Montage
const APP_W = VP.width - PANEL_W;
const PAD = 6; // Luft um die Markierung (px)

function resolvePlaywright() {
  if (PW_DIR) {
    const direct = path.join(PW_DIR, "node_modules", "playwright");
    if (existsSync(direct)) return require(direct);
    if (existsSync(path.join(PW_DIR, "index.js"))) return require(PW_DIR);
  }
  try {
    return require("playwright");
  } catch {
    /* npx-Cache */
  }
  const base = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "", "AppData", "Local");
  const npxDir = path.join(base, "npm-cache", "_npx");
  if (existsSync(npxDir)) {
    for (const d of readdirSync(npxDir)) {
      const p = path.join(npxDir, d, "node_modules", "playwright");
      if (existsSync(p)) return require(p);
    }
  }
  throw new Error("playwright nicht gefunden (--pw <ordner> angeben).");
}

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SECRET_KEY) {
  console.error("Supabase-Umgebung fehlt — mit --env-file=<pfad>/.env.local starten.");
  process.exit(1);
}
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});
const uuid = () => crypto.randomUUID();

// ── Prüf-Protokoll ─────────────────────────────────────────────────────────────────────
const problems = [];
const fail = (m) => {
  problems.push(m);
  console.log("✗ " + m);
};

// ── Selektor-Bauer, läuft IM Browser (self-contained; spiegelt extension/content.js
//    selectorFor/cssPathFor/roleFor/visibleText + guide-resolve.js isVolatileId). KEINE flüchtigen
//    IDs (#base-ui-…, :r5:, UUID-artig) als css-Anker; stattdessen data-testid/name/
//    aria-label/nth-of-type. Rückgabe { css?, text?, role? } | null. ──────────────────
function computeSelectorInPage(el) {
  if (!el || el.nodeType !== 1) return null;
  const cssEsc = (s) => String(s).replace(/["\\]/g, "\\$&");
  const isVolatileId = (id) => {
    if (!id || typeof id !== "string") return true;
    if (id.length > 64) return true;
    if (/^base-ui-/i.test(id)) return true;
    if (/^_[rR]_/.test(id)) return true;
    if (/^:r/i.test(id)) return true;
    if (/^(radix|headlessui|mui|react-aria|aria)-/i.test(id)) return true;
    if (id.indexOf(":") >= 0) return true;
    if (/^\d+$/.test(id)) return true;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id)) return true; // UUID-artig
    if (/^[A-Za-z]+[-_][0-9a-f]{6,}$/i.test(id)) return true; // Präfix + Hash
    return false;
  };
  const isStableId = (id) => !!id && typeof id === "string" && id.length <= 64 && !isVolatileId(id);
  const isUnique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch { return false; } };
  const tag = el.tagName.toLowerCase();
  const cap = (s) => (s && s.length <= 400 ? s : "");
  const attr = (n) => { const v = el.getAttribute && el.getAttribute(n); return v && v.length <= 100 ? v : ""; };

  // ---- css (id > data-testid > name > aria-label > nth-of-type-Pfad) ----
  let css = "";
  if (el.id && isStableId(el.id) && isUnique("#" + CSS.escape(el.id))) css = "#" + CSS.escape(el.id);
  if (!css) {
    const testid = attr("data-testid");
    if (testid) {
      let s = tag + '[data-testid="' + cssEsc(testid) + '"]';
      if (isUnique(s)) css = s;
      else { s = '[data-testid="' + cssEsc(testid) + '"]'; if (isUnique(s)) css = s; }
    }
  }
  if (!css) { const nm = attr("name"); if (nm) { const s = tag + '[name="' + cssEsc(nm) + '"]'; if (isUnique(s)) css = s; } }
  if (!css) { const aria = attr("aria-label"); if (aria) { const s = tag + '[aria-label="' + cssEsc(aria) + '"]'; if (isUnique(s)) css = s; } }
  if (!css) {
    const parts = []; let node = el; let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      const t = node.tagName.toLowerCase();
      if (node.id && isStableId(node.id)) { parts.unshift("#" + CSS.escape(node.id)); break; }
      let seg = t; const parent = node.parentElement;
      if (parent) {
        const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
        if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(seg);
      if (t === "html" || t === "body") break;
      node = node.parentElement; depth++;
    }
    css = parts.join(" > ");
  }
  css = cap(css);

  // ---- role (implizit/explizit, gespiegelt aus roleFor) ----
  let role = "";
  const explicit = el.getAttribute && el.getAttribute("role");
  if (explicit && explicit.trim()) role = explicit.trim().toLowerCase();
  else {
    const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) role = "link";
    else if (tag === "button") role = "button";
    else if (tag === "select") role = "combobox";
    else if (tag === "textarea") role = "textbox";
    else if (tag === "input") {
      if (/^(button|submit|reset|image)$/.test(type)) role = "button";
      else if (type === "checkbox") role = "checkbox";
      else if (type === "radio") role = "radio";
      else if (type === "range") role = "slider";
      else if (type === "search") role = "searchbox";
      else role = "textbox";
    } else if (/^h[1-6]$/.test(tag)) role = "heading";
    else if (tag === "img") role = "img";
    else if (tag === "nav") role = "navigation";
  }
  role = role.slice(0, 40);

  // ---- text (Eingabefelder: Beschriftung; sonst sichtbarer Text) ----
  const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  let isEditable = tag === "textarea" || tag === "select";
  if (tag === "input") {
    const ty = ((el.getAttribute("type") || "text")).toLowerCase();
    isEditable = !/^(button|submit|reset|image)$/.test(ty);
  }
  if (!isEditable) { const ce = el.getAttribute("contenteditable"); if (ce === "" || String(ce).toLowerCase() === "true") isEditable = true; }
  let text = "";
  if (isEditable) {
    // Wie content.js labelForEditable: <label> > aria-label > placeholder > name > title.
    if (el.id) { try { const lbl = document.querySelector('label[for="' + cssEsc(el.id) + '"]'); if (lbl) text = lbl.textContent || ""; } catch { /* ignore */ } }
    if (!text.trim() && el.closest) { const w = el.closest("label"); if (w) text = w.textContent || ""; }
    if (!text.trim()) text = attr("aria-label") || attr("placeholder") || attr("name") || attr("title");
  } else {
    // Wie content.js visibleText: der SICHTBARE Text (kein aria-label — den gleicht
    // guide-resolve.js bei Nicht-Eingabefeldern nicht ab). Reine Symbol-Knöpfe haben dann
    // keinen Text und werden allein über ihren css-Anker (z. B. aria-label) gefunden.
    text = el.innerText || "";
  }
  // Wie content.js clampLabel (max. 80 Zeichen, an Wortgrenze, mit „…“).
  text = norm(text);
  if (text.length > 80) {
    let cut = text.slice(0, 79);
    const sp = cut.lastIndexOf(" ");
    if (sp >= 40) cut = cut.slice(0, sp);
    text = cut.replace(/[\s.,;:]+$/, "") + "…";
  }

  const out = {};
  if (css) out.css = css;
  if (text) out.text = text;
  if (role) out.role = role;
  return out.css || out.text || out.role ? out : null;
}

// ── Prüfung IM Browser: löst der Selektor (über extension/guide-resolve.js, mit Sichtbarkeits-
//    Prädikat wie in der Live-Führung) GENAU das fotografierte, sichtbare Element auf? ─────
function verifySelectorInPage(target, sel) {
  const R = window.SteplyGuideResolve;
  if (!R) return { ok: false, why: "guide-resolve.js nicht geladen" };
  const isVisible = (el) => {
    if (!el || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const res = R.resolveSelector(document, sel, { isVisible });
  const hit = res && res.el;
  let cssCount = null;
  if (sel.css) {
    try {
      cssCount = Array.prototype.filter.call(document.querySelectorAll(sel.css), isVisible).length;
    } catch {
      cssCount = -1;
    }
  }
  // Zusätzlich: nur über Text+Rolle (ohne css) — zeigt, ob die Führung auch bei anderem
  // Seitenaufbau (andere Datenmengen) noch trifft. Informativ, kein Muss.
  let textOnly = null;
  if (sel.text) {
    const r2 = R.resolveSelector(document, { text: sel.text, role: sel.role }, { isVisible });
    textOnly = r2.el === target ? r2.confidence : r2.reason || "anderes Element";
  }
  return {
    ok: hit === target && isVisible(hit) && (cssCount === null || cssCount === 1),
    confidence: res ? res.confidence : null,
    reason: res ? res.reason : null,
    sameEl: hit === target,
    visible: hit ? isVisible(hit) : false,
    cssCount,
    textOnly,
  };
}

const GUIDE_RESOLVE_SRC = readFileSync(path.join(__dirname, "..", "extension", "guide-resolve.js"), "utf8");

// ── Beispieldaten (neutral, generisch — Steply ist nicht branchen-spezifisch) ─────────────
const DEMO = {
  email: "anna.muster@example.com",
  fullName: "Anna Muster",
  account: "Muster GmbH",
  slugWish: "muster-gmbh",
  portalHost: "portal.muster-gmbh.de",
  marker: "steply-doc-shoot", // user_metadata-Kennung: NUR solche Nutzer räumt das Skript weg
};
const PW = "Shot!" + Math.random().toString(36).slice(2, 10) + "Xx1";

const CATS = ["Kundenportal", "Rechnungen & Zahlungen", "Bestellungen", "Intern"];
const DEMO_TUTS = [
  { key: "login", title: "Im Kundenportal anmelden", cat: "Kundenportal", status: "published", desc: "Erstanmeldung mit Kundennummer und Passwort.", steps: ["Portal öffnen", "Kundennummer eingeben", "Passwort eingeben", "Anmelden"] },
  { key: "pw", title: "Passwort zurücksetzen", cat: "Kundenportal", status: "published", steps: ["„Passwort vergessen“ wählen", "E-Mail-Adresse eingeben", "Link in der E-Mail öffnen"] },
  { key: "pdf", title: "Rechnung als PDF herunterladen", cat: "Rechnungen & Zahlungen", status: "published", desc: "Rechnungen jederzeit selbst abrufen.", steps: ["„Rechnungen“ öffnen", "Rechnung auswählen", "„PDF herunterladen“ klicken", "Datei speichern"], audio: true },
  { key: "zahlung", title: "Zahlungsart ändern", cat: "Rechnungen & Zahlungen", status: "draft", inLernen: true, steps: ["„Einstellungen“ öffnen", "Zahlungsart wählen", "Änderung speichern"] },
  { key: "adresse", title: "Lieferadresse ändern", cat: "Bestellungen", status: "published", steps: ["„Lieferadressen“ öffnen", "Adresse bearbeiten", "Speichern"] },
  { key: "retoure", title: "Retoure anmelden", cat: "Bestellungen", status: "published", desc: "Rücksendung in wenigen Schritten.", steps: ["Bestellung öffnen", "„Retoure anmelden“ wählen", "Grund angeben", "Etikett drucken"] },
  { key: "onboarding", title: "Neue Kolleginnen und Kollegen einarbeiten", cat: "Intern", status: "published", visibility: "internal", steps: ["Zugänge anlegen", "Ablage zeigen", "Ansprechpartner vorstellen"] },
  { key: "urlaub", title: "Urlaubsantrag stellen", cat: "Intern", status: "published", visibility: "internal", steps: ["Formular öffnen", "Zeitraum eintragen", "Antrag absenden"] },
];

// Eine schlichte Beispiel-Website („Kundenportal“) als Bildquelle der Beispiel-Anleitungen und
// als Seite links neben der Erweiterungs-Seitenleiste. Reines HTML, keine echte Marke.
const PORTAL_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2a37;background:#f4f6f9}
.top{height:60px;background:#1e3a5f;color:#fff;display:flex;align-items:center;padding:0 24px;gap:12px}
.logo{width:30px;height:30px;border-radius:8px;background:#5aa9e6;display:grid;place-items:center;font-weight:800}
.top b{font-size:16px}.top span{opacity:.7;font-size:13px}.top .me{margin-left:auto;font-size:13px;opacity:.85}
.wrap{display:flex;min-height:calc(100vh - 60px)}nav{width:210px;background:#fff;border-right:1px solid #e3e8ef;padding:18px 12px}
nav a{display:block;padding:9px 12px;border-radius:8px;color:#3b4a5c;text-decoration:none;font-weight:600;margin-bottom:2px}
nav a.on{background:#e8f1fb;color:#1e3a5f}main{flex:1;padding:28px 32px}h1{margin:0 0 4px;font-size:24px}
.sub{color:#6b7a8c;margin:0 0 20px}.card{background:#fff;border:1px solid #e3e8ef;border-radius:12px;overflow:hidden}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px 16px;border-bottom:1px solid #eef1f5}
th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7a8c;background:#fafbfc}
.st{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;background:#e3f5ec;color:#1f7a4d}
.st.o{background:#fdf1dc;color:#8a5a00}button{font:inherit;font-weight:700;border-radius:8px;padding:7px 12px;cursor:pointer}
.dl{background:#fff;border:1px solid #c9d3df;color:#1e3a5f}.pri{background:#1e3a5f;color:#fff;border:0;padding:9px 16px}
.bar{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
</style></head><body><div class="top"><div class="logo">M</div><b>Muster GmbH</b><span>Kundenportal</span><div class="me">Kundennummer 10482 · Abmelden</div></div>
<div class="wrap"><nav><a href="#">Übersicht</a><a href="#">Bestellungen</a><a href="#" class="on">Rechnungen</a><a href="#">Lieferadressen</a><a href="#">Einstellungen</a></nav>
<main><div class="bar"><div><h1>Rechnungen</h1><p class="sub">Alle Rechnungen der letzten 24 Monate.</p></div><button class="pri">Zahlungsart ändern</button></div>
<div class="card"><table><thead><tr><th>Rechnung</th><th>Datum</th><th>Betrag</th><th>Status</th><th></th></tr></thead><tbody>
<tr><td>RE-2026-0918</td><td>18.09.2026</td><td>249,00 €</td><td><span class="st o">Offen</span></td><td><button class="dl" id="dl-first">PDF herunterladen</button></td></tr>
<tr><td>RE-2026-0821</td><td>21.08.2026</td><td>249,00 €</td><td><span class="st">Bezahlt</span></td><td><button class="dl">PDF herunterladen</button></td></tr>
<tr><td>RE-2026-0719</td><td>19.07.2026</td><td>312,50 €</td><td><span class="st">Bezahlt</span></td><td><button class="dl">PDF herunterladen</button></td></tr>
<tr><td>RE-2026-0620</td><td>20.06.2026</td><td>249,00 €</td><td><span class="st">Bezahlt</span></td><td><button class="dl">PDF herunterladen</button></td></tr>
</tbody></table></div></main></div></body></html>`;

// ── Aufräum-Liste (finally) ────────────────────────────────────────────────────────────
const cleanup = { userId: null, accountId: null, paths: [], publicPaths: [], jobIds: [] };

async function removeLeftoverDemoUser() {
  // Nur ein Nutzer mit GENAU dieser E-Mail UND unserer Kennung wird entfernt (Rest eines
  // abgebrochenen Laufs). Alles andere: abbrechen statt anfassen.
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users || [];
    const u = users.find((x) => (x.email || "").toLowerCase() === DEMO.email);
    if (u) {
      if (u.user_metadata?.[DEMO.marker] !== true) {
        throw new Error(`${DEMO.email} existiert, stammt aber nicht von diesem Skript — Abbruch.`);
      }
      const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", u.id);
      for (const m of mem || []) await removeAccount(m.account_id);
      await admin.auth.admin.deleteUser(u.id);
      console.log("• Rest eines früheren Laufs entfernt:", u.id);
      return;
    }
    if (users.length < 1000) return;
  }
}

async function removeStorageFolder(bucket, prefix) {
  // Rekursiv alle Objekte unter prefix/ einsammeln und löschen (nur Wegwerf-Konto-Ordner).
  const all = [];
  const walk = async (dir) => {
    const { data } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
    for (const o of data || []) {
      const p = dir ? `${dir}/${o.name}` : o.name;
      if (o.id) all.push(p);
      else await walk(p);
    }
  };
  await walk(prefix);
  if (all.length) await admin.storage.from(bucket).remove(all);
  return all.length;
}

async function removeAccount(accountId) {
  if (!accountId) return;
  // Sicherheitsanker: nur Konten namens „Muster GmbH“ mit genau einem Mitglied (unserem Nutzer).
  const { data: acc } = await admin.from("accounts").select("id, name, slug").eq("id", accountId).maybeSingle();
  if (!acc) return;
  if (acc.name !== DEMO.account) throw new Error(`Konto ${accountId} heißt „${acc.name}“ — wird NICHT gelöscht.`);
  let n = 0;
  for (const b of ["tutorial-images", "tutorial-images-public"]) n += await removeStorageFolder(b, accountId);
  await admin.from("video_jobs").delete().eq("account_id", accountId);
  await admin.from("kb_embeddings").delete().eq("account_id", accountId);
  await admin.from("accounts").delete().eq("id", accountId);
  console.log(`• Wegwerf-Konto entfernt (${acc.slug}), ${n} Storage-Objekte gelöscht`);
}

// ── Beispieldaten anlegen ──────────────────────────────────────────────────────────────
async function setupDemo(portalPng) {
  await removeLeftoverDemoUser();
  const created = await admin.auth.admin.createUser({
    email: DEMO.email,
    password: PW,
    email_confirm: true,
    user_metadata: { account_name: DEMO.account, full_name: DEMO.fullName, [DEMO.marker]: true },
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  cleanup.userId = userId;
  const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", userId);
  const accountId = mem[0].account_id;
  cleanup.accountId = accountId;

  // Adresse: „muster-gmbh“, falls frei (sonst mit Zähler).
  let slug = DEMO.slugWish;
  for (let n = 2; ; n++) {
    const { data: taken } = await admin.from("accounts").select("id").eq("slug", slug).neq("id", accountId);
    if (!taken?.length) break;
    slug = `${DEMO.slugWish}-${n}`;
  }
  const { error: accErr } = await admin
    .from("accounts")
    .update({
      name: DEMO.account,
      slug,
      onboarded: true,
      plan: "business",
      languages: ["en"],
      escalation: {
        enabled: true,
        contactName: "Kundenservice Muster GmbH",
        message: "Gerne helfen wir Ihnen persönlich weiter.",
        email: "service@example.com",
        phone: "+49 30 1234567",
        experts: [
          { name: "Lena Beispiel", expertise: "Rechnungen & Zahlungen", email: "rechnung@example.com", phone: "", calendarUrl: "" },
        ],
      },
    })
    .eq("id", accountId);
  if (accErr) throw accErr;

  // Kategorien
  const { data: cats, error: cErr } = await admin
    .from("categories")
    .insert(CATS.map((name, i) => ({ account_id: accountId, name, position: i })))
    .select("id, name");
  if (cErr) throw cErr;
  const catId = (n) => cats.find((c) => c.name === n).id;

  // Bild für alle Beispiel-Schritte (privat + öffentlich, da veröffentlicht).
  const webp = await sharp(portalPng).resize(1280).webp({ quality: 80 }).toBuffer();
  const meta = await sharp(webp).metadata();

  const tutIds = {};
  const now = Date.now();
  for (let ti = 0; ti < DEMO_TUTS.length; ti++) {
    const t = DEMO_TUTS[ti];
    const id = uuid();
    tutIds[t.key] = id;
    const published = t.status === "published";
    const { error } = await admin.from("tutorials").insert({
      id,
      account_id: accountId,
      category_id: catId(t.cat),
      title: t.title,
      description: t.desc || null,
      status: t.status,
      visibility: t.visibility || "public",
      slug: t.key === "pdf" ? "rechnung-als-pdf-herunterladen" : `${t.key}-${ti + 1}`,
      published_at: published ? new Date(now - ti * 86400000).toISOString() : null,
      site_domains: t.visibility === "internal" ? [] : [DEMO.portalHost],
      ...(t.inLernen ? { in_lernen: true } : {}),
      updated_at: new Date(now - ti * 3600000).toISOString(),
    });
    if (error) throw error;
    const rows = t.steps.map((title, i) => {
      const sid = uuid();
      const p = `${accountId}/${id}/${sid}.webp`;
      return {
        id: sid,
        tutorial_id: id,
        title,
        body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: i === 0 ? "Öffnen Sie das Kundenportal und melden Sie sich an. Links finden Sie alle Bereiche." : "Klicken Sie auf die markierte Stelle." }] }] },
        position: i + 1,
        is_decision: false,
        image_path: p,
        image_width: meta.width,
        image_height: meta.height,
        highlights: i === 0 ? [] : [{ id: uuid(), type: "rect", x: 0.8, y: 0.25, w: 0.14, h: 0.07, color: "#ef6a4e", rounded: true }],
        audio_path: t.audio ? `${accountId}/${id}/${sid}.mp3` : null, // nur für den ▶-Knopf (Datei nicht nötig)
      };
    });
    for (const r of rows) {
      await admin.storage.from("tutorial-images").upload(r.image_path, webp, { upsert: true, contentType: "image/webp" });
      if (published && t.visibility !== "internal") {
        await admin.storage.from("tutorial-images-public").upload(r.image_path, webp, { upsert: true, contentType: "image/webp" });
      }
    }
    const { error: sErr } = await admin.from("steps").insert(rows);
    if (sErr) throw sErr;
    await admin.from("tutorials").update({ root_step_id: rows[0].id }).eq("id", id);
    const branches = rows.slice(0, -1).map((r, i) => ({ id: uuid(), step_id: r.id, label: null, target_step_id: rows[i + 1].id, position: 0 }));
    if (branches.length) await admin.from("step_branches").insert(branches);
  }

  // Schulungsnachweis: eine interne Anleitung ist schon absolviert.
  await admin.from("tutorial_completions").insert({ tutorial_id: tutIds.urlaub, user_id: userId, account_id: accountId });

  // Wissensdatenbank
  const kb = (title, text, status = "published") => ({
    account_id: accountId,
    title,
    status,
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] },
  });
  await admin.from("kb_articles").insert([
    kb("Öffnungszeiten des Kundenservice", "Montag bis Freitag von 8 bis 18 Uhr, telefonisch und per E-Mail."),
    kb("Zahlungsziele und Mahnungen", "Rechnungen sind innerhalb von 14 Tagen fällig."),
    kb("Versandkosten", "Ab 50 € Bestellwert versenden wir kostenlos.", "draft"),
  ]);

  // Nutzung + offene Fragen (letzte 30 Tage)
  const ev = [];
  const ago = (h) => new Date(now - h * 3600000).toISOString();
  const slugs = ["rechnung-als-pdf-herunterladen", "login-1", "retoure-6", "adresse-5"];
  for (let i = 0; i < 46; i++) ev.push({ account_id: accountId, type: "view", tutorial_slug: slugs[i % slugs.length], created_at: ago(5 + i * 9) });
  for (let i = 0; i < 14; i++) ev.push({ account_id: accountId, type: "chat", question: "Wie lade ich eine Rechnung herunter?", status: "answered", created_at: ago(8 + i * 20) });
  for (let i = 0; i < 9; i++) ev.push({ account_id: accountId, type: "feedback", helpful: i !== 3, tutorial_slug: slugs[i % slugs.length], created_at: ago(12 + i * 30) });
  ev.push({ account_id: accountId, type: "chat", question: "Kann ich eine Rechnung nachträglich auf eine andere Firma ausstellen lassen?", status: "no_answer", created_at: ago(20) });
  ev.push({ account_id: accountId, type: "chat", question: "Kann ich eine Rechnung nachträglich auf eine andere Firma ausstellen lassen?", status: "no_answer", created_at: ago(50) });
  ev.push({ account_id: accountId, type: "chat", question: "Wie ändere ich meine Kundennummer?", status: "no_answer", created_at: ago(70) });
  const { error: evErr } = await admin.from("events").insert(ev);
  if (evErr) throw evErr;

  // Team: eine offene Einladung
  await admin.from("invitations").insert({
    account_id: accountId,
    email: "max.beispiel@example.com",
    role: "editor",
    token: uuid().replace(/-/g, "") + uuid().replace(/-/g, ""),
    status: "pending",
    invited_by: userId,
  });

  return { userId, accountId, slug, tutIds };
}

// ── Server ─────────────────────────────────────────────────────────────────────────────
async function waitForServer(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/robots.txt`);
      if (r.status === 200) return true;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  return false;
}

// ── Erweiterungs-Seitenleiste (echtes extension/panel.html mit chrome-Stub, gemockte API) ──
const PANEL_URL = pathToFileURL(path.join(__dirname, "..", "extension", "panel.html")).href;
const PANEL_STUB = (o) => {
  const mkEvent = () => {
    const ls = [];
    return {
      addListener: (f) => ls.push(f),
      removeListener: (f) => { const i = ls.indexOf(f); if (i >= 0) ls.splice(i, 1); },
      hasListener: (f) => ls.includes(f),
      _fire: (...a) => ls.map((f) => f(...a)),
    };
  };
  const onChanged = mkEvent();
  const mkArea = (obj, name) => ({
    get: (keys) => {
      let out = {};
      if (keys == null) out = { ...obj };
      else if (typeof keys === "string") { if (keys in obj) out[keys] = obj[keys]; }
      else if (Array.isArray(keys)) { for (const k of keys) if (k in obj) out[k] = obj[k]; }
      else if (typeof keys === "object") { for (const k of Object.keys(keys)) out[k] = k in obj ? obj[k] : keys[k]; }
      return Promise.resolve(out);
    },
    set: (items) => {
      const ch = {};
      for (const k of Object.keys(items)) { ch[k] = { oldValue: obj[k], newValue: items[k] }; obj[k] = items[k]; }
      onChanged._fire(ch, name);
      return Promise.resolve();
    },
    remove: (keys) => { for (const k of [].concat(keys)) delete obj[k]; return Promise.resolve(); },
  });
  const T = { local: o.local, session: {}, tabs: [{ id: 1, windowId: 10, url: o.url, active: true, status: "complete" }] };
  const ev = { onCreated: mkEvent(), onRemoved: mkEvent(), onActivated: mkEvent(), onUpdated: mkEvent() };
  Object.defineProperty(window, "chrome", {
    configurable: true,
    writable: true,
    value: {
      runtime: {
        id: "stub",
        getManifest: () => ({ version: o.version }),
        onMessage: mkEvent(),
        connect: () => ({ onDisconnect: mkEvent(), onMessage: mkEvent(), postMessage() {}, disconnect() {} }),
        sendMessage: () => Promise.resolve(undefined),
      },
      storage: { local: mkArea(T.local, "local"), session: mkArea(T.session, "session"), onChanged },
      windows: { getCurrent: () => Promise.resolve({ id: 10 }), update: () => Promise.resolve({}) },
      tabs: {
        ...ev,
        query: () => Promise.resolve(T.tabs.filter((t) => t.active)),
        get: (id) => Promise.resolve({ ...T.tabs.find((t) => t.id === id) }),
        sendMessage: () => Promise.resolve(undefined),
        create: () => Promise.resolve({ id: 500 }),
        update: () => Promise.resolve({}),
      },
      scripting: { executeScript: () => Promise.resolve([]) },
      downloads: { onCreated: mkEvent(), onChanged: mkEvent(), search: () => Promise.resolve([]) },
      sidePanel: { setOptions: () => Promise.resolve(), open: () => Promise.resolve() },
    },
  });
};

// ── Hauptlauf ──────────────────────────────────────────────────────────────────────────
const { chromium } = resolvePlaywright();
let server = null;
let browser = null;
const shots = {}; // name -> { file, boxes, selectors, checks, route }
let demo = null;

const HIDE_DEV_CSS =
  "nextjs-portal,[data-nextjs-toast],[data-next-badge-root],#__next-build-watcher{display:none!important}" +
  "[data-sonner-toaster]{display:none!important}*{caret-color:transparent!important}";

try {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/\.(png|json)$/.test(f)) rmSync(path.join(OUT, f));

  browser = await chromium.launch({ headless: true });

  // Beispiel-Website rendern (Bildquelle + linke Seite der Montagen).
  const portalPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await portalPage.setContent(PORTAL_HTML);
  const portalPng = await portalPage.screenshot();
  await portalPage.close();

  demo = await setupDemo(portalPng);
  console.log(`✓ Wegwerf-Konto „${DEMO.account}“ (/h/${demo.slug}) mit Beispieldaten angelegt`);

  if (!EXTERNAL_BASE) {
    server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
      cwd: path.join(__dirname, ".."),
      shell: true,
      stdio: "ignore",
      env: { ...process.env, NEXT_PUBLIC_APP_URL: APP_URL, PORT: String(PORT) },
    });
    console.log("… next dev startet auf Port", PORT, "…");
    if (!(await waitForServer())) throw new Error("Server nicht erreichbar");
  }

  const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, locale: "de-DE", timezoneId: "Europe/Berlin" });
  await ctx.addInitScript((css) => {
    const put = () => {
      if (!document.documentElement || document.getElementById("__shoot-css")) return;
      const s = document.createElement("style");
      s.id = "__shoot-css";
      s.textContent = css;
      document.documentElement.appendChild(s);
    };
    put();
    document.addEventListener("DOMContentLoaded", put);
  }, HIDE_DEV_CSS);
  const pg = await ctx.newPage();
  const settle = async (ms = 1500) => {
    await pg.waitForLoadState("networkidle").catch(() => {});
    await pg.waitForTimeout(ms);
  };
  const go = async (route, ms) => {
    await pg.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await settle(ms);
  };

  // targets: { key: { loc: () => Locator, guide?: boolean | (() => Locator) } }
  async function capture(name, route, targets = {}, { scrollTo = null } = {}) {
    // Maus in eine leere Ecke — sonst färbt ein Hover-Zustand zufällig eine Karte ein.
    await pg.mouse.move(2, VP.height - 2);
    if (scrollTo) {
      await scrollTo().scrollIntoViewIfNeeded().catch(() => {});
      await pg.waitForTimeout(400);
    }
    await pg.evaluate(GUIDE_RESOLVE_SRC);
    const boxes = {}, selectors = {}, checks = {};
    for (const [key, t] of Object.entries(targets)) {
      // locs: Markierung um MEHRERE Elemente (z. B. „+“ und Blitz eines Einfügepunkts).
      const loc = t.loc ? t.loc().first() : null;
      let bb = null;
      try {
        if (t.locs) {
          const bbs = [];
          for (const l of t.locs()) bbs.push(await l.first().boundingBox({ timeout: 4000 }));
          if (bbs.every(Boolean)) {
            const x1 = Math.min(...bbs.map((b) => b.x)), y1 = Math.min(...bbs.map((b) => b.y));
            const x2 = Math.max(...bbs.map((b) => b.x + b.width)), y2 = Math.max(...bbs.map((b) => b.y + b.height));
            bb = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
          }
        } else bb = await loc.boundingBox({ timeout: 4000 });
      } catch {
        bb = null;
      }
      if (!bb) {
        fail(`${name}: Ziel „${key}“ nicht gefunden/sichtbar`);
        continue;
      }
      boxes[key] = {
        x: Math.max(0, (bb.x - PAD) / VP.width),
        y: Math.max(0, (bb.y - PAD) / VP.height),
        w: Math.min(1, (bb.width + PAD * 2) / VP.width),
        h: Math.min(1, (bb.height + PAD * 2) / VP.height),
      };
      if (t.guide) {
        // guide: true = dasselbe Element wie die Markierung; Funktion = eigenes Führungs-Ziel
        // (z. B. Markierung um die ganze Karte, Führung auf deren Überschrift).
        const gloc = typeof t.guide === "function" ? t.guide().first() : loc;
        const sel = await gloc.evaluate(computeSelectorInPage).catch(() => null);
        // noText: Text wechselt mit dem Zustand/den Daten (Schalter „Entwurf/Veröffentlicht“,
        // Zahlen) -> nur über den stabilen css-Anker führen.
        if (sel && t.noText) delete sel.text;
        if (!sel) {
          fail(`${name}: kein Selektor für „${key}“`);
          continue;
        }
        const v = await gloc.evaluate(verifySelectorInPage, sel);
        checks[key] = v;
        if (!v.ok) fail(`${name}: Selektor „${key}“ ${JSON.stringify(sel)} trifft nicht eindeutig (${JSON.stringify(v)})`);
        else selectors[key] = sel;
      }
    }
    if (DUMP_DOM) {
      mkdirSync(path.join(OUT, "dom"), { recursive: true });
      writeFileSync(path.join(OUT, "dom", `${name}.html`), await pg.content());
    }
    const png = await pg.screenshot();
    const file = `${name}.png`;
    writeFileSync(path.join(OUT, file), png);
    shots[name] = { file, route, width: VP.width, height: VP.height, boxes, selectors, checks };
    const sel = Object.entries(checks).map(([k, v]) => `${k}:${v.confidence}${v.textOnly && v.textOnly !== v.confidence ? `/nur-Text:${v.textOnly}` : ""}`);
    console.log(`✓ ${name} | Boxen: ${Object.keys(boxes).join(",") || "-"}${sel.length ? " | Führung: " + sel.join(", ") : ""}`);
  }

  // Montage: links eine Seite (APP_W breit), rechts die Seitenleiste der Erweiterung.
  async function capturePanel(name, { leftPng, leftBoxes = {}, setup, panelTargets = {} }) {
    const ppg = await browser.newPage({ viewport: { width: PANEL_W, height: VP.height } });
    const detail = (t) => ({
      tutorial: { id: t.id, title: t.title, slug: t.slug, status: "published", root_step_id: t.steps[0].id, site_domains: [DEMO.portalHost] },
      steps: t.steps,
      branches: t.steps.slice(0, -1).map((s, i) => ({ id: "b" + i, step_id: s.id, label: null, target_step_id: t.steps[i + 1].id, position: 0 })),
    });
    await ppg.route(/^https?:/, async (r) => {
      const p = new URL(r.request().url()).pathname;
      const json = (body) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      if (p === "/api/recorder/me") return json({ account: DEMO.account });
      if (p === "/api/recorder/tutorials") return json({ tutorials: PANEL_TUTS });
      if (p.startsWith("/api/recorder/tutorials/")) return json(detail(PANEL_DETAIL));
      if (p === "/api/guide/steply") return json({ tutorials: [] });
      if (p === "/api/recorder/categories") return json({ categories: CATS.map((name, i) => ({ id: "c" + i, name })) });
      if (p === "/api/recorder/automations") return json({ automations: [] });
      if (/\.(png|webp|jpg)$/.test(p)) return r.fulfill({ status: 200, contentType: "image/png", body: portalPng });
      return json({});
    });
    await ppg.addInitScript(PANEL_STUB, {
      local: { steplyToken: "tok-doc", steplyAppUrl: APP_URL },
      url: `https://${DEMO.portalHost}/rechnungen`,
      version: "2.18.1",
    });
    await ppg.goto(PANEL_URL);
    await ppg.waitForFunction(() => { const s = document.getElementById("start"); return s && !s.hidden; }, null, { timeout: 10000 });
    await ppg.waitForTimeout(900);
    if (setup) await setup(ppg);
    const boxes = { ...leftBoxes };
    for (const [key, make] of Object.entries(panelTargets)) {
      const bb = await make(ppg).first().boundingBox({ timeout: 4000 }).catch(() => null);
      if (!bb) {
        fail(`${name}: Seitenleisten-Ziel „${key}“ nicht gefunden`);
        continue;
      }
      boxes[key] = {
        x: (APP_W + bb.x - PAD) / VP.width,
        y: Math.max(0, (bb.y - PAD) / VP.height),
        w: (bb.width + PAD * 2) / VP.width,
        h: (bb.height + PAD * 2) / VP.height,
      };
    }
    const panelPng = await ppg.screenshot();
    await ppg.close();
    const png = await sharp({ create: { width: VP.width, height: VP.height, channels: 3, background: "#d9d4cc" } })
      .composite([
        { input: await sharp(leftPng).resize(APP_W, VP.height, { fit: "cover", position: "left top" }).toBuffer(), left: 0, top: 0 },
        { input: panelPng, left: APP_W + 1, top: 0 },
      ])
      .png()
      .toBuffer();
    const file = `${name}.png`;
    writeFileSync(path.join(OUT, file), png);
    shots[name] = { file, route: null, width: VP.width, height: VP.height, boxes, selectors: {}, checks: {} };
    console.log(`✓ ${name} (Montage mit Seitenleiste) | Boxen: ${Object.keys(boxes).join(",") || "-"}`);
  }

  // Beispiel-Website in App-Breite (links in den Montagen) + Box des ersten „PDF herunterladen“.
  const leftPage = await browser.newPage({ viewport: { width: APP_W, height: VP.height } });
  await leftPage.setContent(PORTAL_HTML);
  const portalLeftPng = await leftPage.screenshot();
  const dlBox = await leftPage.locator("#dl-first").boundingBox();
  await leftPage.close();
  const portalDlBox = {
    x: (dlBox.x - PAD) / VP.width,
    y: (dlBox.y - PAD) / VP.height,
    w: (dlBox.width + PAD * 2) / VP.width,
    h: (dlBox.height + PAD * 2) / VP.height,
  };

  // Daten für die Seitenleiste: die veröffentlichten Beispiel-Anleitungen der Website.
  const { data: panelRows } = await admin
    .from("tutorials")
    .select("id, title, slug, status, site_domains, category_id, categories(id, name)")
    .eq("account_id", demo.accountId)
    .neq("visibility", "internal");
  const { data: stepRows } = await admin.from("steps").select("id, tutorial_id, title, body, position, highlights, image_path").in("tutorial_id", panelRows.map((t) => t.id)).order("position");
  const PANEL_TUTS = panelRows.map((t) => ({
    id: t.id,
    title: t.title,
    slug: t.slug,
    status: t.status,
    site_domains: t.site_domains,
    stepCount: stepRows.filter((s) => s.tutorial_id === t.id).length,
    selectorCount: 0,
    category: t.categories ? { id: t.categories.id, name: t.categories.name } : null,
  }));
  const pdfRow = panelRows.find((t) => t.slug === "rechnung-als-pdf-herunterladen");
  const PANEL_DETAIL = {
    id: pdfRow.id,
    title: pdfRow.title,
    slug: pdfRow.slug,
    steps: stepRows
      .filter((s) => s.tutorial_id === pdfRow.id)
      .map((s) => ({ ...s, body: "<p>Klicken Sie auf „PDF herunterladen“ neben der gewünschten Rechnung.</p>", imageUrl: null, selector: { text: "PDF herunterladen", role: "button" }, page_url: `https://${DEMO.portalHost}/rechnungen` })),
  };

  // ---- Anmelden ----
  await pg.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 180_000 });
  await pg.fill("#email", DEMO.email);
  await pg.fill("#password", PW);
  await pg.click('button[type="submit"]');
  await pg.waitForURL(/\/app/, { timeout: 90_000 });
  await pg.getByText("Rechnung als PDF herunterladen").first().waitFor({ timeout: 90_000 });
  await settle(1500);

  const header = () => pg.locator("header").first();

  // ---- Anleitungen (Bibliothek) ----
  await capture("dashboard", SHOT_ROUTES.dashboard, {
    neu: { loc: () => header().getByRole("button", { name: "Neue Anleitung" }), guide: true },
    // Sichtbarer Text = Anfangsbuchstabe des Nutzers (je Nutzer anders) -> nur css-Anker.
    switcher: { loc: () => pg.locator('[aria-label="Konto-Menü"]'), guide: true, noText: true },
    hilfeseite: { loc: () => header().getByRole("link", { name: /Hilfe-Seite in neuem Tab/ }), guide: true },
    schulungen: { loc: () => pg.getByRole("navigation", { name: "Hauptbereiche" }).getByRole("link", { name: "Schulungen" }), guide: true },
    toggle: { loc: () => pg.locator("main").getByRole("switch", { name: "Veröffentlicht" }) },
  });

  await capture("dashboard-insights", SHOT_ROUTES["dashboard-insights"], {
    insights: { loc: () => pg.getByTestId("insights-card"), guide: true, noText: true },
  }, { scrollTo: () => pg.getByTestId("insights-card") });
  await pg.evaluate(() => window.scrollTo(0, 0));

  // Kategorie-„…“-Menü (Seitenleiste der Bibliothek): erscheint bei Hover, Klick öffnet „Kategorie löschen“.
  {
    const row = pg.getByTestId("category-row").filter({ hasText: "Bestellungen" }).first();
    await row.hover();
    await row.getByTestId("category-menu").click();
    await pg.getByTestId("category-delete").waitFor({ timeout: 8000 });
    await pg.waitForTimeout(500);
    await capture("dashboard-catmenu", SHOT_ROUTES["dashboard-catmenu"], {
      // Markierung um „…“ + „Kategorie löschen“. Keine Führung: Name der Kategorie ist je Konto anders.
      loeschen: { locs: () => [row.getByTestId("category-menu"), pg.getByTestId("category-delete")] },
    });
    await pg.keyboard.press("Escape").catch(() => {});
    await pg.waitForTimeout(300);
  }

  // „Wird erstellt …“-Karte: vorübergehender Video-Auftrag im Wegwerf-Konto.
  const jobId = uuid();
  cleanup.jobIds.push(jobId);
  await admin.from("video_jobs").insert({ id: jobId, account_id: demo.accountId, video_path: `${demo.accountId}/demo.webm`, title: "Bildschirmaufnahme", status: "processing", progress: "Schritt 3 von 6" }).then(
    ({ error }) => error && admin.from("video_jobs").insert({ id: jobId, account_id: demo.accountId, video_path: `${demo.accountId}/demo.webm`, title: "Bildschirmaufnahme", status: "queued" }),
  );
  await go("/app", 1500);
  await pg.getByText(/ird erstellt/).first().waitFor({ timeout: 15000 }).catch(() => {});
  await capture("dashboard-job", SHOT_ROUTES["dashboard-job"], { karte: { loc: () => pg.getByText(/ird erstellt/) } });
  await admin.from("video_jobs").delete().eq("id", jobId);

  // ---- „Neue Anleitung“-Dialog + Video-Dialog ----
  await go("/app", 1200);
  await header().getByRole("button", { name: "Neue Anleitung" }).click();
  await pg.getByRole("dialog").waitFor({ timeout: 8000 });
  await pg.waitForTimeout(700);
  await capture("new-dialog", SHOT_ROUTES["new-dialog"], {
    sofort: { loc: () => pg.getByRole("dialog").getByText("Sofort-Anleitung", { exact: true }).locator("xpath=ancestor::*[self::button or self::div][1]") },
    selbst: { loc: () => pg.getByRole("dialog").getByRole("button", { name: /Selbst bauen/ }), guide: true },
    video: { loc: () => pg.getByRole("dialog").getByRole("button", { name: /Aus Video/ }), guide: true },
  });
  await pg.getByRole("dialog").getByRole("button", { name: /Aus Video/ }).click();
  await pg.waitForTimeout(900);
  await capture("video-dialog", SHOT_ROUTES["video-dialog"], {
    aufnehmen: { loc: () => pg.getByRole("button", { name: /Jetzt aufnehmen/ }), guide: true },
    infobox: { loc: () => pg.getByText(/So wird die Aufnahme am besten/), guide: true },
    url: { loc: () => pg.getByRole("button", { name: /Von URL importieren/ }), guide: true },
  });
  await pg.keyboard.press("Escape").catch(() => {});

  // ---- Editor (Entwurf „Zahlungsart ändern“, Schritt 2 mit Bild) ----
  await go(`/app/tutorials/${demo.tutIds.zahlung}`, 2000);
  await pg.getByText("Zahlungsart wählen").first().click({ timeout: 10000 }).catch(() => {});
  await pg.waitForSelector("#step-title", { timeout: 15000 }).catch(() => {});
  await pg.waitForTimeout(1500);
  await capture("builder", SHOT_ROUTES.builder, {
    // Welle 54: Veröffentlichen-Knopf statt Schalter, Zielgruppe als zwei Chips.
    status: { loc: () => pg.getByTestId("publish-button"), guide: true, noText: true },
    // Text der Gruppe wechselt mit dem Zustand („mit Schulungsnachweis“) -> nur css-Anker.
    audience: { loc: () => pg.getByRole("group", { name: "Wer sieht die Anleitung?" }), guide: true, noText: true },
    nurteam: { loc: () => pg.getByTestId("audience-chips").getByRole("button", { name: "Team", exact: true }), guide: true },
    verbessern: { loc: () => pg.getByTestId("improve-texts"), guide: true },
    // Erster Einfügepunkt im Ablauf: „+“ und Blitz. Keine Führung (je Lücke ein gleicher Knopf).
    einfuegen: {
      locs: () => [
        pg.getByRole("button", { name: "Schritt hier einfügen" }),
        pg.getByRole("button", { name: "Ab hier mit der Steply-Erweiterung aufnehmen" }),
      ],
    },
    titel: { loc: () => pg.locator("#step-title"), guide: true },
    bild: { loc: () => pg.getByTestId("highlight-canvas") },
    rechteck: { loc: () => pg.locator('[title="Rechteck"]'), guide: true },
    verpixeln: { loc: () => pg.locator('[title="Verpixeln"]'), guide: true },
    frage: { loc: () => pg.getByText("Frage / Verzweigung", { exact: true }) },
    hoch: { loc: () => pg.getByRole("button", { name: "Schritt nach oben" }), guide: true },
  });

  // „…“-Menü im Editor-Kopf (Übersetzen, Aktualität prüfen, Texte mit KI verbessern …).
  await pg.getByTestId("editor-more").click();
  await pg.getByRole("menuitem", { name: /Aktualität prüfen/ }).waitFor({ timeout: 8000 });
  await pg.waitForTimeout(500);
  await capture("builder-menu", SHOT_ROUTES["builder-menu"], {
    mehr: { loc: () => pg.getByTestId("editor-more"), guide: true, noText: true },
    // Markierung auf dem Menüpunkt, Führung auf „…“ (der Menüpunkt ist erst nach dem Klick da).
    aktualitaet: { loc: () => pg.getByRole("menuitem", { name: /Aktualität prüfen/ }), guide: () => pg.getByTestId("editor-more"), noText: true },
    uebersetzen: { loc: () => pg.getByRole("menuitem", { name: /Übersetzen/ }) },
  });
  await pg.keyboard.press("Escape").catch(() => {});

  // ---- Leere Anleitung (vorübergehend im Wegwerf-Konto) ----
  {
    const emptyId = uuid();
    const { error } = await admin.from("tutorials").insert({
      id: emptyId, account_id: demo.accountId, title: "Kundenkonto schließen", status: "draft", visibility: "public",
      slug: "kundenkonto-schliessen", site_domains: [DEMO.portalHost],
    });
    if (error) throw error;
    await go(`/app/tutorials/${emptyId}`, 2000);
    await pg.getByTestId("empty-builder").waitFor({ timeout: 15000 }).catch(() => {});
    await pg.waitForTimeout(600);
    await capture("builder-empty", SHOT_ROUTES["builder-empty"], {
      aufnehmen: { loc: () => pg.getByTestId("empty-builder").getByRole("button", { name: "Mit der Steply-Erweiterung aufnehmen" }), guide: true },
      handanlegen: { loc: () => pg.getByTestId("empty-builder").getByRole("button", { name: "Schritt von Hand anlegen" }), guide: true },
    });
    await admin.from("tutorials").delete().eq("id", emptyId);
  }

  // ---- Einstellungen ----
  await go("/app/settings/aussehen", 1800);
  await capture("aussehen", SHOT_ROUTES.aussehen, {
    nav: { loc: () => pg.getByRole("navigation", { name: "Einstellungen" }).getByRole("link", { name: "Aussehen" }), guide: true },
    // Die drei Auswahlkarten (role=group „Design-Grundlage“); Text wechselt mit dem Zustand.
    modus: { loc: () => pg.getByRole("group", { name: "Design-Grundlage" }), guide: true, noText: true },
    website: { loc: () => pg.getByRole("textbox", { name: "Adresse Ihrer Website für das KI-Design" }), guide: true },
  });

  await go("/app/settings/teilen", 1500);
  const card = (heading) => pg.getByRole("heading", { name: heading }).locator("xpath=ancestor::section[1]");
  await capture("teilen", SHOT_ROUTES.teilen, {
    link: { loc: () => card("Link teilen"), guide: () => pg.getByRole("heading", { name: "Link teilen" }) },
    qr: { loc: () => card("QR-Code"), guide: () => pg.getByRole("img", { name: "QR-Code zur Hilfe-Seite" }) },
  });
  await pg.getByRole("heading", { name: /iFrame/ }).scrollIntoViewIfNeeded();
  await pg.waitForTimeout(400);
  await capture("teilen-iframe", SHOT_ROUTES["teilen-iframe"], {
    iframe: { loc: () => card(/Auf Ihrer Website einbetten/), guide: () => pg.getByRole("heading", { name: /Auf Ihrer Website einbetten/ }) },
  });

  await go("/app/settings/chat", 1500);
  await capture("chat", SHOT_ROUTES.chat, {
    bubble: { loc: () => card("Chat-Blase einbauen"), guide: () => pg.getByRole("heading", { name: "Chat-Blase einbauen" }) },
  });

  await go("/app/settings/sprachen", 1500);
  await capture("sprachen", SHOT_ROUTES.sprachen, {
    sprachen: { loc: () => card("Sprachen der Hilfe-Seite"), guide: () => pg.getByRole("heading", { name: "Sprachen der Hilfe-Seite" }) },
    uebersetzung: { loc: () => card("Automatische Übersetzung"), guide: () => pg.getByRole("heading", { name: "Automatische Übersetzung" }) },
  });

  await go("/app/settings/erweiterung", 2200);
  await capture("erweiterung-neu", SHOT_ROUTES["erweiterung-neu"], {
    // Status-Karte: Text wechselt mit dem Zustand (installiert/verbunden) -> nur css-Anker.
    status: { loc: () => pg.getByTestId("extension-status"), guide: true, noText: true },
    installieren: { loc: () => pg.getByText("Erweiterung installieren") },
  });
  // So sieht die Seite MIT installierter Erweiterung aus („Installiert – noch nicht verbunden“
  // + „Jetzt verbinden“): content.js setzt diese DOM-Kennung; RecorderConnect liest sie nach
  // 0/500/1500 ms. Hier von Hand gesetzt (keine echte Erweiterung im Test-Browser).
  await pg.goto(BASE + "/app/settings/erweiterung", { waitUntil: "domcontentloaded", timeout: 180_000 });
  await pg.evaluate(() => document.documentElement.setAttribute("data-steply-recorder", "2.18.1"));
  await pg.getByRole("button", { name: "Jetzt verbinden" }).waitFor({ timeout: 15000 }).catch(() => {});
  await settle(800);
  await capture("erweiterung", SHOT_ROUTES.erweiterung, {
    verbinden: { loc: () => pg.getByRole("button", { name: "Jetzt verbinden" }), guide: true },
  });

  await go("/app/settings/team", 1500);
  await capture("team", SHOT_ROUTES.team, {
    einladen: { loc: () => pg.getByRole("button", { name: "Einladen", exact: true }), guide: true },
    offen: { loc: () => pg.getByText("max.beispiel@example.com").first() },
  });

  // ---- KI-Assistent ----
  await go("/app/assistent/wissen", 1500);
  await capture("knowledge", SHOT_ROUTES.knowledge, {
    neu: { loc: () => pg.getByRole("button", { name: /Neuer Artikel/ }), guide: true },
    import: { loc: () => pg.getByRole("button", { name: /Von Ihrer Website/ }), guide: true },
  });
  await go("/app/assistent/eskalation", 1500);
  await capture("eskalation", SHOT_ROUTES.eskalation, {
    person: { loc: () => pg.getByRole("button", { name: /Person hinzufügen/ }), guide: true },
  });
  await go("/app/assistent/fragen", 1500);
  await capture("fragen", SHOT_ROUTES.fragen, {
    entwurf: { loc: () => pg.getByRole("button", { name: /Entwurf erstellen/ }), guide: true },
  });

  // ---- Schulungen ----
  await go("/app/lernen", 1500);
  await capture("lernen", SHOT_ROUTES.lernen, {
    karte: { loc: () => pg.getByText("Urlaubsantrag stellen").first().locator("xpath=ancestor::a[1]") },
    nachweis: { loc: () => pg.getByText(/von \d+ im Team/).first() },
  });

  // ---- Öffentliche Hilfe-Seite (illustrativ — Kunden-Adresse, keine Führung) ----
  await go(`/h/${demo.slug}`, 1500);
  await capture("hub", SHOT_ROUTES.hub, {
    marke: { loc: () => pg.locator("header").first() },
    sprache: { loc: () => pg.locator('[data-tx="lang"]').first() },
  });
  await pg.getByRole("button", { name: /KI-Assistent|Frage stellen|Hilfe/ }).last().click({ timeout: 5000 }).catch(() => {});
  await pg.waitForTimeout(900);
  await capture("hub-chat", SHOT_ROUTES["hub-chat"], { frage: { loc: () => pg.getByRole("dialog").getByRole("textbox") } });
  await pg.keyboard.press("Escape").catch(() => {});

  await go(`/h/${demo.slug}/rechnung-als-pdf-herunterladen`, 1500);
  await capture("wizard-public", SHOT_ROUTES["wizard-public"], {
    drucken: { loc: () => pg.locator('[data-tx="print-link"]') },
    vorlesen: { loc: () => pg.locator('[data-tx="tts"]') },
  });

  // ---- Steply-Erweiterung (Montagen) ----
  await capturePanel("panel-start", {
    leftPng: portalLeftPng,
    panelTargets: {
      aufnahme: (p) => p.locator("#recStart"),
      seite: (p) => p.locator("#siteRow"),
    },
    setup: async (p) => {
      await p.waitForFunction(() => document.getElementById("siteRowCount").textContent !== "…", null, { timeout: 8000 }).catch(() => {});
    },
  });
  await capturePanel("panel-guides", {
    leftPng: portalLeftPng,
    panelTargets: { zeigen: (p) => p.getByRole("button", { name: /Auf der Seite zeigen/ }) },
    setup: async (p) => {
      await p.locator("#siteRow").click();
      await p.waitForTimeout(700);
      await p.locator("#guidesList .item", { hasText: "Rechnung als PDF herunterladen" }).first().click();
      await p.waitForTimeout(500);
    },
  });
  await capturePanel("panel-run", {
    leftPng: portalLeftPng,
    leftBoxes: { ziel: portalDlBox },
    panelTargets: { schritt: (p) => p.locator("#guideRun .body").first() },
    setup: async (p) => {
      await p.locator("#siteRow").click();
      await p.waitForTimeout(700);
      await p.locator("#guidesList .item", { hasText: "Rechnung als PDF herunterladen" }).first().click();
      await p.waitForTimeout(400);
      await p.getByRole("button", { name: /Auf der Seite zeigen/ }).click();
      await p.waitForFunction(() => { const s = document.getElementById("guideRun"); return s && !s.hidden; }, null, { timeout: 8000 });
      await p.waitForTimeout(1200);
    },
  });

  // Prüfen-Bildschirm nach „Fertig“: drei aufgenommene Schritte, einer mit eingetipptem Wert.
  //  Zustand direkt im echten panel.js gesetzt (guideSteps/guidePhase sind globale Bindungen).
  await capturePanel("panel-review", {
    leftPng: portalLeftPng,
    panelTargets: { typed: (p) => p.locator("#guideList .typed") },
    setup: async (p) => {
      await p.evaluate(async (b64) => {
        const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const blob = new Blob([bin], { type: "image/png" });
        const url = "https://portal.muster-gmbh.de/rechnungen";
        const mk = (label, action, typedValue, i) => ({
          rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.05 }, label, action, url, title: "Rechnungen", selector: { text: label },
          sensitive: null, fileMeta: null, interaction: null, typedValue, ts: Date.now() - (5 - i) * 4000,
          tabId: 1, frameKey: null, blob, width: 1280, height: 720, thumbUrl: URL.createObjectURL(blob), imprecise: false,
        });
        // guideSteps/guidePhase/show/… sind globale Bindungen aus extension/panel.js.
        guideSteps.length = 0;
        guideSteps.push(
          mk("Rechnungen", "click", "", 0),
          // Kurzer Wert: ab ~12 Zeichen schneidet die 400-px-Seitenleiste „weglassen“ per Ellipse ab.
          mk("Kundennummer", "type", "10482", 1),
          mk("PDF herunterladen", "click", "", 2),
        );
        guidePhase = "stopped";
        show("guideLive");
        await guideMetaPrepare();
        els.guideTitle.value = "Rechnung als PDF herunterladen";
        els.guideCategory.value = "c1"; // „Rechnungen & Zahlungen“
        renderGuideSteps();
        renderGuidePhase();
      }, portalPng.toString("base64"));
      await p.waitForTimeout(700);
    },
  });

  // ── Vollständigkeit: jede Doku-Anleitung hat für jeden Schritt ein Bild; jede gewünschte
  //    Auto-Markierung (target ohne explizites highlight) wurde gefunden. ───────────────────
  let stepCount = 0, withSel = 0;
  for (const t of TUTORIALS) {
    t.steps.forEach((st, i) => {
      stepCount++;
      const where = `„${t.title}“ Schritt ${i + 1}`;
      const shot = shots[st.shot];
      if (!shot || !existsSync(path.join(OUT, shot.file))) return fail(`${where}: kein Bild (Shot „${st.shot}“ fehlt)`);
      if (!(st.shot in SHOT_ROUTES)) fail(`${where}: Shot „${st.shot}“ fehlt in SHOT_ROUTES`);
      if (st.target && st.highlight === undefined && !shot.boxes[st.target]) fail(`${where}: Markierung „${st.target}“ fehlt im Shot „${st.shot}“`);
      if (st.target && shot.selectors[st.target]) withSel++;
    });
  }
  // Ziele mit Führung, die auf einer Seite OHNE stabile Adresse liegen, sind nur im Editor
  // (dynamische URL) erlaubt — dort sucht die Führung auf der gerade offenen Editor-Seite.
  console.log(`\n${TUTORIALS.length} Doku-Anleitungen, ${stepCount} Schritte, ${withSel} mit Live-Führungs-Selektor.`);

  const manifest = {
    createdAt: new Date().toISOString(),
    appUrl: APP_URL,
    siteDomains: appSiteDomains(APP_URL),
    viewport: VP,
    shots,
  };
  writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log("→ Ausgabe:", OUT);
} catch (e) {
  fail("Abbruch: " + (e && e.stack ? e.stack : e));
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) {
    try {
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(server.pid), "/f", "/t"], { stdio: "ignore", shell: true });
      else server.kill("SIGKILL");
    } catch {
      /* egal */
    }
  }
  try {
    for (const id of cleanup.jobIds) await admin.from("video_jobs").delete().eq("id", id);
    if (cleanup.accountId) await removeAccount(cleanup.accountId);
    if (cleanup.userId) await admin.auth.admin.deleteUser(cleanup.userId);
    if (cleanup.userId) console.log("• Wegwerf-Nutzer entfernt");
  } catch (e) {
    fail("Aufräumen: " + (e && e.message ? e.message : e));
  }
}

if (problems.length) {
  console.log(`\n✗ ${problems.length} Problem(e) — NICHT einspielen.`);
  process.exit(1);
}
console.log("\n✓ Alle Schritte bebildert, alle Live-Führungs-Selektoren lösen genau das sichtbare Ziel auf.");
process.exit(0);

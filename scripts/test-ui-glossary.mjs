// Welle 50d — Wächter für die Begriffsliste (App-Makeover §6). OHNE Netz, ohne Server.
//
// Durchsucht nur SICHTBARE Texte (nicht Code-Kommentare, nicht Bezeichner) nach verbotenen
// Mustern: „Tutorial" statt Anleitung, Du-Form, „Dashboard", „Extension", „Chatbot",
// ae/oe/ue-Ersatzschreibung in der Steply-Erweiterung, gerade Anführungszeichen um deutsche
// Wörter, alte Einstellungs-Namen („Einstellungen → Einbetten/Abo") u. a.
//
// Was als sichtbar gilt:
//   src/**/*.tsx   JSX-Text; String-Literale in JSX-Ausdrücken ({…}) und in JSX-Attributen
//                  (außer technischen wie className/href/key …); Texte in toast(…)-Aufrufen;
//                  new Error("…")-Meldungen (landen per Toast beim Nutzer).
//   src/**/*.ts    new Error("…")-Meldungen und die reinen Text-Module (TEXT_MODULES: dort ist
//                  jedes String-Literal Oberfläche). src/app/api/** ist ausgenommen (Verhalten
//                  der API bleibt in dieser Welle unangetastet).
//   extension/*.js alle String-/Template-Literale AUSSER console.*-Argumenten, Vergleichs-
//                  operanden (=== / includes / startsWith …), Objekt-Schlüsseln und Selektor-/
//                  Nachrichtentyp-Strings ohne Leerzeichen; dazu extension/*.html (Textknoten
//                  und title/placeholder/aria-label/alt).
//
// Nutzung:  node scripts/test-ui-glossary.mjs            (Exit 1 bei Treffern)
//           node scripts/test-ui-glossary.mjs --list     (alle geprüften Texte ausgeben)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIST = process.argv.includes("--list");

// ── Regeln ────────────────────────────────────────────────────────────────────────────
// scope: "all" = überall, "ext" = nur Steply-Erweiterung, "jsxText" = nur JSX-/HTML-Textknoten.
const RULES = [
  { id: "Tutorial", re: /\bTutorials?\b/, hint: "„Anleitung“ statt „Tutorial“" },
  {
    id: "Du-Form",
    re: /(?:^|[\s(„"])(?:[Dd]u|[Dd]ir|[Dd]ich|[Dd]ein(?:e|en|em|er|es)?)(?=[\s.,!?:;)“"…]|$)/,
    hint: "Sie-Form",
  },
  { id: "Dashboard", re: /Dashboard/, hint: "keine „Dashboard“-Texte" },
  { id: "Extension", re: /\bExtension\b/, hint: "„Steply-Erweiterung“" },
  { id: "Recorder", re: /\bRecorder\b/, hint: "„Steply-Erweiterung“" },
  { id: "Chatbot", re: /Chatbot|Chat-Assistent|Hilfe-Assistent/i, hint: "„KI-Assistent“" },
  { id: "Drift", re: /Drift-Agent|Jetzt prüfen/, hint: "„Aktualität prüfen“" },
  { id: "Hilfeseite", re: /Hilfeseite|Hilfe-Center/, hint: "„Hilfe-Seite“" },
  { id: "powered-by", re: /powered by/i, hint: "„Erstellt mit Steply“" },
  { id: "Blur", re: /\bBlur\b/, hint: "„Verpixeln“" },
  {
    id: "gerader-Apostroph",
    re: /[a-zäöüß](?:'|&apos;)s\b/,
    hint: "typografischer Apostroph (z. B. „Los geht’s“)",
  },
  { id: "Bibliothek", re: /\bBibliothek\b/, hint: "Hauptmenü heißt „Anleitungen“" },
  { id: "Lern-Bereich", re: /Lern-?[Bb]ereich|Lern-Tab/, hint: "„Schulungen“" },
  { id: "Freigegeben", re: /[Ff]reigegeben|[Ff]ürs Team freigeben|[Ff]ür das Team freigeben/, hint: "„Veröffentlicht“" },
  { id: "Anleitung-führen", re: /Anleitung führen/, hint: "„Auf der Seite zeigen“" },
  { id: "Hub", re: /\bHub\b/, hint: "„Hilfe-Seite“" },
  {
    id: "alte-Einstellungen",
    re: /Einstellungen\s*(?:→|->|›|>)\s*(?:Einbetten|Abo\b|Branding|Konto\b)/,
    hint: "neue Einstellungs-Namen (Steply-Erweiterung, Tarif, Aussehen, Profil …)",
  },
  {
    id: "ae/oe/ue",
    scope: "ext",
    re: /moechte|zurueck|pruef|waehl|laeuft|oeffne|verfuegbar|aender|koennen|koennte|ueber|\bfuer\b|muess|spaeter|naechst|schliess|hinzufueg|groess|loesch|waehrend|Schaltflaeche|gueltig|ungueltig|Fuehrung|Aenderung|haette|waere|ausfuehr|zurueckgesetzt|Luecke|Schluessel|Buero/,
    hint: "echte Umlaute",
  },
  {
    id: "gerade-Anführungszeichen",
    scope: "jsxText",
    re: /"[A-Za-zÄÖÜäöüß][^"<>{}]{0,40}"/,
    hint: "„…“ statt \"…\"",
  },
];

// ── Ausnahmen (bewusst, begründet) ─────────────────────────────────────────────────────
// Jeder Eintrag: Datei-Präfix (relativ, mit /) + Regel-id + optionaler Text-Filter + Grund.
const EXCEPTIONS = [
  {
    file: "src/app/admin/",
    rule: "*",
    why: "Admin-Bereich ist ein internes Werkzeug für Steply selbst (nicht Kunden-Oberfläche)",
  },
  {
    file: "src/components/admin/",
    rule: "*",
    why: "Admin-Bereich ist ein internes Werkzeug für Steply selbst (nicht Kunden-Oberfläche)",
  },
  {
    file: "src/app/h/[account_slug]/",
    rule: "Du-Form",
    text: /\bDu\b.*\bdu\b|Du bist|du kannst/,
    why: "Hilfe-Seite: Kunden-Texte kommen aus der Kanzlei-Konfiguration (keine festen UI-Texte)",
  },
  {
    file: "extension/content.js",
    rule: "Extension",
    text: /Extension context invalidated/,
    why: "Chrome-Fehlermeldung (Vergleichstext), nie sichtbar",
  },
  {
    file: "src/lib/i18n-hub.ts",
    rule: "*",
    why: "Wörterbuch für EN/PL/TR — fremdsprachige Wörter wie „Tutorial“ sind dort korrekt",
  },
];

// Module, deren String-Literale praktisch nur aus Oberflächentext bestehen.
const TEXT_MODULES = [
  "src/lib/pricing.ts",
  "src/lib/plan.ts",
  "src/components/app/nav-config.ts",
];

// JSX-Attribute, die nie sichtbar sind.
const TECH_ATTR =
  /^(className|class|href|src|srcSet|id|key|type|name|role|target|rel|variant|size|htmlFor|autoComplete|inputMode|method|action|style|align|side|sizes|accept|pattern|dir|lang|form|encType|loading|fill|stroke\w*|viewBox|d|x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|render|sandbox|allow|referrerPolicy|mode|layout|color|as|icon|tone|kind|value|defaultValue|points|transform|xmlns\w*|crossOrigin|prefetch|scroll|nonce|integrity|priority|quality|fetchPriority|decoding|tabIndex|min|max|step|maxLength|rows|cols|capture|download|wrap|spellCheck|sideOffset|alignOffset|delay|orientation|gradientUnits|offset|stopColor|strokeWidth|dangerouslySetInnerHTML|onClick|onChange|onSubmit|formAction|accountSlug|slug|lang|locale|path|tab|field|storageKey|param|query|dataKey|format|tag|state|status|visibility|mimeType|kindKey|shortcut|keys|hotkey|data-[\w-]+|aria-(?!label|description|valuetext)[\w-]+)$/;

// ── Hilfen ────────────────────────────────────────────────────────────────────────────
function walkFiles(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      walkFiles(p, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

const texts = []; // { file, line, text, kind, ext }
function add(sf, node, text, kind, ext = false) {
  const t = String(text).replace(/\s+/g, " ").trim();
  if (!t) return;
  const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  texts.push({ file: rel(sf.fileName), line, text: t, kind, ext });
}

const CMP_OPS = new Set([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);
const CMP_METHODS = new Set([
  "includes", "startsWith", "endsWith", "indexOf", "match", "test", "replace", "replaceAll",
  "split", "querySelector", "querySelectorAll", "closest", "matches", "getAttribute",
  "setAttribute", "removeAttribute", "hasAttribute", "addEventListener", "removeEventListener",
  "createElement", "get", "set", "has", "delete", "getItem", "setItem", "removeItem",
  "add", "remove", "toggle", "contains", "postMessage", "sendMessage", "fetch", "from",
  "select", "eq", "rpc", "storage", "getPropertyValue", "setProperty",
]);

/** Ist der String-Knoten ein „technischer“ String (Vergleich, Selektor, Schlüssel …)? */
function isTechnicalUse(node) {
  const p = node.parent;
  if (!p) return false;
  if (ts.isBinaryExpression(p) && CMP_OPS.has(p.operatorToken.kind)) return true;
  if (ts.isCaseClause(p)) return true;
  if (ts.isPropertyAssignment(p) && p.name === node) return true;
  if (ts.isElementAccessExpression(p)) return true;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return true;
  if (ts.isCallExpression(p)) {
    const callee = p.expression;
    const name = ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : ts.isIdentifier(callee)
        ? callee.text
        : "";
    if (CMP_METHODS.has(name) || name === "require" || name === "cn" || name === "clsx") return true;
    if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "console") return true;
  }
  if (ts.isLiteralTypeNode(p)) return true;
  return false;
}

function insideConsole(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p)) {
      const c = p.expression;
      if (ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "console") return true;
    }
    if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
  }
  return false;
}

/** Sammelt String-/Template-Texte unterhalb von `node`, stoppt an verschachteltem JSX. */
function collectStrings(sf, node, kind, ext = false) {
  const visit = (n) => {
    if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n) || ts.isJsxFragment(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      if (!isTechnicalUse(n)) add(sf, n, n.text, kind, ext);
      return;
    }
    if (ts.isTemplateExpression(n)) {
      const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)];
      add(sf, n, parts.join(" … "), kind, ext);
      n.templateSpans.forEach((s) => visit(s.expression));
      return;
    }
    // Technische Unter-Ausdrücke überspringen (Vergleiche, className-Helfer …).
    if (ts.isBinaryExpression(n) && CMP_OPS.has(n.operatorToken.kind)) return;
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const name = ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : "";
      if (name === "cn" || name === "clsx" || CMP_METHODS.has(name)) return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
}

/** Satz-Text statt Klassen-/Schlüssel-String? */
function looksLikeProse(t) {
  const words = t.trim().split(/\s+/);
  if (words.length < 2) return false;
  const utility = words.filter((w) => /[-:/[\]#]|^\d/.test(w) || /^(flex|grid|hidden|block|inline|relative|absolute|fixed|sticky|truncate|italic|uppercase|underline|group|peer|shrink|grow|border|rounded|shadow|transition|container)$/.test(w));
  return utility.length / words.length < 0.5 && /[a-zäöüß]{2,}/.test(t);
}
/** Liegt der Knoten in einem JSX-Ausdruck/-Attribut oder toast() (dort schon erfasst)? */
function insideJsxOrToast(n) {
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isJsxExpression(p) || ts.isJsxAttribute(p) || isToastCall(p) || isNewError(p)) return true;
    if (ts.isSourceFile(p)) return false;
  }
  return false;
}

function isToastCall(n) {
  if (!ts.isCallExpression(n)) return false;
  const c = n.expression;
  if (ts.isIdentifier(c)) return c.text === "toast";
  return ts.isPropertyAccessExpression(c) && ts.isIdentifier(c.expression) && c.expression.text === "toast";
}
function isNewError(n) {
  return ts.isNewExpression(n) && ts.isIdentifier(n.expression) && /Error$/.test(n.expression.text);
}

// ── src/**/*.tsx + *.ts ────────────────────────────────────────────────────────────────
function scanSrc(file) {
  const r = rel(file);
  const isTsx = file.endsWith(".tsx");
  if (r.startsWith("src/app/api/")) return;
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const textModule = TEXT_MODULES.includes(r);
  const visit = (n) => {
    if (textModule && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n))) {
      if (!isTechnicalUse(n)) collectStrings(sf, n, "text-module");
      return;
    }
    // Übrige String-Literale in .tsx (Daten-Arrays, metadata, Hilfsfunktionen): nur, wenn sie
    // wie Satz-Text aussehen (≥2 Wörter, nicht überwiegend Tailwind-Klassen).
    if (
      isTsx &&
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      !ts.isJsxAttribute(n.parent) &&
      !isTechnicalUse(n) &&
      looksLikeProse(n.text) &&
      !insideJsxOrToast(n)
    ) {
      add(sf, n, n.text, "tsx-literal");
      return;
    }
    if (isTsx && ts.isJsxText(n)) {
      add(sf, n, n.text, "jsxText");
      return;
    }
    if (isTsx && ts.isJsxAttribute(n)) {
      const name = n.name.getText(sf);
      if (TECH_ATTR.test(name) || /^on[A-Z]/.test(name)) return; // Handler/Technik
      if (n.initializer) collectStrings(sf, n.initializer, "attr:" + name);
      // Verschachteltes JSX im Attribut (z. B. render={<Link/>}) trotzdem besuchen.
      if (n.initializer) ts.forEachChild(n.initializer, visit);
      return;
    }
    if (isTsx && ts.isJsxExpression(n) && n.parent && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      if (n.expression) collectStrings(sf, n.expression, "jsxExpr");
    }
    if (isTsx && isToastCall(n)) {
      n.arguments.forEach((a) => collectStrings(sf, a, "toast"));
    }
    if (isNewError(n) && n.arguments) {
      n.arguments.forEach((a) => collectStrings(sf, a, "error"));
    }
    // Rückgaben von Server-Actions ({ ok:false, message:"…" } / { error:"…" }) landen im UI.
    if (
      !isTsx &&
      ts.isPropertyAssignment(n) &&
      ts.isIdentifier(n.name) &&
      /^(message|error|hint)$/.test(n.name.text)
    ) {
      collectStrings(sf, n.initializer, "return:" + n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ── extension/*.js ─────────────────────────────────────────────────────────────────────
const EXT_JS = ["content.js", "background.js", "panel.js", "runner.js", "target-banner.js", "exec-run.js", "guide-resolve.js", "exec-plan.js", "site-match.js"];
function scanExtJs(file) {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const visit = (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      // Selektoren/Nachrichtentypen/Schlüssel haben kein Leerzeichen und keinen Satz —
      // sichtbare Texte fast immer schon (Ausnahme: Ein-Wort-Knöpfe, s. u.).
      const t = n.text;
      const looksText = /\s/.test(t.trim()) || /^[A-ZÄÖÜ][a-zäöüß]{2,}/.test(t);
      if (looksText && !isTechnicalUse(n) && !insideConsole(n)) add(sf, n, t, "ext-string", true);
      return;
    }
    if (ts.isTemplateExpression(n)) {
      if (!insideConsole(n)) {
        const parts = [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" … ");
        // Template-HTML: Tags entfernen, nur Text prüfen.
        add(sf, n, parts.replace(/<[^>]*>/g, " "), "ext-template", true);
      }
      ts.forEachChild(n, visit);
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

// ── extension/*.html ───────────────────────────────────────────────────────────────────
function scanHtml(file) {
  const src = readFileSync(file, "utf8");
  const r = rel(file);
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;
  const cleaned = src
    .replace(/<script[\s\S]*?<\/script>/gi, (m) => m.replace(/[^\n]/g, " "))
    .replace(/<style[\s\S]*?<\/style>/gi, (m) => m.replace(/[^\n]/g, " "))
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  const textRe = />([^<]+)</g;
  let m;
  while ((m = textRe.exec(cleaned))) {
    const t = m[1].replace(/\s+/g, " ").trim();
    if (t) texts.push({ file: r, line: lineOf(m.index), text: t, kind: "jsxText", ext: true });
  }
  const attrRe = /\s(title|placeholder|aria-label|alt|data-tip|data-title)="([^"]*)"/g;
  while ((m = attrRe.exec(cleaned))) {
    if (m[2].trim()) texts.push({ file: r, line: lineOf(m.index), text: m[2], kind: "attr:" + m[1], ext: true });
  }
}

// ── Lauf ──────────────────────────────────────────────────────────────────────────────
const srcFiles = walkFiles(path.join(ROOT, "src"), [".tsx", ".ts"]).filter((f) => !f.endsWith(".d.ts"));
srcFiles.forEach(scanSrc);
for (const f of EXT_JS) scanExtJs(path.join(ROOT, "extension", f));
for (const f of readdirSync(path.join(ROOT, "extension")).filter((f) => f.endsWith(".html"))) {
  scanHtml(path.join(ROOT, "extension", f));
}

// Welle 52a: die Steply-Selbstdoku (/h/steply, „Steply lernen“) ist ebenfalls Oberfläche —
// Titel, Kurzbeschreibungen, Kategorien und Schritt-Texte aus scripts/steply-help-content.mjs.
// Als „jsxText“ geprüft, damit auch gerade Anführungszeichen auffallen.
const DOC_FILE = "scripts/steply-help-content.mjs";
{
  const { TUTORIALS, CATEGORIES } = await import(new URL("./steply-help-content.mjs", import.meta.url));
  const docSrc = readFileSync(path.join(ROOT, DOC_FILE), "utf8").split("\n");
  const lineOf = (text) => {
    const probe = String(text).slice(0, 40);
    const i = docSrc.findIndex((l) => l.includes(probe));
    return i >= 0 ? i + 1 : 0;
  };
  const docText = (text) => texts.push({ file: DOC_FILE, line: lineOf(text), text: String(text), kind: "jsxText", ext: false });
  CATEGORIES.forEach(docText);
  for (const t of TUTORIALS) {
    docText(t.title);
    if (t.desc) docText(t.desc);
    for (const st of t.steps) {
      docText(st.title);
      docText(st.body);
    }
  }
}

function excepted(hit, rule) {
  return EXCEPTIONS.find(
    (e) =>
      hit.file.startsWith(e.file) &&
      (e.rule === "*" || e.rule === rule.id) &&
      (!e.text || e.text.test(hit.text)),
  );
}

const findings = [];
const perRule = Object.fromEntries(RULES.map((r) => [r.id, 0]));
let exceptedCount = 0;
for (const t of texts) {
  for (const rule of RULES) {
    if (rule.scope === "ext" && !t.ext) continue;
    if (rule.scope === "jsxText" && t.kind !== "jsxText") continue;
    if (!rule.re.test(t.text)) continue;
    if (excepted(t, rule)) {
      exceptedCount++;
      continue;
    }
    perRule[rule.id]++;
    findings.push({ ...t, rule });
  }
}

if (LIST) for (const t of texts) console.log(`${t.file}:${t.line} [${t.kind}] ${t.text}`);

const fileCount = new Set(texts.map((t) => t.file)).size;
console.log(
  `Begriffs-Wächter: ${texts.length} sichtbare Texte in ${fileCount} Dateien geprüft ` +
    `(${srcFiles.length} Quelldateien in src/, ${EXT_JS.length} Erweiterungs-Skripte + HTML), ` +
    `${RULES.length} Regeln, ${exceptedCount} begründete Ausnahme-Treffer.`,
);
if (findings.length) {
  for (const f of findings) {
    console.log(`✗ ${f.file}:${f.line} [${f.rule.id}] ${f.text.slice(0, 160)}  → ${f.rule.hint}`);
  }
  console.log(`\n✗ ${findings.length} Verstöße: ` + Object.entries(perRule).filter(([, n]) => n).map(([k, n]) => `${k}=${n}`).join(", "));
  process.exit(1);
}
console.log("✓ keine verbotenen Begriffe in sichtbaren Texten");

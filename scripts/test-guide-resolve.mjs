// Pure Node-Tests für extension/guide-resolve.js (Welle 31, Live-Führung).
// KEIN Browser, KEIN Netz, KEINE npm-Pakete: ein winziger DOM-Stub (querySelector /
// querySelectorAll / textContent / getAttribute / hasAttribute) reicht, weil resolveSelector
// PUR ist (root wird injiziert). Deckt alle drei Auflösungs-Stufen ab plus
// „nicht eindeutig -> null".
//
// Nutzung:  node scripts/test-guide-resolve.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { resolveSelector } = require("../extension/guide-resolve.js");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ── Mini-DOM-Stub ───────────────────────────────────────────────────────────
// Ein Element: { tag, attrs, text, css }. css = der (fiktive) eindeutige Pfad, unter dem
// querySelector es findet. Alle Elemente gelten als „klickbar" (der Test kontrolliert die
// Menge) -> querySelectorAll(CLICKABLE_SELECTOR) gibt schlicht alle zurück.
function elem({ tag = "div", attrs = {}, text = "", css = null }) {
  return {
    tagName: String(tag).toUpperCase(),
    _attrs: attrs,
    textContent: text,
    _css: css,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
    },
    hasAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this._attrs, name);
    },
  };
}

function makeRoot(elements) {
  return {
    _els: elements,
    querySelector(sel) {
      // label[for="…"] fuer die Eingabefeld-Tests aufloesen (Beschriftung ueber for-Bindung).
      const m = /^label\[for="(.*)"\]$/.exec(sel);
      if (m) {
        for (const el of this._els) {
          if ((el.tagName || "").toLowerCase() === "label" && el.getAttribute("for") === m[1]) {
            return el;
          }
        }
        return null;
      }
      for (const el of this._els) if (el._css && el._css === sel) return el;
      return null;
    },
    querySelectorAll() {
      // Der Test behandelt jedes registrierte Element als klickbaren Kandidaten.
      return this._els.slice();
    },
    getElementById(id) {
      for (const el of this._els) if (el.getAttribute("id") === id) return el;
      return null;
    },
  };
}

// ── Stufe 1: css exakt ──────────────────────────────────────────────────────
{
  const btn = elem({ tag: "button", text: "Speichern", css: "#save" });
  const other = elem({ tag: "a", attrs: { href: "#" }, text: "Abbrechen", css: "#cancel" });
  const root = makeRoot([btn, other]);

  // css trifft + Text passt grob -> exact.
  let r = resolveSelector(root, { css: "#save", text: "Speichern", role: "button" });
  ok(r.el === btn && r.confidence === "exact", "Stufe 1: css-Treffer + passender Text -> exact");

  // css trifft, kein Text im Selektor -> exact (Text-Check entfällt).
  r = resolveSelector(root, { css: "#save" });
  ok(r.el === btn && r.confidence === "exact", "Stufe 1: css-Treffer ohne Text -> exact");

  // contains in BEIDE Richtungen: Selektor-Text ist Teilstring des sichtbaren Textes.
  const long = elem({ tag: "button", text: "Rechnung jetzt hochladen", css: "#up" });
  const root2 = makeRoot([long]);
  r = resolveSelector(root2, { css: "#up", text: "hochladen" });
  ok(r.el === long && r.confidence === "exact", "Stufe 1: Text contains (Selektor ⊂ Sichtbar) -> exact");
}

// ── Stufe 2: Rolle + exakter Text (css fehlt/veraltet) -> text ───────────────
{
  // css zeigt ins Leere (SPA umgebaut) -> Stufe 1 fällt durch, Stufe 2 greift.
  const save = elem({ tag: "button", text: "Speichern", css: "#neu-save" });
  const link = elem({ tag: "a", attrs: { href: "#" }, text: "Speichern", css: "#neu-link" });
  const root = makeRoot([save, link]);

  // Nur der Button hat role=button -> genau EIN exakter Treffer trotz gleichem Text.
  let r = resolveSelector(root, { css: "#save-alt-veraltet", text: "Speichern", role: "button" });
  ok(r.el === save && r.confidence === "text", "Stufe 2: Rolle grenzt auf genau einen exakten Text-Treffer ein -> text");

  // Ohne Rolle wären es ZWEI exakte Treffer (Button + Link) -> Stufe 2 nicht eindeutig.
  // Stufe 3 fuzzy: beide enthalten den Text -> ebenfalls mehrdeutig -> null.
  r = resolveSelector(root, { text: "Speichern" });
  ok(r.el === null && r.confidence === null, "Stufe 2/3: zwei gleiche Texte ohne Rolle -> null (mehrdeutig)");
}

// ── Stufe 3: Fuzzy contains, genau ein Treffer -> fuzzy ──────────────────────
{
  const a = elem({ tag: "button", text: "Zur Kasse gehen", css: "#checkout" });
  const b = elem({ tag: "button", text: "Weiter einkaufen", css: "#more" });
  const root = makeRoot([a, b]);

  // Kein css-Treffer, kein EXAKTER Text-Treffer, aber genau EIN contains-Treffer -> fuzzy.
  const r = resolveSelector(root, { css: "#weg", text: "Kasse" });
  ok(r.el === a && r.confidence === "fuzzy", "Stufe 3: eindeutiger contains-Treffer -> fuzzy");
}

// ── Stufe 3: Fuzzy mehrdeutig -> null ────────────────────────────────────────
{
  const a = elem({ tag: "button", text: "Datei löschen", css: "#del1" });
  const b = elem({ tag: "button", text: "Ordner löschen", css: "#del2" });
  const root = makeRoot([a, b]);

  const r = resolveSelector(root, { text: "löschen" });
  ok(r.el === null && r.confidence === null, "Stufe 3: zwei contains-Treffer -> null (nicht eindeutig)");
}

// ── Randfälle ────────────────────────────────────────────────────────────────
{
  const root = makeRoot([elem({ tag: "button", text: "OK", css: "#ok" })]);
  ok(resolveSelector(null, { css: "#ok" }).el === null, "Randfall: root null -> null");
  ok(resolveSelector(root, null).el === null, "Randfall: selector null -> null");
  ok(resolveSelector(root, {}).confidence === null, "Randfall: leerer Selektor -> null");
  // css verfehlt + kein Text -> keine textbasierte Rettung möglich -> null.
  ok(resolveSelector(root, { css: "#gibtsnicht" }).el === null, "Randfall: css verfehlt, kein Text -> null");
}

// ── Eingabefelder (Welle 32, Punkt A): Text-Gegenprobe NICHT gegen textContent ──────────
// Ein input/textarea/select hat leeren textContent. Der matchbare Text kommt aus der
// BESCHRIFTUNG: <label for> / aria-label / aria-labelledby / placeholder / name.
{
  // Stufe 1 (der Kernfall aus Richards Bug): css trifft ein input, dessen textContent LEER
  // ist, aber der Selektor-Text = das LABEL. Frueher scheiterte die Gegenprobe (textContent
  // ""), jetzt greift sie ueber das <label for> -> exact statt Fallback.
  const input = elem({ tag: "input", attrs: { id: "email", type: "email" }, css: "#email" });
  const label = elem({ tag: "label", attrs: { for: "email" }, text: "E-Mail" });
  const root = makeRoot([input, label]);
  let r = resolveSelector(root, { css: "#email", text: "E-Mail", role: "textbox" });
  ok(r.el === input && r.confidence === "exact", "Eingabe Stufe 1: css trifft input + Label-Gegenprobe (leerer textContent) -> exact");
}
{
  // Stufe 2: css veraltet, aber Rolle=textbox + exakter LABEL-Text (ueber label[for]) -> text.
  const input = elem({ tag: "input", attrs: { id: "iban", type: "text" }, css: "#iban-neu" });
  const label = elem({ tag: "label", attrs: { for: "iban" }, text: "IBAN" });
  const noise = elem({ tag: "button", text: "IBAN", css: "#btn" }); // gleicher Text, andere Rolle
  const root = makeRoot([input, label, noise]);
  const r = resolveSelector(root, { css: "#iban-alt", text: "IBAN", role: "textbox" });
  ok(r.el === input && r.confidence === "text", "Eingabe Stufe 2: Rolle textbox + Label-Text (label[for]) -> text");
}
{
  // placeholder als Beschriftung (kein <label>): Stufe 2 exakt ueber placeholder.
  const input = elem({ tag: "input", attrs: { type: "text", placeholder: "Suchbegriff" }, css: "#s" });
  const root = makeRoot([input]);
  const r = resolveSelector(root, { css: "#weg", text: "Suchbegriff", role: "textbox" });
  ok(r.el === input && r.confidence === "text", "Eingabe: placeholder als Beschriftung -> text");
}
{
  // aria-label als Beschriftung.
  const input = elem({ tag: "input", attrs: { type: "text", "aria-label": "Betrag" }, css: "#b" });
  const root = makeRoot([input]);
  const r = resolveSelector(root, { css: "#weg", text: "Betrag", role: "textbox" });
  ok(r.el === input && r.confidence === "text", "Eingabe: aria-label als Beschriftung -> text");
}
{
  // aria-labelledby -> Text des referenzierten Elements (getElementById).
  const cap = elem({ tag: "span", attrs: { id: "cap1" }, text: "Kundennummer" });
  const input = elem({ tag: "input", attrs: { type: "text", "aria-labelledby": "cap1" }, css: "#k" });
  const root = makeRoot([cap, input]);
  const r = resolveSelector(root, { css: "#weg", text: "Kundennummer", role: "textbox" });
  ok(r.el === input && r.confidence === "text", "Eingabe: aria-labelledby -> referenzierter Text -> text");
}
{
  // textarea ueber name (letzte Stufe der Beschriftungskette).
  const ta = elem({ tag: "textarea", attrs: { name: "nachricht" }, css: "#msg" });
  const root = makeRoot([ta]);
  const r = resolveSelector(root, { css: "#weg", text: "nachricht", role: "textbox" });
  ok(r.el === ta && r.confidence === "text", "Eingabe: textarea ueber name -> text");
}
{
  // select ueber <label for> — textContent (Options) darf NICHT als Text genommen werden.
  const sel = elem({ tag: "select", attrs: { id: "land" }, text: "Deutschland Österreich Schweiz", css: "#land" });
  const label = elem({ tag: "label", attrs: { for: "land" }, text: "Land" });
  const root = makeRoot([sel, label]);
  const r = resolveSelector(root, { css: "#land-alt", text: "Land", role: "combobox" });
  ok(r.el === sel && r.confidence === "text", "Eingabe: select ueber Label (nicht Options-textContent) -> text");
}

console.log(failed ? "\n✗ guide-resolve Tests fehlgeschlagen." : "\n✓ guide-resolve: alle Stufen verifiziert.");
process.exitCode = failed ? 1 : 0;

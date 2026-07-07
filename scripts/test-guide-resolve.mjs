// Pure Node-Tests für extension/guide-resolve.js (Welle 31, Live-Führung).
// KEIN Browser, KEIN Netz, KEINE npm-Pakete: ein winziger DOM-Stub (querySelector /
// querySelectorAll / textContent / getAttribute / hasAttribute) reicht, weil resolveSelector
// PUR ist (root wird injiziert). Deckt alle drei Auflösungs-Stufen ab plus
// „nicht eindeutig -> null".
//
// Nutzung:  node scripts/test-guide-resolve.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { resolveSelector, isVolatileId, nearText, CLICKABLE_SELECTOR } = require("../extension/guide-resolve.js");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ── Mini-DOM-Stub ───────────────────────────────────────────────────────────
// Ein Element: { tag, attrs, text, css }. css = der (fiktive) eindeutige Pfad, unter dem
// querySelector es findet. Alle Elemente gelten als „klickbar" (der Test kontrolliert die
// Menge) -> querySelectorAll(CLICKABLE_SELECTOR) gibt schlicht alle zurück.
function elem({ tag = "div", attrs = {}, text = "", css = null, wrapLabel = null }) {
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
    // Minimaler closest('label')-Stub fuer den Wrapping-<label>-Fall (Welle 33, Fix 3).
    closest(sel) {
      return sel === "label" && wrapLabel ? wrapLabel : null;
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
    querySelectorAll(sel) {
      // Klickbaren-Sammelselektor -> ALLE Elemente (der Test kontrolliert die Kandidatenmenge).
      if (sel === undefined || sel === CLICKABLE_SELECTOR) return this._els.slice();
      // Spezifischer css-Selektor -> ECHTE Eindeutigkeits-Semantik (Welle 44): nur Elemente,
      // deren _css exakt passt. So zählt der Eindeutigkeits-Anker (querySelectorAll(css).length
      // === 1) im Stub genauso wie im Browser (mehrere gleiche _css -> mehrdeutig -> kein Heilen).
      return this._els.filter((el) => el._css && el._css === sel);
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

// ── Eingabefeld INNERHALB eines <label> (Welle 33, Fix 3): closest('label')-Text ──────────
{
  // Kein for-Attribut, keine id — die Beschriftung ist der Text des umschliessenden <label>.
  // role=textbox grenzt das <label> selbst (das ja auch „Geburtsdatum" traegt) sauber aus.
  const label = elem({ tag: "label", text: "Geburtsdatum" });
  const input = elem({ tag: "input", attrs: { type: "text" }, css: "#gd", wrapLabel: label });
  const root = makeRoot([input, label]);
  const r = resolveSelector(root, { css: "#gd-alt", text: "Geburtsdatum", role: "textbox" });
  ok(r.el === input && r.confidence === "text", "Eingabe: Wrapping-<label> (closest) als Beschriftung -> text");
}

// ── Grund-Rückgabe (Welle 33, Fix 3): reason für die Panel-Anzeige/Telemetrie ─────────────
{
  ok(resolveSelector(null, { css: "#x" }).reason === "no-selector", "reason: root null -> no-selector");
  ok(resolveSelector(makeRoot([]), null).reason === "no-selector", "reason: selector null -> no-selector");
  // Leerer Selektor {} hat weder css noch text -> css-miss (nichts, woran man verankern könnte).
  ok(resolveSelector(makeRoot([]), {}).reason === "css-miss", "reason: leerer Selektor -> css-miss");

  const root = makeRoot([elem({ tag: "button", text: "OK", css: "#ok" })]);
  ok(resolveSelector(root, { css: "#weg" }).reason === "css-miss", "reason: css verfehlt, kein Text -> css-miss");

  // css hit + passender Text -> Treffer, reason null.
  const btn = elem({ tag: "button", text: "Speichern", css: "#save" });
  ok(resolveSelector(makeRoot([btn]), { css: "#save", text: "Speichern" }).reason === null, "reason: Treffer -> null");

  // Text im Selektor, aber nirgends vorhanden -> text-mismatch.
  const r1 = resolveSelector(makeRoot([btn]), { css: "#weg", text: "Gibtsnicht", role: "button" });
  ok(r1.el === null && r1.reason === "text-mismatch", "reason: Text nirgends -> text-mismatch");

  // Zwei gleiche Texte, keine Rolle -> mehrdeutig -> ambiguous.
  const a = elem({ tag: "button", text: "Löschen", css: "#d1" });
  const b = elem({ tag: "button", text: "Löschen", css: "#d2" });
  const r2 = resolveSelector(makeRoot([a, b]), { text: "Löschen" });
  ok(r2.el === null && r2.reason === "ambiguous", "reason: zwei Treffer -> ambiguous");
}

// ── Flüchtige IDs (Welle 33, Fix 5): isVolatileId + Bestandsschutz für alte Aufnahmen ─────
{
  ok(isVolatileId("base-ui-_R_1mtabrb_") === true, "isVolatileId: base-ui-… -> flüchtig");
  ok(isVolatileId("_r_6_") === true, "isVolatileId: _r_6_ (useId) -> flüchtig");
  ok(isVolatileId(":r5:") === true, "isVolatileId: :r5: -> flüchtig");
  ok(isVolatileId("radix-42") === true, "isVolatileId: radix-… -> flüchtig");
  ok(isVolatileId("123456") === true, "isVolatileId: rein numerisch -> flüchtig");
  ok(isVolatileId("invite-email") === false, "isVolatileId: sprechende id -> stabil");

  // Alte Aufnahme mit flüchtigem-ID-css: css trifft NICHT (ID hat sich geändert) -> Stufe 2
  // findet die Menü-Schaltfläche über role+Text; Grund wird als volatile-id gemeldet, wenn
  // (hier separat geprüft) gar nichts mehr passt.
  const menu = elem({ tag: "button", text: "Menü öffnen", css: "#base-ui-_r_66_" });
  const root = makeRoot([menu]);
  const r = resolveSelector(root, { css: "#base-ui-_R_1mtabrb_", text: "Menü öffnen", role: "button" });
  ok(r.el === menu && r.confidence === "text", "Flüchtige-ID-css verfehlt -> Stufe 2 (role+Text) findet -> text");

  // Flüchtiger-ID-css verfehlt UND nichts Passendes da -> reason volatile-id (statt css-miss).
  const noise = elem({ tag: "button", text: "Ganz anderer Knopf", css: "#other" });
  const r2 = resolveSelector(makeRoot([noise]), { css: "#base-ui-_r_6_", text: "Menü öffnen", role: "button" });
  ok(r2.el === null && r2.reason === "volatile-id", "Flüchtige-ID-css tot + kein Text-Treffer -> reason volatile-id");
}

// ── Hotfix 06.07.: Mini-Text-Falle + Typ-Grenze (Richards „Menü-Icon statt E-Mail-Feld") ──
{
  // Avatar-Knopf „M" darf die Suche nach „E-Mail" NICHT fangen („e-mail" enthält „m"),
  // solange das echte Feld (css) noch nicht existiert (Hydration/PPR).
  const avatar = elem({ tag: "button", text: "M", css: "#avatar" });
  const r = resolveSelector(makeRoot([avatar]), {
    css: "#invite-email",
    text: "E-Mail",
    role: "textbox",
  });
  ok(r.el === null, "Mini-Text: Avatar-M faengt die E-Mail-Suche nicht (kein Fuzzy-Treffer)");

  // Exakt gleicher Kurz-Text bleibt gültig (Stufe 2): der M-Knopf wird über role+Text gefunden.
  const r2 = resolveSelector(makeRoot([avatar]), { css: "#tot", text: "M", role: "button" });
  ok(r2.el === avatar && r2.confidence === "text", "Mini-Text: exakt gleicher Kurz-Text (M) matcht weiter");

  // Typ-Grenze: Ein textbox-Schritt ankert nie an einem Button — auch wenn dessen Text
  // die Beschriftung ENTHÄLT (z. B. Knopf [E-Mail senden] vs. Feld-Label [E-Mail]).
  const mailBtn = elem({ tag: "button", text: "E-Mail senden", css: "#send" });
  const r3 = resolveSelector(makeRoot([mailBtn]), {
    css: "#invite-email",
    text: "E-Mail",
    role: "textbox",
  });
  ok(r3.el === null, "Typ-Grenze: textbox-Schritt ankert nicht am Senden-Button");

  // Gegenprobe: existiert das ECHTE Feld (label via for-Bindung), gewinnt es wie gehabt.
  const label = elem({ tag: "label", attrs: { for: "invite-email" }, text: "E-Mail" });
  const field = elem({ tag: "input", attrs: { id: "invite-email", type: "email" }, css: "#invite-email" });
  const r4 = resolveSelector(makeRoot([label, field]), {
    css: "#invite-email",
    text: "E-Mail",
    role: "textbox",
  });
  ok(r4.el === field && r4.confidence === "exact", "Gegenprobe: echtes Feld gewinnt via css+Label wie gehabt");
}

// ── Welle 43: Google-„Konto auswählen" (mehrzeiliger Name+E-Mail-Text) ────────────────────
// Bei der Aufnahme erfasst content.js den Text mit innerText (visibleText) → Block-Grenzen
// werden zu Leerraum: „Richard Petrasch richard.petrasch@googlemail.com". Beim Auflösen muss
// der Resolver ebenfalls innerText bevorzugen — sonst KLEBT textContent Name+E-Mail zusammen
// („…Petraschrichard…") und der Resolver meldete fälschlich „text-mismatch". Der Stub liefert
// hier BEIDES (innerText mit Umbruch, textContent ohne Trenner), um zu beweisen, dass innerText
// den Ausschlag gibt.
{
  // Konto-Zeile: verschachtelt (Name-<div> + E-Mail-<div>) mit role=link (Google-Muster).
  const row = {
    tagName: "DIV",
    _css: "#acct-richard",
    innerText: "Richard Petrasch\nrichard.petrasch@googlemail.com",
    // textContent OHNE Trenner (so wie der Browser die Bloecke zusammenklebt).
    textContent: "Richard Petraschrichard.petrasch@googlemail.com",
    _attrs: { role: "link", tabindex: "0" },
    getAttribute(n) { return Object.prototype.hasOwnProperty.call(this._attrs, n) ? this._attrs[n] : null; },
    hasAttribute(n) { return Object.prototype.hasOwnProperty.call(this._attrs, n); },
    closest() { return null; },
  };
  const root = makeRoot([row]);

  // Stufe 1: css trifft + mehrzeiliger Text passt (dank innerText) -> exact.
  const r1 = resolveSelector(root, {
    css: "#acct-richard",
    text: "Richard Petrasch richard.petrasch@googlemail.com",
    role: "link",
  });
  ok(r1.el === row && r1.confidence === "exact",
    "Welle 43: Konto-Zeile (Name+E-Mail, mehrzeilig) via css+innerText-Gegenprobe -> exact");

  // Stufe 2 (css veraltet/flüchtig): role=link + exakter innerText-Text -> text.
  const r2 = resolveSelector(root, {
    css: "#base-ui-_r_9_",
    text: "Richard Petrasch richard.petrasch@googlemail.com",
    role: "link",
  });
  ok(r2.el === row && r2.confidence === "text",
    "Welle 43: Konto-Zeile über role+innerText gefunden, wenn css tot ist -> text");

  // Gegenprobe: OHNE die innerText-Bevorzugung (nur textContent) würde derselbe Selektor
  // scheitern — der Stub ohne innerText belegt den Regressions-Unterschied.
  const glued = elem({ tag: "div", attrs: { role: "link" }, text: "Richard Petraschrichard.petrasch@googlemail.com", css: "#g" });
  const rGlued = resolveSelector(makeRoot([glued]), {
    css: "#tot",
    text: "Richard Petrasch richard.petrasch@googlemail.com",
    role: "link",
  });
  ok(rGlued.el === null,
    "Welle 43: ohne innerText-Trenner (nur zusammengeklebter textContent) bleibt es zu Recht ein Miss");
}

// ── Welle 44: SELBSTHEILUNG STUFE A (Text-Drift bei eindeutigem+stabilem css) ───────────────
// EINE neue Regel in Stufe 1: traf der css eindeutig+stabil+rollengleich, driftete aber NUR der
// Text volatil (Version/Datum/Zähler), gilt der Treffer als selbstgeheilt -> confidence 'healed'.
// Motiv (Richards echter Test): Knopf „Extension herunterladen (v2.13.0)" heißt live „(v2.13.1)".

// (a) KERNFALL: Versionsnummer v2.13.0 -> v2.13.1 (css #dl eindeutig+stabil, role=button).
{
  const btn = elem({ tag: "button", text: "Extension herunterladen (v2.13.1)", css: "#dl" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#dl", text: "Extension herunterladen (v2.13.0)", role: "button" });
  ok(r.el === btn && r.confidence === "healed" && r.healed === true && r.reason === null,
    "Heilung (a) KERN: Version v2.13.0→v2.13.1, css eindeutig+stabil+role -> healed");
}

// (b) Datum-im-Text analog (01.03.2024 -> 15.09.2025).
{
  const btn = elem({ tag: "button", text: "Rechnung vom 15.09.2025 öffnen", css: "#inv" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#inv", text: "Rechnung vom 01.03.2024 öffnen", role: "button" });
  ok(r.el === btn && r.confidence === "healed", "Heilung (b): Datum 01.03.2024→15.09.2025 -> healed");
}

// (c) „(3)" -> „(5)"-Zähler (realistisches Label mit tragfähigem Rest „warenkorb ()").
{
  const btn = elem({ tag: "button", text: "Warenkorb (5)", css: "#cart" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#cart", text: "Warenkorb (3)", role: "button" });
  ok(r.el === btn && r.confidence === "healed", "Heilung (c): Zähler (3)→(5) -> healed");
}

// (d) NEGATIV: generischer css mehrdeutig (2 Treffer) -> Bedingung 2 verhindert Heilung.
{
  const b1 = elem({ tag: "button", text: "Postausgang (5)", css: ".tab" });
  const b2 = elem({ tag: "button", text: "Entwürfe (5)", css: ".tab" });
  const root = makeRoot([b1, b2]);
  const r = resolveSelector(root, { css: ".tab", text: "Postausgang (3)", role: "button" });
  ok(r.el === null && r.confidence !== "healed" && r.reason === "text-mismatch",
    "Heilung (d) NEG: mehrdeutiger css (2 Treffer) -> KEIN Heilen (Bedingung 2 Eindeutigkeit)");
}

// (e) NEGATIV: flüchtiger css (base-ui) trifft „zufällig" -> Bedingung 1 verhindert Heilung,
//     OBWOHL der Text hier nur volatil driftet (nearText würde passen) — dem Zufall nie trauen.
{
  const btn = elem({ tag: "button", text: "Herunterladen (v2.13.1)", css: "#base-ui-_r_5_" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#base-ui-_r_5_", text: "Herunterladen (v2.13.0)", role: "button" });
  ok(r.el === null && r.confidence !== "healed",
    "Heilung (e) NEG: flüchtiger css (base-ui) -> KEIN Heilen trotz volatiler Text-Drift (Bedingung 1)");
}

// (f) NEGATIV: Rollenwechsel Button->Link -> Bedingung 3 verhindert Heilung.
{
  const link = elem({ tag: "a", attrs: { href: "#" }, text: "Herunterladen (v2.13.1)", css: "#dl2" });
  const root = makeRoot([link]);
  const r = resolveSelector(root, { css: "#dl2", text: "Herunterladen (v2.13.0)", role: "button" });
  ok(r.el === null && r.confidence !== "healed",
    "Heilung (f) NEG: Rollenwechsel Button→Link -> KEIN Heilen (Bedingung 3 Rolle)");
}

// (g) NEGATIV: echter Textwechsel „Speichern" -> „Löschen" -> nearText false -> kein Heilen.
{
  const btn = elem({ tag: "button", text: "Löschen", css: "#act" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#act", text: "Speichern", role: "button" });
  ok(r.el === null && r.confidence !== "healed",
    "Heilung (g) NEG: echter Textwechsel Speichern→Löschen -> KEIN Heilen (nearText false)");
}

// (h) NEGATIV: „weiter" vs „weiter zu wetransfer" — Rest verschieden (kein reiner Volatil-
//     Unterschied). Mit Klammern erzwungen, damit der Treffer die Heil-Prüfung überhaupt erreicht
//     (sonst fängt containsEither „weiter" ⊂ „weiter zu…" schon als exact).
{
  const btn = elem({ tag: "button", text: "Weiter zu WeTransfer (2)", css: "#nxt" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#nxt", text: "Weiter (1)", role: "button" });
  ok(r.el === null && r.confidence !== "healed",
    "Heilung (h) NEG: 'weiter (1)' vs 'weiter zu wetransfer (2)' -> Rest verschieden -> KEIN Heilen");
}

// (i) Kein-Text-Selektor: reiner css-Treffer wie bisher exact (Heilen weder nötig noch aktiv).
{
  const btn = elem({ tag: "button", text: "Egal", css: "#plain" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#plain" });
  ok(r.el === btn && r.confidence === "exact", "Heilung (i): ohne recorded text bleibt reiner css-Treffer -> exact (kein healed)");
}

// ── Pure nearText-Direkttests (Volatil-Token-Regex isoliert) ────────────────────────────────
{
  ok(nearText("Extension herunterladen (v2.13.0)", "Extension herunterladen (v2.13.1)") === true,
    "nearText: Version v2.13.0→v2.13.1 -> nah");
  ok(nearText("Warenkorb (3)", "Warenkorb (5)") === true, "nearText: Zähler (3)→(5) -> nah");
  ok(nearText("Rechnung vom 01.03.2024 öffnen", "Rechnung vom 15.09.2025 öffnen") === true,
    "nearText: Datum mit Punkten -> nah");
  ok(nearText("Export 2024-03-12", "Export 2025-09-01") === true, "nearText: ISO-Datum mit Bindestrichen -> nah");
  ok(nearText("Sitzung 14:30 starten", "Sitzung 09:15 starten") === true, "nearText: Uhrzeit -> nah");
  ok(nearText("Speichern", "Löschen") === false, "nearText: Speichern/Löschen -> NICHT nah");
  ok(nearText("weiter", "weiter zu wetransfer") === false,
    "nearText: 'weiter' vs 'weiter zu wetransfer' (Rest verschieden) -> NICHT nah");
  ok(nearText("(3)", "(5)") === false, "nearText: reiner Zähler '(3)'/'(5)' (Rest <3 sichtbar) -> NICHT nah (Untergrenze)");
  ok(nearText("2.13.0", "2.13.1") === false, "nearText: reine Versionsnummer (Rest leer) -> NICHT nah");
  ok(nearText("", "") === false, "nearText: leer/leer -> NICHT nah");
  ok(nearText("Version 3", "Version 3") === true, "nearText: identisch -> nah");
}

// ── Welle 45: SICHTBARE ELEMENTE BEVORZUGEN (injiziertes isVisible-Prädikat) ─────────────────
// resolveSelector(root, selector, { isVisible }) bevorzugt in Stufe 2/3 SICHTBARE Kandidaten und
// verankert Stufe 1 NICHT an einem unsichtbaren css-Einzeltreffer (bei vorhandenem Text). OHNE
// isVisible bleibt alles EXAKT wie zuvor (alle Tests oben laufen ohne opts). „Sichtbarkeit" ist
// hier ein Stub-Prädikat (Element NICHT in hiddenSet) — das reine Modul ruft NIE
// getBoundingClientRect; der Aufrufer (content.js) liefert getBoundingClientRect>0.
// Motiv: Richards echter Test „Anmelden auswählen" auf der „Konto erstellen"-Seite — der Resolver
// haftete an einem versteckten 0×0-Duplikat (eingeklapptes Mobil-Menü) statt am sichtbaren Link.
function hiddenPred(...hiddenEls) {
  const set = new Set(hiddenEls);
  return { isVisible: (el) => !set.has(el) };
}

// (a) Zwei exakte „Anmelden"-Treffer, einer unsichtbar -> der SICHTBARE wird gewählt (text).
{
  const hidden = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#anm-mobile" });
  const visible = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#anm-desktop" });
  const root = makeRoot([hidden, visible]);
  const r = resolveSelector(root, { text: "Anmelden", role: "link" }, hiddenPred(hidden));
  ok(r.el === visible && r.confidence === "text",
    "W45 (a): zwei exakte 'Anmelden', einer unsichtbar -> sichtbarer gewählt (text)");
  // Gegenprobe OHNE isVisible: zwei exakte Treffer bleiben mehrdeutig -> null (altes Verhalten).
  const r0 = resolveSelector(root, { text: "Anmelden", role: "link" });
  ok(r0.el === null && r0.reason === "ambiguous",
    "W45 (a) Gegenprobe OHNE isVisible: zwei gleiche Treffer -> ambiguous (unverändert)");
}

// (b) css trifft ein UNSICHTBARES Element, aber ein sichtbarer Text-Zwilling existiert -> sichtbar.
//     Das ist Richards Kern: der aufgenommene css zeigte auf das versteckte Mobil-Menü-Duplikat.
{
  const hiddenHit = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#anm-mobile" });
  const visibleTwin = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#anm-desktop" });
  const root = makeRoot([hiddenHit, visibleTwin]);
  const r = resolveSelector(root, { css: "#anm-mobile", text: "Anmelden", role: "link" }, hiddenPred(hiddenHit));
  ok(r.el === visibleTwin && r.confidence === "text",
    "W45 (b): css trifft unsichtbares Element -> Stufe 1 übersprungen, sichtbarer Zwilling gewählt (text)");
  // Gegenprobe OHNE isVisible: css verankert exakt am unsichtbaren Treffer (der heutige Bug).
  const r0 = resolveSelector(root, { css: "#anm-mobile", text: "Anmelden", role: "link" });
  ok(r0.el === hiddenHit && r0.confidence === "exact",
    "W45 (b) Gegenprobe OHNE isVisible: css verankert am unsichtbaren Treffer (exact) — der alte Bug");
}

// (c) NUR ein unsichtbarer Treffer -> Element wie bisher zurückgegeben (Aufrufer meldet target-hidden).
{
  const onlyHidden = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#anm" });
  const opts = { isVisible: () => false }; // nichts ist sichtbar
  // css unsichtbar übersprungen; Stufe 2 findet genau EINEN (unsichtbaren) exakten Treffer ->
  // Fallback gibt ihn zurück (Element erhalten), damit rein-unsichtbare Fälle nicht schlechter werden.
  const r = resolveSelector(makeRoot([onlyHidden]), { css: "#anm", text: "Anmelden", role: "link" }, opts);
  ok(r.el === onlyHidden && r.el !== null,
    "W45 (c): nur unsichtbarer Treffer -> Element wie bisher zurückgegeben (Aufrufer meldet dann target-hidden)");
  // Ohne css, nur Text: gleicher Fallback (genau ein exakter Treffer, wenn auch unsichtbar).
  const r2 = resolveSelector(makeRoot([onlyHidden]), { text: "Anmelden", role: "link" }, opts);
  ok(r2.el === onlyHidden, "W45 (c2): nur unsichtbarer Text-Treffer -> Fallback gibt den einen zurück");
}

// (d) OHNE isVisible -> altes Verhalten exakt (auch ein opts-Objekt OHNE isVisible zählt als 'kein Prädikat').
{
  const hidden = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#h" });
  const visible = elem({ tag: "a", attrs: { href: "#" }, text: "Anmelden", css: "#v" });
  const root = makeRoot([hidden, visible]);
  const r = resolveSelector(root, { text: "Anmelden", role: "link" });
  ok(r.el === null && r.reason === "ambiguous",
    "W45 (d): OHNE isVisible bleibt alles alt (zwei gleiche -> ambiguous)");
  const r2 = resolveSelector(root, { css: "#h", text: "Anmelden", role: "link" }, {});
  ok(r2.el === hidden && r2.confidence === "exact",
    "W45 (d2): opts ohne isVisible -> css verankert wie bisher (exact)");
}

// (e) Stufe 3 (fuzzy contains): zwei contains-Treffer, einer unsichtbar -> sichtbarer (fuzzy).
{
  const hidden = elem({ tag: "button", text: "Zur Kasse gehen", css: "#k1" });
  const visible = elem({ tag: "button", text: "Zur Kasse gehen", css: "#k2" });
  const root = makeRoot([hidden, visible]);
  const r = resolveSelector(root, { text: "Kasse", role: "button" }, hiddenPred(hidden));
  ok(r.el === visible && r.confidence === "fuzzy",
    "W45 (e): Stufe 3 fuzzy — zwei contains-Treffer, einer unsichtbar -> sichtbarer (fuzzy)");
  // Gegenprobe OHNE isVisible: zwei fuzzy-Treffer -> mehrdeutig -> null (unverändert).
  const r0 = resolveSelector(root, { text: "Kasse", role: "button" });
  ok(r0.el === null && r0.reason === "ambiguous", "W45 (e) Gegenprobe OHNE isVisible: fuzzy mehrdeutig -> ambiguous");
}

// (f) Selbstheilung (Welle 44) bleibt intakt, wenn der EINDEUTIGE css-Treffer SICHTBAR ist:
//     Version driftet, css sichtbar+eindeutig+rollengleich -> weiterhin healed (isVisible ändert
//     den Heil-Pfad für sichtbare css-Treffer NICHT).
{
  const btn = elem({ tag: "button", text: "Extension herunterladen (v2.13.1)", css: "#dl" });
  const root = makeRoot([btn]);
  const r = resolveSelector(root, { css: "#dl", text: "Extension herunterladen (v2.13.0)", role: "button" }, hiddenPred());
  ok(r.el === btn && r.confidence === "healed",
    "W45 (f): sichtbarer eindeutiger css-Treffer heilt Text-Drift weiter -> healed (Härtung W44 unberührt)");
}

console.log(failed ? "\n✗ guide-resolve Tests fehlgeschlagen." : "\n✓ guide-resolve: alle Stufen + Selbstheilung (W44) + Sichtbarkeits-Bevorzugung (W45) verifiziert.");
process.exitCode = failed ? 1 : 0;

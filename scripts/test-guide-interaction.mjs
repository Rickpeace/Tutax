// Welle 48: erweiterte Interaktion — Server-Teil OHNE Datenbank/Netz.
// Prueft: validateInteraction (tolerant, Datenschutz), Vorlagen-Titel/-Texte (Sie-Form,
// typografische Quotes, TITLE_MAX zitat-sicher), deutsche Tastenanzeige, Automations-Chips,
// KI-Hinweis, Aktions-Ableitung bei der Umwandlung Tutorial → Automation.
//
// Nutzung:  node scripts/test-guide-interaction.mjs
import { register } from "node:module";

// server-only ist in reinem Node nicht aufloesbar (Next aliased es) -> stubben; „@/…" → src/….ts.
const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);

const { validateGuideSteps, validateInteraction, templateTitle, templateBodyText } = await import("../src/lib/guide.ts");
const { displayKeyDe, interactionChips, describeInteractionForAi } = await import("../src/lib/interaction-text.ts");
const { actionForInteraction } = await import("../src/lib/automations.ts");
// Welle 55: KI-Wächter + Abschluss-Bild-Ausnahme und die Wiedergabe-Seite (pures Modul).
const { keepsInteraction, isResultStep } = await import("../src/lib/guide-ai.ts");
const { createRequire } = await import("node:module");
const { parseInteraction } = createRequire(import.meta.url)("../extension/exec-plan.js");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const quotesPaired = (s) => (s.match(/„/g) || []).length === (s.match(/“/g) || []).length;

const base = { path: "acc/x.webp", rect: { x: 0, y: 0, w: 0.1, h: 0.1 }, url: "https://app.example/", title: "App", w: 100, h: 100 };
const step = (over) => validateGuideSteps([{ ...base, label: "Datei", action: "click", ...over }], "acc")[0];

// ── 1) Validierung ────────────────────────────────────────────────────────────
{
  ok(validateInteraction({ variant: "right" }, "click")?.variant === "right", "validate: right");
  ok(validateInteraction({ variant: "right" }, "type") === undefined, "validate: variant bei Eingabe verworfen");
  ok(validateInteraction({ variant: "key", key: "Ctrl+S" }, "click")?.key === "Ctrl+S", "validate: key");
  ok(validateInteraction({ variant: "drag" }, "click") === undefined, "validate: drag ohne drop verworfen");
  const d = validateInteraction({ variant: "drag", drop: { text: "Erledigt" }, dropLabel: "Erledigt" }, "click");
  ok(d?.drop?.text === "Erledigt" && d.dropLabel === "Erledigt", "validate: drag mit drop");
  ok(validateInteraction({ hover: { text: "Datei", shadow: ["x-app"] }, hoverLabel: "Datei" }, "click")?.hover?.shadow?.[0] === "x-app",
    "validate: hover inkl. shadow");
  ok(validateInteraction({ frame: { url: "file:///c:/x" } }, "click") === undefined, "validate: frame nur http(s)");
  ok(!("value" in (validateInteraction({ enter: true, value: "4711" }, "type") ?? {})), "validate: Feldwerte fallen weg");
}

// ── 2) Anleitungstexte ────────────────────────────────────────────────────────
{
  const r = step({ interaction: { variant: "right" } });
  ok(templateTitle(r, 0) === "Klicken Sie mit der rechten Maustaste auf „Datei“", `Titel Rechtsklick: ${templateTitle(r, 0)}`);
  ok(templateBodyText(r, r) === "Klicken Sie mit der rechten Maustaste auf „Datei“.", `Text Rechtsklick: ${templateBodyText(r, r)}`);

  const dbl = step({ label: "Bericht.pdf", interaction: { variant: "double" } });
  ok(templateTitle(dbl, 0) === "Doppelklicken Sie auf „Bericht.pdf“", `Titel Doppelklick: ${templateTitle(dbl, 0)}`);
  ok(templateBodyText(dbl, dbl) === "Doppelklicken Sie auf „Bericht.pdf“.", "Text Doppelklick");

  const drag = step({ label: "Aufgabe 1", interaction: { variant: "drag", drop: { text: "Erledigt" }, dropLabel: "Erledigt" } });
  ok(templateTitle(drag, 0) === "Ziehen Sie „Aufgabe 1“ auf „Erledigt“", `Titel Ziehen: ${templateTitle(drag, 0)}`);
  ok(templateBodyText(drag, drag) === "Ziehen Sie „Aufgabe 1“ mit gedrückter Maustaste auf „Erledigt“.", `Text Ziehen: ${templateBodyText(drag, drag)}`);

  const key = step({ label: "", interaction: { variant: "key", key: "Ctrl+S" } });
  ok(templateTitle(key, 3) === "Drücken Sie Strg+S", `Titel Kuerzel (ohne Label): ${templateTitle(key, 3)}`);
  ok(templateBodyText(key, key) === "Drücken Sie die Tastenkombination Strg+S.", `Text Kuerzel: ${templateBodyText(key, key)}`);
  const esc = step({ label: "", interaction: { variant: "key", key: "Escape" } });
  ok(templateBodyText(esc, esc) === "Drücken Sie die Taste Esc.", `Text Einzeltaste: ${templateBodyText(esc, esc)}`);

  const hov = step({ label: "Speichern unter", interaction: { hover: { text: "Datei" }, hoverLabel: "Datei" } });
  ok(templateBodyText(hov, hov) === "Fahren Sie mit der Maus über „Datei“ und klicken Sie dann auf „Speichern unter“.",
    `Text Hover: ${templateBodyText(hov, hov)}`);
  const ht = templateTitle(hov, 0);
  ok(ht.length <= 60 && quotesPaired(ht) && ht.includes("„Datei“") && ht.includes("„Speichern unter“"), `Titel Hover (≤60): ${ht}`);

  const hovRight = step({ label: "Umbenennen", interaction: { hover: { text: "Mehr" }, variant: "right" } });
  ok(templateBodyText(hovRight, hovRight) === "Fahren Sie zuerst mit der Maus über „Mehr“. Klicken Sie mit der rechten Maustaste auf „Umbenennen“.",
    `Text Hover + Rechtsklick: ${templateBodyText(hovRight, hovRight)}`);

  // Kontext-Praefix beim Seitenwechsel bleibt erhalten.
  const prev = { ...r, title: "Andere Seite" };
  ok(templateBodyText(r, prev).startsWith("Auf der Seite „App“: Klicken Sie mit der rechten Maustaste"), "Text: Seiten-Kontext vorangestellt");

  // TITLE_MAX + zitat-sicher: lange Labels.
  const long = "Quartalsbericht Finanzbuchhaltung Mandant Mustermann GmbH 2026";
  const lr = step({ label: long, interaction: { variant: "right" } });
  const lt = templateTitle(lr, 0);
  ok(lt.length <= 60 && quotesPaired(lt) && lt.startsWith("Rechtsklick auf „") && lt.endsWith("…“"), `Titel Rechtsklick lang → Kurzform: ${lt}`);
  const ld = step({ label: long, interaction: { variant: "drag", drop: { text: long }, dropLabel: long } });
  const ldt = templateTitle(ld, 0);
  ok(ldt.length <= 60 && quotesPaired(ldt) && ldt.startsWith("Ziehen Sie „"), `Titel Ziehen, zwei lange Labels: ${ldt}`);
  const lh = step({ label: long, interaction: { hover: { text: "Datei" }, hoverLabel: "Datei" } });
  const lht = templateTitle(lh, 0);
  ok(lht.length <= 60 && quotesPaired(lht) && lht.startsWith("Klicken Sie im Menü „Datei“ auf „"), `Titel Hover lang: ${lht}`);

  // Normaler Klick: Titel wie bisher, Text LEER (Welle 54 — der Titel sagt schon alles).
  const plain = step({});
  ok(templateTitle(plain, 0) === "Klicken Sie auf „Datei“" && templateBodyText(plain, plain) === "",
    "Normaler Klick: Titel unveraendert, kein Fuelltext");
  const typed = step({ action: "type", label: "Suche", interaction: { enter: true } });
  ok(templateBodyText(typed, typed) === "Tragen Sie hier „Suche“ ein und bestätigen Sie mit Enter.", "Bestand: Eingabe + Enter unveraendert");
}

// ── 3) Tastenanzeige, Chips, KI-Hinweis, Aktions-Ableitung ──────────────────────────
{
  ok(displayKeyDe("Ctrl+Shift+s") === "Strg+Umschalt+S", `displayKeyDe: ${displayKeyDe("Ctrl+Shift+s")}`);
  ok(displayKeyDe("Meta+Enter") === "Cmd+Enter" && displayKeyDe("Delete") === "Entf" && displayKeyDe("Ctrl++") === "Strg++",
    "displayKeyDe: Cmd/Entf/Plus-Taste");
  ok(JSON.stringify(interactionChips({ enter: true })) === JSON.stringify(["↵ Enter"]), "Chip: ↵ Enter");
  ok(JSON.stringify(interactionChips({ hover: { text: "Datei" }, hoverLabel: "Datei", variant: "right", frame: { url: "https://x.example/f" } })) ===
    JSON.stringify(["Menü: Datei", "Rechtsklick", "im Rahmen"]), "Chips: Menü + Rechtsklick + im Rahmen (Ablauf-Reihenfolge)");
  ok(interactionChips({ variant: "key", key: "Ctrl+S" })[0] === "Strg+S" && interactionChips(null).length === 0, "Chip: Strg+S / leer bei null");
  const ai = describeInteractionForAi({ variant: "drag", drop: { text: "Erledigt" } });
  ok(!!ai && ai.includes("ZIEHEN") && ai.includes("„Erledigt“"), `KI-Hinweis Ziehen: ${ai}`);
  ok(describeInteractionForAi(null) === null && describeInteractionForAi({}) === null, "KI-Hinweis: nichts Besonderes → null");
  ok(actionForInteraction({ enter: true }) === "fill", "Umwandlung: Eingabe+Enter → fill (auch bei role=combobox wie Google)");
  ok(actionForInteraction({ variant: "double" }) === "click" && actionForInteraction({ variant: "key", key: "Ctrl+S" }) === "click",
    "Umwandlung: Klick-Varianten → click");
  ok(actionForInteraction({ hover: { text: "x" } }) === null && actionForInteraction(null) === null, "Umwandlung: sonst Rolle entscheidet");
}

// ── 4) Welle 55: Zusatztasten, Seitenwechsel, markierte Stelle, Abschluss-Bild ──────
{
  // (a) Validierung: nur bekannte Namen, ohne Dubletten, feste Reihenfolge ctrl→meta→alt→shift.
  const m = validateInteraction({ modifiers: ["shift", "ctrl", "ctrl", "windows"] }, "click");
  ok(JSON.stringify(m?.modifiers) === JSON.stringify(["ctrl", "shift"]), `validate: modifiers ${JSON.stringify(m?.modifiers)}`);
  ok(validateInteraction({ modifiers: ["ctrl"] }, "type") === undefined, "validate: modifiers nur beim Klick");
  ok(validateInteraction({ modifiers: ["strg"] }, "click") === undefined, "validate: unbekannte Zusatztaste verworfen");
  ok(validateInteraction({ variant: "nav", nav: "back" }, "click")?.nav === "back", "validate: nav back");
  ok(validateInteraction({ variant: "nav", nav: "seitwaerts" }, "click") === undefined, "validate: unbekannte nav-Art verworfen");
  ok(validateInteraction({ variant: "nav" }, "click") === undefined, "validate: nav ohne Art verworfen");
  ok(validateInteraction({ variant: "spot" }, "click")?.variant === "spot", "validate: spot");
  ok(validateInteraction({ variant: "result" }, "click")?.variant === "result", "validate: result");

  // (b) Titel + Text: Zusatztasten.
  const ctrl = step({ label: "Beleg 3", interaction: { modifiers: ["ctrl"] } });
  ok(templateTitle(ctrl, 0) === "Mit gedrückter Strg-Taste auf „Beleg 3“ klicken", `Titel Strg+Klick: ${templateTitle(ctrl, 0)}`);
  ok(/Halten Sie die Strg-Taste gedrückt/.test(templateBodyText(ctrl, ctrl)), `Text Strg+Klick: ${templateBodyText(ctrl, ctrl)}`);
  const both = step({ label: "Beleg 4", interaction: { modifiers: ["ctrl", "shift"] } });
  ok(templateTitle(both, 0) === "Mit gedrückten Strg+Umschalt-Tasten auf „Beleg 4“ klicken", `Titel Strg+Umschalt: ${templateTitle(both, 0)}`);
  const dblMod = step({ label: "Zelle", interaction: { variant: "double", modifiers: ["shift"] } });
  ok(/Doppelklicken/.test(templateTitle(dblMod, 0)) && /Umschalt-Taste gedrückt/.test(templateBodyText(dblMod, dblMod)),
    `Doppelklick + Umschalt: ${templateBodyText(dblMod, dblMod)}`);

  // (c) Titel + Text: Seitenwechsel ohne Klick (kein Label, kein Selektor).
  const back = step({ label: "", title: "Belege", interaction: { variant: "nav", nav: "back" } });
  ok(templateTitle(back, 3) === "Zur vorigen Seite zurückgehen", `Titel zurück: ${templateTitle(back, 3)}`);
  ok(templateBodyText(back, null) === "Gehen Sie mit dem Zurück-Knopf des Browsers zur vorigen Seite.",
    `Text zurück: ${templateBodyText(back, null)}`);
  const reload = step({ label: "", title: "Belege", interaction: { variant: "nav", nav: "reload" } });
  ok(templateTitle(reload, 3) === "Seite neu laden", `Titel neu laden: ${templateTitle(reload, 3)}`);
  const goto = step({ label: "", title: "Übersicht", interaction: { variant: "nav", nav: "goto" } });
  ok(templateTitle(goto, 3) === "Weiter zu „Übersicht“", `Titel weiter: ${templateTitle(goto, 3)}`);
  ok(!/Auf der Seite/.test(templateBodyText(goto, null)), `Text weiter ohne doppelten Vorspann: ${templateBodyText(goto, null)}`);

  // (d) Titel + Text: markierte Stelle (Canvas / geschlossenes Shadow DOM) + Abschluss-Bild.
  const spot = step({ label: "", interaction: { variant: "spot" } });
  ok(templateTitle(spot, 7) === "Auf die markierte Stelle klicken", `Titel spot: ${templateTitle(spot, 7)}`);
  ok(templateBodyText(spot, spot) === "Klicken Sie auf die markierte Stelle im Bild.", `Text spot: ${templateBodyText(spot, spot)}`);
  const spotL = step({ label: "Zeichenfläche", interaction: { variant: "spot" } });
  ok(templateTitle(spotL, 7) === "In „Zeichenfläche“ auf die markierte Stelle klicken", `Titel spot mit Label: ${templateTitle(spotL, 7)}`);
  const res = step({ label: "", interaction: { variant: "result" } });
  ok(templateTitle(res, 9) === "Ergebnis", `Titel Abschluss-Bild: ${templateTitle(res, 9)}`);
  ok(templateBodyText(res, res) === "So sieht das Ergebnis am Ende aus.", `Text Abschluss-Bild: ${templateBodyText(res, res)}`);
  for (const st of [ctrl, both, back, reload, goto, spot, spotL, res]) {
    ok(templateTitle(st, 0).length <= 60 && quotesPaired(templateTitle(st, 0)), "Titel-Grenzen eingehalten: " + templateTitle(st, 0));
  }

  // (e) Chips + KI-Hinweis: die KI darf die neuen Arten nicht wegformulieren.
  ok(interactionChips({ modifiers: ["ctrl"] })[0] === "Strg+Klick", "Chip: Strg+Klick");
  ok(interactionChips({ variant: "nav", nav: "reload" })[0] === "Neu laden", "Chip: Neu laden");
  ok(interactionChips({ variant: "result" })[0] === "Abschluss-Bild", "Chip: Abschluss-Bild");
  ok(/Strg/.test(describeInteractionForAi({ modifiers: ["ctrl"] }) ?? ""), "KI-Hinweis: Zusatztaste genannt");
  ok(/SEITENWECHSEL/.test(describeInteractionForAi({ variant: "nav", nav: "back" }) ?? ""), "KI-Hinweis: Seitenwechsel genannt");
  ok(/MARKIERTE STELLE/.test(describeInteractionForAi({ variant: "spot" }) ?? ""), "KI-Hinweis: markierte Stelle genannt");
  ok(/ABSCHLUSS-BILD/.test(describeInteractionForAi({ variant: "result" }) ?? ""), "KI-Hinweis: Abschluss-Bild genannt");

  // (f) KI-Wächter: eine Antwort, die die Besonderheit verliert, wird verworfen.
  ok(keepsInteraction("Klicken Sie auf „Beleg 3“", { modifiers: ["ctrl"] }) === false, "KI-Wächter: Strg darf nicht verschwinden");
  ok(keepsInteraction("Mit gedrückter Strg-Taste auf „Beleg 3“ klicken", { modifiers: ["ctrl"] }) === true, "KI-Wächter: mit Strg in Ordnung");
  ok(keepsInteraction("Klicken Sie auf „Weiter“", { variant: "nav", nav: "reload" }) === false, "KI-Wächter: Neuladen darf kein Klick werden");
  ok(keepsInteraction("Laden Sie die Seite neu.", { variant: "nav", nav: "reload" }) === true, "KI-Wächter: Neuladen erhalten");
  ok(keepsInteraction("Klicken Sie auf den Knopf", { variant: "spot" }) === false, "KI-Wächter: markierte Stelle darf nicht verschwinden");
  ok(isResultStep({ interaction: { variant: "result" } }) === true && isResultStep({ interaction: null }) === false,
    "Abschluss-Bild: vom KI-Feinschliff ausgenommen");

  // (g) Automation: Schritte ohne Selektor sind nicht automatisierbar (nur Kürzel sind Ausnahme).
  ok(actionForInteraction({ variant: "nav", nav: "back" }) === "click", "Umwandlung: nav bleibt formal ein Klick (fliegt ohne Selektor raus)");

  // (h) Wiedergabe-Seite: exec-plan reicht die neuen Felder durch.
  const pi = parseInteraction({ modifiers: ["shift", "ctrl", "unsinn"], variant: "nav", nav: "goto" }, "click");
  ok(JSON.stringify(pi?.modifiers) === JSON.stringify(["ctrl", "shift"]) && pi?.nav === "goto",
    `exec-plan parseInteraction: ${JSON.stringify(pi)}`);
  ok(parseInteraction({ variant: "nav", nav: "quer" }, "click") === null, "exec-plan: unbekannte nav-Art verworfen");
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Erweiterte Interaktion: Validierung + Texte + Chips verifiziert.");
process.exit(failed ? 1 : 0);

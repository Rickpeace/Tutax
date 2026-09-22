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

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Erweiterte Interaktion: Validierung + Texte + Chips verifiziert.");
process.exit(failed ? 1 : 0);

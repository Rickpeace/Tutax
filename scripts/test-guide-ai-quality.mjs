// KI-Feinschliff der Schritt-Texte (09/2026): Qualität + Datenschutz + harte Prüfung.
// KEINE Datenbank-Zugriffe. Teil A läuft offline (Prompt-Bau, Platzhalter, Prüf-Regeln mit
// gestubbter KI), Teil B LIVE gegen OpenAI mit Richards echter x.com-Aufnahme (8 Schritte) und
// druckt Vorher/Nachher.
//
// Nutzung:  node scripts/test-guide-ai-quality.mjs          (Teil B braucht OPENAI_API_KEY in .env.local)
//           node scripts/test-guide-ai-quality.mjs --offline
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";

const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);

// .env.local laden (nur Werte setzen, nie ausgeben) — VOR dem Import von lib/ai.ts.
const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const { validateGuideSteps, templateTitle, labelHead } = await import("../src/lib/guide.ts");
const { buildRefineRequest, suggestStepTexts, refineStepFromGuide, refineContextFromGuide, quotesBalanced } =
  await import("../src/lib/guide-ai.ts");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ── Richards x.com-Aufnahme (Labels wörtlich aus der echten Anleitung) ─────────────────────
const base = { path: "acc/x.webp", rect: { x: 0.1, y: 0.1, w: 0.1, h: 0.05 }, w: 1280, h: 800 };
const RAW = [
  { label: "Home (New unread posts)", action: "click", url: "https://x.com/home", title: "Home / X", selector: { role: "link", text: "Home" } },
  { label: "Account menu", action: "click", url: "https://x.com/home", title: "Home / X", selector: { role: "button" } },
  { label: "More menu items", action: "click", url: "https://x.com/home", title: "Home / X", selector: { role: "button" } },
  { label: "Settings and privacy", action: "click", url: "https://x.com/home", title: "Home / X", selector: { role: "menuitem" } },
  {
    label: "Search query",
    action: "type",
    typed_value: "account",
    interaction: { enter: true },
    url: "https://x.com/settings",
    title: "Settings / X",
    selector: { role: "textbox", css: "input[data-testid=\"settingsSearchBox\"]" },
  },
  {
    label: "Account information See your account information like your phone number and email address.",
    action: "click",
    url: "https://x.com/settings/account",
    title: "Your account / X",
    selector: { role: "link" },
  },
  { label: "Password", action: "type", url: "https://x.com/settings/your_twitter_data/account", title: "Account information / X", selector: { role: "textbox", css: "input[name=\"password\"]" } },
  { label: "Confirm", action: "click", url: "https://x.com/settings/your_twitter_data/account", title: "Account information / X", selector: { role: "button" } },
].map((s) => ({ ...base, ...s }));
const VALUE = "account";

const steps = validateGuideSteps(RAW, "acc");
const input = steps.map((_s, i) => refineStepFromGuide(steps, i));
const ctx = refineContextFromGuide("Anleitung vom 22.09.2026", steps);

// ── A) OFFLINE: Prompt, Platzhalter, Prüf-Regeln ───────────────────────────────────────────
{
  const req = buildRefineRequest(ctx, input);
  const prompt = req.messages.map((m) => m.content).join("\n");
  const userMsg = req.messages[req.messages.length - 1].content;
  ok(!/(?<![\p{L}\p{N}])account(?![\p{L}\p{N}])/u.test(userMsg), "Datenschutz: eingetippter Wert „account“ steht NICHT im Prompt");
  ok(userMsg.includes("{{WERT}}"), "Prompt trägt stattdessen den Platzhalter {{WERT}}");
  ok(!prompt.includes("Anleitung vom"), "Datums-Standardtitel wird nicht als Anleitungstitel gesendet");
  ok(userMsg.includes("x.com"), "Kontext: Domain x.com im Prompt");
  ok(/Enter/i.test(userMsg), "Interaktion (Enter) im Prompt");
  ok(userMsg.includes("Passwortfeld"), "Passwortfeld gekennzeichnet");
  ok(templateTitle(steps[6], 6) === "Passwort eingeben", `Vorlage Passwortfeld: ${templateTitle(steps[6], 6)}`);
  ok(templateTitle(steps[0], 0) === "Klicken Sie auf „Home“", `Vorlage kürzt Klammer-Anhängsel: ${templateTitle(steps[0], 0)}`);
  ok(templateTitle(steps[5], 5) === "Klicken Sie auf „Account information“", `Vorlage kürzt Kartentext: ${templateTitle(steps[5], 5)}`);
  ok(labelHead("Rechnungen und Belege für den Monat September anzeigen") === "Rechnungen und Belege für den Monat September anzeigen",
    "labelHead: deutscher Satz ohne Überschrift bleibt ganz");
  ok(quotesBalanced("Klicken Sie auf „A“ und „B“.") && !quotesBalanced("Klicken Sie auf „A") && !quotesBalanced("„A „B““") && !quotesBalanced('Klicken Sie auf "A"'),
    "quotesBalanced erkennt paarig/unpaarig/verschachtelt/gerade");

  // Gestubbte KI: gute und schlechte Antworten je Schritt.
  const fake = {
    steps: [
      { n: 1, title: "Startseite öffnen", body: "Klicken Sie auf „Home“." }, // gut
      { n: 2, title: "Kontomenü öffnen", body: "Klicken Sie auf „Kontomenü“." }, // übersetztes Label → verworfen
      { n: 3, title: "Weitere Optionen anzeigen", body: "Klicken Sie auf „More menu items." }, // unpaarig → verworfen
      { n: 4, title: "Einstellungen öffnen", body: "Klicken Sie links in der Leiste auf „Settings and privacy“." }, // (Ortsangabe: Prompt-Regel, nicht prüfbar) ok
      { n: 5, title: "Nach „{{WERT}}“ suchen", body: "Geben Sie den Suchbegriff in „Search query“ ein." }, // Enter fehlt → verworfen
      { n: 6, title: "Kontoinformationen öffnen", body: "Klicken Sie auf „Account information“." }, // gut
      { n: 7, title: "Irgendwas", body: "Geben Sie Ihr Passwort in das Feld „Password“ ein." }, // Titel wird fest „Passwort eingeben“
      { n: 8, title: "Bestätigen", body: "" }, // Label fehlt → verworfen
    ],
  };
  const create = async () => ({ choices: [{ message: { content: JSON.stringify(fake) } }] });
  const { results } = await suggestStepTexts(ctx, input, { create });
  ok(results[0]?.title === "Startseite öffnen" && results[0]?.body === "Klicken Sie auf „Home“.", "Stub 1: gute Antwort übernommen");
  ok(results[1] === null, "Stub 2: übersetztes Label („Kontomenü“ statt „Account menu“) verworfen");
  ok(results[2] === null, "Stub 3: unpaariges Zitat verworfen");
  ok(results[4] === null, "Stub 5: fehlendes Enter verworfen");
  ok(results[5]?.body === "Klicken Sie auf „Account information“.", "Stub 6: Anfang des Kartentexts als Zitat erlaubt");
  ok(results[6]?.title === "Passwort eingeben", "Stub 7: Passwortfeld-Titel fest");
  ok(results[7] === null, "Stub 8: Label fehlt → verworfen");

  const fake5 = { steps: [{ n: 5, title: "Nach „{{WERT}}“ suchen", body: "Geben Sie den Begriff in „Search query“ ein und drücken Sie Enter." }] };
  const r5 = await suggestStepTexts(ctx, input, { create: async () => ({ choices: [{ message: { content: JSON.stringify(fake5) } }] }) });
  ok(r5.results[4]?.title === `Nach „${VALUE}“ suchen`, `Stub 5b: Platzhalter korrekt zurückgesetzt: ${r5.results[4]?.title}`);
  const fake5c = { steps: [{ n: 5, title: "Suchbegriff eingeben", body: "Geben Sie den Begriff in „Search query“ ein und drücken Sie Enter." }] };
  const r5c = await suggestStepTexts(ctx, input, { create: async () => ({ choices: [{ message: { content: JSON.stringify(fake5c) } }] }) });
  ok(r5c.results[4] === null, "Stub 5c: Wert-Platzhalter fehlt → verworfen (Fakt wäre verloren)");
  const fake5d = { steps: [{ n: 5, title: "Nach „{{WERT3}}“ suchen", body: "Geben Sie „{{WERT3}}“ in „Search query“ ein und drücken Sie Enter." }] };
  const r5d = await suggestStepTexts(ctx, input, { create: async () => ({ choices: [{ message: { content: JSON.stringify(fake5d) } }] }) });
  ok(r5d.results[4] === null, "Stub 5d: unbekannter Platzhalter → verworfen");
  const broken = await suggestStepTexts(ctx, input, { create: async () => { throw new Error("offline"); } });
  ok(broken.results.every((r) => r === null) && broken.failed === 1, "KI-Fehler → alles bleibt (ausfallsicher)");
}

// ── B) LIVE gegen OpenAI ───────────────────────────────────────────────────────────────────
if (process.argv.includes("--offline")) {
  console.log("\n(Teil B übersprungen: --offline)");
} else if (!process.env.OPENAI_API_KEY) {
  ok(false, "OPENAI_API_KEY fehlt – Live-Teil nicht möglich");
} else {
  const t0 = Date.now();
  let calls = 0;
  const { openai } = await import("../src/lib/openai.ts");
  const create = (args) => {
    calls += 1;
    ok(!/(?<![\p{L}\p{N}])account(?![\p{L}\p{N}])/u.test(args.messages[args.messages.length - 1].content), "Live-Prompt ohne eingetippten Wert");
    return openai().chat.completions.create(args);
  };
  const { results, failed: f } = await suggestStepTexts(ctx, input, { create });
  console.log(`\nLive: ${calls} Call(s), ${Date.now() - t0} ms, Fehler: ${f}\n`);
  console.log("VORHER → NACHHER");
  const finals = input.map((s, i) => {
    const r = results[i];
    const fin = r ? { title: r.title, body: r.body ?? s.bodyText } : { title: s.title, body: s.bodyText };
    console.log(` ${i + 1}. ${s.title}${s.bodyText ? ` — ${s.bodyText}` : ""}`);
    console.log(`    → ${fin.title}${fin.body ? ` — ${fin.body}` : ""}${r ? "" : "   [Vorlage behalten]"}`);
    return fin;
  });
  console.log("");
  const improved = results.filter(Boolean).length;
  ok(improved >= 7, `mind. 7 von 8 Schritten verbessert (${improved})`);
  finals.forEach((fin, i) => {
    const all = `${fin.title} ${fin.body}`;
    ok(!/^„[^“]*“\s*anklicken$/.test(fin.title) && !/^Klicken Sie/.test(fin.title), `S${i + 1}: Titel ohne „„…“ anklicken“/„Klicken Sie“: ${fin.title}`);
    ok(fin.title.length <= 60, `S${i + 1}: Titel kurz (${fin.title.length})`);
    ok(quotesBalanced(fin.title) && quotesBalanced(fin.body) && !/…“/.test(all), `S${i + 1}: Zitate paarig, nicht abgeschnitten`);
    ok(!all.includes("{{"), `S${i + 1}: kein Platzhalter-Rest`);
    const head = labelHead(steps[i].label);
    if (head.length <= 30) ok(all.includes(`„${head}“`), `S${i + 1}: Label wörtlich zitiert („${head}“)`);
  });
  ok(finals[4].title.includes(VALUE) || finals[4].body.includes(VALUE), `S5: Wert „${VALUE}“ zurückgesetzt`);
  ok(/Enter/i.test(`${finals[4].title} ${finals[4].body}`), "S5: Enter bleibt erhalten");
  ok(finals[6].title === "Passwort eingeben" && !finals[6].body.includes(VALUE), "S7: Passwortfeld ohne Wert, Titel „Passwort eingeben“");
  ok(!/links|rechts|oben|unten|Leiste/i.test(finals.map((f) => f.body).join(" ")), "Keine erfundenen Ortsangaben");
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ KI-Feinschliff: Qualität + Datenschutz verifiziert.");
process.exit(failed ? 1 : 0);

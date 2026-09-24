// Regressionstest Hilfe-Seite (Audit 24.09.2026) — reine Logik, kein Server, keine DB.
// Prüft die Farb-Ableitung aus lib/theme.ts für helle UND dunkle Kunden-Designs
// (Papier, Textstufen, Text auf Akzent, Druck), Schriftnamen mit Ziffern, „eigene Farben“
// (bunte Kategorien) und die Bot-Erkennung der Aufruf-Zählung.
//
// Nutzung:  node --no-warnings scripts/test-hub-contrast.mjs   (Node ≥ 22.18, lädt .ts direkt)
import {
  brandStyle,
  contrastRatio,
  cssFontFamily,
  brandFonts,
  hasCustomColors,
  weakTextContrast,
} from "../src/lib/theme.ts";
import { isBotUserAgent } from "../src/app/h/bot-ua.ts";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const hex = (h) => {
  const x = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
const toHex = (rgb) => "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
/** CSS-Wert → deckende Farbe auf `under` (versteht #hex und color-mix(in srgb, #hex N%, transparent)). */
function flatten(value, under) {
  const m = /color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, transparent\)/i.exec(value);
  if (!m) return value;
  const a = Number(m[2]) / 100;
  const c = hex(m[1]);
  const u = hex(under);
  return toHex(c.map((v, i) => v * a + u[i] * (1 - a)));
}
const cr = (a, b) => contrastRatio(a, b) ?? 0;

// 1) Steply-Standard ohne Tokens: Papier weiß, keine Überschreibungen der Textstufen.
{
  const s = brandStyle(null);
  ok(s["--brand-paper"] === "#ffffff", "Standard: Papier bleibt Weiß");
  ok(s["--muted-foreground"] === undefined && s["--ink"] === undefined, "Standard: Textstufen unverändert (globals.css)");
  ok(s["--brand-accent-fg"] === "#ffffff", "Standard: Koralle-Knopf behält weiße Schrift");
}

// 2) Dunkles Kunden-Design (Repro aus dem Audit).
const dark = { background: "#161616", text: "#f2f2f2", surface: "#2a2a2a", primary: "#ff7a00" };
{
  const s = brandStyle({ colors: dark });
  const paper = s["--brand-paper"];
  ok(paper !== "#ffffff", `Dunkel: Papier nicht mehr Weiß (${paper})`);
  ok(cr(dark.text, paper) >= 4.5, `Dunkel: Text auf Papier lesbar (${cr(dark.text, paper).toFixed(1)} : 1)`);
  ok(s["--brand-card-bg"] === paper, "Dunkel: Karten liegen auf dem Papier");
  const mutedOnPaper = flatten(s["--muted-foreground"], paper);
  const mutedOnBg = flatten(s["--muted-foreground"], dark.background);
  ok(cr(mutedOnPaper, paper) >= 4.5, `Dunkel: gedämpfter Text auf Papier (${cr(mutedOnPaper, paper).toFixed(1)} : 1)`);
  ok(cr(mutedOnBg, dark.background) >= 4.5, `Dunkel: gedämpfter Text auf Hintergrund (${cr(mutedOnBg, dark.background).toFixed(1)} : 1)`);
  const ink2 = flatten(s["--ink-2"], dark.background);
  ok(cr(ink2, dark.background) >= 4.5, `Dunkel: Chat-Bot-Text (ink-2) auf Hintergrund (${cr(ink2, dark.background).toFixed(1)} : 1)`);
  ok(cr(s["--brand-accent-strong"], paper) >= 3, `Dunkel: Akzent als Text auf Papier (${cr(s["--brand-accent-strong"], paper).toFixed(1)} : 1)`);
  ok(cr(s["--brand-accent-fg"], dark.primary) >= 4.5, `Dunkel: Knopfschrift auf Orange (${cr(s["--brand-accent-fg"], dark.primary).toFixed(1)} : 1)`);
  ok(!/16,21,36/.test(s["--brand-card-border"]), "Dunkel: Kartenrand hell statt dunkel-auf-dunkel");
}

// 3) Dunkles Design ohne passende Flächenfarbe → aufgehellter Hintergrund.
{
  const s = brandStyle({ colors: { background: "#101010", text: "#eeeeee" } });
  ok(cr("#eeeeee", s["--brand-paper"]) >= 4.5, `Dunkel ohne Flächenfarbe: Papier lesbar (${s["--brand-paper"]})`);
}

// 4) Helles Kunden-Design: Papier weiß, gedämpfter Text ≥ 4,5.
const light = { background: "#fdf3ec", text: "#33291f", surface: "#ffe8e2", primary: "#1f6feb" };
{
  const s = brandStyle({ colors: light });
  ok(s["--brand-paper"] === "#ffffff", "Hell: Papier bleibt Weiß");
  const m = flatten(s["--muted-foreground"], light.background);
  ok(cr(m, light.background) >= 4.5, `Hell: gedämpfter Text auf Hintergrund (${cr(m, light.background).toFixed(1)} : 1)`);
  const mw = flatten(s["--muted-foreground"], "#ffffff");
  ok(cr(mw, "#ffffff") >= 4.5, `Hell: gedämpfter Text auf Weiß (${cr(mw, "#ffffff").toFixed(1)} : 1)`);
}

// 5) Helle Akzentfarbe: dunkle Schrift auf dem Knopf.
{
  const s = brandStyle({ colors: { primary: "#ffe14d" } });
  ok(s["--brand-accent-fg"] !== "#ffffff", "Gelber Akzent: Knopfschrift nicht weiß");
  ok(cr(s["--brand-accent-fg"], "#ffe14d") >= 4.5, `Gelber Akzent: Knopfschrift lesbar (${cr(s["--brand-accent-fg"], "#ffe14d").toFixed(1)} : 1)`);
  ok(cr(s["--brand-accent-strong"], "#ffffff") >= 2.5, "Gelber Akzent: als Text auf Weiß abgedunkelt");
}

// 6) Druckansicht (immer weißes Papier) mit dunklem Design: Text auf Weiß lesbar.
{
  const s = brandStyle({ colors: dark }, { onWhite: true });
  ok(cr(s["--brand-ink"], "#ffffff") >= 4.5, `Druck: Textfarbe auf Weiß lesbar (${s["--brand-ink"]})`);
  ok(s["--brand-paper"] === "#ffffff", "Druck: Papier Weiß");
  const m = flatten(s["--muted-foreground"], "#ffffff");
  ok(cr(m, "#ffffff") >= 4.5, "Druck: gedämpfter Text auf Weiß lesbar");
}

// 7) Schriften mit Ziffer im Namen.
ok(cssFontFamily("Source Sans 3, sans-serif") === '"Source Sans 3", sans-serif', "Schrift: „Source Sans 3“ in Anführungszeichen");
ok(cssFontFamily("'Inter'") === '"Inter"', "Schrift: vorhandene Anführungszeichen vereinheitlicht");
ok(brandFonts({ typography: { headingFont: "Source Sans 3" } }).heading === '"Source Sans 3"', "brandFonts quotet");
ok(brandStyle({ typography: { bodyFont: "Source Sans 3" } })["--brand-font"] === '"Source Sans 3"', "brandStyle quotet --brand-font");
ok(brandFonts({ typography: { bodyFont: "Inter;background:url(x)" } }).body === undefined, "Schrift: unsichere Werte weiter verworfen");

// 8) Eigene Farben → keine bunten Kategorien.
ok(!hasCustomColors(null), "Ohne Tokens: Steply-Standard (bunt)");
ok(!hasCustomColors({ colors: { primary: "#EF6A4E" } }), "Standard-Farben gespeichert: weiter bunt");
ok(hasCustomColors({ colors: { primary: "#1f6feb" } }), "Eigene Akzentfarbe: monochrom");

// 9) Kontrast-Hinweis im Formular.
ok(weakTextContrast({ background: "#161616", text: "#2a2a2a" }) != null, "Hinweis bei dunklem Text auf dunklem Grund");
ok(weakTextContrast(dark) == null && weakTextContrast(light) == null, "Kein Hinweis bei lesbaren Designs");

// 10) Bot-Erkennung der Aufruf-Zählung.
const bots = [
  "WhatsApp/2.23.20.0 A",
  "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Twitterbot/1.0",
  "TelegramBot (like TwitterBot)",
  "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
  "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
  "curl/8.4.0",
  "Wget/1.21",
  "",
];
const humans = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/128.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15 Edg/128.0",
];
for (const ua of bots) ok(isBotUserAgent(ua), `Bot erkannt: ${ua.slice(0, 50) || "(leer)"}`);
for (const ua of humans) ok(!isBotUserAgent(ua), `Mensch zählt: ${ua.slice(0, 70)}`);

console.log(failed ? "\nFEHLER" : "\nAlle Prüfungen bestanden");
process.exit(failed ? 1 : 0);

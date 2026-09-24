// Design-Werte der öffentlichen Hilfe-Seite (Sicherheitsprüfung 23.09.2026) — ohne DB/Netz.
// themes.tokens / extreme_css sind per REST beschreibbar und landen im Server-HTML:
//   - brandStyle: nur echte Farben/Schriftnamen als CSS-Variablen
//   - brandFonts: Schrift als Inline-Style (React übernimmt „;“ unverändert ins HTML!)
//   - sanitizeSkinCss: kein „</style>“, keine externen url()
// Gleichzeitig dürfen legitime KI-/Formular-Werte NICHT verworfen werden.
//
// Nutzung:  node scripts/test-theme-tokens.mjs
import { brandStyle, brandFonts } from "../src/lib/theme.ts";
import { sanitizeSkinCss } from "../src/lib/skin-css.ts";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// Legitime Werte (Formular = Hex, KI = Hex/rgba/hsl, Schrift-Stapel mit Anführungszeichen).
const legit = {
  colors: { primary: "#ef6a4e", background: "rgba(253, 243, 236, 0.9)", surface: "hsl(12 90% 95% / 0.8)", text: "oklch(0.3 0.02 60)" },
  typography: { bodyFont: '"Inter", system-ui, sans-serif', headingFont: "'Playfair Display', serif", headingWeight: 800 },
  shape: { radius: 12 },
};
const s = brandStyle(legit);
ok(s["--brand-accent"] === "#ef6a4e", "Hex-Farbe bleibt");
ok(s["--brand-bg"] === "rgba(253, 243, 236, 0.9)", "rgba(…) mit Leerzeichen bleibt");
ok(s["--brand-soft"] === "hsl(12 90% 95% / 0.8)", "hsl(… / …) bleibt");
ok(s["--brand-ink"] === "oklch(0.3 0.02 60)", "oklch(…) bleibt");
ok(s["--brand-font"] === '"Inter", system-ui, sans-serif', "Schrift-Stapel mit Anführungszeichen bleibt");
ok(s["--brand-heading-weight"] === "800", "Schriftstärke (Zahl) bleibt");
const f = brandFonts(legit);
// cssFontFamily vereinheitlicht die Anführungszeichen (Audit 24.09.) — inhaltlich unverändert.
ok(f.body === '"Inter", system-ui, sans-serif' && f.heading === '"Playfair Display", serif', "brandFonts: legitime Schriften bleiben");

// Angriffe: url()/Semikolon in Farben und Schriften.
const evil = {
  colors: { primary: "red;background:url(https://tracker.example/p.gif)", background: "url(https://tracker.example/a.gif)" },
  typography: { bodyFont: "Inter;background-image:url(https://tracker.example/p.gif)", headingFont: "x)}</style><script>alert(1)</script>" },
};
const e = brandStyle(evil);
ok(!JSON.stringify(e).includes("tracker.example") && !JSON.stringify(e).includes("<"), "brandStyle: url()/HTML verworfen");
const ef = brandFonts(evil);
ok(ef.body === undefined && ef.heading === undefined, "brandFonts: Deklarations-Einschleusung verworfen (Standardschrift)");

// Skin-CSS: echte KI-Ausgabe bleibt, Ausbruch aus <style> und externe URLs nicht.
const skin = sanitizeSkinCss(
  '[data-tx="card"]:hover { border-left: 4px solid #ef6a4e; box-shadow: 0 6px 20px rgba(0,0,0,.08); }\n' +
    '[data-tx="header"] { background: url(https://tracker.example/bg.png); font-family: "Archivo", sans-serif; }\n' +
    '[data-tx="title"] { color: #111 } </style><script>alert(1)</script>',
);
ok(skin.includes('.tutax-skin [data-tx="card"]:hover') && skin.includes("border-left: 4px solid #ef6a4e"), "Skin: Hook-Selektor + Deko bleiben");
ok(skin.includes('font-family: "Archivo", sans-serif'), "Skin: Schrift mit Anführungszeichen bleibt");
ok(!skin.includes("tracker.example"), "Skin: externe url() entfernt");
ok(!skin.includes("<"), "Skin: kein „<“ (kein </style>-Ausbruch)");

if (failed) {
  console.log("\n✗ Design-Werte: Fehler");
  process.exit(1);
}
console.log("\n✓ Design-Werte: alle Prüfungen grün");

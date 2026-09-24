// Audit 24.09. — Sicherheitsnetz in guide-complete: sensible WERTE (IBAN, Steuernummer, Steuer-ID,
// SV-/KV-Nummer, Kreditkarte) fliegen aus typed_value/Beschriftung, das Feld bekommt einen
// Verpixelungsvorschlag. OHNE Datenbank/Netz (lädt src/lib/recorder.ts direkt).
//
// Nutzung:  node scripts/test-recorder-sensitive.mjs
import { register } from "node:module";

const srcBase = JSON.stringify(new URL("../src/", import.meta.url).href);
const loader = `export async function resolve(s,c,n){if(s==='server-only'||s==='client-only'){return {url:'data:text/javascript,',shortCircuit:true};}if(s.startsWith('@/')){return n(new URL(s.slice(2)+'.ts',${srcBase}).href,c);}if(s==='next/server'){return n('next/server.js',c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);

const { looksSensitiveValue, scrubSensitiveGuideSteps } = await import("../src/lib/recorder.ts");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ── Wert-Muster ──────────────────────────────────────────────────────────────
for (const v of [
  "143/815/08154",
  "12/345/67890",
  "9181/815/08155",
  "2181081508155",
  "12345678901",
  "12 345 678 901",
  "65 170839 J 003",
  "A123456789",
  "DE89 3704 0044 0532 0130 00",
  "DE89370400440532013000",
  "4111 1111 1111 1111",
  "Kunde DE89 3704 0044 0532 0130 00 ist neu",
]) {
  ok(looksSensitiveValue(v) === true, `sensibel: ${v}`);
}
for (const v of ["account", "0170 1234567", "24.09.2026", "4711", "123456789012", "DE89 3704 0044 0532 0130 01", "Mandant Müller", ""]) {
  ok(looksSensitiveValue(v) === false, `harmlos: ${JSON.stringify(v)}`);
}

// ── Schritte bereinigen ──────────────────────────────────────────────────────
{
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.05 };
  const steps = [
    { label: "Nummer", action: "type", rect, typed_value: "143/815/08154" },
    { label: "Suche", action: "type", rect, typed_value: "account" },
    { label: "Steuer-ID", action: "type", rect, typed_value: "Wert4711" },
    { label: "PIN", action: "type", rect, typed_value: "1234" },
    { label: "Bestand", action: "type", rect, typed_value: "42" },
    { label: "Konto DE89 3704 0044 0532 0130 00 öffnen", action: "click", rect },
    { label: "Nummer", action: "type", rect, typed_value: "12345678901", sensitive: [{ ...rect }] },
  ];
  const n = scrubSensitiveGuideSteps(steps);
  ok(n === 5, `5 Schritte bereinigt (${n})`);
  ok(!("typed_value" in steps[0]), "Steuernummer als Wert: typed_value entfernt");
  ok(Array.isArray(steps[0].sensitive) && steps[0].sensitive.length === 1 && steps[0].sensitive[0].x === 0.1, "Steuernummer: Feld als Verpixelungsvorschlag");
  ok(steps[1].typed_value === "account" && !steps[1].sensitive, "harmloser Wert bleibt, kein Vorschlag");
  ok(!("typed_value" in steps[2]), "Beschriftung Steuer-ID: typed_value entfernt");
  ok(!("typed_value" in steps[3]), "Beschriftung PIN: typed_value entfernt");
  ok(steps[4].typed_value === "42", "Beschriftung „Bestand“ (enthält „tan“): Wert bleibt");
  ok(steps[5].label === "Konto ••• öffnen" && !steps[5].sensitive, `IBAN in Beschriftung maskiert, Klick ohne Vorschlag (${steps[5].label})`);
  ok(steps[6].sensitive.length === 1, "vorhandener Vorschlag wird nicht verdoppelt");
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Sensible Werte: Server-Sicherheitsnetz verifiziert.");
process.exit(failed ? 1 : 0);

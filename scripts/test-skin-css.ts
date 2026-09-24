// Regression: Extrem-Design-CSS darf keine fremden Adressen laden (Sicherheits-Audit 24.09.).
// Nutzung:  npx tsx scripts/test-skin-css.ts
import { sanitizeSkinCss } from "../src/lib/skin-css";

let failed = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "  ✓" : "  ✗"} ${m}`); if (!c) failed++; };
const cases: [string, string][] = [
  ["image-set", `.x{background-image:image-set("https://evil.example/t.png" 1x)}`],
  ["-webkit-image-set", `.x{background-image:-webkit-image-set('//evil.example/t.png' 1x)}`],
  ["url()", `.x{background:url(https://evil.example/t.png)}`],
  ["cross-fade", `.x{background-image:cross-fade(url(data:image/png;base64,AAA), "https://evil.example/a.png", 50%)}`],
];
for (const [name, css] of cases) {
  const out = sanitizeSkinCss(css);
  ok(!/evil\.example/.test(out), `${name}: keine fremde Adresse (${out.slice(0, 80)})`);
}
const keep = sanitizeSkinCss(`.x{color:#123456;background:linear-gradient(90deg,#fff,#000);background-image:url(data:image/png;base64,AAAA)}`);
ok(/linear-gradient/.test(keep) && /data:image\/png/.test(keep) && /#123456/.test(keep), "normale Farben, Verläufe, data:-Bilder bleiben");
console.log(failed ? `\n✗ ${failed} fehlgeschlagen` : "\n✓ Skin-CSS lädt keine fremden Adressen");
process.exit(failed ? 1 : 0);

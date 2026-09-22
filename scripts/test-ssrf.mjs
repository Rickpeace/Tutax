// SSRF-Schutz (src/lib/ssrf.ts): interne Adressen in JEDER Schreibweise blockiert (Sicherheits-
// prüfung Welle 51, M2 — `[::ffff:127.0.0.1]` erscheint in Node als `::ffff:7f00:1` und rutschte
// früher durch). Ohne Netz: nur IP-Literale.
// Nutzung: node scripts/test-ssrf.mjs
import { register } from "node:module";
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s,c,n){if(s==='server-only')return {url:'data:text/javascript,',shortCircuit:true};return n(s,c);}`,
    ),
  import.meta.url,
);
const { isSafePublicUrl } = await import("../src/lib/ssrf.ts");

const cases = [
  ["http://[::ffff:127.0.0.1]/", false],
  ["http://[::ffff:7f00:1]/", false],
  ["http://[::ffff:a9fe:a9fe]/", false], // 169.254.169.254 (Cloud-Metadaten)
  ["http://[::ffff:c0a8:0101]/", false], // 192.168.1.1
  ["http://[64:ff9b::7f00:1]/", false], // NAT64
  ["http://[::127.0.0.1]/", false], // IPv4-compatible
  ["http://[::1]/", false],
  ["http://[::]/", false],
  ["http://[fe80::1]/", false],
  ["http://[fd00::1]/", false],
  ["http://[ff02::1]/", false],
  ["http://169.254.169.254/", false],
  ["http://127.0.0.1/", false],
  ["http://10.0.0.1/", false],
  ["http://198.18.0.1/", false],
  ["http://224.0.0.1/", false],
  ["http://localhost/", false],
  ["ftp://8.8.8.8/", false],
  ["http://[::ffff:8.8.8.8]/", true],
  ["http://8.8.8.8/", true],
  ["http://[2606:4700:4700::1111]/", true],
];
let bad = 0;
for (const [u, want] of cases) {
  const got = await isSafePublicUrl(u);
  console.log(`${got === want ? "✓" : "✗"} ${u} → ${got ? "erlaubt" : "blockiert"}`);
  if (got !== want) bad++;
}
console.log(bad ? `\n✗ ${bad} falsch.` : `\n✓ SSRF-Schutz: alle ${cases.length} Fälle korrekt.`);
process.exit(bad ? 1 : 0);

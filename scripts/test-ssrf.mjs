// SSRF-Schutz (src/lib/ssrf.ts): interne Adressen in JEDER Schreibweise blockiert (Sicherheits-
// prüfung Welle 51, M2 — `[::ffff:127.0.0.1]` erscheint in Node als `::ffff:7f00:1` und rutschte
// früher durch). Ohne Netz: nur IP-Literale.
// Teil 2 (Sicherheitsprüfung 23.09.2026): Weiterleitungen. Ein lokaler Server spielt den
// „öffentlichen“ Host (nur /public/* gilt als erlaubt) und leitet per 30x auf interne Ziele
// um — jede Station muss erneut geprüft und blockiert werden, /secret darf nie erreicht werden.
// Nutzung: node scripts/test-ssrf.mjs
import { register } from "node:module";
import http from "node:http";
register(
  "data:text/javascript," +
    encodeURIComponent(
      `export async function resolve(s,c,n){if(s==='server-only')return {url:'data:text/javascript,',shortCircuit:true};return n(s,c);}`,
    ),
  import.meta.url,
);
const { isSafePublicUrl, safeFetch, fetchWithCheckedRedirects, MAX_REDIRECTS } = await import("../src/lib/ssrf.ts");

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

// ---- Teil 2: Weiterleitungen ----
let secretHits = 0;
const server = http.createServer((req, res) => {
  const port = server.address().port;
  const go = (loc, status = 302) => {
    res.writeHead(status, { Location: loc });
    res.end();
  };
  const u = req.url ?? "";
  if (u === "/secret") {
    secretHits++;
    res.end("GEHEIM");
  } else if (u === "/public/to-loopback") go(`http://127.0.0.1:${port}/secret`);
  else if (u === "/public/to-relative") go("/secret");
  else if (u === "/public/to-metadata") go("http://169.254.169.254/latest/meta-data/");
  else if (u === "/public/to-mapped") go(`http://[::ffff:7f00:1]:${port}/secret`);
  else if (u === "/public/to-localhost") go(`http://localhost:${port}/secret`, 301);
  else if (u === "/public/chain") go("/public/chain2", 307);
  else if (u === "/public/chain2") go(`http://127.0.0.1:${port}/public/ok`, 303);
  else if (u === "/public/ok") res.end("ok");
  else if (u === "/public/loop") go("/public/loop");
  else if (u === "/public/no-location") {
    res.writeHead(302);
    res.end();
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
// Testweise gilt NUR der lokale /public/*-Bereich als „öffentlich“; alles andere prüft die echte Regel.
const allowed = async (u) => u.startsWith(`${base}/public/`) || isSafePublicUrl(u);
const get = (path, init) => fetchWithCheckedRedirects(base + path, init, allowed);

const redirectCases = [
  ["302 → 127.0.0.1 blockiert", () => get("/public/to-loopback"), "throw"],
  ["302 relativ (/secret) → 127.0.0.1 blockiert", () => get("/public/to-relative"), "throw"],
  ["302 → 169.254.169.254 (Cloud-Metadaten) blockiert", () => get("/public/to-metadata"), "throw"],
  ["302 → [::ffff:7f00:1] blockiert", () => get("/public/to-mapped"), "throw"],
  ["301 → localhost blockiert", () => get("/public/to-localhost"), "throw"],
  [`Endlosschleife nach ${MAX_REDIRECTS} Sprüngen abgebrochen`, () => get("/public/loop"), "throw"],
  ['redirect: "error" wirft bei Weiterleitung', () => get("/public/to-loopback", { redirect: "error" }), "throw"],
  [
    'redirect: "manual" liefert die 302 ungefolgt',
    async () => (await get("/public/to-loopback", { redirect: "manual" })).status,
    302,
  ],
  [
    "Kette erlaubter Stationen (307 → 303 → 200) wird gefolgt",
    async () => {
      const r = await get("/public/chain");
      return `${r.status} ${await r.text()} ${r.url.endsWith("/public/ok")}`;
    },
    "200 ok true",
  ],
  ["302 ohne Location → Antwort unverändert", async () => (await get("/public/no-location")).status, 302],
  ["safeFetch blockt 127.0.0.1 schon an der ersten Station", () => safeFetch(`${base}/public/ok`), "throw"],
];
for (const [name, run, want] of redirectCases) {
  let got;
  try {
    got = await run();
  } catch {
    got = "throw";
  }
  const pass = got === want;
  console.log(`${pass ? "✓" : "✗"} ${name} → ${got === "throw" ? "blockiert/Fehler" : got}`);
  if (!pass) bad++;
}
const noLeak = secretHits === 0;
console.log(`${noLeak ? "✓" : "✗"} internes Ziel /secret wurde nie aufgerufen (${secretHits}×)`);
if (!noLeak) bad++;
server.close();

const total = cases.length + redirectCases.length + 1;
console.log(bad ? `\n✗ ${bad} falsch.` : `\n✓ SSRF-Schutz: alle ${total} Fälle korrekt.`);
process.exit(bad ? 1 : 0);

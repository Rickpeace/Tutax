// Reine Node-Tests fuer den Seiten-Kontext (Welle 31c) — KEIN Netz, KEIN Chrome, KEIN
// Server. Prueft:
//   • src/lib/site-domains.ts  → normalizeDomain (www-Strip, Port-Strip, Subdomain-Reduktion,
//     Schema-/IP-/Muell-Ablehnung) + mergeDomains (Dedup, Sortierung, Limit 10)
//   • extension/site-match.js  → hostnameOf (chrome:// → null), matchesDomain (Subdomain-
//     Suffix), matchTutorials (Sortierung exakt>Suffix, published>draft, Titel)
//
// site-domains.ts wird ueber Nodes native Typ-Entfernung geladen; site-match.js (klassisches
// Script) via node:vm — daher OHNE neue Pakete lauffaehig.
//
// Nutzung:  node --experimental-strip-types scripts/test-site-match.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { normalizeDomain, mergeDomains } from "../src/lib/site-domains.ts";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};
const eq = (a, b, m) => ok(a === b, `${m} (war ${JSON.stringify(a)})`);

// ── site-match.js im vm laden (klassisches Script -> module.exports/self) ─────────────
const smCode = readFileSync(fileURLToPath(new URL("../extension/site-match.js", import.meta.url)), "utf8");
const sandbox = { module: { exports: {} }, self: {}, URL, console };
vm.createContext(sandbox);
vm.runInContext(smCode, sandbox);
const SM = sandbox.module.exports;
ok(SM && typeof SM.hostnameOf === "function", "site-match.js exportiert hostnameOf/matchesDomain/matchTutorials");

// ═══════════ normalizeDomain (site-domains.ts) ═══════════
eq(normalizeDomain("https://www.datev.de/foo?x=1"), "datev.de", "www-Strip + Pfad/Query -> datev.de");
eq(normalizeDomain("www.datev.de"), "datev.de", "nackt www.datev.de -> datev.de");
eq(normalizeDomain("login.datev.de"), "datev.de", "Subdomain login.datev.de -> Basis datev.de");
eq(normalizeDomain("app.sub.lexoffice.de"), "lexoffice.de", "Mehrfach-Subdomain -> letzte zwei Labels");
eq(normalizeDomain("datev.de:8443"), "datev.de", "Port-Strip (nackt)");
eq(normalizeDomain("https://app.lexoffice.de:443/rechnungen"), "lexoffice.de", "Port-Strip (URL) + Subdomain");
eq(normalizeDomain("DATEV.DE"), "datev.de", "lowercase");
eq(normalizeDomain("datev.de."), "datev.de", "abschliessender Punkt entfernt");
eq(normalizeDomain("  datev.de  "), "datev.de", "getrimmt");
// Ungueltige Eingaben -> null
eq(normalizeDomain("foo"), null, "ohne Punkt -> null");
eq(normalizeDomain(""), null, "leer -> null");
eq(normalizeDomain("chrome://extensions"), null, "chrome:// -> null");
eq(normalizeDomain("ftp://x.com"), null, "fremdes Schema ftp:// -> null");
eq(normalizeDomain("192.168.0.1"), null, "IPv4 nackt -> null");
eq(normalizeDomain("http://192.168.0.1/x"), null, "IPv4 in URL -> null");
eq(normalizeDomain("just some text"), null, "Text mit Leerzeichen -> null");
eq(normalizeDomain(123), null, "Nicht-String -> null");

// ═══════════ mergeDomains (site-domains.ts) ═══════════
{
  const m = mergeDomains(["b.de", "a.de"], ["a.de", "c.de"]);
  ok(JSON.stringify(m) === JSON.stringify(["a.de", "b.de", "c.de"]), `merge: Dedup + Sortierung (war ${JSON.stringify(m)})`);
}
{
  const m = mergeDomains(["A.de"], ["a.de", "  A.DE  "]);
  ok(JSON.stringify(m) === JSON.stringify(["a.de"]), `merge: case-insensitiv dedup (war ${JSON.stringify(m)})`);
}
{
  const many = Array.from({ length: 12 }, (_, i) => `d${String(i).padStart(2, "0")}.de`);
  const m = mergeDomains(many, ["extra.de"]);
  ok(m.length === 10, `merge: Limit 10 (war ${m.length})`);
}

// ═══════════ hostnameOf (site-match.js) ═══════════
eq(SM.hostnameOf("https://login.datev.de/anmelden"), "login.datev.de", "hostnameOf: voller Host bleibt (Suffix macht das Matching)");
eq(SM.hostnameOf("http://datev.de"), "datev.de", "hostnameOf: http -> datev.de");
eq(SM.hostnameOf("chrome://extensions"), null, "hostnameOf: chrome:// -> null");
eq(SM.hostnameOf("about:blank"), null, "hostnameOf: about: -> null");
eq(SM.hostnameOf("file:///c:/x.html"), null, "hostnameOf: file: -> null");
eq(SM.hostnameOf(""), null, "hostnameOf: leer -> null");
eq(SM.hostnameOf("kein url"), null, "hostnameOf: Muell -> null");

// ═══════════ matchesDomain (site-match.js) ═══════════
ok(SM.matchesDomain("login.datev.de", "datev.de"), "matchesDomain: Subdomain login.datev.de ~ datev.de");
ok(SM.matchesDomain("datev.de", "datev.de"), "matchesDomain: exakt");
ok(SM.matchesDomain("www.datev.de", "datev.de"), "matchesDomain: www.datev.de ~ datev.de");
ok(!SM.matchesDomain("notdatev.de", "datev.de"), "matchesDomain: notdatev.de NICHT ~ datev.de");
ok(!SM.matchesDomain("evil-datev.de", "datev.de"), "matchesDomain: evil-datev.de NICHT ~ datev.de");
ok(!SM.matchesDomain("datev.de.evil.com", "datev.de"), "matchesDomain: datev.de.evil.com NICHT ~ datev.de");

// ═══════════ matchTutorials (site-match.js) ═══════════
const tuts = [
  { id: "1", title: "B-Titel", status: "draft", site_domains: ["datev.de"] },
  { id: "2", title: "A-Titel", status: "published", site_domains: ["datev.de"] },
  { id: "3", title: "Exakt", status: "draft", site_domains: ["login.datev.de"] },
  { id: "4", title: "Andere", status: "published", site_domains: ["elster.de"] },
];
{
  // Auf login.datev.de: T3 exakt (draft) vor Suffix-Treffern; unter Suffix published>draft.
  const ids = SM.matchTutorials("https://login.datev.de/x", tuts).map((t) => t.id);
  ok(JSON.stringify(ids) === JSON.stringify(["3", "2", "1"]), `matchTutorials login.datev.de -> [3,2,1] (war ${JSON.stringify(ids)})`);
}
{
  // Auf datev.de: nur T1/T2 (exakt); published(T2) vor draft(T1); T3 (login-Sub) matcht NICHT.
  const ids = SM.matchTutorials("https://datev.de/x", tuts).map((t) => t.id);
  ok(JSON.stringify(ids) === JSON.stringify(["2", "1"]), `matchTutorials datev.de -> [2,1] (war ${JSON.stringify(ids)})`);
}
{
  const ids = SM.matchTutorials("https://elster.de/x", tuts).map((t) => t.id);
  ok(JSON.stringify(ids) === JSON.stringify(["4"]), `matchTutorials elster.de -> [4] (war ${JSON.stringify(ids)})`);
}
ok(SM.matchTutorials("chrome://extensions", tuts).length === 0, "matchTutorials: chrome:// -> keine Treffer");
ok(SM.matchTutorials("https://fremd.example/x", tuts).length === 0, "matchTutorials: unbekannte Domain -> keine Treffer");
{
  // Titel-Tiebreak: zwei published, gleiche Domain-Ebene -> alphabetisch nach Titel.
  const two = [
    { id: "z", title: "Zebra", status: "published", site_domains: ["x.de"] },
    { id: "a", title: "Apfel", status: "published", site_domains: ["x.de"] },
  ];
  const ids = SM.matchTutorials("https://x.de/", two).map((t) => t.id);
  ok(JSON.stringify(ids) === JSON.stringify(["a", "z"]), `matchTutorials: Titel-Tiebreak Apfel<Zebra (war ${JSON.stringify(ids)})`);
}

console.log(failed ? "\n✗ Fehlgeschlagen." : "\n✓ Seiten-Match (pure) verifiziert.");
process.exit(failed ? 1 : 0);

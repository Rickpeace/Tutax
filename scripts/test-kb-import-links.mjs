// Welle 51: lokaler Test der reinen Wissens-Import-Logik (src/lib/kb-import-links.ts) — ohne
// Netz, ohne DB, ohne KI. Statisches HTML + Sitemap-Beispiel nach dem Muster der Kanzlei-Seite
// aus der Kundenmeldung (Startadresse https://jakus.tax/datev).
// Node lädt die .ts-Datei per Type-Stripping direkt (Node ≥ 22.18).
// Nutzung:  node scripts/test-kb-import-links.mjs
import {
  MAX_SUBPAGES,
  MAX_EXTRA_URLS,
  allocateBudget,
  extractLinks,
  htmlToText,
  linkScore,
  normalizeInputUrl,
  parseExtraUrls,
  parseSitemap,
  pickSubLinks,
  sitemapsFromRobots,
} from "../src/lib/kb-import-links.ts";

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

const start = new URL("https://jakus.tax/datev");

const HTML = `<!doctype html><html><head><title>DATEV</title>
<link rel="stylesheet" href="/style.css"></head><body>
<header><a href="/">Start</a></header>
<nav>
  <a href="/kanzlei">Kanzlei</a>
  <a href='/leistungen/lohnabrechnung'>Lohn</a>
  <a href=/datev/unternehmen-online>Unternehmen online</a>
  <a href="https://www.jakus.tax/datev/belege-hochladen#anker">Belege</a>
  <a href="/datenschutz">Datenschutz</a>
  <a href="/impressum">Impressum</a>
  <a href="mailto:info@jakus.tax">Mail</a>
  <a href="tel:+49301234">Telefon</a>
  <a href="javascript:void(0)">JS</a>
  <a href="https://fremde-seite.de/datev">Fremd</a>
  <a href="/downloads/vollmacht.pdf">PDF</a>
  <a href="/wp-login.php">Login</a>
  <a href="/datev?utm_source=newsletter&amp;utm_medium=mail">Selbst mit Tracking</a>
  <a href="/suche?q=lohn&amp;seite=2">Suche</a>
  <a href="/datev/">Selbst</a>
  <a href="/kanzlei/">Kanzlei doppelt</a>
</nav>
<main><h1>DATEV Unternehmen online</h1><p>Wir arbeiten digital &amp; papierlos.</p>
<script>var x = "<a href='/geheim'>";</script></main>
<footer><a href="/kontakt">Kontakt</a></footer>
</body></html>`;

// --- extractLinks ---
const links = extractLinks(HTML, start);
const paths = links.map((h) => new URL(h).pathname + new URL(h).search);
ok(paths.includes("/kanzlei") && paths.includes("/leistungen/lohnabrechnung"), "Links: normale Unterseiten gefunden");
ok(paths.includes("/datev/unternehmen-online"), "Links: href ohne Anführungszeichen gefunden");
ok(paths.includes("/datev/belege-hochladen"), "Links: www-Variante gilt als dieselbe Website, Anker entfernt");
ok(!links.some((h) => /fremde-seite/.test(h)), "Links: fremde Website ausgeschlossen");
ok(!links.some((h) => /\.pdf|wp-login|mailto|tel:|javascript/.test(h)), "Links: PDF/Login/mailto/tel/javascript ausgeschlossen");
ok(paths.filter((p) => p === "/kanzlei").length === 1, "Links: /kanzlei und /kanzlei/ nur einmal");
ok(paths.includes("/suche?q=lohn&seite=2"), "Links: &amp; in href dekodiert");
ok(
  !pickSubLinks(links, start, 50).some((h) => new URL(h).pathname.replace(/\/$/, "") === "/datev"),
  "Auswahl: Startadresse (auch mit Tracking-Parametern oder „/“ am Ende) wird nicht erneut geladen"
);
ok(!paths.includes("/geheim"), "Links: Adressen aus Skripten ignoriert");

// --- Sitemap ---
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://jakus.tax/</loc></url>
  <url><loc>https://jakus.tax/datev/digitale-belege</loc><lastmod>2026-07-01</lastmod></url>
  <url><loc><![CDATA[https://jakus.tax/faq]]></loc></url>
  <url><loc>https://www.jakus.tax/steuerberatung/privatpersonen</loc></url>
  <url><loc>https://jakus.tax/preise</loc></url>
  <url><loc>https://jakus.tax/blog/2019/alter-beitrag</loc></url>
  <url><loc>https://cdn.fremd.net/x</loc></url>
  <url><loc>https://jakus.tax/agb</loc></url>
  <url><loc>https://jakus.tax/team/max-mustermann</loc></url>
</urlset>`;
const sm = parseSitemap(SITEMAP, start);
ok(sm.pages.length === 8 && sm.sitemaps.length === 0, `Sitemap: 8 Seiten der Website (${sm.pages.length}), fremder Host raus`);
ok(sm.pages.some((h) => h.endsWith("/faq")), "Sitemap: CDATA-loc gelesen");

const INDEX = `<sitemapindex><sitemap><loc>https://jakus.tax/page-sitemap.xml</loc></sitemap>
<sitemap><loc>https://evil.example/sitemap.xml</loc></sitemap></sitemapindex>`;
const si = parseSitemap(INDEX, start);
ok(si.pages.length === 0 && si.sitemaps.length === 1 && si.sitemaps[0].endsWith("/page-sitemap.xml"), "Sitemap-Index: nur Unter-Sitemap derselben Website");

const robots = "User-agent: *\nDisallow: /wp-admin/\nSitemap: https://jakus.tax/sitemap_index.xml\nSitemap: https://evil.example/s.xml\n";
const rs = sitemapsFromRobots(robots, start);
ok(rs.length === 1 && rs[0] === "https://jakus.tax/sitemap_index.xml", "robots.txt: Sitemap-Zeile gelesen, fremde ignoriert");

// --- Auswahl ---
const picked = pickSubLinks([...links, ...sm.pages], start, MAX_SUBPAGES);
const pp = picked.map((h) => new URL(h).pathname);
ok(MAX_SUBPAGES === 12, "Budget: 12 Unterseiten (vorher 5)");
ok(picked.length <= MAX_SUBPAGES, `Auswahl: höchstens ${MAX_SUBPAGES} (${picked.length})`);
ok(!pp.includes("/datev") && !picked.some((h) => urlIsStart(h)), "Auswahl: Startadresse selbst nicht doppelt");
ok(pp.slice(0, 3).every((p) => p.startsWith("/datev/")), `Auswahl: Seiten unter /datev zuerst (${pp.slice(0, 3).join(", ")})`);
ok(pp.includes("/faq") && pp.includes("/kanzlei") && pp.includes("/preise"), "Auswahl: faq/kanzlei/preise dabei");
ok(pp.indexOf("/datenschutz") === -1 || pp.indexOf("/datenschutz") > pp.indexOf("/kanzlei"), "Auswahl: Datenschutz hinten");
ok(pp.indexOf("/agb") === -1 || pp.indexOf("/agb") > pp.indexOf("/faq"), "Auswahl: AGB hinten");
ok(new Set(picked.map((h) => h.replace("www.", "").replace(/\/$/, ""))).size === picked.length, "Auswahl: keine Dubletten (www/Schrägstrich)");
ok(linkScore("https://jakus.tax/faq", start) < linkScore("https://jakus.tax/blog/2019/alter-beitrag", start), "Score: FAQ vor altem Blogbeitrag");
function urlIsStart(h) {
  const u = new URL(h);
  return u.pathname.replace(/\/$/, "") === "/datev" && !u.search;
}
const excluded = pickSubLinks([...links], start, 12, ["https://jakus.tax/kanzlei"]);
ok(!excluded.some((h) => new URL(h).pathname === "/kanzlei"), "Auswahl: schon selbst angegebene Seiten werden nicht doppelt geladen");

// --- Zusatz-Adressen ---
let ex = parseExtraUrls("jakus.tax/leistungen\n\nhttps://www.jakus.tax/faq\nhttps://jakus.tax/leistungen/\n", start);
ok(!ex.error && ex.urls.length === 2, `Zusatz: normalisiert + dedupliziert (${ex.urls.join(" | ")})`);
ex = parseExtraUrls("https://jakus.tax/faq\nhttps://andere-kanzlei.de/faq", start);
ok(ex.error && /gehört nicht zu jakus\.tax/.test(ex.error), "Zusatz: fremde Website abgelehnt (Meldung nennt die Website)");
ex = parseExtraUrls("ftp://jakus.tax/x", start);
ok(!!ex.error, "Zusatz: ftp abgelehnt");
ex = parseExtraUrls(Array.from({ length: MAX_EXTRA_URLS + 1 }, (_, i) => `https://jakus.tax/s${i}`).join("\n"), start);
ok(ex.error && /höchstens 10/.test(ex.error), "Zusatz: mehr als 10 abgelehnt");
ok(parseExtraUrls("", start).urls.length === 0 && !parseExtraUrls("", start).error, "Zusatz: leer = nichts");
ok(normalizeInputUrl("javascript:alert(1)") === null, "normalizeInputUrl: javascript: abgelehnt");

// --- Budget ---
const a1 = allocateBudget([100, 50000, 50000], 40000);
ok(a1[0] === 100 && a1[1] + a1[2] <= 39900 && Math.abs(a1[1] - a1[2]) <= 1, `Budget: kurze Seite ganz, Rest gerecht (${a1.join("/")})`);
const a2 = allocateBudget(Array(13).fill(10000), 40000);
ok(a2.reduce((x, y) => x + y, 0) <= 40000 && a2.every((x) => x >= 3000), `Budget: 13 lange Seiten bekommen je ≥ 3000 (${a2[0]})`);
const a3 = allocateBudget([0, 500], 40000);
ok(a3[0] === 0 && a3[1] === 500, "Budget: leere Seite 0, kleine Seite vollständig");

// --- htmlToText ---
const t = htmlToText(HTML);
ok(/DATEV Unternehmen online/.test(t) && /digital & papierlos/.test(t), "Text: Inhalt + Entitäten");
ok(!/geheim|Datenschutz|Impressum/.test(t), "Text: script/nav/footer entfernt");

console.log(failed ? "\nFEHLGESCHLAGEN" : "\nAlle Prüfungen grün.");
process.exit(failed ? 1 : 0);

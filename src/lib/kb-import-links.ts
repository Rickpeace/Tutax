// Wissens-Import von der Website (Welle 51): REINE Logik ohne Netz/Imports — Link-Auswahl,
// Sitemap-Auswertung, zusätzliche Adressen, Textbudget. Genutzt von
// app/app/assistent/wissen/import-actions.ts; lokal getestet von scripts/test-kb-import-links.mjs
// (Node lädt diese .ts-Datei per Type-Stripping direkt — darum KEINE Imports und keine
// TS-Syntax, die sich nicht einfach wegstreichen lässt).
//
// Anlass (Kunde Max, Beispiel https://jakus.tax/datev): Der Import las praktisch nur die
// Startseite — max. 5 Unterseiten, Vorzugsliste ohne branchentypische Wörter, Links nur aus dem
// rohen HTML (JS-gerenderte Menüs lieferten nichts).

/** Unterseiten zusätzlich zur Startseite (Kostenbremse bleibt MAX_TOTAL_CHARS). */
export const MAX_SUBPAGES = 12;
/** Höchstens so viele selbst eingegebene Zusatz-Adressen. */
export const MAX_EXTRA_URLS = 10;

// Bevorzugte Unterseiten (FAQ-würdiges Wissen). Reihenfolge = Priorität (kleiner = besser).
export const PREFERRED = [
  "faq", "haeufige", "häufige", "fragen",
  "leistung", "service", "angebot", "beratung",
  "datev", "digital", "unternehmen-online", "belege", "portal",
  "steuer", "lohn", "gehalt", "buchhaltung", "buchfuehrung", "buchführung", "finanzbuch", "jahresabschluss",
  "mandant", "kanzlei", "ablauf", "so-funktioniert", "prozess",
  "preise", "preis", "honorar", "kosten",
  "kontakt", "oeffnungszeit", "öffnungszeit", "sprechzeit", "termin", "anfahrt",
  "team", "ueber", "über", "about",
  "impressum",
];

// Offensichtlich wertlose Ziele (Recht/Konto/Technik) — landen hinten bzw. fliegen raus.
const SKIP_PATH =
  /(\/(wp-admin|wp-login|wp-json|xmlrpc)|\/(login|logout|anmelden|registrieren|warenkorb|cart|checkout|feed|tag|author|page\/\d+)(\/|$))/i;
// Tracking-Parameter ändern den Inhalt nicht -> beim Vergleich ignorieren.
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|msclkid|mc_[a-z]+|ref)$/i;
const ASSET_EXT = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|zip|rar|mp4|mp3|webm|docx?|xlsx?|pptx?|css|js|json|xml|txt)$/i;
const LOW_VALUE = /(datenschutz|privacy|cookie|agb|disclaimer|barrierefrei|sitemap)/i;

/** Host ohne führendes „www.“ (www.x.de und x.de gelten als dieselbe Website). */
export function siteHost(u: URL): string {
  return u.hostname.toLowerCase().replace(/^www\./, "");
}

/** Gleiche Website? (Protokoll egal, www egal.) */
export function sameSite(a: URL, b: URL): boolean {
  return siteHost(a) === siteHost(b);
}

/** Vergleichsschlüssel: ohne Hash, ohne abschließenden Schrägstrich, Host ohne www. */
export function urlKey(u: URL): string {
  const path = u.pathname.replace(/\/+$/, "") || "/";
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING_PARAM.test(k));
  const search = params.length ? "?" + new URLSearchParams(params).toString() : "";
  return `${siteHost(u)}${path}${search}`;
}

/** Adresse normalisieren („kanzlei.de/x“ -> „https://kanzlei.de/x“); null, wenn ungültig. */
export function normalizeInputUrl(raw: string): URL | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u;
  } catch {
    return null;
  }
}

/** Taugt die Adresse als Unterseite (gleiche Website, http(s), keine Datei/Technikseite)? */
export function isCandidate(u: URL, start: URL): boolean {
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (!sameSite(u, start)) return false;
  const path = u.pathname.toLowerCase();
  if (ASSET_EXT.test(path)) return false;
  if (SKIP_PATH.test(path)) return false;
  return true;
}

/** HTML-Entitäten, die in href/loc typischerweise vorkommen. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

/** Alle Unterseiten-Links aus dem HTML (gleiche Website, in Dokument-Reihenfolge, ohne Dubletten). */
export function extractLinks(html: string, base: URL): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  // Links in Skripten/Kommentaren sind keine echten Menüpunkte.
  const clean = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  for (const m of clean.matchAll(/<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim());
    if (!raw || /^(mailto|tel|javascript|data):/i.test(raw)) continue;
    let u: URL;
    try {
      u = new URL(raw, base);
    } catch {
      continue;
    }
    u.hash = "";
    if (!isCandidate(u, base)) continue;
    const key = urlKey(u);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.href);
  }
  return out;
}

/**
 * sitemap.xml auswerten: `<urlset>` liefert Seiten, `<sitemapindex>` weitere Sitemaps.
 * Nur Adressen derselben Website (SSRF/Kosten: keine fremden Hosts über die Sitemap).
 */
export function parseSitemap(xml: string, base: URL): { pages: string[]; sitemaps: string[] } {
  const pages: string[] = [];
  const sitemaps: string[] = [];
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const blockRe = isIndex ? /<sitemap\b[\s\S]*?<\/sitemap>/gi : /<url\b[\s\S]*?<\/url>/gi;
  for (const block of xml.match(blockRe) ?? []) {
    const loc = /<loc>\s*(?:<!\[CDATA\[)?\s*([\s\S]*?)\s*(?:\]\]>)?\s*<\/loc>/i.exec(block);
    if (!loc) continue;
    let u: URL;
    try {
      u = new URL(decodeEntities(loc[1].trim()), base);
    } catch {
      continue;
    }
    u.hash = "";
    if (isIndex) {
      if ((u.protocol === "http:" || u.protocol === "https:") && sameSite(u, base)) sitemaps.push(u.href);
    } else if (isCandidate(u, base)) {
      pages.push(u.href);
    }
  }
  return { pages, sitemaps };
}

/** Sitemap-Adressen aus robots.txt („Sitemap: …“), nur gleiche Website. */
export function sitemapsFromRobots(txt: string, base: URL): string[] {
  const out: string[] = [];
  for (const m of txt.matchAll(/^\s*sitemap\s*:\s*(\S+)\s*$/gim)) {
    try {
      const u = new URL(m[1], base);
      if ((u.protocol === "http:" || u.protocol === "https:") && sameSite(u, base)) out.push(u.href);
    } catch {
      /* ungültig */
    }
  }
  return out;
}

/**
 * Nutzen einer Unterseite (kleiner = besser): Vorzugswort im Pfad, Nähe zur Startadresse
 * (bei https://kanzlei.de/datev zählen /datev/… zuerst), geringe Tiefe; Recht/Cookies hinten.
 */
export function linkScore(href: string, start: URL): number {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return 1e6;
  }
  let path = u.pathname.toLowerCase();
  try {
    path = decodeURIComponent(u.pathname).toLowerCase(); // „/%C3%BCber-uns“ -> „/über-uns“
  } catch {
    /* kaputte Kodierung: roher Pfad */
  }
  const pri = PREFERRED.findIndex((k) => path.includes(k));
  let score = pri < 0 ? 100 : pri;
  const startPath = start.pathname.replace(/\/+$/, "").toLowerCase();
  if (startPath && startPath !== "/" && path.startsWith(startPath + "/")) score -= 50; // unter der Startadresse
  const depth = path.split("/").filter(Boolean).length;
  score += Math.max(0, depth - 1) * 3;
  if (LOW_VALUE.test(path)) score += 500;
  if (u.search) score += 20;
  return score;
}

/**
 * Unterseiten auswählen: Kandidaten (Links + Sitemap) zusammenführen, Dubletten und schon
 * geladene Adressen (exclude, per urlKey) entfernen, nach Nutzen sortieren (stabil), kappen.
 */
export function pickSubLinks(candidates: string[], start: URL, max: number, exclude: string[] = []): string[] {
  const skip = new Set(exclude.map((h) => {
    try {
      return urlKey(new URL(h));
    } catch {
      return h;
    }
  }));
  skip.add(urlKey(start));
  const seen = new Set<string>();
  const list: { href: string; score: number; i: number }[] = [];
  candidates.forEach((href, i) => {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      return;
    }
    if (!isCandidate(u, start)) return;
    const key = urlKey(u);
    if (skip.has(key) || seen.has(key)) return;
    seen.add(key);
    list.push({ href: u.href, score: linkScore(u.href, start), i });
  });
  list.sort((a, b) => a.score - b.score || a.i - b.i);
  return list.slice(0, Math.max(0, max)).map((x) => x.href);
}

/**
 * „Weitere Unterseiten, eine pro Zeile“ auswerten. Nur Adressen derselben Website wie die
 * Startadresse (sonst Fehlertext), höchstens MAX_EXTRA_URLS, ohne Dubletten.
 */
export function parseExtraUrls(text: string, start: URL): { urls: string[]; error: string | null } {
  const urls: string[] = [];
  const seen = new Set<string>([urlKey(start)]);
  for (const line of text.split(/[\r\n,;]+/)) {
    const raw = line.trim();
    if (!raw) continue;
    const u = normalizeInputUrl(raw);
    if (!u) return { urls: [], error: `„${raw.slice(0, 80)}“ ist keine gültige Adresse.` };
    if (!sameSite(u, start)) {
      return {
        urls: [],
        error: `„${raw.slice(0, 80)}“ gehört nicht zu ${siteHost(start)}. Bitte nur Unterseiten dieser Website angeben.`,
      };
    }
    const key = urlKey(u);
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push(u.href);
  }
  if (urls.length > MAX_EXTRA_URLS) {
    return { urls: [], error: `Bitte höchstens ${MAX_EXTRA_URLS} weitere Unterseiten angeben.` };
  }
  return { urls, error: null };
}

/**
 * Textbudget fair verteilen („Wasserstand“): kurze Seiten bekommen alles, der Rest teilt sich
 * gleichmäßig den verbleibenden Platz. Summe ≤ total. Liefert die erlaubte Länge je Seite.
 */
export function allocateBudget(lengths: number[], total: number): number[] {
  const alloc = lengths.map(() => 0);
  let remaining = Math.max(0, total);
  // Kürzeste zuerst: jede Seite bekommt min(eigene Länge, gerechter Anteil am Rest).
  const order = lengths.map((_, i) => i).filter((i) => lengths[i] > 0).sort((a, b) => lengths[a] - lengths[b]);
  let n = order.length;
  for (const i of order) {
    const share = Math.floor(remaining / n);
    const give = Math.min(lengths[i], share);
    alloc[i] = give;
    remaining -= give;
    n--;
  }
  return alloc;
}

/** HTML grob zu Klartext: script/style/nav/header/footer raus, Tags weg, Whitespace normalisiert. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

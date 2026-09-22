"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { aiConfigured } from "@/lib/ai";
import { safeFetch } from "@/lib/ssrf";
import { assertImportBudget, textToDraftArticles, type ImportResult } from "@/lib/kb-import";
import {
  MAX_SUBPAGES,
  allocateBudget,
  extractLinks,
  htmlToText,
  normalizeInputUrl,
  parseExtraUrls,
  parseSitemap,
  pickSubLinks,
  sitemapsFromRobots,
} from "@/lib/kb-import-links";

// Hinweis: In "use server"-Dateien sind nur async-Funktions-Exporte erlaubt — daher KEIN
// `export const maxDuration`. Der Website-Import (mehrere Seiten + 1 KI-Call) läuft im
// Zeitbudget der aufrufenden Seite; der OpenAI-Client kappt zusätzlich hart (20 s/Call).

// Gesamt-Textbudget über alle geladenen Seiten (Kostenbremse vor dem KI-Call) — unverändert,
// auch wenn seit Welle 51 mehr Seiten (MAX_SUBPAGES = 12 + Zusatz-Adressen) gelesen werden:
// das Budget wird fair verteilt (allocateBudget) statt „wer zuerst kommt“.
const MAX_TOTAL_CHARS = 40_000;
// Pro einzelner Seite so viel HTML lesen (Rest verwerfen).
const MAX_HTML_PER_PAGE = 300_000;
// Sitemap: höchstens so viel XML lesen und so viele Unter-Sitemaps (sitemapindex) folgen.
const MAX_SITEMAP_BYTES = 500_000;
const MAX_CHILD_SITEMAPS = 2;
// Parallel laufende Seitenabrufe + Zeitlimit je Abruf.
const FETCH_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 8000;

const UA = "Mozilla/5.0 (compatible; TutaxBot/1.0)";

/**
 * SSRF-sicher laden UND Weiterleitungen einzeln prüfen: fetch folgt Redirects sonst selbst —
 * ein öffentlicher Host könnte so auf eine interne Adresse umlenken. Jede Station geht durch
 * safeFetch (DNS-Prüfung), höchstens 4 Sprünge.
 */
async function fetchChecked(url: string, accept: string): Promise<Response | null> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    const resp = await safeFetch(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { "User-Agent": UA, Accept: accept },
    });
    if (resp.status >= 300 && resp.status < 400) {
      const loc = resp.headers.get("location");
      if (!loc) return null;
      current = new URL(loc, current).href;
      continue;
    }
    return resp;
  }
  return null;
}

/**
 * Antwort-Text höchstens bis `maxBytes` lesen und dann abbrechen (Sicherheitsprüfung Welle 51,
 * M3): `resp.text()` läse eine beliebig große/endlos streamende Antwort komplett in den Speicher.
 */
async function readCapped(resp: Response, maxBytes: number): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;
  try {
    while (bytes < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      bytes += value.byteLength;
      out += decoder.decode(value, { stream: true });
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return out.slice(0, maxBytes);
}

/** Eine Seite laden, Text extrahieren. Wirft nicht — leerer String bei Fehler. */
async function loadPageText(url: string): Promise<{ text: string; html: string; finalUrl: string }> {
  try {
    const resp = await fetchChecked(url, "text/html");
    if (!resp) return { text: "", html: "", finalUrl: url };
    const ct = (resp.headers.get("content-type") ?? "").toLowerCase();
    if (!resp.ok || !ct.includes("text/html")) return { text: "", html: "", finalUrl: url };
    const html = await readCapped(resp, MAX_HTML_PER_PAGE);
    return { text: htmlToText(html), html, finalUrl: resp.url || url };
  } catch {
    return { text: "", html: "", finalUrl: url };
  }
}

/** Text-Ressource (Sitemap/robots.txt) laden, gekappt. "" bei Fehler. */
async function loadText(url: string, accept: string): Promise<string> {
  try {
    const resp = await fetchChecked(url, accept);
    if (!resp || !resp.ok) return "";
    return await readCapped(resp, MAX_SITEMAP_BYTES);
  } catch {
    return "";
  }
}

/**
 * Seiten-Adressen aus der Sitemap: robots.txt („Sitemap:“) oder /sitemap.xml bzw.
 * /sitemap_index.xml; bei einem Sitemap-Index höchstens MAX_CHILD_SITEMAPS Unter-Sitemaps.
 * Nur dieselbe Website (parseSitemap filtert), alles über fetchChecked (SSRF).
 */
async function sitemapPages(start: URL): Promise<string[]> {
  const origin = start.origin;
  const robots = await loadText(`${origin}/robots.txt`, "text/plain");
  const listed = robots ? sitemapsFromRobots(robots, start) : [];
  const tried = new Set<string>();
  const candidates = listed.length ? listed.slice(0, 2) : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
  for (const sm of candidates) {
    if (tried.has(sm)) continue;
    tried.add(sm);
    const xml = await loadText(sm, "application/xml,text/xml");
    if (!xml || !/<(urlset|sitemapindex)[\s>]/i.test(xml)) continue;
    const { pages, sitemaps } = parseSitemap(xml, start);
    if (pages.length) return pages;
    const out: string[] = [];
    for (const child of sitemaps.slice(0, MAX_CHILD_SITEMAPS)) {
      const cx = await loadText(child, "application/xml,text/xml");
      if (cx) out.push(...parseSitemap(cx, start).pages);
    }
    if (out.length) return out;
  }
  return [];
}

/** Seiten in kleinen Parallel-Gruppen laden (Reihenfolge bleibt erhalten). */
async function loadAll(urls: string[]): Promise<{ url: string; text: string }[]> {
  const out: { url: string; text: string }[] = [];
  for (let i = 0; i < urls.length; i += FETCH_CONCURRENCY) {
    const batch = urls.slice(i, i + FETCH_CONCURRENCY);
    const res = await Promise.all(batch.map((u) => loadPageText(u)));
    res.forEach((r, k) => out.push({ url: batch[k], text: r.text }));
  }
  return out;
}

function labelOf(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}

/**
 * Website-Import: liest die Startadresse, bis zu 12 Unterseiten derselben Website (Links aus
 * dem HTML + sitemap.xml, nach FAQ-Nutzen priorisiert) und optional selbst angegebene
 * Unterseiten; die KI leitet daraus Wissens-ENTWÜRFE ab (nie veröffentlicht). Default-URL =
 * themes.source_url des Kontos. Ergebnis: Anzahl + Titel der angelegten Entwürfe.
 *
 * @param extraUrls „Weitere Unterseiten, eine pro Zeile“ (nur dieselbe Website, max. 10).
 */
export async function importFromWebsite(rawUrl?: string, extraUrls?: string): Promise<ImportResult> {
  const { account } = await requireAccount();
  if (!aiConfigured()) throw new Error("Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).");
  // Kostenbremse schon VOR dem Laden der Website (spart auch die Abrufe).
  await assertImportBudget(createAdminClient(), account.id);

  const supabase = await createClient();

  // URL bestimmen: übergebene URL bevorzugt, sonst die beim Branding erfasste source_url.
  let url = (rawUrl ?? "").trim();
  if (!url) {
    const { data: theme } = await supabase
      .from("themes")
      .select("source_url")
      .eq("account_id", account.id)
      .single();
    url = (theme?.source_url ?? "").trim();
  }
  if (!url) throw new Error("Für dieses Konto ist keine Website hinterlegt. Bitte geben Sie eine Adresse an.");

  const start = normalizeInputUrl(url);
  if (!start) throw new Error("Die angegebene Adresse ist ungültig.");

  // Zusatz-Adressen vorab prüfen (klare Meldung statt stillem Überspringen).
  const extra = parseExtraUrls(typeof extraUrls === "string" ? extraUrls : "", start);
  if (extra.error) throw new Error(extra.error);

  // Startadresse + Sitemap parallel laden (fetchChecked blockt interne/private Ziele -> SSRF).
  const [home, fromSitemap] = await Promise.all([loadPageText(start.href), sitemapPages(start)]);
  if (!home.html) {
    throw new Error("Die Website konnte nicht geladen werden (blockiert oder nicht erreichbar).");
  }

  // Nach Weiterleitung (z. B. kanzlei.de -> www.kanzlei.de/start) gilt die END-Adresse als
  // Basis für relative Links (Sitemap-Adressen filtert parseSitemap ohnehin www-tolerant).
  let site = start;
  try {
    site = new URL(home.finalUrl);
  } catch {
    /* Startadresse bleibt */
  }
  // Kandidaten: Links der Startseite + Sitemap; die selbst angegebenen zählen extra.
  const auto = pickSubLinks(
    [...extractLinks(home.html, site), ...fromSitemap],
    site,
    MAX_SUBPAGES,
    extra.urls,
  );
  const pages = [
    { label: "Startseite", text: home.text },
    ...(await loadAll([...extra.urls, ...auto])).map((p) => ({ label: labelOf(p.url), text: p.text })),
  ].filter((p) => p.text.trim().length > 0);

  // Budget fair verteilen, Gesamttext hart gekappt (Kostenbremse unverändert).
  const labels = pages.map((p) => p.label);
  const overhead = labels.reduce((n, l) => n + l.length + 4, 0);
  const alloc = allocateBudget(pages.map((p) => p.text.length), Math.max(0, MAX_TOTAL_CHARS - overhead));
  const combined = pages
    .map((p, i) => (alloc[i] > 0 ? `# ${labels[i]}\n${p.text.slice(0, alloc[i])}` : ""))
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_TOTAL_CHARS);
  if (combined.trim().length < 100) {
    throw new Error("Auf der Website wurde zu wenig lesbarer Text gefunden.");
  }

  const result = await textToDraftArticles(createAdminClient(), account.id, start.hostname, combined);
  revalidatePath("/app/assistent/wissen");
  return result;
}

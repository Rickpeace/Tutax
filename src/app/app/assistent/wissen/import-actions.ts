"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAccount } from "@/lib/account";
import { aiConfigured } from "@/lib/ai";
import { safeFetch } from "@/lib/ssrf";
import { textToDraftArticles, type ImportResult } from "@/lib/kb-import";

// Hinweis: In "use server"-Dateien sind nur async-Funktions-Exporte erlaubt — daher KEIN
// `export const maxDuration`. Der Website-Import (mehrere Seiten + 1 KI-Call) läuft im
// Zeitbudget der aufrufenden Seite; der OpenAI-Client kappt zusätzlich hart (20 s/Call).

// Gesamt-Textbudget über alle geladenen Seiten (Kostenbremse vor dem KI-Call).
const MAX_TOTAL_CHARS = 40_000;
// Wie viele Unterseiten zusätzlich zur Startseite geladen werden.
const MAX_SUBPAGES = 5;
// Pro einzelner Seite so viel HTML lesen (Rest verwerfen).
const MAX_HTML_PER_PAGE = 300_000;

const UA = "Mozilla/5.0 (compatible; TutaxBot/1.0)";

/** HTML grob zu Klartext: script/style/nav/header/footer raus, Tags weg, Whitespace normalisiert. */
function htmlToText(html: string): string {
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

// Bevorzugte Unterseiten (FAQ-würdiges Wissen). Reihenfolge = Priorität.
const PREFERRED = [
  "kontakt", "impressum", "faq", "leistung", "service", "angebot",
  "oeffnungszeit", "öffnungszeit", "sprechzeit", "anfahrt", "team", "ueber", "über", "about", "preis",
];

/** Same-Origin-Links aus dem HTML ziehen und nach FAQ-Nutzen priorisieren. */
function pickSubLinks(html: string, base: URL, max: number): string[] {
  const found = new Map<string, number>(); // href -> Priorität (kleiner = besser)
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.origin !== base.origin) continue;
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    u.hash = "";
    const href = u.href;
    if (href === base.href || href === base.origin + "/") continue;
    const path = u.pathname.toLowerCase();
    if (/\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|mp4|docx?|xlsx?)$/.test(path)) continue;
    const pri = PREFERRED.findIndex((k) => path.includes(k));
    const score = pri < 0 ? 999 : pri;
    if (!found.has(href) || (found.get(href) ?? 999) > score) found.set(href, score);
  }
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, max)
    .map(([href]) => href);
}

/** Eine Seite laden (SSRF-geschützt), Text extrahieren. Wirft nicht — leerer String bei Fehler. */
async function loadPageText(url: string): Promise<{ text: string; html: string }> {
  try {
    const resp = await safeFetch(url, {
      signal: AbortSignal.timeout(9000),
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    const ct = (resp.headers.get("content-type") ?? "").toLowerCase();
    if (!resp.ok || !ct.includes("text/html")) return { text: "", html: "" };
    const html = (await resp.text()).slice(0, MAX_HTML_PER_PAGE);
    return { text: htmlToText(html), html };
  } catch {
    return { text: "", html: "" };
  }
}

function normalizeUrl(raw: string): string {
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

/**
 * Website-Import: liest die Startseite (+ bis zu 5 same-origin Unterseiten) des Kontos,
 * lässt die KI daraus Wissens-ENTWÜRFE ableiten. Default-URL = themes.source_url des Kontos
 * (beim Onboarding/Branding erfasst). Ergebnis: Anzahl + Titel der angelegten Entwürfe.
 */
export async function importFromWebsite(rawUrl?: string): Promise<ImportResult> {
  const { account } = await requireAccount();
  if (!aiConfigured()) throw new Error("Die KI ist nicht aktiviert (OPENAI_API_KEY fehlt).");

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

  url = normalizeUrl(url);
  let start: URL;
  try {
    start = new URL(url);
  } catch {
    throw new Error("Die angegebene Adresse ist ungültig.");
  }

  // Startseite laden (safeFetch blockt interne/private Ziele -> SSRF-Schutz).
  const home = await loadPageText(start.href);
  if (!home.html) {
    throw new Error("Die Website konnte nicht geladen werden (blockiert oder nicht erreichbar).");
  }

  // Bis zu 5 Unterseiten laden, Gesamttext hart kappen.
  const subLinks = pickSubLinks(home.html, start, MAX_SUBPAGES);
  const parts: string[] = [];
  const pushCapped = (label: string, text: string) => {
    if (!text) return;
    const remaining = MAX_TOTAL_CHARS - parts.join("\n\n").length;
    if (remaining <= 0) return;
    parts.push(`# ${label}\n${text}`.slice(0, remaining));
  };
  pushCapped("Startseite", home.text);
  for (const link of subLinks) {
    if (parts.join("\n\n").length >= MAX_TOTAL_CHARS) break;
    const sub = await loadPageText(link);
    let label: string;
    try {
      label = new URL(link).pathname || link;
    } catch {
      label = link;
    }
    pushCapped(label, sub.text);
  }

  const combined = parts.join("\n\n").slice(0, MAX_TOTAL_CHARS);
  if (combined.trim().length < 100) {
    throw new Error("Auf der Website wurde zu wenig lesbarer Text gefunden.");
  }

  const result = await textToDraftArticles(createAdminClient(), account.id, start.hostname, combined);
  revalidatePath("/app/assistent/wissen");
  return result;
}

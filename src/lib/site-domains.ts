// Reine Domain-Normalisierung + Merge für den Seiten-Kontext (Welle 31c). BEWUSST OHNE
// "server-only": wird server­seitig (guide-complete-Seeding, Server-Action) UND im
// Client-Builder (SiteDomainsPicker) genutzt. Keine Imports → auch standalone unter
// `node --experimental-strip-types` importierbar (scripts/test-site-match.mjs).
//
// normalizeDomain reduziert einen beliebigen URL- ODER Domain-Eingabewert auf die
// „registrierbare" Basis-Domain (die letzten zwei Labels), z. B. datev.de. So kollabieren
// www.datev.de, login.datev.de und app.datev.de alle auf datev.de — genau EIN Eintrag pro
// Website. Das Extension-Matching (site-match.js/matchesDomain) deckt dann JEDE Subdomain
// der Live-Seite per Suffix ab. Grenze der Heuristik: mehrteilige Public Suffixes
// (foo.co.uk → co.uk) werden NICHT aufgelöst — bewusst simpel (kein PSL-Paket, keine neuen
// Abhängigkeiten), für die Zielgruppe (Kanzlei-Tools mit einfachen .de/.com-Domains) genug.

/** Höchstzahl gespeicherter Domains je Tutorial (Kostenbremse + UI-Übersicht). */
export const MAX_SITE_DOMAINS = 10;

// Reine IPv4-Adresse — keine sinnvolle „Website"-Domain, daher verworfen.
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Normalisiert eine URL oder nackte Domain auf die Basis-Domain (lowercase, ohne www./
 * Subdomains, ohne Port/Pfad). Nur http(s)-URLs bzw. plausible Hostnamen (mind. ein Punkt,
 * keine IPv4). Ungültig → null. Wirft nie.
 */
export function normalizeDomain(input: string): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;

  let host = "";
  if (/^[a-z][a-z0-9+.-]*:\/\//.test(s)) {
    // Hat ein Schema: NUR http(s) zulassen (chrome://, file://, ftp:// … verwerfen).
    if (!/^https?:\/\//.test(s)) return null;
    try {
      host = new URL(s).hostname;
    } catch {
      return null;
    }
  } else {
    // Nackte Domain (evtl. mit Pfad/Port/Query): alles ab „/", „?" oder „#" abschneiden.
    host = s.split(/[/?#]/)[0];
  }

  // Port + abschließende Punkte entfernen.
  host = host.replace(/:\d+$/, "").replace(/\.+$/, "");
  if (!host) return null;

  // Nur erlaubte Hostname-Zeichen; keine IPv4-Adressen.
  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (IPV4_RE.test(host)) return null;
  if (host.length > 253) return null;

  const labels = host.split(".");
  // Mindestens zwei Labels (ein Punkt); jedes Label 1..63 Zeichen, kein führender/
  // abschließender Bindestrich.
  if (labels.length < 2) return null;
  for (const l of labels) {
    if (l.length < 1 || l.length > 63) return null;
    if (l.startsWith("-") || l.endsWith("-")) return null;
  }

  // Auf die registrierbare Basis-Domain reduzieren: die letzten ZWEI Labels.
  return labels.slice(-2).join(".");
}

/**
 * Vereinigt zwei Domain-Listen: dedupliziert (case-insensitiv), stabil alphabetisch
 * sortiert, auf MAX_SITE_DOMAINS (10) begrenzt. Nimmt bereits normalisierte Werte an (die
 * Aufrufer normalisieren via normalizeDomain); leere/kaputte Strings fallen weg.
 */
export function mergeDomains(existing: string[], add: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of [...(existing ?? []), ...(add ?? [])]) {
    if (typeof d !== "string") continue;
    const v = d.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  out.sort();
  return out.slice(0, MAX_SITE_DOMAINS);
}

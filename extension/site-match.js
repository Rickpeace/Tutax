"use strict";

// Steply Recorder - Seiten-Matching (Welle 31c). REINES Modul, klassisches Script (wie
// content.js/panel.js, kein Build-Step). Es entscheidet LOKAL im Browser, welche Tutorials
// zur gerade offenen Seite passen - fuer die Panel-Sektion „Fuer diese Seite".
//
// DATENSCHUTZ: Dieses Modul verarbeitet die aktuelle Tab-URL AUSSCHLIESSLICH lokal. Es
// macht KEINE Netz-Aufrufe; die besuchte URL verlaesst niemals den Browser (siehe auch die
// Kommentare in panel.js). Die Tutorial-Liste (inkl. site_domains) kommt EINMAL vom Server;
// das Abgleichen gegen die Live-URL passiert danach nur hier.
//
// Ladeweg: In der Seitenleiste als globales `self.SteplySiteMatch`; in Node (Tests) via
// `module.exports` - dieselbe UMD-Huelle wie sie Extensions ueblich nutzen. Testbar ohne
// Netz/Chrome (scripts/test-site-match.mjs, geladen via node:vm).

(function (global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (global) global.SteplySiteMatch = api;
})(typeof self !== "undefined" ? self : typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Hostname einer URL (lowercase, ohne abschliessenden Punkt) - NUR fuer normale
  // http(s)-Seiten. null bei chrome://, about:, file:, view-source:, data:, leer/kaputt …
  // (dort gibt es keine „Website", fuer die eine Anleitung gelten koennte).
  function hostnameOf(url) {
    if (typeof url !== "string" || !url) return null;
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      return null;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = (u.hostname || "").toLowerCase().replace(/\.+$/, "");
    return host || null;
  }

  // Passt ein (voller) Live-Hostname zu einer gespeicherten (Basis-)Domain? EXAKT oder als
  // Subdomain-Suffix: „login.datev.de" matcht „datev.de" (endet auf „.datev.de"). Die
  // gespeicherten Domains sind bereits Basis-Domains (server: normalizeDomain).
  function matchesDomain(hostname, domain) {
    if (typeof hostname !== "string" || typeof domain !== "string") return false;
    const h = hostname.toLowerCase().replace(/\.+$/, "");
    const d = domain.toLowerCase().replace(/^\.+|\.+$/g, "");
    if (!h || !d) return false;
    return h === d || h.endsWith("." + d);
  }

  // Alle Tutorials, die zur URL passen, sortiert:
  //   1) exakter Host-Treffer vor Subdomain-Suffix-Treffer,
  //   2) published vor draft,
  //   3) danach alphabetisch nach Titel.
  // Tutorial-Kontrakt (baut Welle 31a, GET /api/recorder/tutorials):
  //   { id, title, slug, status, visibility, site_domains, stepCount, selectorCount }
  function matchTutorials(url, tutorials) {
    const host = hostnameOf(url);
    if (!host || !Array.isArray(tutorials)) return [];
    const scored = [];
    for (const t of tutorials) {
      if (!t || !Array.isArray(t.site_domains)) continue;
      let exact = false;
      let suffix = false;
      for (const d of t.site_domains) {
        if (typeof d !== "string" || !d) continue;
        const dl = d.toLowerCase().replace(/^\.+|\.+$/g, "");
        if (!dl) continue;
        if (host === dl) {
          exact = true;
          break; // bester moeglicher Treffer fuer dieses Tutorial
        }
        if (host.endsWith("." + dl)) suffix = true;
      }
      if (exact || suffix) scored.push({ t: t, exact: exact });
    }
    scored.sort(function (a, b) {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      const ap = a.t.status === "published" ? 0 : 1;
      const bp = b.t.status === "published" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return String(a.t.title || "").localeCompare(String(b.t.title || ""));
    });
    return scored.map(function (s) {
      return s.t;
    });
  }

  return { hostnameOf: hostnameOf, matchesDomain: matchesDomain, matchTutorials: matchTutorials };
});

"use strict";

// Steply Automationen (Welle 36b): die PLANBAREN Teile der Ausführ-Engine als PURES
// Modul — ohne DOM, ohne Chrome-APIs, ohne Netz. So sind sie in Node testbar
// (scripts/test-exec-plan.mjs) und dieselbe Datei liefert im Panel `SteplyExecPlan`
// (UMD-Hülle wie guide-resolve.js / site-match.js).
//
// Drei Bausteine:
//   • buildRunPlan(automation, steps, values) → geordnete Aktionsliste mit AUFGELÖSTEN
//     Werten; wirft, wenn ein PFLICHT-Parameter fehlt (die Nachricht enthält nur den
//     Parameter-Schlüssel/-Label — NIE einen eingegebenen Wert).
//   • needsNavigation(currentUrl, step) → braucht der nächste Schritt einen Tab-Wechsel
//     (anderer Host ODER Pfad)? Query/Hash zählen NICHT (gleiche Seite, anderer Zustand).
//   • redactDetail(text) → Sicherheitsnetz: entfernt zufällig aussehende Tokens/Werte aus
//     detail-Strings, BEVOR sie den Browser verlassen (Werte dürfen nie in Server-Payloads).
//
// SICHERHEIT: Werte leben nur lokal; dieses Modul reicht sie NUR in die Aktionsliste
// (die im Browser bleibt) und protokolliert sie nie. redactDetail ist die letzte Bastion,
// falls doch einmal ein Wert in einen detail-String geriete.

(function (root) {
  // ── buildRunPlan ────────────────────────────────────────────────────────────
  // automation: { id, title, site_domains, params: [{key,label,type:'text'|'secret',required}] }
  // steps:      [{ id, position, title, action, selector, page_url, param_key, imageUrl, highlights? }]
  // values:     { [paramKey]: string }   (lokal; NIE geloggt)
  // → [{ index, total, title, action, selector, page_url, param_key, imageUrl, highlights, value? }]
  function buildRunPlan(automation, steps, values) {
    var vals = values && typeof values === "object" ? values : {};
    var params = automation && Array.isArray(automation.params) ? automation.params : [];

    // Pflicht-Parameter prüfen — fehlt einer, brechen wir VOR dem Lauf ab (kein halber Lauf).
    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      if (!p || !p.required) continue;
      var raw = vals[p.key];
      var filled = raw != null && String(raw).length > 0;
      if (!filled) {
        // NUR der Schlüssel/das Label — niemals ein (fehlender) Wert.
        var name = (p.label && String(p.label).trim()) || p.key || "?";
        throw new Error("Pflichtfeld fehlt: " + name);
      }
    }

    var list = (Array.isArray(steps) ? steps.slice() : []).sort(function (a, b) {
      return (numOr(a && a.position, 0)) - (numOr(b && b.position, 0));
    });
    var total = list.length;

    return list.map(function (s, idx) {
      var s0 = s || {};
      var action = {
        index: idx,
        total: total,
        title: typeof s0.title === "string" ? s0.title : "",
        action: s0.action,
        selector: s0.selector != null ? s0.selector : null,
        page_url: typeof s0.page_url === "string" ? s0.page_url : "",
        param_key: s0.param_key || null,
        imageUrl: s0.imageUrl != null ? s0.imageUrl : null,
        // Markierungen fürs Referenzbild in der Miss-Ansicht (Welle 37). Immer ein Array.
        highlights: Array.isArray(s0.highlights) ? s0.highlights : [],
      };
      // Wert nur setzen, wenn der Schritt einen Parameter referenziert und ein Wert vorliegt.
      if (s0.param_key && Object.prototype.hasOwnProperty.call(vals, s0.param_key)) {
        action.value = vals[s0.param_key];
      }
      return action;
    });
  }

  function numOr(n, fallback) {
    return typeof n === "number" && isFinite(n) ? n : fallback;
  }

  // ── needsNavigation ─────────────────────────────────────────────────────────
  // Muss vor dem Schritt navigiert werden? Vergleicht Host + Pfad (ohne Query/Hash).
  //   • kein page_url             → false (auf dem aktuellen Tab bleiben)
  //   • page_url unparsebar       → false (dorthin kann man ohnehin nicht navigieren)
  //   • currentUrl unparsebar     → true  (aktueller Ort unbekannt → sicherheitshalber hin)
  //   • anderer Host ODER Pfad    → true
  //   • gleicher Host + Pfad      → false (nur Query/Hash unterscheiden sich → gleiche Seite)
  function needsNavigation(currentUrl, step) {
    var target = step && typeof step.page_url === "string" ? step.page_url : "";
    if (!target) return false;
    var t;
    try {
      t = new URL(target);
    } catch (e) {
      return false;
    }
    var c;
    try {
      c = new URL(currentUrl);
    } catch (e) {
      return true;
    }
    if (t.host.toLowerCase() !== c.host.toLowerCase()) return true;
    return normPath(t.pathname) !== normPath(c.pathname);
  }

  function normPath(p) {
    var s = typeof p === "string" ? p : "";
    s = s.replace(/\/+$/, "");
    return s || "/";
  }

  // ── redactDetail ────────────────────────────────────────────────────────────
  // Sicherheitsnetz für detail-Strings (z. B. ein Fehlergrund), BEVOR sie an den Server
  // gehen. Entfernt, was nach Geheimnis/eingetipptem Wert aussieht. Bewusst großzügig
  // (lieber ein „***" zu viel): E-Mails, IBAN-artiges, lange Ziffernketten, gemischte
  // Token (Buchstaben+Ziffern, ≥ 12) und lange Hex/Base64-Blöcke.
  function redactDetail(text) {
    if (text == null) return "";
    var s = String(text);
    // E-Mail-Adressen.
    s = s.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "***");
    // IBAN-artig: 2 Buchstaben + 2 Ziffern + 10..30 alphanumerisch.
    s = s.replace(/\b[A-Za-z]{2}\d{2}[A-Za-z0-9]{10,30}\b/g, "***");
    // Lange reine Ziffernketten (≥ 6): Konto-/Karten-/CVV-artig.
    s = s.replace(/\b\d{6,}\b/g, "***");
    // Gemischte Token (mind. ein Buchstabe UND eine Ziffer, ≥ 12 Zeichen): API-Keys/Tokens.
    s = s.replace(/\b(?=[A-Za-z0-9_-]*[A-Za-z])(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{12,}\b/g, "***");
    // Lange reine Hex-Blöcke (≥ 16): Hashes/Secrets.
    s = s.replace(/\b[0-9a-fA-F]{16,}\b/g, "***");
    return s;
  }

  // ── submitOutcome / submitBounced (Welle 38) ─────────────────────────────────
  // Ehrlichkeits-Netz: Nach einem Formular-Submit (content meldet submitted:true) prüft das
  // Panel, ob die Übermittlung wirklich durchkam — statt blind „ok" zu melden und weiter zu
  // stapfen, während die Anmeldung real nicht durchkam (Richards Kaltstart-Login: die Seite
  // lädt voll neu, landet wieder auf demselben Pfad). Diese REINE Logik klassifiziert die im
  // Panel gesammelten Beobachtungen; kein DOM, kein Chrome, testbar.
  //
  //   prevUrl : Tab-URL im Moment des Submits.
  //   events  : geordnete Beobachtungen im Prüf-Fenster, je Eintrag EINES von:
  //             { url: "<aktuelle Tab-URL>" }            (aus tabs.onUpdated.url / Polling)
  //             { status: "loading" | "complete" }       (aus tabs.onUpdated.status)
  //   → "left"    : Tab hat den Formular-Pfad verlassen (Pfad gewechselt) = ERFOLG.
  //   → "bounced" : Voll-Reload (loading→complete) und wieder auf DEMSELBEN Pfad = FEHLGESCHLAGEN.
  //   → "pending" : (noch) keine Aussage — kein Pfadwechsel, kein Reload-Zyklus.
  //
  // Pfadvergleich = Host + Pfad (Query/Hash egal, wie needsNavigation): `/login` nach dem
  // Bounce (URL `/login?next=%2Fapp`) zählt als DERSELBE Pfad wie das Ausgangs-`/login`.
  // „left" schlägt „bounced": ein Pfadwechsel (auch via Voll-Reload, z. B. nativer POST →
  // /app) ist Erfolg. Maßgeblich ist die ZULETZT bekannte URL (keine Fehlklassifikation
  // durch eine flüchtige Zwischen-URL einer Redirect-Kette).
  function pathKey(u) {
    try {
      var x = new URL(u);
      return x.host.toLowerCase() + normPath(x.pathname);
    } catch (e) {
      return "";
    }
  }
  function submitOutcome(prevUrl, events) {
    var prevKey = pathKey(prevUrl);
    var evs = Array.isArray(events) ? events : [];
    // Zuletzt bekannte URL im Fenster (maßgeblich für den Pfadvergleich).
    var lastUrl = prevUrl;
    for (var i = 0; i < evs.length; i++) {
      if (evs[i] && typeof evs[i].url === "string" && evs[i].url) lastUrl = evs[i].url;
    }
    var lastKey = pathKey(lastUrl);
    // Ohne bekannten Ausgangs-Pfad können wir nichts beweisen → nie „bounced".
    if (prevKey && lastKey && lastKey !== prevKey) return "left";
    // Gleicher Pfad — kam ein VOLL-Reload (loading → danach complete)?
    var sawLoading = false;
    var sawComplete = false;
    for (var j = 0; j < evs.length; j++) {
      var s = evs[j] && evs[j].status;
      if (s === "loading") sawLoading = true;
      else if (s === "complete" && sawLoading) sawComplete = true;
    }
    if (prevKey && sawLoading && sawComplete) return "bounced";
    return "pending";
  }
  function submitBounced(prevUrl, events) {
    return submitOutcome(prevUrl, events) === "bounced";
  }

  var api = {
    buildRunPlan: buildRunPlan,
    needsNavigation: needsNavigation,
    redactDetail: redactDetail,
    submitOutcome: submitOutcome,
    submitBounced: submitBounced,
  };

  // UMD-artig: Node (CommonJS, für den Test) ODER classic panel-script (globaler Namespace).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SteplyExecPlan = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

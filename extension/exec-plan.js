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

    // Datei-Brücke (Welle 39): Download-/Upload-Schritte in Ablauf-Reihenfolge verknüpfen
    // (Download liefert key file1/file2…, Upload verbraucht den passenden Download). Wirft,
    // wenn ein Upload keinen vorherigen Download hat (defensiv — die Konvertierung fängt das
    // schon ab, aber ein re-derivierter Plan bleibt dadurch garantiert konsistent).
    var linked = linkFileSteps(list);
    if (!linked.ok) throw new Error(linked.error);

    return list.map(function (s, idx) {
      var s0 = s || {};
      var action = {
        index: idx,
        // Position des Schritts (Basis der Sprung-Zielsuche, Welle 47 jumpTargetIndex). Fehlt sie
        // → Index als Fallback. Additiv; alle anderen Verbraucher ignorieren das Feld.
        position: typeof s0.position === "number" && isFinite(s0.position) ? s0.position : idx,
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
      // Datei-Brücke: {role:'download',key} bzw. {role:'upload',source}. Nur setzen, wenn der
      // Schritt eine Datei trägt (sonst bleibt das Feld weg — bestehende Abläufe unverändert).
      if (linked.links[idx]) action.file_meta = linked.links[idx];
      // Bedingte Schritte (Welle 42): die (bereits validierte) condition 1:1 in die Aktion
      // durchreichen. Fehlt sie → Feld bleibt weg (Schritt läuft immer = heutiges Verhalten).
      // Zur LAUFZEIT ausgewertet (shouldRunStep/evalUrlCondition + content.js), NICHT hier.
      var pc = parseCondition(s0.condition);
      if (pc) action.condition = pc;
      // Bedingter Sprung / Block-Überspringen (Welle 47): die (tolerant validierte) jump-Angabe
      // durchreichen. to_position MUSS hinter DIESEM Schritt liegen (nur VORWÄRTS) — sonst weg.
      // Zur LAUFZEIT ausgewertet (jumpTargetIndex + shouldRunStep/content.js), GANZ VOR der
      // Navigation, damit der Lauf einen Login-Block gar nicht erst anfährt.
      var pj = parseJump(s0.jump, action.position);
      if (pj) action.jump = pj;
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

  // ── Tab-/Fenster-Folgen (Welle 43) ────────────────────────────────────────────
  // pickTabForStep(step, tabsInfo) → tabId | null. Verallgemeinert die W40-Navigation von
  // EINEM starr gebundenen Tab auf die LAUF-ZUGEHÖRIGE Tab-Menge: wählt den Tab, dessen aktuelle
  // URL (Host+Pfad, Query/Hash egal — pathKey wie needsNavigation) zur page_url des Schritts
  // passt. Kern der Verfolgung: ein Klick öffnet einen neuen Tab / ein OAuth-Popup (separates
  // Fenster) → der nächste Schritt gehört DORTHIN, nicht in den alten (WeTransfer-)Tab; schließt
  // sich das Popup wieder, passt der Opener-Tab zum Folgeschritt → Rückkehr.
  //   tabsInfo: [{ tabId, url, windowId?, lastFocusedMs? }] (die lauf-zugehörige Menge; der aktuell
  //             gebundene Tab ist enthalten, solange er lebt).
  //   • kein/unparsebares page_url → null (der Aufrufer bleibt beim aktuellen Tab; Schritte ohne
  //     page_url binden sich an die Seite des Vorgängers, exakt wie needsNavigation).
  //   • kein passender Tab → null (Aufrufer bleibt beim aktuellen Tab / navigiert ihn).
  //   • mehrere passende Tabs → der GEBUNDENE Tab (preferTabId), wenn er passt, gewinnt IMMER;
  //     sonst der ZULETZT FOKUSSIERTE (höchstes lastFocusedMs), bei Gleichstand der zuletzt in
  //     der Liste stehende (stabil/deterministisch).
  // preferTabId (Welle 46, optional): der aktuell gebundene Tab. BUGFIX In-Page-Klick — ein
  // reiner In-Page-Schritt (Dropdown öffnen, KEINE Navigation, KEIN neuer Tab) darf die Bindung
  // NIE an einen ANDEREN Tab mit derselben URL abgeben (z. B. eine während des Laufs geöffnete
  // zweite Kopie derselben Seite): sonst läuft der Klick im falschen Tab (oder hängt, wenn dieser
  // nicht antworten kann) → der Lauf schaltet nicht weiter. Passt der gebundene Tab selbst zum
  // Schritt, bleibt er gebunden. Bei einer ECHTEN Tab-Folge (der gebundene Tab passt NICHT mehr,
  // weil der Vorschritt in einen neuen Tab/ein OAuth-Popup führte) ist preferTabId kein Kandidat
  // → die bisherige „zuletzt fokussiert"-Wahl greift unverändert (Welle 43 bleibt intakt).
  // Popup-Bevorzugung fällt automatisch heraus: der Popup-Tab steht in tabsInfo, seine URL passt
  // zur nächsten page_url → er gewinnt gegen den (nicht passenden) Ursprungs-Tab.
  // PUR: kein DOM/Chrome/Netz — in Node testbar (scripts/test-exec-plan.mjs).
  function pickTabForStep(step, tabsInfo, preferTabId) {
    var target = step && typeof step.page_url === "string" ? step.page_url : "";
    if (!target) return null;
    var targetKey = pathKey(target);
    if (!targetKey) return null;
    var list = Array.isArray(tabsInfo) ? tabsInfo : [];
    var best = null;
    var preferMatches = false;
    for (var i = 0; i < list.length; i++) {
      var ti = list[i];
      if (!ti || ti.tabId == null) continue;
      if (pathKey(ti.url) !== targetKey) continue;
      // Der gebundene Tab passt selbst → er gewinnt (kein Wechsel bei reinem In-Page-Schritt).
      if (preferTabId != null && ti.tabId === preferTabId) preferMatches = true;
      if (best === null || focusMsOf(ti) >= focusMsOf(best)) best = ti;
    }
    if (preferMatches) return preferTabId;
    return best ? best.tabId : null;
  }

  function focusMsOf(ti) {
    return ti && typeof ti.lastFocusedMs === "number" && isFinite(ti.lastFocusedMs) ? ti.lastFocusedMs : 0;
  }

  // ── Zustands-Intelligenz (Welle 40) ───────────────────────────────────────────
  // Läufe/Führungen kommen mit dem Anmelde-Zustand klar: Ist der Nutzer schon angemeldet,
  // leitet die Website selbst um → die zugehörigen (Login-)Schritte werden ÜBERSPRUNGEN;
  // landet er auf einer fremden Login-Seite, WARTET der Lauf höflich. Drei PURE Helfer tragen
  // die Entscheidung (kein DOM/Chrome/Netz → in Node testbar):

  // resyncTarget(currentUrl, plan, fromIndex) → index|null
  // Erster Schritt mit Index ≥ fromIndex, dessen page_url (Host+Pfad, Query/Hash egal —
  // pathKey/normPath) zur aktuellen URL passt. NUR VORWÄRTS. Schritte OHNE page_url zählen
  // beim Matching NICHT (sie binden sich an die Seite des Vorgängers) — sie werden schlicht
  // übersprungen; passt currentUrl zu Schritt k, gilt der Treffer auch, wenn zwischen fromIndex
  // und k solche Schritte liegen (die gehören zur übersprungenen Strecke). currentUrl unlesbar
  // → null (nichts beweisbar).
  function resyncTarget(currentUrl, plan, fromIndex) {
    var list = Array.isArray(plan) ? plan : [];
    var curKey = pathKey(currentUrl);
    if (!curKey) return null;
    var start = typeof fromIndex === "number" && fromIndex > 0 ? Math.floor(fromIndex) : 0;
    for (var i = start; i < list.length; i++) {
      var s = list[i];
      var pu = s && typeof s.page_url === "string" ? s.page_url : "";
      if (!pu) continue;
      if (pathKey(pu) === curKey) return i;
    }
    return null;
  }

  // looksLikeLoginUrl(url) → bool
  // Erkennt Anmelde-Seiten am PFAD (nicht an der Query): Muster am Anfang eines Pfad-Segments
  // (nach „/" oder Pfadanfang): login|log-in|signin|sign-in|anmeld|auth|sso. „account/login"
  // ist durch „login" bereits abgedeckt. Groß/klein egal. „auth" segmentanfangs deckt
  // auth/authorize/authenticate ab; bewusst großzügig — im Live-Lauf zusätzlich per
  // Passwortfeld-Probe abgesichert (die Wache tippt NIE selbst Zugangsdaten).
  function looksLikeLoginUrl(url) {
    var p;
    try {
      p = new URL(url).pathname.toLowerCase();
    } catch (e) {
      return false;
    }
    return /(^|\/)(log-?in|sign-?in|anmeld|auth|sso)/.test(p);
  }

  // skipCrossesNeededDownload(plan, fromIndex, toIndex) → bool
  // Datei-Brücken-Kohärenz beim Vorspulen: Würde die übersprungene Strecke [from, to) einen
  // DOWNLOAD-Schritt enthalten, dessen Datei ein SPÄTERER (nicht übersprungener) Upload braucht?
  // Dann darf NICHT stumm übersprungen werden (der Upload hätte keine Datei) → der Aufrufer
  // pausiert stattdessen ehrlich. Rein strukturell über file_meta (Welle 39).
  function skipCrossesNeededDownload(plan, fromIndex, toIndex) {
    var list = Array.isArray(plan) ? plan : [];
    var from = Math.max(0, Math.floor(fromIndex || 0));
    var to = Math.min(list.length, Math.floor(toIndex != null ? toIndex : list.length));
    var skipped = {};
    for (var i = from; i < to; i++) {
      var fm = list[i] && list[i].file_meta;
      if (fm && fm.role === "download" && fm.key) skipped[fm.key] = true;
    }
    for (var j = to; j < list.length; j++) {
      var fm2 = list[j] && list[j].file_meta;
      if (fm2 && fm2.role === "upload" && fm2.source && skipped[fm2.source]) return true;
    }
    return false;
  }

  // skipCrossesLogin(plan, fromIndex, toIndex, secretKeys) → bool
  // Formulierungs-Heuristik fürs Vorspul-Feedback (Richards Verzweigungs-Metapher): Enthält die
  // übersprungene Strecke [from, to) Login-Schritte? → true, wenn ein Schritt eine Login-page_url
  // trägt ODER ein fill-Schritt einen als „secret" markierten Parameter füllt (secretKeys: Map
  // {paramKey:true}). Dann darf die UI „Angemeldet? → Ja ✓" texten statt nur „bereits erledigt".
  function skipCrossesLogin(plan, fromIndex, toIndex, secretKeys) {
    var list = Array.isArray(plan) ? plan : [];
    var secret = secretKeys && typeof secretKeys === "object" ? secretKeys : {};
    var from = Math.max(0, Math.floor(fromIndex || 0));
    var to = Math.min(list.length, Math.floor(toIndex != null ? toIndex : list.length));
    for (var i = from; i < to; i++) {
      var s = list[i];
      if (!s) continue;
      if (typeof s.page_url === "string" && s.page_url && looksLikeLoginUrl(s.page_url)) return true;
      if (s.action === "fill" && s.param_key && Object.prototype.hasOwnProperty.call(secret, s.param_key)) return true;
    }
    return false;
  }

  // ── Bedingte Schritte (Welle 42) ──────────────────────────────────────────────
  // Ein Automations-Schritt kann eine condition tragen: „führe NUR aus, wenn …". Damit
  // überstehen unbeaufsichtigte Läufe Cookie-Banner / optionale Dialoge / „Sitzung abgelaufen"-
  // Hinweise — die Maschine beantwortet dieselbe Ja/Nein-Frage, die im manuellen Tutorial der
  // Mensch per Klick beantwortet, per Element-/URL-Check. Formen (Migration 0034):
  //   { kind:'element', selector:{css,text,role}, negate? }  → nur wenn Element vorhanden+sichtbar
  //   { kind:'url', pattern:'…', negate? }                   → nur wenn die aktuelle URL passt
  // Die ELEMENT-Prüfung braucht das DOM → sie läuft im Ziel-Tab (content.js steply-eval-condition)
  // und liefert ein ROHES elementFound (gefunden+sichtbar, OHNE negate). Die URL-Prüfung ist pur
  // (evalUrlCondition, ROHER Treffer OHNE negate). Die EINZIGE Stelle, die negate anwendet UND
  // „ausführen vs. überspringen" entscheidet, ist shouldRunStep — so verhalten sich Element- und
  // URL-Bedingung garantiert identisch (kein doppeltes negate, eine dokumentierte Autorität).

  // parseCondition(raw) → normalisierte condition | null. TOLERANT (wirft NIE): unbekannte Form,
  // leerer Selektor/leeres pattern, fremde kind → null (Schritt läuft dann immer). Genutzt beim
  // Plan-Bau (buildRunPlan) UND — gespiegelt in TS (guide.ts validateStepCondition) — bei der
  // Aufnahme. negate NUR als echtes true übernehmen.
  function parseCondition(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var negate = raw.negate === true;
    if (raw.kind === "element") {
      var sel = raw.selector;
      if (!sel || typeof sel !== "object" || Array.isArray(sel)) return null;
      var out = {};
      var css = typeof sel.css === "string" ? sel.css.trim().slice(0, 400) : "";
      var text = typeof sel.text === "string" ? sel.text.trim().slice(0, 80) : "";
      var role = typeof sel.role === "string" ? sel.role.trim().toLowerCase().slice(0, 40) : "";
      if (css) out.css = css;
      if (text) out.text = text;
      if (role) out.role = role;
      if (!out.css && !out.text && !out.role) return null; // leerer Selektor → unbrauchbar
      var ce = { kind: "element", selector: out };
      if (negate) ce.negate = true;
      return ce;
    }
    if (raw.kind === "url") {
      var pat = typeof raw.pattern === "string" ? raw.pattern.trim().slice(0, 400) : "";
      if (!pat) return null;
      var cu = { kind: "url", pattern: pat };
      if (negate) cu.negate = true;
      return cu;
    }
    return null;
  }

  // evalUrlCondition(currentUrl, cond) → bool: ROHER URL-Treffer (OHNE negate — negate wendet
  // ausschließlich shouldRunStep an). Vergleichsbasis ist „host + pathname" (Query/Hash zählen
  // NICHT, wie needsNavigation), klein geschrieben. Zwei Formen:
  //   • pattern enthält '*' → einfache Glob (nur '*' ist Platzhalter, alles andere literal),
  //     als Teilstring-Regex (nicht verankert) getestet.
  //   • sonst → schlichter Teilstring-Vergleich.
  // Kein url-cond / kaputt / currentUrl unlesbar → false.
  function evalUrlCondition(currentUrl, cond) {
    if (!cond || cond.kind !== "url") return false;
    var pat = typeof cond.pattern === "string" ? cond.pattern.trim().toLowerCase() : "";
    if (!pat) return false;
    var hay;
    try {
      var u = new URL(currentUrl);
      hay = (u.host + u.pathname).toLowerCase();
    } catch (e) {
      hay = typeof currentUrl === "string" ? currentUrl.toLowerCase() : "";
    }
    if (!hay) return false;
    if (pat.indexOf("*") >= 0) {
      var re = "";
      for (var i = 0; i < pat.length; i++) {
        var ch = pat.charAt(i);
        re += ch === "*" ? ".*" : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }
      try {
        return new RegExp(re).test(hay);
      } catch (e2) {
        return false;
      }
    }
    return hay.indexOf(pat) >= 0;
  }

  // shouldRunStep(cond, signals) → bool: DIE EINE Entscheidung „Schritt ausführen (true) vs.
  // nahtlos überspringen (false)" — und die EINZIGE Stelle, die negate anwendet.
  //   • kein cond / unbekannte kind → true (Schritt läuft immer — bestehendes Verhalten).
  //   • kind 'element' → base = signals.elementFound (ROH, aus content.js).
  //   • kind 'url'     → base = signals.urlMatch (ROH, aus evalUrlCondition).
  //   • negate kehrt base um.
  function shouldRunStep(cond, signals) {
    if (!cond || typeof cond !== "object") return true;
    var s = signals && typeof signals === "object" ? signals : {};
    var base;
    if (cond.kind === "element") base = s.elementFound === true;
    else if (cond.kind === "url") base = s.urlMatch === true;
    else return true; // unbekannte kind → tolerant ausführen
    return cond.negate === true ? !base : base;
  }

  // ── Bedingter Sprung / Block-Überspringen (Welle 47) ──────────────────────────
  // Ein Schritt kann einen jump tragen: „wenn ⟨when⟩ zutrifft → springe VORWÄRTS zu Schritt
  // to_position (der ganze Block dazwischen wird übersprungen); sonst diesen Schritt normal".
  // KERN-FALL (Richard): eine Automation soll ein- UND ausgeloggt laufen. Das per-Schritt-„?"
  // (W42) reicht NICHT, weil jeder Login-Schritt seine Login-/Google-Seite als page_url trägt und
  // der Lauf sich SELBST dorthin navigiert, BEVOR die Bedingung greift. Der Sprung entscheidet
  // EINMAL, GANZ VORNE (vor der Navigation), und überspringt den ganzen Login-Block, sodass gar
  // nicht erst zu Login/Google navigiert wird. Die when-Auswertung teilt sich die Element-/URL-
  // Logik mit W42: „when erfüllt?" ist genau shouldRunStep(jump.when, signals) (EINE negate-Autorität;
  // Element via content.js steply-eval-condition STRENG exact/text, URL via evalUrlCondition).

  // parseJump(raw, fromPosition) → { when, to_position } | null. TOLERANT (wirft NIE). when via
  // parseCondition (Element-/URL-Bedingung); to_position MUSS ein ganzzahliger Wert > fromPosition
  // sein (nur VORWÄRTS — keine Schleife). Ist fromPosition unbekannt, genügt eine positive
  // Zielposition als Formprüfung; die Vorwärts-Garantie trägt zur Laufzeit jumpTargetIndex.
  function parseJump(raw, fromPosition) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    var when = parseCondition(raw.when);
    if (!when) return null; // kein/kaputtes when → kein Sprung
    var rawTo = raw.to_position;
    if (typeof rawTo !== "number" || !isFinite(rawTo)) return null;
    var to = Math.trunc(rawTo);
    var from = typeof fromPosition === "number" && isFinite(fromPosition) ? Math.trunc(fromPosition) : null;
    if (from != null) {
      if (to <= from) return null; // nur VORWÄRTS (rückwärts/gleich → kein Sprung)
    } else if (to < 1) {
      return null;
    }
    return { when: when, to_position: to };
  }

  // jumpTargetIndex(plan, fromIndex, toPosition) → index | null. Ziel-Index eines Sprungs: der
  // Schritt mit position == toPosition (oder der NÄCHSTGRÖSSERE, falls exakt fehlt), STRENG hinter
  // fromIndex. toPosition ≤ Position des tragenden Schritts → null (rückwärts/gleich, nie). Liegt
  // toPosition HINTER allen Schritten → plan.length (Sprung ans Ende = Lauf ist danach fertig).
  function jumpTargetIndex(plan, fromIndex, toPosition) {
    var list = Array.isArray(plan) ? plan : [];
    if (typeof toPosition !== "number" || !isFinite(toPosition)) return null;
    var to = Math.trunc(toPosition);
    var from = typeof fromIndex === "number" && isFinite(fromIndex) ? Math.trunc(fromIndex) : -1;
    var fromPos = from >= 0 && from < list.length ? planPosition(list[from], from) : -Infinity;
    if (to <= fromPos) return null; // rückwärts oder gleich → nie springen
    var nextGreater = null;
    for (var i = from + 1; i < list.length; i++) {
      var pos = planPosition(list[i], i);
      if (pos === to) return i; // exakter Treffer
      if (pos > to && nextGreater === null) nextGreater = i; // ersten größeren merken
    }
    if (nextGreater !== null) return nextGreater; // Ziel fehlt → nächstgrößerer
    // Kein Treffer und kein größerer: liegt toPosition HINTER echten Folgeschritten, geht der Sprung
    // ans Ende (Lauf endet); gibt es GAR keinen Folgeschritt (leerer/erschöpfter Plan) → null.
    return from + 1 < list.length ? list.length : null;
  }

  // Position eines Plan-Schritts (buildRunPlan setzt action.position); Fallback = Index.
  function planPosition(item, idx) {
    return item && typeof item.position === "number" && isFinite(item.position) ? item.position : idx;
  }

  // ── nextFireTime (Welle 41, ZEITPLAN) ─────────────────────────────────────────
  // Nächste Fälligkeit eines Wiederhol-Zeitplans als UTC-Epoch-ms — die REINE, getestete
  // Grundlage für chrome.alarms im Service-Worker (background.js legt pro aktivem Zeitplan
  // einen Alarm auf `when: nextFireTime(...)`). BEWUSST deterministisch: nowMs (UTC-Epoch)
  // und tzOffsetMin (wie Date.prototype.getTimezoneOffset(): Minuten, die zur LOKALEN Zeit
  // addiert UTC ergeben — UTC+2 → -120) werden ÜBERGEBEN; kein Date.now()/kein lokaler
  // Zeitzonen-Zugriff in dieser Funktion (im Test exakt steuerbar).
  //
  // schedule: { enabled, freq:'weekly'|'monthly', weekday:0-6, day:1-31, hour:0-23, minute:0-59 }
  //   • !enabled / ungültig                 → null
  //   • weekly   → nächster Wochentag `weekday` um hour:minute (heute schon vorbei → +7 Tage)
  //   • monthly  → nächster Tag `day` um hour:minute; day auf MONATSENDE geklemmt (31 im
  //                Februar → 28./29.); heute/Tag schon vorbei → nächster Monat.
  //
  // Modell: FESTER Offset (kein DST-Sprung INNERHALB einer Berechnung). Das ist bewusst — der
  // Worker rechnet bei JEDEM Sync (~30 min) mit dem AKTUELLEN tzOffset neu; ein DST-Wechsel
  // wird also an der Sync-Grenze eingefangen, nicht mitten in einer Fälligkeits-Rechnung.
  function nextFireTime(schedule, nowMs, tzOffsetMin) {
    var s = schedule && typeof schedule === "object" ? schedule : null;
    if (!s || s.enabled === false) return null;
    if (s.freq !== "weekly" && s.freq !== "monthly") return null;
    var now = typeof nowMs === "number" && isFinite(nowMs) ? nowMs : NaN;
    if (!isFinite(now)) return null;
    var tz = typeof tzOffsetMin === "number" && isFinite(tzOffsetMin) ? tzOffsetMin : 0;
    var hour = intInRange(s.hour, 0, 23);
    var minute = intInRange(s.minute, 0, 59);
    if (hour == null || minute == null) return null;

    // Lokale Wanduhr als „Pseudo-UTC" (getUTC* darauf lesen die LOKALE Zeit).
    var localNow = new Date(now - tz * 60000);
    var Y = localNow.getUTCFullYear();
    var Mo = localNow.getUTCMonth();
    var Da = localNow.getUTCDate();

    // Pseudo-UTC (lokale Wanduhr) → echte UTC-Epoche.
    var toUtc = function (pseudoMs) { return pseudoMs + tz * 60000; };

    if (s.freq === "weekly") {
      var weekday = intInRange(s.weekday, 0, 6);
      if (weekday == null) return null;
      // 0..7 Tage voraus: genau ein passender Wochentag; ist er heute schon vorbei, greift +7.
      for (var off = 0; off <= 7; off++) {
        var pseudo = Date.UTC(Y, Mo, Da + off, hour, minute, 0, 0); // Überlauf normalisiert Date.UTC
        if (new Date(pseudo).getUTCDay() !== weekday) continue;
        var candUtc = toUtc(pseudo);
        if (candUtc > now) return candUtc;
      }
      return null; // unerreichbar (7-Tage-Periode deckt jeden Wochentag ab)
    }

    // monthly: aktueller Monat, sonst nächster — day auf Monatsende klemmen.
    var day = intInRange(s.day, 1, 31);
    if (day == null) return null;
    for (var k = 0; k <= 1; k++) {
      var y = Y + Math.floor((Mo + k) / 12);
      var m = ((Mo + k) % 12 + 12) % 12;
      var eff = Math.min(day, daysInMonth(y, m));
      var pseudoM = Date.UTC(y, m, eff, hour, minute, 0, 0);
      var utcM = toUtc(pseudoM);
      if (utcM > now) return utcM;
    }
    return null; // unerreichbar (nächster Monat liegt immer in der Zukunft)
  }

  function intInRange(v, lo, hi) {
    if (typeof v !== "number" || !isFinite(v)) return null;
    var n = Math.trunc(v);
    return n >= lo && n <= hi ? n : null;
  }

  function daysInMonth(year, month0) {
    // Tag 0 des Folgemonats = letzter Tag dieses Monats.
    return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
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

  // ── linkFileSteps (Welle 39, Datei-Brücke) ────────────────────────────────────
  // Ordnet die Datei-Schritte eines Ablaufs in REIHENFOLGE zu: jeder Download-Schritt liefert
  // eine Datei unter einem key (file1, file2, …); jeder Upload-Schritt verbraucht die passende
  // Datei (1. Upload ← 1. Download, 2. Upload ← 2. Download; FIFO). Der Schlüssel ist die
  // ROLLE aus step.file_meta.role — die tatsächliche Aktion (click/upload) ist egal.
  //   steps: geordnetes Array; je Eintrag optional { file_meta: { role: 'download'|'upload' } }.
  //   → { ok:true, links:[ null | {role:'download',key} | {role:'upload',source} ] } (parallel)
  //   → { ok:false, error, index }  wenn ein Upload keinen vorherigen Download hat.
  // SICHERHEIT: rein strukturell — keine Datei-Bytes, keine Werte. Wirft nie.
  function linkFileSteps(steps) {
    var list = Array.isArray(steps) ? steps : [];
    var links = new Array(list.length).fill(null);
    var pool = []; // noch nicht verbrauchte Download-keys (FIFO)
    var dlCount = 0;
    for (var i = 0; i < list.length; i++) {
      var fm = list[i] && list[i].file_meta;
      var role = fm && typeof fm.role === "string" ? fm.role : "";
      if (role === "download") {
        var key = "file" + ++dlCount;
        links[i] = { role: "download", key: key };
        pool.push(key);
      } else if (role === "upload") {
        if (!pool.length) {
          return {
            ok: false,
            index: i,
            error:
              "Der Ablauf lädt eine Datei hoch, aber vorher wird keine heruntergeladen.",
          };
        }
        links[i] = { role: "upload", source: pool.shift() };
      }
    }
    return { ok: true, links: links };
  }

  // ── planFileChunks (Welle 39) ─────────────────────────────────────────────────
  // Größen-Planung für den Transport einer Datei (base64) ans Content-Script. Bleibt die
  // base64-Länge unter singleMax, geht sie als EINE Nachricht; sonst in ⌈len/chunkSize⌉
  // Stücken (Chunk-Protokoll `steply-exec-file-chunk`). Rein arithmetisch, testbar.
  function planFileChunks(b64len, singleMax, chunkSize) {
    var len = typeof b64len === "number" && b64len > 0 ? Math.floor(b64len) : 0;
    var single = typeof singleMax === "number" && singleMax > 0 ? singleMax : 8 * 1024 * 1024;
    var cs = typeof chunkSize === "number" && chunkSize > 0 ? chunkSize : 4 * 1024 * 1024;
    if (len === 0) return { mode: "single", chunks: 0, chunkSize: cs };
    if (len <= single) return { mode: "single", chunks: 1, chunkSize: cs };
    return { mode: "chunked", chunks: Math.ceil(len / cs), chunkSize: cs };
  }

  // ── fileCapDecision (Welle 39) ────────────────────────────────────────────────
  // Deckel-Entscheidung: Dateien bis `cap` (Standard 50 MB) werden im Speicher getragen
  // (Weg 1). Darüber → Disk/Mensch-Fallback (Weg 2/3), nie 66 MB base64 durch den Speicher.
  function fileCapDecision(size, cap) {
    var c = typeof cap === "number" && cap > 0 ? cap : 50 * 1024 * 1024;
    var s = typeof size === "number" && size >= 0 ? size : 0;
    return s > c ? "disk-fallback" : "memory";
  }

  var api = {
    buildRunPlan: buildRunPlan,
    needsNavigation: needsNavigation,
    // Tab-/Fenster-Folgen (Welle 43)
    pickTabForStep: pickTabForStep,
    redactDetail: redactDetail,
    submitOutcome: submitOutcome,
    submitBounced: submitBounced,
    linkFileSteps: linkFileSteps,
    planFileChunks: planFileChunks,
    fileCapDecision: fileCapDecision,
    // Zustands-Intelligenz (Welle 40)
    resyncTarget: resyncTarget,
    looksLikeLoginUrl: looksLikeLoginUrl,
    skipCrossesNeededDownload: skipCrossesNeededDownload,
    skipCrossesLogin: skipCrossesLogin,
    // Zeitplan (Welle 41)
    nextFireTime: nextFireTime,
    // Bedingte Schritte (Welle 42)
    parseCondition: parseCondition,
    evalUrlCondition: evalUrlCondition,
    shouldRunStep: shouldRunStep,
    // Bedingter Sprung / Block-Überspringen (Welle 47)
    parseJump: parseJump,
    jumpTargetIndex: jumpTargetIndex,
  };

  // UMD-artig: Node (CommonJS, für den Test) ODER classic panel-script (globaler Namespace).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SteplyExecPlan = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

"use strict";

// Steply Live-Führung (Welle 31): Selektor-Auflösung als PURES Modul.
//
// resolveSelector(root, selector) sucht auf einer LEBENDEN Seite das Element wieder, das
// bei der Aufnahme geklickt wurde. `selector` ist der bei der Sofort-Anleitung erfasste
// robuste { css, text, role } (steps.selector). `root` wird injiziert (document oder ein
// Test-Stub) -> die Funktion ist ohne Browser mit einem Mini-DOM-Stub testbar.
//
// Rückgabe: { el: Element|null, confidence: 'exact'|'healed'|'text'|'fuzzy'|null }.
// Reihenfolge (erste greifende Stufe gewinnt):
//   1. css via root.querySelector — Treffer und (falls text vorhanden) grobe Textübereinstimmung
//      (normalisiert; contains in BEIDE Richtungen) -> exact.
//      SELBSTHEILUNG Stufe A (Welle 44): traf css eindeutig+stabil+rollengleich, driftete aber
//      NUR der Text volatil (Version/Datum/Zähler; nearText), so gilt der Treffer als
//      selbstgeheilt -> healed (reason null, additiv healed:true). Sonst durchfallen.
//   2. Kandidaten über (implizite/explizite) Rolle + EXAKT normalisierter Text; genau EIN
//      Treffer -> text.
//   3. Fuzzy: contains-Textvergleich über klickbare Elemente; nur bei GENAU einem Treffer -> fuzzy.
//   Sonst { el: null, confidence: null }.
//
// SICHTBARE ELEMENTE BEVORZUGEN (Welle 45): resolveSelector(root, selector, opts) nimmt ein
// OPTIONALES `opts.isVisible(el) -> bool`. FEHLT es (alle Alt-Aufrufer/Tests), ist das Verhalten
// EXAKT wie zuvor — 100 % rückwärtskompatibel. Ist es da, BEVORZUGEN Stufe 2/3 sichtbare
// Kandidaten (statt an einem unsichtbaren 0×0-Duplikat — z. B. eingeklapptes Mobil-Menü — hängen
// zu bleiben) und Stufe 1 verankert NICHT an einem unsichtbaren css-Einzeltreffer, wenn ein Text
// vorhanden ist (Stufe 2/3 dürfen dann den sichtbaren Zwilling wählen). Gibt es NUR unsichtbare
// Treffer, wird wie bisher der eine zurückgegeben (der Aufrufer meldet über seine 0×0-Nachprüfung
// weiterhin „target-hidden"). Das Modul bleibt PUR: die Sichtbarkeit wird INJIZIERT, nie selbst
// (kein getBoundingClientRect) ermittelt.
//
// SHADOW DOM (Welle 48): selector.shadow = [hostCss, …] -> Host für Host in den offenen
// shadowRoot absteigen, dort css/text/role auflösen. Ohne shadow: wie bisher; findet der Text
// im Dokument GAR NICHTS, suchen Stufe 2/3 zusätzlich in offenen Shadow-Roots. Slot-Text
// (<button><slot></slot></button>) zählt über den flachen Baum mit.
//
// PUR halten: keine Chrome-APIs, keine Seiteneffekte, kein globaler Zustand.

(function (root) {
  // Klickbare/interaktive Kandidaten (deckt native Widgets + gängige ARIA-Rollen ab).
  // EIN konstanter Selektor-String -> im Test-Stub leicht als „gib alle Klickbaren" behandelbar.
  var CLICKABLE_SELECTOR =
    'a, button, input, textarea, select, summary, label, ' +
    '[role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], ' +
    '[role="menuitemradio"], [role="tab"], [role="option"], [role="checkbox"], ' +
    '[role="radio"], [role="switch"], [role="slider"], [role="combobox"], ' +
    '[onclick], [tabindex]';

  // Normalisieren: trim, Mehrfach-Whitespace zu einem, lowercase.
  function norm(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function tagOf(el) {
    return el && el.tagName ? String(el.tagName).toLowerCase() : "";
  }

  // Eingabefelder haben KEINEN sichtbaren textContent — ihr matchbarer Text ist die
  // BESCHRIFTUNG. Erfasst input (ausser button-artige), textarea, select, contenteditable.
  function isEditableEl(el) {
    var tag = tagOf(el);
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") {
      var type = String(getAttr(el, "type") || "text").toLowerCase();
      return !/^(button|submit|reset|image)$/.test(type);
    }
    var ce = getAttr(el, "contenteditable");
    if (ce === "" || String(ce).toLowerCase() === "true") return true;
    return false;
  }

  // "-Zeichen fuer einen [for="…"]-Selektor maskieren (pures Modul, kein CSS.escape).
  function attrEsc(v) {
    return String(v == null ? "" : v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Beschriftung einer Eingabe-Kontrolle (SPIEGELT die Aufnahme-Kette in content.js):
  // aria-label > aria-labelledby > <label for> > placeholder > name. Braucht `scope` fuer
  // die Referenz-Aufloesung (getElementById / label[for]); fehlt sie im Stub, faellt der
  // jeweilige Schritt einfach aus (Guards).
  function editableLabelText(el, scope) {
    var aria = getAttr(el, "aria-label");
    if (aria && norm(aria)) return norm(aria);
    var labelledby = getAttr(el, "aria-labelledby");
    if (labelledby && scope && typeof scope.getElementById === "function") {
      var acc = "";
      var ids = String(labelledby).split(/\s+/);
      for (var i = 0; i < ids.length; i++) {
        var ref = ids[i] ? scope.getElementById(ids[i]) : null;
        if (ref) {
          var rt = norm(ref.textContent || "");
          if (rt) acc += (acc ? " " : "") + rt;
        }
      }
      if (acc) return acc;
    }
    var id = getAttr(el, "id");
    if (id && scope && typeof scope.querySelector === "function") {
      try {
        var lbl = scope.querySelector('label[for="' + attrEsc(id) + '"]');
        if (lbl) {
          var lt = norm(lbl.textContent || "");
          if (lt) return lt;
        }
      } catch (err) {
        /* ungueltige id -> ignorieren */
      }
    }
    // Eingabefeld INNERHALB eines <label> (kein for-Attribut): der sichtbare Label-Text ist
    // die Beschriftung. Spiegelt content.js associatedLabelText (closest('label')). textContent
    // eines <input>/<select> zaehlt nicht zum Label-Text -> keine Wert-Leckage.
    try {
      if (el && typeof el.closest === "function") {
        var wrap = el.closest("label");
        if (wrap) {
          var wt = norm(wrap.textContent || "");
          if (wt) return wt;
        }
      }
    } catch (err) {
      /* egal */
    }
    var ph = getAttr(el, "placeholder");
    if (ph && norm(ph)) return norm(ph);
    var nm = getAttr(el, "name");
    if (nm && norm(nm)) return norm(nm);
    return "";
  }

  // Matchbarer (normalisierter) Text eines Elements. Fuer Eingabefelder die BESCHRIFTUNG
  // (label/placeholder/aria/name) statt des leeren textContent — sonst der sichtbare Text.
  // `scope` ist noetig, um label[for]/aria-labelledby aufzuloesen.
  //
  // Welle 43 (Google-„Konto auswaehlen"): Bei der AUFNAHME erfasst content.js den Text mit
  // el.innerText (visibleText) — das setzt an BLOCK-Grenzen Zeilenumbrueche/Leerraum. Ein
  // Konto-Zeilentext „Richard Petrasch \n richard.petrasch@googlemail.com" (Name + E-Mail in
  // getrennten <div>s) wird so zu „Richard Petrasch richard.petrasch@googlemail.com". textContent
  // dagegen KLEBT die Bloecke ohne Trenner zusammen („…Petraschrichard…") → norm ergaebe einen
  // anderen String und der Resolver meldete faelschlich „text-mismatch", obwohl das Element sichtbar
  // da ist. Deshalb beim Aufloesen ebenfalls innerText bevorzugen (spiegelt die Aufnahme), und nur
  // wenn es fehlt (Test-Stub / seltene Faelle) auf textContent zurueckfallen. Die Fuzzy-Grenzen
  // (containsEither, Mindestlaenge 3) bleiben UNVERAENDERT.
  // Shadow DOM (Welle 48): Text im „flachen" Baum — <slot> durch die zugewiesenen Light-DOM-
  // Knoten ersetzt, Shadow-Roots betreten. innerText/textContent eines Buttons IM Shadow-Root
  // (<button><slot></slot></button>) sind sonst LEER, obwohl sichtbar „Speichern" dasteht.
  // Spiegelt content.js flatText (Aufnahme). Nur bei Slot/Shadow-Root (Stub-Elemente: nie).
  function selectHasOption(sel, want) {
    try {
      var opts = sel.options || [];
      for (var i = 0; i < opts.length; i++) {
        if (norm(opts[i].text || opts[i].textContent || "") === want) return true;
      }
    } catch (err) {
      /* kein Treffer */
    }
    return false;
  }
  function hasSlotOrShadow(el) {
    try {
      if (el.shadowRoot) return true;
      return typeof el.querySelector === "function" && !!el.querySelector("slot");
    } catch (err) {
      return false;
    }
  }
  function flatTextOf(node, depth) {
    if (!node || depth > 12) return "";
    if (node.nodeType === 3) return node.nodeValue || "";
    if (node.nodeType !== 1 && node.nodeType !== 11) return "";
    var tag = node.nodeType === 1 ? tagOf(node) : "";
    if (tag === "style" || tag === "script" || tag === "template" || tag === "noscript") return "";
    if (tag === "slot" && typeof node.assignedNodes === "function") {
      var assigned = [];
      try {
        assigned = node.assignedNodes({ flatten: true });
      } catch (err) {
        assigned = [];
      }
      if (assigned.length) {
        var s = "";
        for (var a = 0; a < assigned.length; a++) s += " " + flatTextOf(assigned[a], depth + 1);
        return s;
      }
    }
    var kids = node.nodeType === 1 && node.shadowRoot ? node.shadowRoot.childNodes : node.childNodes;
    var out = "";
    for (var i = 0; kids && i < kids.length; i++) {
      out += " " + flatTextOf(kids[i], depth + 1);
      if (out.length > 400) break;
    }
    return out;
  }

  function visibleTextOf(el) {
    if (hasSlotOrShadow(el)) {
      var flat = norm(flatTextOf(el, 0));
      if (flat) return flat;
    }
    var it = null;
    try {
      it = el.innerText;
    } catch (err) {
      it = null;
    }
    if (typeof it === "string" && it.replace(/\s+/g, "").length > 0) return norm(it);
    try {
      return norm(el.textContent || "");
    } catch (err2) {
      return "";
    }
  }
  function textOf(el, scope) {
    if (!el) return "";
    try {
      if (isEditableEl(el)) return editableLabelText(el, scope);
      return visibleTextOf(el);
    } catch (err) {
      return "";
    }
  }

  // "contains in beide Richtungen": a enthält b ODER b enthält a (beide nicht leer).
  // MINDESTLÄNGE 3 für den ENTHALTENEN Teil (Hotfix 06.07.): Ein Avatar-Knopf „M" darf
  // die Suche nach „E-Mail" nicht fangen, nur weil „e-mail" ein „m" enthält. Exakt
  // gleiche Texte passen immer (auch kurze — „M" == „M" bleibt gültig).
  function containsEither(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    if (a.indexOf(b) >= 0) return b.length >= 3;
    if (b.indexOf(a) >= 0) return a.length >= 3;
    return false;
  }

  // ── Selbstheilung Stufe A (Welle 44) ────────────────────────────────────────────────────
  // „Volatil-Token" aus einem Text entfernen: Versionsnummern, Datums-/Uhrzeit-Muster und reine
  // Zahlen (Zähler). Motiv: ein Knopf „Extension herunterladen (v2.13.0)" heißt live
  // „…(v2.13.1)" — derselbe Knopf, nur die Version driftete. Nach dem Entfernen der Token
  // bleiben BEIDSEITIG identische Reste („extension herunterladen ()") → als „gleich" erkennbar.
  // Umschließende Satzzeichen (Klammern) bleiben ERHALTEN (nur der Inhalt fällt weg), damit der
  // Rest strukturell vergleichbar bleibt. Reihenfolge: Mehr-Token-Muster (Version/Datum/Zeit)
  // VOR den reinen Zahlen, sonst würde \d+ ein „2.13.0" in Bruchstücke zerlegen.
  function stripVolatileTokens(s) {
    return String(s == null ? "" : s)
      .replace(/v?\d+(?:[.,]\d+)+/gi, "") // Versionen/Dezimal/Punkt-Datum: v2.13.0, 2.13.1, 12.03.2024, 1,5
      .replace(/\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/g, "") // Datum mit / oder -: 2024-03-12, 01/02/2023
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, "") // Uhrzeit: 14:30, 09:15:00
      .replace(/\d+/g, ""); // reine Zahlen / Zähler: (3), Jahr 2024
  }

  // nearText(recorded, live): PUR. true, wenn recorded und live sich AUSSCHLIESSLICH in
  // volatilen Token (Versionsnummern/Daten/Zählern) unterscheiden — der bereinigte Rest also
  // BEIDSEITIG exakt gleich (nach norm) UND nicht leer ist. Zusätzlich muss der gemeinsame Rest
  // ≥3 sichtbare (nicht-Whitespace) Zeichen haben (analog containsEither-Mindestlänge 3), sonst
  // ist „nah" bedeutungslos (z. B. „(3)" vs „(5)" allein → Rest „()" → 2 Zeichen → false).
  // Gegenbeispiele: „speichern" vs „löschen" (Reste verschieden) und „weiter" vs
  // „weiter zu wetransfer" (Rest verschieden — echter Textwechsel) → false.
  function nearText(recorded, live) {
    var a = norm(recorded);
    var b = norm(live);
    if (!a || !b) return false;
    if (a === b) return true; // identisch → trivial nah (greift real schon in containsEither)
    var ca = norm(stripVolatileTokens(a));
    var cb = norm(stripVolatileTokens(b));
    if (!ca || ca !== cb) return false; // Reste müssen gleich UND nicht leer sein
    if (ca.replace(/\s+/g, "").length < 3) return false; // Sicherheits-Untergrenze
    return true;
  }

  // Trifft ein css-Selektor im Dokument GENAU EIN Element? Eindeutigkeit ist der
  // Sicherheitsanker der Selbstheilung — ein mehrdeutiger css-Treffer darf NIE geheilt werden
  // (man wüsste nicht, welches der Elemente gemeint war).
  function cssHitIsUnique(scope, css) {
    try {
      var all = scope.querySelectorAll(css);
      return !!all && all.length === 1;
    } catch (err) {
      return false;
    }
  }

  function getAttr(el, name) {
    try {
      return el && el.getAttribute ? el.getAttribute(name) : null;
    } catch (err) {
      return null;
    }
  }

  function hasAttr(el, name) {
    try {
      return !!(el && el.hasAttribute && el.hasAttribute(name));
    } catch (err) {
      return false;
    }
  }

  // Implizite/explizite ARIA-Rolle (gespiegelt aus content.js roleFor). Lowercase.
  function roleOf(el) {
    if (!el) return "";
    var explicit = getAttr(el, "role");
    if (explicit && String(explicit).trim()) return String(explicit).trim().toLowerCase();
    var tag = (el.tagName || "").toLowerCase();
    var type = String(getAttr(el, "type") || "").toLowerCase();
    if (tag === "a" && hasAttr(el, "href")) return "link";
    if (tag === "button") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      if (/^(button|submit|reset|image)$/.test(type)) return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "img") return "img";
    if (tag === "nav") return "navigation";
    return "";
  }

  function clickableCandidates(scope) {
    var list = [];
    try {
      var found = scope.querySelectorAll(CLICKABLE_SELECTOR);
      if (found) {
        for (var i = 0; i < found.length; i++) list.push(found[i]);
      }
    } catch (err) {
      /* querySelectorAll nicht verfügbar -> leere Liste */
    }
    return list;
  }

  // ── Flüchtige IDs (Welle 33, Fix 5) ──────────────────────────────────────────────────
  // Base UI / Radix / React useId u. ä. vergeben pro Render WECHSELNDE IDs
  // (#base-ui-_R_1m…, #base-ui-_r_6_, :r5:, radix-…). Als css-Selektor sind sie bei der
  // Führung praktisch immer tot. EINE geteilte Prüfung (content.js nutzt sie beim Aufnehmen,
  // um solche IDs gar nicht erst als Anker zu wählen; der Resolver, um NICHT vergeblich zu
  // warten). Stabile sprechende IDs (#invite-email) sind NICHT flüchtig.
  function isVolatileId(id) {
    if (!id || typeof id !== "string") return true; // kein/ungültig -> nicht als Anker taugen
    if (/^base-ui-/i.test(id)) return true;
    if (/^_[rR]_/.test(id)) return true; // React useId "_r_6_" / "_R_…"
    if (/^:r/i.test(id)) return true; // Doppelpunkt-Variante ":r5:"
    if (/^radix-/i.test(id)) return true;
    if (/^react-aria/i.test(id)) return true;
    if (/^headlessui-/i.test(id)) return true;
    if (/^mui-/i.test(id)) return true;
    if (/^\d+$/.test(id)) return true; // rein numerisch
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id)) return true; // UUID-artig
    return false;
  }

  // Zielt ein css-Selektor (grob) auf eine flüchtige #id? Zieht #id-Token heraus und prüft sie.
  function cssTargetsVolatileId(css) {
    if (typeof css !== "string" || css.indexOf("#") < 0) return false;
    var m = css.match(/#([^\s>#.\[\]:]+)/g);
    if (!m) return false;
    for (var i = 0; i < m.length; i++) {
      var id = m[i].slice(1).replace(/\\/g, "");
      if (isVolatileId(id)) return true;
    }
    return false;
  }

  // Rückgabe: { el, confidence, reason }. `reason` (Welle 33, Fix 3) begründet einen MISS
  // für die Panel-Anzeige/Telemetrie und ist rein ADDITIV — Aufrufer, die nur el/confidence
  // lesen, bleiben unberührt. Werte: "no-selector" | "css-miss" | "volatile-id" |
  // "text-mismatch" | "ambiguous". Bei Treffer ist reason null.
  function resolveIn(scope, selector, opts, deep) {
    if (!scope || !selector || typeof selector !== "object") {
      return { el: null, confidence: null, reason: "no-selector" };
    }
    var css = typeof selector.css === "string" ? selector.css : "";
    var wantText = norm(selector.text || "");
    var wantRole =
      typeof selector.role === "string" ? selector.role.trim().toLowerCase() : "";

    // ── Sichtbarkeits-Prädikat (Welle 45), INJIZIERT & OPTIONAL ────────────────────
    // hasVis=false (kein opts.isVisible) -> das Modul verhält sich EXAKT wie zuvor. Ist es da,
    // bevorzugen Stufe 2/3 sichtbare Kandidaten. isVisibleEl kapselt den Aufruf defensiv: wirft
    // das Prädikat (real nie — der Aufrufer liefert getBoundingClientRect>0), gilt „nicht
    // bestätigt sichtbar" -> false (konservativ; die reinen-unsichtbar-Fälle fangen die
    // Fallbacks unten wie bisher ab).
    var hasVis = !!(opts && typeof opts.isVisible === "function");
    function isVisibleEl(el) {
      if (!hasVis) return true;
      try {
        return !!opts.isVisible(el);
      } catch (err) {
        return false;
      }
    }

    // ── Stufe 1: css exakt (mit grober Textprüfung, falls text vorhanden) ──────────
    var cssVolatile = false;
    if (css) {
      var hit = null;
      try {
        hit = scope.querySelector(css);
      } catch (err) {
        hit = null;
      }
      if (hit) {
        if (!wantText) return { el: hit, confidence: "exact", reason: null };
        // Welle 45: Traf der css EIN UNSICHTBARES Element und ist ein Text da, NICHT hier
        // verankern (weder exakt noch geheilt) — Stufe 2/3 (sichtbarkeits-bevorzugend) dürfen
        // den sichtbaren Zwilling wählen. Nur bei injiziertem isVisible; ohne bleibt alles alt.
        if (!(hasVis && !isVisibleEl(hit))) {
          if (containsEither(textOf(hit, scope), wantText)) {
            return { el: hit, confidence: "exact", reason: null };
          }
          // Auswahlliste: aufgenommen wird die GEWAEHLTE Option als Text — die steht nicht im
          // Text des ganzen <select>, sondern ist eine seiner Optionen (Erweiterungs-Audit 24.09.:
          // Fuehrung/Automation fanden das Feld nie).
          if (tagOf(hit) === "select" && selectHasOption(hit, wantText)) {
            return { el: hit, confidence: "exact", reason: null };
          }
          // css traf, aber die strikte Text-Gegenprobe scheiterte. Bevor wir durchfallen:
          // SELBSTHEILUNG Stufe A (Welle 44) — akzeptiere den css-Treffer als selbstgeheilt
          // NUR, wenn ALLE strengen Sicherheitsbedingungen erfüllt sind:
          //   1. css ist NICHT flüchtig (ein flüchtiger Treffer wäre Zufall — nie vertrauen).
          //   2. css trifft im Dokument GENAU EIN Element (Eindeutigkeit = Sicherheitsanker).
          //   3. die Rolle stimmt (Button→Link wäre ein echtes „falsches Element"-Signal).
          //   4. der Text ist NUR volatil gedriftet (nearText: Version/Datum/Zähler) — ein
          //      echter Textwechsel (anderer Knopf) fällt weiter durch zu Stufe 2/3.
          // Confidence „healed" (zwischen exact und text); reason bleibt null; healed:true ist
          // ein rein ADDITIVES Telemetrie-Feld (Aufrufer lesen nur res.el).
          if (
            !cssTargetsVolatileId(css) &&
            cssHitIsUnique(scope, css) &&
            (!wantRole || roleOf(hit) === wantRole) &&
            nearText(wantText, textOf(hit, scope))
          ) {
            return { el: hit, confidence: "healed", reason: null, healed: true };
          }
        }
        // Kein sicheres Heilen möglich / unsichtbar übersprungen -> textbasierte Stufen versuchen.
      } else {
        // css verfehlt: war es ein flüchtiger-ID-Selektor (alte Aufnahme, Base UI & Co.)?
        // Dann ist der css-Pfad chancenlos -> Stufe 2/3 tragen die Auflösung; als Grund
        // melden wir „volatile-id" statt eines irreführenden „css-miss".
        cssVolatile = cssTargetsVolatileId(css);
      }
    }

    // Ohne Text sind Stufe 2/3 nicht möglich -> css hat schlicht nicht getroffen.
    if (!wantText) {
      return { el: null, confidence: null, reason: cssVolatile ? "volatile-id" : "css-miss" };
    }

    var first = textStages(clickableCandidates(scope), function () {
      return scope;
    });
    if (first.hit) return first.hit;
    var exactMatches = first.exactMatches;
    var fuzzyMatches = first.fuzzyMatches;

    // ── Shadow-DOM-Fallback (Welle 48): NUR wenn im Dokument GAR NICHTS passte (weder exakt
    // noch fuzzy — mehrdeutig bleibt mehrdeutig), dieselben Text-Stufen über die Kandidaten in
    // OFFENEN Shadow-Roots (Web-Komponenten: Salesforce/Microsoft/UI5). Teurer (Baum-Lauf),
    // darum nur hier. Jeder Kandidat löst seine Label-Referenzen in SEINEM Root auf.
    if (deep && !exactMatches.length && !fuzzyMatches.length) {
      var roots = openShadowRoots(scope);
      if (roots.length) {
        var dCands = [];
        var dScopes = [];
        for (var ri = 0; ri < roots.length; ri++) {
          var rc = clickableCandidates(roots[ri]);
          for (var rj = 0; rj < rc.length; rj++) {
            dCands.push(rc[rj]);
            dScopes.push(roots[ri]);
          }
        }
        var second = textStages(dCands, function (el, idx) {
          return dScopes[idx];
        });
        if (second.hit) return second.hit;
        exactMatches = second.exactMatches;
        fuzzyMatches = second.fuzzyMatches;
      }
    }

    // Kein eindeutiger Treffer: mehrere Kandidaten (ambiguous), sonst — bei totem
    // flüchtigen-ID-css — „volatile-id", andernfalls schlicht „text-mismatch".
    var reason =
      exactMatches.length > 1 || fuzzyMatches.length > 1
        ? "ambiguous"
        : cssVolatile
          ? "volatile-id"
          : "text-mismatch";
    return { el: null, confidence: null, reason: reason };

    // Stufe 2 + 3 über eine Kandidatenliste. scopeOf(el, index) liefert den Root für die
    // Label-Auflösung. Rückgabe: { hit } bei eindeutigem Treffer, sonst die Trefferlisten.
    function textStages(cands, scopeOf) {
      // ── Stufe 2: Rolle (falls vorhanden) + EXAKT normalisierter Text, genau EIN Treffer ──
      var exactMatches = [];
      for (var i = 0; i < cands.length; i++) {
        var el = cands[i];
        if (wantRole && roleOf(el) !== wantRole) continue;
        if (textOf(el, scopeOf(el, i)) === wantText) exactMatches.push(el);
      }
      if (hasVis) {
        // Welle 45: unter den exakten Treffern die SICHTBAREN bevorzugen. Genau EIN sichtbarer
        // -> nimm ihn (auch wenn daneben unsichtbare Duplikate liegen — Richards Fall). Ist KEINER
        // sichtbar, aber existiert genau einer -> Fallback auf den einen (nicht schlechter als heute;
        // der Aufrufer meldet dann per 0×0-Nachprüfung target-hidden). Mehrere sichtbare -> wie
        // bisher mehrdeutig (durchfallen zu Stufe 3, am Ende „ambiguous").
        var visExact = [];
        for (var vi = 0; vi < exactMatches.length; vi++) {
          if (isVisibleEl(exactMatches[vi])) visExact.push(exactMatches[vi]);
        }
        if (visExact.length === 1) return { hit: { el: visExact[0], confidence: "text", reason: null } };
        if (visExact.length === 0 && exactMatches.length === 1) {
          return { hit: { el: exactMatches[0], confidence: "text", reason: null } };
        }
      } else if (exactMatches.length === 1) {
        return { hit: { el: exactMatches[0], confidence: "text", reason: null } };
      }

      // ── Stufe 3: Fuzzy contains über klickbare Elemente, nur bei EINDEUTIG einem Treffer ──
      // Typ-Grenze (Hotfix 06.07.): Ein Eingabefeld-Schritt (textbox/searchbox/combobox) darf
      // NIE an einem Nicht-Eingabefeld ankern — und umgekehrt. Sonst „gewinnt" während des
      // Seitenaufbaus (Hydration/PPR) kurzzeitig ein völlig falsches Element als „eindeutig".
      var wantEditable =
        wantRole === "textbox" || wantRole === "searchbox" || wantRole === "combobox";
      var fuzzyMatches = [];
      for (var j = 0; j < cands.length; j++) {
        var cel = cands[j];
        if (wantRole && wantEditable !== isEditableEl(cel)) continue;
        var t = textOf(cel, scopeOf(cel, j));
        if (t && containsEither(t, wantText)) fuzzyMatches.push(cel);
      }
      if (hasVis) {
        // Welle 45: analog zu Stufe 2 — sichtbare contains-Treffer bevorzugen. Genau EIN
        // sichtbarer -> fuzzy; kein sichtbarer, aber genau einer existiert -> Fallback (Aufrufer
        // meldet target-hidden); mehrere sichtbare -> mehrdeutig (durchfallen zu „ambiguous").
        var visFuzzy = [];
        for (var fj = 0; fj < fuzzyMatches.length; fj++) {
          if (isVisibleEl(fuzzyMatches[fj])) visFuzzy.push(fuzzyMatches[fj]);
        }
        if (visFuzzy.length === 1) return { hit: { el: visFuzzy[0], confidence: "fuzzy", reason: null } };
        if (visFuzzy.length === 0 && fuzzyMatches.length === 1) {
          return { hit: { el: fuzzyMatches[0], confidence: "fuzzy", reason: null } };
        }
      } else if (fuzzyMatches.length === 1) {
        return { hit: { el: fuzzyMatches[0], confidence: "fuzzy", reason: null } };
      }
      return { hit: null, exactMatches: exactMatches, fuzzyMatches: fuzzyMatches };
    }
  }

  // ── Shadow DOM (Welle 48) ──────────────────────────────────────────────────────────────
  // selector.shadow = [hostCss, …] (von außen nach innen): Host für Host in dessen OFFENEN
  // shadowRoot absteigen; css/text/role gelten dann im innersten Root. Geschlossene Roots
  // (mode:"closed") sind von außen unsichtbar -> null (dann Text-Fallback).
  function descendShadow(scope, hosts) {
    var cur = scope;
    for (var i = 0; i < hosts.length; i++) {
      var h = null;
      try {
        h = cur.querySelector(hosts[i]);
      } catch (err) {
        h = null;
      }
      var sr = h ? h.shadowRoot : null;
      if (!sr || typeof sr.querySelector !== "function") return null;
      cur = sr;
    }
    return cur;
  }

  // Alle OFFENEN Shadow-Roots unterhalb von scope (auch verschachtelt), gekappt. Nur für den
  // Text-Fallback — ein Baum-Lauf über „*" ist teurer als die normalen Stufen.
  var MAX_SHADOW_ROOTS = 200;
  function openShadowRoots(scope) {
    var out = [];
    var queue = [scope];
    while (queue.length && out.length < MAX_SHADOW_ROOTS) {
      var s = queue.shift();
      var all = null;
      try {
        all = s.querySelectorAll("*");
      } catch (err) {
        all = null;
      }
      if (!all) continue;
      for (var i = 0; i < all.length && out.length < MAX_SHADOW_ROOTS; i++) {
        var sr = all[i] ? all[i].shadowRoot : null;
        if (sr && typeof sr.querySelectorAll === "function") {
          out.push(sr);
          queue.push(sr);
        }
      }
    }
    return out;
  }

  // Öffentlicher Einstieg. Ohne selector.shadow: EXAKT wie bisher (plus Shadow-Text-Fallback,
  // der nur greift, wenn im Dokument nichts passte). Mit shadow: im innersten Root auflösen;
  // fehlt ein Host oder trifft dort nichts, bleibt der seitenweite Text/Rolle-Fallback (ohne
  // css — der css-Pfad ist relativ zu einem Root und im Dokument bedeutungslos).
  function resolveSelector(scope, selector, opts) {
    if (!scope || !selector || typeof selector !== "object") {
      return { el: null, confidence: null, reason: "no-selector" };
    }
    var hosts = [];
    if (Array.isArray(selector.shadow)) {
      for (var i = 0; i < selector.shadow.length; i++) {
        if (typeof selector.shadow[i] === "string" && selector.shadow[i]) hosts.push(selector.shadow[i]);
      }
    }
    if (!hosts.length) return resolveIn(scope, selector, opts, true);
    var textOnly = { text: selector.text, role: selector.role };
    var inner = descendShadow(scope, hosts);
    if (inner) {
      var r = resolveIn(inner, selector, opts, true);
      if (r.el) return r;
      if (!selector.text) return r;
      var r2 = resolveIn(scope, textOnly, opts, true);
      return r2.el ? r2 : r;
    }
    if (!selector.text) return { el: null, confidence: null, reason: "css-miss" };
    return resolveIn(scope, textOnly, opts, true);
  }

  var api = {
    resolveSelector: resolveSelector,
    CLICKABLE_SELECTOR: CLICKABLE_SELECTOR,
    isVolatileId: isVolatileId,
    nearText: nearText, // pur exportiert für Direkttests (Welle 44)
  };

  // UMD-artig: Node (CommonJS, für den Test) ODER classic content-script (globaler Namespace).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SteplyGuideResolve = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

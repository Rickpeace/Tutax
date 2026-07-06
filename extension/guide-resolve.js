"use strict";

// Steply Live-Führung (Welle 31): Selektor-Auflösung als PURES Modul.
//
// resolveSelector(root, selector) sucht auf einer LEBENDEN Seite das Element wieder, das
// bei der Aufnahme geklickt wurde. `selector` ist der bei der Sofort-Anleitung erfasste
// robuste { css, text, role } (steps.selector). `root` wird injiziert (document oder ein
// Test-Stub) -> die Funktion ist ohne Browser mit einem Mini-DOM-Stub testbar.
//
// Rückgabe: { el: Element|null, confidence: 'exact'|'text'|'fuzzy'|null }.
// Reihenfolge (erste greifende Stufe gewinnt):
//   1. css via root.querySelector — Treffer und (falls text vorhanden) grobe Textübereinstimmung
//      (normalisiert; contains in BEIDE Richtungen) -> exact.
//   2. Kandidaten über (implizite/explizite) Rolle + EXAKT normalisierter Text; genau EIN
//      Treffer -> text.
//   3. Fuzzy: contains-Textvergleich über klickbare Elemente; nur bei GENAU einem Treffer -> fuzzy.
//   Sonst { el: null, confidence: null }.
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
    var ph = getAttr(el, "placeholder");
    if (ph && norm(ph)) return norm(ph);
    var nm = getAttr(el, "name");
    if (nm && norm(nm)) return norm(nm);
    return "";
  }

  // Matchbarer (normalisierter) Text eines Elements. Fuer Eingabefelder die BESCHRIFTUNG
  // (label/placeholder/aria/name) statt des leeren textContent — sonst textContent. `scope`
  // ist noetig, um label[for]/aria-labelledby aufzuloesen.
  function textOf(el, scope) {
    if (!el) return "";
    try {
      if (isEditableEl(el)) return editableLabelText(el, scope);
      return norm(el.textContent || "");
    } catch (err) {
      return "";
    }
  }

  // "contains in beide Richtungen": a enthält b ODER b enthält a (beide nicht leer).
  function containsEither(a, b) {
    if (!a || !b) return false;
    return a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
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

  function resolveSelector(scope, selector) {
    if (!scope || !selector || typeof selector !== "object") {
      return { el: null, confidence: null };
    }
    var css = typeof selector.css === "string" ? selector.css : "";
    var wantText = norm(selector.text || "");
    var wantRole =
      typeof selector.role === "string" ? selector.role.trim().toLowerCase() : "";

    // ── Stufe 1: css exakt (mit grober Textprüfung, falls text vorhanden) ──────────
    if (css) {
      var hit = null;
      try {
        hit = scope.querySelector(css);
      } catch (err) {
        hit = null;
      }
      if (hit) {
        if (!wantText) return { el: hit, confidence: "exact" };
        if (containsEither(textOf(hit, scope), wantText)) return { el: hit, confidence: "exact" };
        // css traf, aber Text passt nicht (SPA umgebaut / css zeigt woanders hin) ->
        // NICHT hier verankern, sondern die textbasierten Stufen versuchen.
      }
    }

    // Ohne Text sind Stufe 2/3 nicht möglich.
    if (!wantText) return { el: null, confidence: null };

    var cands = clickableCandidates(scope);

    // ── Stufe 2: Rolle (falls vorhanden) + EXAKT normalisierter Text, genau EIN Treffer ──
    var exactMatches = [];
    for (var i = 0; i < cands.length; i++) {
      var el = cands[i];
      if (wantRole && roleOf(el) !== wantRole) continue;
      if (textOf(el, scope) === wantText) exactMatches.push(el);
    }
    if (exactMatches.length === 1) return { el: exactMatches[0], confidence: "text" };

    // ── Stufe 3: Fuzzy contains über klickbare Elemente, nur bei EINDEUTIG einem Treffer ──
    var fuzzyMatches = [];
    for (var j = 0; j < cands.length; j++) {
      var t = textOf(cands[j], scope);
      if (t && containsEither(t, wantText)) fuzzyMatches.push(cands[j]);
    }
    if (fuzzyMatches.length === 1) return { el: fuzzyMatches[0], confidence: "fuzzy" };

    return { el: null, confidence: null };
  }

  var api = { resolveSelector: resolveSelector, CLICKABLE_SELECTOR: CLICKABLE_SELECTOR };

  // UMD-artig: Node (CommonJS, für den Test) ODER classic content-script (globaler Namespace).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SteplyGuideResolve = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

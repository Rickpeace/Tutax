"use strict";

// Steply Recorder - Content-Script (laeuft in JEDER http(s)-Seite, deklarativ im
// Manifest registriert, run_at document_start). Standardmaessig PASSIV: es zeichnet
// NUR waehrend einer laufenden Aufnahme Klicks auf.
//
// WARUM DEKLARATIV STATT PROGRAMMATISCHER INJEKTION (v1-Problem):
// v1 injizierte das Script per chrome.scripting nur in den aktiven Tab mit activeTab.
// Das scheiterte auf vielen Seiten und ueberlebte KEINE Navigation - Klicks auf
// Folge-Seiten fehlten. Deklarativ registriert laeuft das Script auf jeder Seite und
// in jeder Folge-Seite innerhalb des Tabs automatisch neu. Damit ueberleben Klicks den
// Seitenwechsel innerhalb des Tabs.
//
// WIE ES WEISS, OB AUFGENOMMEN WIRD:
// Die Seitenleiste (panel.js) schreibt beim Start { rec: { startedAt } } nach
// chrome.storage.local und loescht es beim Stopp. Dieses Content-Script liest den
// Zustand beim Laden UND lauscht auf storage-Aenderungen (chrome.storage.onChanged).
// So braucht es KEINE direkte Nachricht - eine frisch geladene Folge-Seite sieht den
// laufenden Zustand sofort.
//
// UHR-SYNCHRONISATION (bewusst einfach + robust):
// Content-Script und Seitenleiste laufen auf DERSELBEN Maschine und teilen sich damit
// dieselbe Wanduhr (Date.now()). startedAt ist Date.now() aus der Seitenleiste. Fuer
// jeden Klick gilt t = (Date.now() - startedAt) / 1000. Kein Abgleich von
// performance.now()-Zeiturspruengen ueber Kontextgrenzen noetig.

(() => {
  // Doppel-Registrierung vermeiden (z. B. wenn Chrome das Script mehrfach laedt).
  if (window.__steplyRecorderInstalled) return;
  window.__steplyRecorderInstalled = true;

  // ---- Erkennungs-Marker fuer App-Seiten (Welle 25) ------------------------
  // FRUEH (document_start) ein DOM-Attribut setzen, damit App-Seiten erkennen, dass die
  // Extension installiert ist. WICHTIG: Content-Script und Seite laufen in getrennten
  // JS-Welten (isolated world) - window-Variablen dieses Scripts sind fuer Seiten-Skripte
  // UNSICHTBAR. NUR das DOM ist geteilt, also ist ein Attribut der einzig verlaessliche
  // Marker. Wert = die Versionsnummer aus dem Manifest (die App zeigt „Installiert (vX)").
  try {
    const setMarker = () => {
      if (document.documentElement && chrome.runtime && chrome.runtime.getManifest) {
        document.documentElement.setAttribute(
          "data-steply-recorder",
          chrome.runtime.getManifest().version
        );
      }
    };
    setMarker();
    // Falls documentElement bei document_start noch nicht existiert: beim naechsten Tick.
    if (!document.documentElement) {
      document.addEventListener("readystatechange", setMarker, { once: true });
    }
  } catch (err) {
    /* Marker ist optional - im Zweifel still weiter */
  }

  // ---- Ein-Klick-Pairing (Welle 25) ----------------------------------------
  // Die App-Seite (Einstellungen -> Einbetten) stoesst das Verbinden per window.postMessage
  // an. SICHERHEIT (Origin-Bindung): Wir nehmen die Nachricht NUR an, wenn
  //   - event.source === window   (echtes Seiten-Fenster, kein iframe/fremder Kontext)
  //   - event.origin === location.origin  (kein fremder Absender)
  //   - event.data.__steply === true UND type === "steply-pair"
  //   - token ein plausibler String (Laenge gekappt)
  // Dann reichen wir NUR den Token an background.js weiter - mit appUrl = event.origin
  // (der verifizierten Herkunft, NICHT einem im Payload behaupteten Wert). background.js
  // validiert den Token GEGEN die Ziel-App, BEVOR etwas gespeichert wird. Das Ergebnis
  // (inkl. Kontoname) posten wir an die Seite zurueck -> sie zeigt Erfolg/Fehler an.
  function postPairResult(payload) {
    try {
      window.postMessage(
        Object.assign({ __steply: true, type: "steply-pair-result" }, payload),
        location.origin
      );
    } catch (err) {
      /* egal */
    }
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const d = event.data;
    if (!d || d.__steply !== true || d.type !== "steply-pair") return;
    const token = typeof d.token === "string" ? d.token.slice(0, 200).trim() : "";
    if (!token) {
      postPairResult({ ok: false, error: "Kein Token uebergeben." });
      return;
    }
    try {
      chrome.runtime
        .sendMessage({ type: "steply-pair", token, appUrl: event.origin })
        .then(
          (resp) =>
            postPairResult({
              ok: !!(resp && resp.ok),
              account: (resp && resp.account) || "",
              error: (resp && resp.error) || "",
            }),
          (err) =>
            postPairResult({
              ok: false,
              error: (err && err.message) || "Verbindung fehlgeschlagen.",
            })
        );
    } catch (err) {
      postPairResult({ ok: false, error: "Extension nicht erreichbar." });
    }
  });

  let recording = false;
  let startEpoch = 0;
  // Modus der laufenden Aufnahme: "video" (Screencast + Klick-Zeitstempel, Bestand) oder
  // "guide" (Sofort-Anleitung: pro Klick ein Screenshot + Element-Box, KEIN Video).
  let mode = "video";
  // guide-Modus: aktuell fokussiertes editierbares Feld (fuer die blur-basierte Eingabe-
  // Erkennung). startValue bleibt LOKAL (Vergleich), wird NIE ans Panel gesendet.
  let focusedEditable = null; // { el, kind, startValue, settled }

  function truncate(text, max) {
    if (!text) return "";
    const clean = String(text).replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
  }

  // Interaktive Elemente (fuer Klick-Aufloesung UND Dead-Click-Filter). Deckt neben den
  // nativen Widgets auch ARIA-Rollen ab (Checkbox/Switch/Slider/Tab/Option/Combobox).
  const INTERACTIVE_SELECTOR =
    'button, a, [role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], ' +
    '[role="menuitemradio"], [role="tab"], [role="option"], [role="checkbox"], [role="radio"], ' +
    '[role="switch"], [role="slider"], [role="combobox"], input, textarea, select, summary, ' +
    "label, [onclick]";

  // Das "sinnvolle" Element fuer einen Klick (fuer Label UND Bounding-Box): das naechste
  // interaktive Element in der Ahnenkette, sonst das Ziel selbst.
  function clickableFor(target) {
    if (!target || target.nodeType !== 1) return null;
    const clickable = target.closest(INTERACTIVE_SELECTOR);
    return clickable || target;
  }

  // Wie clickableFor, aber STRENG: null statt Fallback, wenn nichts Interaktives da ist
  // (Dead-Click-Filter der Sofort-Anleitung — Richards Fall: Klick auf eine passive Karte
  // markierte die ganze Karte und nahm ihren kompletten Text als Titel). Zusaetzlich:
  // contenteditable/tabindex>=0 in der Ahnenkette und die cursor:pointer-Heuristik fuer
  // klickbare DIVs ohne Rolle (onclick am Rahmenwerk statt im DOM-Attribut). Bei pointer
  // nehmen wir das AEUSSERSTE Element mit pointer als Widget-Grenze (die ganze Karte,
  // nicht der innere Span).
  function interactiveFor(target) {
    if (!target || target.nodeType !== 1) return null;
    let hit = null;
    try {
      hit = target.closest(INTERACTIVE_SELECTOR);
    } catch (err) {
      hit = null;
    }
    if (hit) return hit;
    let n = target;
    for (let i = 0; n && n.nodeType === 1 && i < 8; i++) {
      if (n.isContentEditable === true) return n;
      const ti = n.getAttribute && n.getAttribute("tabindex");
      if (ti != null && parseInt(ti, 10) >= 0) return n;
      n = n.parentElement;
    }
    let cur = null;
    try {
      if (getComputedStyle(target).cursor === "pointer") cur = target;
    } catch (err) {
      cur = null;
    }
    if (cur) {
      let p = cur.parentElement;
      let guard = 0;
      while (p && p !== document.body && p !== document.documentElement && guard < 8) {
        let c = "";
        try {
          c = getComputedStyle(p).cursor;
        } catch (err) {
          c = "";
        }
        if (c !== "pointer") break;
        cur = p;
        p = p.parentElement;
        guard++;
      }
      return cur;
    }
    return null;
  }

  // Whitespace kollabieren und an einer Wortgrenze auf max Zeichen kappen (60 fuer Labels).
  function clampLabel(text, max) {
    if (!text) return "";
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (clean.length <= max) return clean;
    let cut = clean.slice(0, max - 1);
    const sp = cut.lastIndexOf(" ");
    if (sp >= Math.floor(max * 0.5)) cut = cut.slice(0, sp);
    return cut.replace(/[\s.,;:]+$/, "") + "…";
  }

  // CSS-Sonderzeichen fuer #id / Attribut-Selektoren maskieren.
  function cssEscape(s) {
    try {
      if (window.CSS && CSS.escape) return CSS.escape(String(s));
    } catch (err) {
      /* fallthrough */
    }
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function cssEscapeAttr(v) {
    return String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // RETTUNGSNETZ: Sieht der Kandidat nach Code/CSS aus (styled-components legt CSS-Text in
  // <style>-Kinder, der frueher per textContent ins Label lief - „asdasda.MagqMc{...}")?
  // Dann verwerfen, damit die naechste Prioritaetsstufe greift.
  function looksLikeCode(s) {
    if (!s) return false;
    const t = String(s);
    if (t.indexOf("{") >= 0 || t.indexOf("}") >= 0) return true;
    const semis = (t.match(/;/g) || []).length;
    if (semis > 3) return true;
    if (/\.[A-Za-z][\w-]*\s*\{/.test(t)) return true; // .klasse { ... }
    if (/^\s*\.[A-Za-z][\w-]*(\s+\.|\s*[{,])/.test(t)) return true; // .A .B / .A{ / .A,
    if (/^\s*\.[A-Za-z0-9_-]*[A-Z][A-Za-z0-9_-]*\s/.test(t)) return true; // .CamelHash <space>
    return false;
  }

  // Sichtbaren Text ueber sichtbare Textknoten sammeln - OHNE <style>/<script>/<template>/
  // <noscript> und ohne display:none/visibility:hidden. Ergaenzt innerText fuer den Fall,
  // dass der pointerdown-Moment ausgeblendete Knoten hat.
  function textFromWalker(root) {
    let out = "";
    try {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          const tag = p.tagName;
          if (tag === "STYLE" || tag === "SCRIPT" || tag === "TEMPLATE" || tag === "NOSCRIPT") {
            return NodeFilter.FILTER_REJECT;
          }
          if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          try {
            const cs = getComputedStyle(p);
            if (cs && (cs.display === "none" || cs.visibility === "hidden")) {
              return NodeFilter.FILTER_REJECT;
            }
          } catch (err) {
            /* getComputedStyle kann werfen -> Knoten zulassen */
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode()) {
        out += walker.currentNode.nodeValue + " ";
        if (out.length > 240) break;
      }
    } catch (err) {
      out = "";
    }
    return out.replace(/\s+/g, " ").trim();
  }

  // Kurzer sichtbarer Text eines Elements (leer, wenn er nach Code aussieht). innerText
  // ignoriert <style>/<script> bereits; der Walker faengt Rest-Faelle ab.
  function visibleText(el) {
    if (!el || el.nodeType !== 1) return "";
    let txt = "";
    try {
      txt = el.innerText || "";
    } catch (err) {
      txt = "";
    }
    txt = txt.replace(/\s+/g, " ").trim();
    if (txt && !looksLikeCode(txt)) return txt;
    const walked = textFromWalker(el);
    if (walked && !looksLikeCode(walked)) return walked;
    return "";
  }

  // aria-label / aria-labelledby (aufgeloest) -> Text.
  function ariaLabelText(el) {
    if (!el || !el.getAttribute) return "";
    const aria = el.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      let acc = "";
      for (const id of labelledby.split(/\s+/)) {
        const ref = id && document.getElementById(id);
        if (ref) {
          const t = visibleText(ref);
          if (t) acc += (acc ? " " : "") + t;
        }
      }
      if (acc) return acc;
    }
    return "";
  }

  // Text des zugehoerigen <label> (el.labels deckt for=id UND umschliessend ab; plus
  // Fallbacks fuer Elemente ohne .labels wie contenteditable).
  function associatedLabelText(el) {
    if (!el) return "";
    try {
      if (el.labels && el.labels.length) {
        for (const l of el.labels) {
          const t = visibleText(l);
          if (t) return t;
        }
      }
    } catch (err) {
      /* egal */
    }
    if (el.id) {
      try {
        const lbls = document.querySelectorAll('label[for="' + cssEscapeAttr(el.id) + '"]');
        for (const l of lbls) {
          const t = visibleText(l);
          if (t) return t;
        }
      } catch (err) {
        /* ungueltige id -> ignorieren */
      }
    }
    const wrap = el.closest ? el.closest("label") : null;
    if (wrap) {
      const t = visibleText(wrap);
      if (t) return t;
    }
    return "";
  }

  // Ist das Element ein <label>, die zugehoerige Kontrolle liefern (fuer Editierbarkeit +
  // Eingabe-Erkennung); sonst das Element selbst.
  function controlForLabel(el) {
    if (!el || el.nodeType !== 1) return el;
    if ((el.tagName || "").toLowerCase() !== "label") return el;
    try {
      if (el.control) return el.control;
    } catch (err) {
      /* egal */
    }
    const forId = el.getAttribute && el.getAttribute("for");
    if (forId) {
      const byId = document.getElementById(forId);
      if (byId) return byId;
    }
    const inner =
      el.querySelector &&
      el.querySelector("input, textarea, select, [contenteditable=''], [contenteditable='true']");
    return inner || el;
  }

  // Editierbarkeit einer (bereits aufgeloesten) Kontrolle bewerten. Editierbar sind
  // textartige input/textarea/select, contenteditable und role=textbox/searchbox/combobox.
  // kind steuert Label- und Snapshot-Logik.
  function editableInfo(el) {
    if (!el || el.nodeType !== 1) return { editable: false, control: el, kind: "" };
    const tag = (el.tagName || "").toLowerCase();
    const type = ((el.getAttribute && el.getAttribute("type")) || el.type || "text").toLowerCase();
    const role = ((el.getAttribute && el.getAttribute("role")) || "").toLowerCase();
    if (tag === "textarea") return { editable: true, control: el, kind: "text" };
    if (tag === "select") return { editable: true, control: el, kind: "select" };
    if (tag === "input") {
      if (/^(button|submit|checkbox|radio|reset|file|image|range|color|hidden)$/.test(type)) {
        return { editable: false, control: el, kind: "" };
      }
      return { editable: true, control: el, kind: type === "password" ? "password" : "text" };
    }
    if (el.isContentEditable === true) return { editable: true, control: el, kind: "rich" };
    if (role === "textbox" || role === "searchbox" || role === "combobox") {
      return { editable: true, control: el, kind: "rich" };
    }
    return { editable: false, control: el, kind: "" };
  }

  // Sichtbare Feldueberschrift in der Naehe finden - das haeufigste Muster OHNE echte
  // <label>-Verknuepfung: <div>Telefon</div><input placeholder="+49 ...">. Wir gehen bis
  // zu 3 Ebenen nach oben und pruefen je Ebene die bis zu 2 unmittelbar vorangehenden
  // Geschwister. Bewusst konservativ: kurzer (<=40), code-freier Text; Geschwister, die
  // selbst Eingabefelder/Buttons enthalten (Formular-Grids), werden uebersprungen.
  function nearbyCaptionText(control) {
    let node = control;
    for (let depth = 0; depth < 3 && node && node !== document.body; depth++) {
      let sib = node.previousElementSibling;
      let hops = 0;
      while (sib && hops < 2) {
        let skip = false;
        try {
          // Interaktive Geschwister (Button/Link/Feld) sind NIE die Ueberschrift dieses
          // Feldes; Container MIT Feldern (Formular-Grids) ebenfalls ueberspringen.
          skip = !!(
            sib.matches &&
            sib.matches("input, textarea, select, button, a, [role='button'], [role='link']")
          );
          if (!skip) {
            skip = !!(
              sib.querySelector && sib.querySelector("input, textarea, select, button")
            );
          }
        } catch (err) {
          skip = true; // im Zweifel ueberspringen
        }
        if (!skip) {
          const t = visibleText(sib);
          if (t && t.length <= 40 && !looksLikeCode(t)) return t;
        }
        sib = sib.previousElementSibling;
        hops++;
      }
      node = node.parentElement;
    }
    return "";
  }

  // Label fuer ein editierbares Feld. DATENSCHUTZ: NIE der getippte Wert (el.value) - bei
  // type=password gilt das erst recht (nichts Feldinhaltliches). Kette: <label> > aria >
  // (select: gewaehlte Option) > sichtbare Feldueberschrift daneben > placeholder > name
  // > title. (Placeholder erst NACH der Ueberschrift: "Telefon" schlaegt "+49 ...".)
  function labelForEditable(control, kind) {
    const lbl = associatedLabelText(control);
    if (lbl && !looksLikeCode(lbl)) return clampLabel(lbl, 60);
    const aria = ariaLabelText(control);
    if (aria && !looksLikeCode(aria)) return clampLabel(aria, 60);
    if (kind === "select") {
      try {
        const opt =
          control.selectedIndex != null && control.selectedIndex >= 0
            ? control.options[control.selectedIndex]
            : null;
        const t = opt && (opt.textContent || opt.label);
        if (t && t.trim()) return clampLabel(t, 60);
      } catch (err) {
        /* egal */
      }
    }
    const cap = nearbyCaptionText(control);
    if (cap) return clampLabel(cap, 60);
    const ph = control.getAttribute && control.getAttribute("placeholder");
    if (ph && ph.trim() && !looksLikeCode(ph)) return clampLabel(ph, 60);
    const nm = control.getAttribute && control.getAttribute("name");
    if (nm && nm.trim()) return clampLabel(nm, 60);
    const ti = control.getAttribute && control.getAttribute("title");
    if (ti && ti.trim() && !looksLikeCode(ti)) return clampLabel(ti, 60);
    return "";
  }

  // Label fuer ein nicht editierbares Klick-Ziel. Kette: aria > sichtbarer Text >
  // zugehoeriges <label> (Checkbox/Radio/Slider haben selbst keinen Text!) > alt/title >
  // Feldueberschrift daneben > (nur Button-artige input) value > Tag.
  // KEIN value fuer Textfelder (Datenschutz).
  function clickLabel(el) {
    const aria = ariaLabelText(el);
    if (aria && !looksLikeCode(aria)) return clampLabel(aria, 60);
    const text = visibleText(el);
    if (text) return clampLabel(text, 60);
    const assoc = associatedLabelText(el);
    if (assoc && !looksLikeCode(assoc)) return clampLabel(assoc, 60);
    const alt = el.getAttribute && (el.getAttribute("alt") || el.getAttribute("title"));
    if (alt && alt.trim() && !looksLikeCode(alt)) return clampLabel(alt, 60);
    const cap = nearbyCaptionText(el);
    if (cap) return clampLabel(cap, 60);
    const tag = (el.tagName || "").toLowerCase();
    const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (tag === "input" && /^(button|submit|reset)$/.test(type) && el.value && String(el.value).trim()) {
      return clampLabel(el.value, 60); // Button-Caption (keine getippte Eingabe)
    }
    return clampLabel(tag, 60);
  }

  // Kuerzester sinnvoller Text fuer das geklickte/verlassene Element (editierbar vs. Klick).
  function labelFor(target) {
    if (!target || target.nodeType !== 1) return "";
    const clickable = clickableFor(target) || target;
    const info = editableInfo(controlForLabel(clickable));
    if (info.editable) {
      const l = labelForEditable(info.control, info.kind);
      if (l) return l;
      return clampLabel((info.control.tagName || "feld").toLowerCase(), 60);
    }
    return clickLabel(clickable);
  }

  // ---- Selektor-Vorbau (Welle 24): robuster { css, text, role } je Schritt. ----
  // Wird serverseitig streng validiert und in steps.selector gespeichert; noch NIRGENDS
  // gelesen (Vorbau fuer Live-Fuehrung). KEINE generierten Klassennamen (sc-/css-/Hashes) -
  // wir bauen den css-Pfad bewusst OHNE Klassen (id > data-testid > name/aria-label > nth).
  function isStableId(id) {
    if (!id || typeof id !== "string") return false;
    if (id.length > 64) return false;
    if (id.indexOf(":") >= 0) return false; // React useId ":r5:" u. ae.
    if (/^\d+$/.test(id)) return false; // rein numerisch
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(id)) return false; // UUID-artig
    if (/^(radix|headlessui|mui|react-aria|aria)-/i.test(id)) return false; // Framework-generiert
    if (/^[A-Za-z]+[-_][0-9a-f]{6,}$/i.test(id)) return false; // Praefix + Hash
    return true;
  }
  function isUnique(sel) {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch (err) {
      return false;
    }
  }
  function nthOfTypePath(el) {
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 5) {
      const tag = node.tagName.toLowerCase();
      if (node.id && isStableId(node.id)) {
        parts.unshift("#" + cssEscape(node.id));
        break; // stabile id ist ein guter Anker -> Pfad hier verankern
      }
      let seg = tag;
      const parent = node.parentElement;
      if (parent) {
        const same = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
        if (same.length > 1) seg += ":nth-of-type(" + (same.indexOf(node) + 1) + ")";
      }
      parts.unshift(seg);
      if (tag === "html" || tag === "body") break;
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }
  function cssPathFor(el) {
    if (!el || el.nodeType !== 1) return "";
    const tag = el.tagName.toLowerCase();
    const cap = (s) => (s && s.length <= 400 ? s : "");
    if (el.id && isStableId(el.id)) {
      const sel = "#" + cssEscape(el.id);
      if (isUnique(sel)) return cap(sel);
    }
    const attr = (name) => {
      const v = el.getAttribute && el.getAttribute(name);
      return v && v.length <= 100 ? v : "";
    };
    const testid = attr("data-testid");
    if (testid) {
      let sel = tag + '[data-testid="' + cssEscapeAttr(testid) + '"]';
      if (isUnique(sel)) return cap(sel);
      sel = '[data-testid="' + cssEscapeAttr(testid) + '"]';
      if (isUnique(sel)) return cap(sel);
    }
    const name = attr("name");
    if (name) {
      const sel = tag + '[name="' + cssEscapeAttr(name) + '"]';
      if (isUnique(sel)) return cap(sel);
    }
    const aria = attr("aria-label");
    if (aria) {
      const sel = tag + '[aria-label="' + cssEscapeAttr(aria) + '"]';
      if (isUnique(sel)) return cap(sel);
    }
    return cap(nthOfTypePath(el));
  }
  function roleFor(el) {
    const explicit = el.getAttribute && el.getAttribute("role");
    if (explicit && explicit.trim()) return explicit.trim().toLowerCase();
    const tag = (el.tagName || "").toLowerCase();
    const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (tag === "a" && el.hasAttribute && el.hasAttribute("href")) return "link";
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
  function selectorFor(el) {
    if (!el || el.nodeType !== 1) return undefined;
    const out = {};
    const css = cssPathFor(el);
    if (css) out.css = css;
    const text = clampLabel(visibleText(el) || "", 80);
    if (text) out.text = text;
    const role = roleFor(el).slice(0, 40);
    if (role) out.role = role;
    return out.css || out.text || out.role ? out : undefined;
  }

  // Lokaler Snapshot eines Feldwerts NUR zum Vergleich (bleibt IM Content-Script; wird NIE
  // ans Panel gesendet). Bei rich/contenteditable nur die Textlaenge (kein Inhalt).
  function fieldSnapshot(el, kind) {
    try {
      if (kind === "rich") return "len:" + ((el.textContent || "").length);
      return String(el.value == null ? "" : el.value);
    } catch (err) {
      return "";
    }
  }

  function onClick(event) {
    // Nur im Video-Modus Klick-Zeitstempel senden (im guide-Modus laeuft die Erfassung
    // ueber pointerdown, s. u.).
    if (!recording || mode !== "video") return;

    const w = window.innerWidth || document.documentElement.clientWidth || 1;
    const h = window.innerHeight || document.documentElement.clientHeight || 1;

    // clientX/Y ist relativ zum sichtbaren Fenster - passt zum aufgenommenen
    // Tab-Inhalt. Werte defensiv auf 0..1 klemmen.
    const x = Math.min(1, Math.max(0, event.clientX / w));
    const y = Math.min(1, Math.max(0, event.clientY / h));
    const t = Math.max(0, (Date.now() - startEpoch) / 1000);

    const click = {
      t: Math.round(t * 1000) / 1000,
      x: Math.round(x * 10000) / 10000,
      y: Math.round(y * 10000) / 10000,
      label: labelFor(event.target),
    };

    try {
      chrome.runtime.sendMessage({ type: "steply-click", click });
    } catch (err) {
      // Extension-Kontext evtl. weg (Reload) -> als beendet betrachten.
      recording = false;
    }
  }

  // Capture-Phase: Klick wird erfasst, auch wenn die Seite stopPropagation nutzt.
  document.addEventListener("click", onClick, true);

  // Rect (0..1, TANGO-Trick fuer pixelgenaue Markierung) + Pixel-Lage eines Elements.
  function rectOf(el) {
    const w = window.innerWidth || document.documentElement.clientWidth || 1;
    const h = window.innerHeight || document.documentElement.clientHeight || 1;
    const px = { left: 0, top: 0, width: 0, height: 0, cx: 0, cy: 0 };
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    try {
      const r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && r.width >= 0 && r.height >= 0) {
        px.left = r.left; px.top = r.top; px.width = r.width; px.height = r.height;
        px.cx = r.left + r.width / 2; px.cy = r.top + r.height / 2;
        const clamp = (n) => Math.min(1, Math.max(0, n));
        const round = (n) => Math.round(n * 10000) / 10000;
        rect = {
          x: round(clamp(r.left / w)),
          y: round(clamp(r.top / h)),
          w: round(clamp(r.width / w)),
          h: round(clamp(r.height / h)),
        };
        if (rect.x + rect.w > 1) rect.w = round(1 - rect.x);
        if (rect.y + rect.h > 1) rect.h = round(1 - rect.y);
      }
    } catch (err) {
      // Bounding-Box nicht ermittelbar -> leeres Rechteck (Markierung entfaellt still).
    }
    return { rect, px };
  }

  // Einen Schritt (Klick oder Eingabe) an das Panel senden. Die Seitenleiste macht darauf
  // SOFORT einen Screenshot. Der Klick-Puls (lastClickPx) wird erst NACH der Bestaetigung
  // gezeichnet, damit er nie mit im Bild landet. cx/cy optional (Fallback-Kreis).
  function emitStep(el, action, cx, cy) {
    const geo = rectOf(el);
    lastClickPx = {
      left: geo.px.left, top: geo.px.top, width: geo.px.width, height: geo.px.height,
      cx: cx != null ? cx : geo.px.cx, cy: cy != null ? cy : geo.px.cy,
    };
    const step = {
      rect: geo.rect,
      label: labelFor(el),
      action: action === "type" ? "type" : "click",
      url: (location && location.href ? location.href : "").slice(0, 500),
      title: truncate(document.title || "", 200),
      selector: selectorFor(el),
      ts: Date.now(),
    };
    try {
      chrome.runtime.sendMessage({ type: "steply-guide-step", step });
    } catch (err) {
      recording = false;
    }
  }

  // Ist ein editierbares Feld mit GEAENDERTEM Wert fokussiert, ZUERST den Eingabe-Schritt
  // senden und das Feld abrechnen (settled) - damit ein direkt folgender Klick DAHINTER
  // liegt und das nachfolgende blur keinen Doppel-Schritt erzeugt.
  function flushPendingInput() {
    const fe = focusedEditable;
    if (!fe || !fe.el || fe.settled) return false;
    const now = fieldSnapshot(fe.el, fe.kind);
    if (now === fe.startValue) return false;
    fe.settled = true;
    emitStep(fe.el, "type");
    return true;
  }

  // SOFORT-ANLEITUNG (guide-Modus): auf pointerdown (Capture-Phase, VOR Klick-Wirkung und
  // Navigation) das geklickte Element erfassen. Ein Klick IN ein editierbares Feld erzeugt
  // KEINEN Schritt mehr - dessen Inhalt meldet erst das blur als Eingabe-Schritt (Tango).
  function onPointerDown(event) {
    if (!recording || mode !== "guide") return;
    // Nur Haupt-Taste (linksklick / primaerer Zeiger).
    if (typeof event.button === "number" && event.button !== 0) return;

    const target = event.target;

    // EVENT-REIHENFOLGE (kritisch): pointerdown(Button) feuert VOR blur(Feld). Klickt man
    // ausserhalb des fokussierten Feldes, erst die Eingabe melden, dann den Klick.
    // Der Flush laeuft VOR dem Dead-Click-Filter: auch ein Klick ins Leere schliesst eine
    // offene Eingabe ab.
    const fe = focusedEditable;
    const insideFocused = !!(
      fe && fe.el && (target === fe.el || (fe.el.contains && fe.el.contains(target)))
    );
    if (!insideFocused) flushPendingInput();

    // DEAD-CLICK-FILTER: Klick auf nicht-interaktive Flaeche (passive Karte, Absatz,
    // Leerraum) erzeugt KEINEN Schritt.
    const el = interactiveFor(target);
    if (!el) return;

    // Klick IN ein editierbares Feld erzeugt KEINEN Schritt (kein Feld-Klick-Rauschen).
    const info = editableInfo(controlForLabel(el));
    if (info.editable) return;

    // Schieberegler (input type=range): der Schritt entsteht beim change (Endposition im
    // Screenshot), nicht beim Anfassen.
    const elTag = (el.tagName || "").toLowerCase();
    const elType = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (elTag === "input" && elType === "range") return;

    emitStep(el, "click", event.clientX || 0, event.clientY || 0);
  }

  // pointerdown feuert VOR click und VOR der Navigation -> der Screenshot zeigt die Seite
  // im Ausgangszustand (mit dem Element, das gleich geklickt wird).
  document.addEventListener("pointerdown", onPointerDown, true);

  // focusin: Startwert eines editierbaren Feldes merken (bleibt LOKAL, nie ans Panel).
  function onFocusIn(event) {
    if (!recording || mode !== "guide") return;
    const info = editableInfo(event.target);
    if (!info.editable) {
      focusedEditable = null;
      return;
    }
    focusedEditable = {
      el: info.control,
      kind: info.kind,
      startValue: fieldSnapshot(info.control, info.kind),
      settled: false,
    };
  }
  document.addEventListener("focusin", onFocusIn, true);

  // focusout: verlaesst man ein Feld mit GEAENDERTEM Wert, einen „type"-Schritt senden. Der
  // Screenshot entsteht damit NACH der Eingabe und zeigt das ausgefuellte Feld (gewollt).
  function onFocusOut(event) {
    if (!recording || mode !== "guide") return;
    const fe = focusedEditable;
    if (!fe || event.target !== fe.el) return;
    focusedEditable = null;
    if (fe.settled) return; // bereits per pointerdown-Flush abgerechnet
    const now = fieldSnapshot(fe.el, fe.kind);
    if (now !== fe.startValue) emitStep(fe.el, "type");
  }
  document.addEventListener("focusout", onFocusOut, true);

  // change: native <select> und Schieberegler (input type=range) -> ein „type"-Schritt
  // (sichtbare UI-Auswahl/-Position, kein Getipptes). Range feuert change je Raststufe
  // (Tastatur) bzw. beim Loslassen — pro Element gedrosselt, damit Feinjustieren nicht
  // zehn Schritte erzeugt (der Screenshot zeigt dann die letzte erfasste Position).
  let lastRangeStep = { el: null, t: 0 };
  function onChange(event) {
    if (!recording || mode !== "guide") return;
    const el = event.target;
    if (!el) return;
    const tag = (el.tagName || "").toLowerCase();
    const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    const isSelect = tag === "select";
    const isRange = tag === "input" && type === "range";
    if (!isSelect && !isRange) return;
    if (isRange) {
      const now = Date.now();
      if (lastRangeStep.el === el && now - lastRangeStep.t < 1200) {
        lastRangeStep.t = now;
        return;
      }
      lastRangeStep = { el, t: now };
    }
    emitStep(el, "type");
    // Feld abrechnen, damit das folgende blur keinen Doppel-Schritt erzeugt.
    if (isSelect && focusedEditable && focusedEditable.el === el) {
      focusedEditable.startValue = fieldSnapshot(el, "select");
      focusedEditable.settled = true;
    }
  }
  document.addEventListener("change", onChange, true);

  // ---- Klick-Puls (Tango-Stil): blaues Aufleuchten um das erfasste Element. ----
  let lastClickPx = null;
  function showCapturePulse() {
    if (!lastClickPx) return;
    const pad = 4;
    const el = document.createElement("div");
    const hasRect = lastClickPx.width > 2 && lastClickPx.height > 2;
    const st = el.style;
    st.position = "fixed";
    st.zIndex = "2147483647";
    st.pointerEvents = "none";
    st.border = "3px solid #ef6a4e";
    st.boxShadow = "0 0 0 4px rgba(239,106,78,0.25)";
    st.borderRadius = hasRect ? "10px" : "50%";
    if (hasRect) {
      st.left = lastClickPx.left - pad + "px";
      st.top = lastClickPx.top - pad + "px";
      st.width = lastClickPx.width + pad * 2 + "px";
      st.height = lastClickPx.height + pad * 2 + "px";
    } else {
      // Fallback ohne Element-Box: kleiner Kreis am Klickpunkt.
      st.left = lastClickPx.cx - 16 + "px";
      st.top = lastClickPx.cy - 16 + "px";
      st.width = "32px";
      st.height = "32px";
    }
    (document.documentElement || document.body).appendChild(el);
    try {
      el.animate(
        [
          { opacity: 0.9, transform: "scale(0.97)" },
          { opacity: 1, transform: "scale(1.03)", offset: 0.35 },
          { opacity: 0, transform: "scale(1.0)" },
        ],
        { duration: 650, easing: "ease-out" }
      ).onfinish = () => el.remove();
    } catch (err) {
      setTimeout(() => el.remove(), 650);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "steply-guide-captured" && recording && mode === "guide") {
      showCapturePulse();
    }
  });

  // Aufnahmezustand aus einem storage-Wert uebernehmen.
  function applyRecState(rec) {
    if (rec && typeof rec.startedAt === "number") {
      startEpoch = rec.startedAt;
      mode = rec.mode === "guide" ? "guide" : "video";
      recording = true;
    } else {
      recording = false;
    }
  }

  // Beim Laden den aktuellen Zustand lesen (deckt frisch geladene Folge-Seiten ab).
  try {
    chrome.storage.local.get("rec", (res) => {
      if (chrome.runtime.lastError) return;
      applyRecState(res && res.rec);
    });
  } catch (err) {
    // storage nicht verfuegbar (sehr alte Chrome-Version) -> Script bleibt passiv.
  }

  // Auf Aenderungen des Aufnahmezustands lauschen (Start/Stopp waehrend die Seite offen ist).
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.rec) return;
      applyRecState(changes.rec.newValue);
    });
  } catch (err) {
    // ignorieren
  }
})();

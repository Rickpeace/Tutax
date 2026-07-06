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

  // ---- Seitenleiste per Klick auf der App-Seite oeffnen (v2.2.1) -------------
  // Die Sofort-Anleitung-Karte im „Neue Anleitung"-Dialog postet {type:"steply-open-panel"}.
  // Gleiche Origin-Bindung wie beim Pairing. background.js ruft chrome.sidePanel.open()
  // SYNCHRON im onMessage-Handler auf - die Klick-Geste der Seite reicht dafuer durch
  // (Chrome >= 116), solange dazwischen nichts awaited wird.
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const d = event.data;
    if (!d || d.__steply !== true || d.type !== "steply-open-panel") return;
    try {
      chrome.runtime.sendMessage({ type: "steply-open-panel" });
    } catch (err) {
      /* Extension nicht erreichbar - Karte zeigt den manuellen Weg als Fallback */
    }
  });

  // ---- Aufnahme-Anker: „Ab hier mit Extension aufnehmen" (Welle 27) ----------
  // Ein Einfügepunkt im Steply-Builder postet {type:"steply-record-into", target, label}.
  // GLEICHE Origin-Bindung wie beim Pairing/Panel-Oeffnen. Wir reichen NUR ein sauberes,
  // laengen-gekapptes Ziel an background.js weiter (dort: Seitenleiste synchron oeffnen +
  // pendingTarget speichern). Die Herkunft (origin) bestimmt background aus dem Sender,
  // nicht aus dem Payload. Der target-Inhalt (tutorialId/anchor) wird ausserdem serverseitig
  // in guide-complete streng geprueft (Konto-Eigentum, Entwurf, Anker) - hier nur Hygiene.
  function cleanId(v) {
    return typeof v === "string" ? v.slice(0, 100).trim() : "";
  }
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== location.origin) return;
    const d = event.data;
    if (!d || d.__steply !== true || d.type !== "steply-record-into") return;
    const t = d.target && typeof d.target === "object" ? d.target : null;
    const a = t && t.anchor && typeof t.anchor === "object" ? t.anchor : null;
    if (!t || !a) return;
    const tutorialId = cleanId(t.tutorialId);
    if (!tutorialId) return;
    // Genau EIN Anker-Feld durchreichen (afterStepId ODER branchId).
    let anchor = null;
    if (cleanId(a.afterStepId)) anchor = { afterStepId: cleanId(a.afterStepId) };
    else if (cleanId(a.branchId)) anchor = { branchId: cleanId(a.branchId) };
    if (!anchor) return;
    const label = typeof d.label === "string" ? d.label.slice(0, 160).trim() : "";
    try {
      chrome.runtime.sendMessage({
        type: "steply-record-into",
        target: { tutorialId, anchor },
        label,
      });
    } catch (err) {
      /* Extension nicht erreichbar - der Builder zeigt den manuellen Weg als Fallback */
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

  // Grosse Link-Kacheln (YouTube & Co.): aria-label/sichtbarer Text der GANZEN Kachel
  // enthaelt oft Titel + Metadaten ("... 19 minutes"). Steckt im Element eine echte
  // Ueberschrift, ist DEREN Text das sauberere Label.
  function headingText(el) {
    try {
      const h =
        el.querySelector &&
        el.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"]');
      if (!h) return "";
      const t = visibleText(h);
      return t && t.length <= 80 ? t : "";
    } catch (err) {
      return "";
    }
  }

  // Label fuer ein nicht editierbares Klick-Ziel. Kette: aria > sichtbarer Text >
  // zugehoeriges <label> (Checkbox/Radio/Slider haben selbst keinen Text!) > alt/title >
  // Feldueberschrift daneben > (nur Button-artige input) value > Tag.
  // KEIN value fuer Textfelder (Datenschutz). Ist der Normalweg LANG (>60, Kachel mit
  // Metadaten), gewinnt eine enthaltene Ueberschrift.
  function clickLabel(el) {
    const aria = ariaLabelText(el);
    if (aria && !looksLikeCode(aria)) {
      if (aria.trim().length > 60) {
        const h = headingText(el);
        if (h && !looksLikeCode(h)) return clampLabel(h, 60);
      }
      return clampLabel(aria, 60);
    }
    const text = visibleText(el);
    if (text) {
      if (text.length > 60) {
        const h = headingText(el);
        if (h && !looksLikeCode(h)) return clampLabel(h, 60);
      }
      return clampLabel(text, 60);
    }
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
  // Flüchtige-ID-Prüfung (Welle 33, Fix 5): dieselbe Liste wie im Resolver (guide-resolve.js
  // wird VOR content.js injiziert -> globaler Namespace steht bereit). Fehlt sie ausnahmsweise,
  // greifen die lokalen Muster in isStableId weiter.
  function isVolatileIdShared(id) {
    var R = globalThis.SteplyGuideResolve;
    return !!(R && typeof R.isVolatileId === "function" && R.isVolatileId(id));
  }
  function isStableId(id) {
    if (!id || typeof id !== "string") return false;
    if (id.length > 64) return false;
    if (isVolatileIdShared(id)) return false; // Base UI / Radix / useId & Co. -> nie als Anker
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
    // Text-Gegenprobe fuer die Live-Fuehrung: Eingabefelder (input/textarea/select/
    // contenteditable) haben KEINEN sichtbaren textContent — als `text` daher das zugehoerige
    // LABEL erfassen (dieselbe Kette wie labelFor: <label>/aria/Ueberschrift/placeholder/name).
    // So findet guide-resolve.js das Feld ueber label/placeholder/aria wieder, statt am leeren
    // textContent zu scheitern (Richards Bug: „Tragen Sie … ein" wurde nicht markiert).
    const editable = editableInfo(controlForLabel(el));
    const rawText = editable.editable
      ? labelForEditable(editable.control, editable.kind)
      : visibleText(el);
    const text = clampLabel(rawText || "", 80);
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

  // ---- Auto-Schwaerzung (Welle 28): Rechtecke sichtbarer SENSIBLER Felder sammeln. ----
  // Datenschutz-Vorbau fuers Server-Blur (Gruender-Auftrag): Screenshots duerfen keine
  // API-Keys/Passwoerter/IBANs leaken. Wir sammeln NUR GEOMETRIE (normalisiert 0..1 zum
  // Viewport, wie rect) - NIEMALS Feldinhalte. Erfasst werden:
  //   • input[type=password] IMMER,
  //   • input/textarea, deren Label/aria-label/placeholder/name/id auf sensible Begriffe
  //     matcht (API-Key, secret, token, Passwort, IBAN, Kontonummer, Kreditkarte, CVV, BIC),
  //   • beliebige Elemente mit [data-steply-sensitive] (Opt-in).
  // Sichtbar = im Viewport, Flaeche > 0, nicht display:none/visibility:hidden. Kappe bei 10
  // (die groessten zuerst), Werte 0..1 geklemmt (rectOf klemmt bereits).
  const SENSITIVE_RE =
    /(api[-_ ]?key|secret|token|geheim|passw|iban|kontonummer|kreditkarte|credit[-_ ]?card|cvv|bic)/i;
  const MAX_SENSITIVE = 10;

  // Trifft die BESCHRIFTUNG (Label/aria-label/placeholder/name/id) eines Feldes einen
  // sensiblen Begriff? NUR Metadaten des Feldes - NIE der eingegebene Wert.
  function isSensitiveByMeta(el) {
    try {
      const parts = [
        associatedLabelText(el),
        ariaLabelText(el),
        el.getAttribute && el.getAttribute("placeholder"),
        el.getAttribute && el.getAttribute("name"),
        el.id,
      ];
      const hay = parts.filter(Boolean).join(" ");
      return !!hay && SENSITIVE_RE.test(hay);
    } catch (err) {
      return false;
    }
  }

  // Sichtbar fuer die Schwaerzung: im Viewport, Flaeche > 0, nicht display:none/hidden.
  function isVisibleForRedaction(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs && (cs.display === "none" || cs.visibility === "hidden")) return false;
    } catch (err) {
      /* getComputedStyle kann werfen -> das Rect entscheidet */
    }
    let r;
    try {
      r = el.getBoundingClientRect();
    } catch (err) {
      return false;
    }
    if (!r || r.width <= 0 || r.height <= 0) return false;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    // Im Viewport, sobald es ihn ueberhaupt schneidet.
    if (r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) return false;
    return true;
  }

  // Alle sichtbaren sensiblen Elemente -> normalisierte Rechtecke (0..1), groesste zuerst,
  // Kappe 10. Reine Geometrie; wirft nie (im Zweifel leere Liste).
  function collectSensitiveRects() {
    const seen = new Set();
    const rects = [];
    const add = (el) => {
      if (!el || el.nodeType !== 1 || seen.has(el)) return;
      seen.add(el);
      if (!isVisibleForRedaction(el)) return;
      const { rect } = rectOf(el);
      const area = rect.w * rect.h;
      if (!(area > 0)) return;
      rects.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, area });
    };
    try {
      // 1) Passwortfelder IMMER.
      document.querySelectorAll('input[type="password"]').forEach(add);
      // 2) Opt-in per Attribut (beliebige Elemente).
      document.querySelectorAll("[data-steply-sensitive]").forEach(add);
      // 3) Text-Eingaben mit sensibler Beschriftung.
      document.querySelectorAll("input, textarea").forEach((el) => {
        if (isSensitiveByMeta(el)) add(el);
      });
    } catch (err) {
      /* im Zweifel lieber nichts erfassen als einen Fehler werfen */
    }
    rects.sort((a, b) => b.area - a.area);
    return rects.slice(0, MAX_SENSITIVE).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
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
    // Auto-Schwaerzung (Welle 28): nur GEOMETRIE sichtbarer sensibler Felder, additiv.
    const sensitive = collectSensitiveRects();
    if (sensitive.length) step.sensitive = sensitive;
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

  // "Inhalt aktualisiert"-Signal der Seitenleiste (nach erfolgreichem Upload) in die
  // Seite weiterreichen - ein offener Builder/die Bibliothek laedt dann ohne F5 nach
  // (die App lauscht via ContentUpdatedRefresh; auf fremden Seiten verpufft es einfach).
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || msg.type !== "steply-content-updated") return;
    try {
      window.postMessage(
        { __steply: true, type: "steply-content-updated" },
        location.origin
      );
    } catch (err) {
      /* egal */
    }
  });

  // ============================================================================
  // LIVE-FUEHRUNG (Welle 31): Overlay auf der ECHTEN Seite (Tango/WalkMe-Prinzip).
  //
  // Das Panel schickt pro Schritt {type:"steply-guide-show", step:{selector,title,index,
  // total}}. Wir loesen das Element via SteplyGuideResolve.resolveSelector auf (SPA-
  // tolerant: bis ~1,5 s in Intervallen nachversuchen), zeichnen einen pulsierenden
  // Koralle-Rahmen (#ef6a4e) + ein Schritt-Badge „3/12", scrollen das Element in die Mitte
  // und lassen die Markierung Scroll/Resize folgen. Ein pointerdown auf dem Ziel (Capture)
  // meldet {type:"steply-guide-advance"}. Nicht gefunden -> {type:"steply-guide-status",
  // found:false}. „steply-guide-hide" raeumt Overlay + Listener restlos auf. Das Overlay
  // selbst ist pointer-events:none -> Klicks gehen an die echte Seite. Stile isoliert per
  // Inline-Style (wie showCapturePulse), Puls ueber die Web-Animations-API (kein globales CSS).
  // Der Installations-Guard oben sorgt dafuer, dass dieser Block pro Dokument nur EINMAL laeuft.
  // ============================================================================
  const GUIDE_OVERLAY_ID = "__steply-guide-overlay";
  let guideOverlayEl = null; // Container (Rahmen + Badge)
  let guideFrameEl = null; // pulsierender Rahmen
  let guideBadgeEl = null; // Schritt-Pille „3/12"
  let guideTargetEl = null; // aufgeloestes Ziel-Element
  // Element-Suche (Welle 33, Fix 3): MutationObserver + Fallback-Tick + Timeout statt starrem
  // Kurz-Polling. Alle drei werden von guideStopSearch() zentral abgeraeumt.
  let guideSearchObserver = null;
  let guideSearchTick = null;
  let guideSearchTimeout = null;
  let guideRafPending = false; // Reposition-Drossel (requestAnimationFrame)
  let guideAdvanceModeCur = "click"; // wie das Ziel „weiter" ausloest (s. guideAdvanceMode)
  let guideFieldListeners = null; // { el, onChange, onBlur, onKeydown } fuer Eingabe-Ziele
  let guideAdvanced = false; // Doppel-„weiter"-Schutz (Enter + blur / mehrere pointerdown)
  let guideTargetLost = false; // Ziel verschwand (SPA/0x0) -> Overlay versteckt, found:false EINMAL
  // Stille Wiederaufnahme (Hotfix 06.07.): SPAs/PPR ersetzen oder verstecken Knoten waehrend
  // Hydration/Streaming kurzzeitig. Bei Ziel-Verlust NICHT sofort aufgeben, sondern den
  // zuletzt gezeigten Schritt einmal komplett neu aufloesen (voller Suchlauf inkl. Ersatz-Knoten).
  let guideCurrentStep = null;
  let guideReacquireTimer = null;
  // Selbstschutz (Welle 33, Fix 2b): laeuft ein Overlay, aber kommt >60s kein show/ping mehr
  // (Panel hart geschlossen, Port-Hide verpasst), raeumt das Content-Script SELBST ab.
  let guideLastSignalAt = 0;
  let guideWatchdog = null;
  const GUIDE_SIGNAL_MAX_IDLE = 60000;

  // Genau EINMAL „weiter" pro Schritt melden (Enter + folgendes blur duerfen NICHT zwei
  // Schritte ueberspringen). Der Reset passiert beim naechsten steply-guide-show.
  function guideAdvance() {
    if (guideAdvanced) return;
    guideAdvanced = true;
    try {
      chrome.runtime.sendMessage({ type: "steply-guide-advance" });
    } catch (err) {
      /* Panel evtl. geschlossen - egal */
    }
  }

  // Wie ein aufgeloestes Ziel „weiter" schaltet:
  //   "click"  -> pointerdown (Buttons/Links/normale Klick-Ziele; Bestand).
  //   "text"   -> Enter im Feld ODER Verlassen (blur/change) mit NICHT-leerem Wert
  //               (input[text], textarea, contenteditable, role=textbox/searchbox/combobox).
  //   "toggle" -> change (Checkbox/Radio).
  //   "select" -> change (natives <select>).
  // Ein Klick IN ein Textfeld darf NICHT weiterschalten — sonst kommt man nie zum Tippen.
  function guideAdvanceMode(el) {
    if (!el || el.nodeType !== 1) return "click";
    const tag = (el.tagName || "").toLowerCase();
    const type = ((el.getAttribute && el.getAttribute("type")) || "").toLowerCase();
    if (tag === "select") return "select";
    if (tag === "textarea") return "text";
    if (tag === "input") {
      if (/^(checkbox|radio)$/.test(type)) return "toggle";
      if (/^(button|submit|reset|image|file|range|color)$/.test(type)) return "click";
      return "text"; // text/email/search/password/number/tel/url/date/...
    }
    if (el.isContentEditable === true) return "text";
    const role = ((el.getAttribute && el.getAttribute("role")) || "").toLowerCase();
    if (role === "textbox" || role === "searchbox" || role === "combobox") return "text";
    return "click";
  }

  // Hat ein Textfeld einen NICHT-leeren Wert? (contenteditable ueber textContent.)
  function guideFieldHasValue(el) {
    try {
      if (el.isContentEditable === true) return !!String(el.textContent || "").trim();
      return !!String(el.value == null ? "" : el.value).trim();
    } catch (err) {
      return false;
    }
  }

  // Fuer Eingabe-Ziele die passenden Listener setzen (Klick-Ziele laufen ueber pointerdown).
  function attachGuideFieldListeners(el, mode) {
    guideFieldListeners = null;
    if (mode === "click") return;
    const onChange = () => {
      if (mode === "toggle" || mode === "select") {
        guideAdvance();
      } else if (mode === "text" && guideFieldHasValue(el)) {
        guideAdvance();
      }
    };
    const onBlur = () => {
      if (mode === "text" && guideFieldHasValue(el)) guideAdvance();
    };
    const onKeydown = (e) => {
      if ((mode === "text" || mode === "select") && (e.key === "Enter" || e.keyCode === 13)) {
        guideAdvance();
      }
    };
    // Natives <select> (Hotfix 06.07.): Waehlt man die BEREITS eingestellte Option erneut,
    // feuert KEIN change (Wert unveraendert) — der Schritt schaltete dann nie weiter.
    // Chrome dispatcht beim Waehlen einer Option (auch derselben) einen click auf dem
    // <select> OHNE frisches eigenes pointerdown (das ging ans native Popup). Ein click
    // ohne kurz vorangegangenes pointerdown = Option gewaehlt -> weiter. Auf-/Zuklappen
    // (pointerdown + click direkt auf dem Element) schaltet NICHT weiter. Feuert Chrome
    // den click mal nicht, bleibt es beim heutigen Verhalten (change/Enter) — kein Risiko.
    let lastDownAt = 0;
    const onDown = () => {
      lastDownAt = Date.now();
    };
    const onClick = () => {
      if (mode === "select" && Date.now() - lastDownAt > 150) guideAdvance();
    };
    try {
      el.addEventListener("change", onChange, true);
      if (mode === "text") {
        el.addEventListener("blur", onBlur, true);
        el.addEventListener("keydown", onKeydown, true);
      }
      if (mode === "select") {
        el.addEventListener("keydown", onKeydown, true);
        el.addEventListener("pointerdown", onDown, true);
        el.addEventListener("click", onClick, true);
      }
      guideFieldListeners = { el, onChange, onBlur, onKeydown, onDown, onClick };
    } catch (err) {
      guideFieldListeners = null;
    }
  }

  // Laufende Element-Suche (Observer + Tick + Timeout) restlos stoppen.
  function guideStopSearch() {
    if (guideSearchObserver) {
      try {
        guideSearchObserver.disconnect();
      } catch (err) {
        /* egal */
      }
      guideSearchObserver = null;
    }
    if (guideSearchTick) {
      clearInterval(guideSearchTick);
      guideSearchTick = null;
    }
    if (guideSearchTimeout) {
      clearTimeout(guideSearchTimeout);
      guideSearchTimeout = null;
    }
  }

  function guideStopWatchdog() {
    if (guideWatchdog) {
      clearInterval(guideWatchdog);
      guideWatchdog = null;
    }
  }

  // Zombie-Overlays ENTFERNEN (Hotfix 06.07.): Ein Extension-Reload laesst alte content-
  // Script-Instanzen verwaist in offenen Tabs zurueck — deren Overlay-DOM (Rahmen + Badge)
  // klebt sonst fuer immer auf der Seite (Richards „Duplikat, das beim Scrollen wandert").
  // Wir raeumen deshalb ALLE Elemente mit unserer Overlay-ID ab, nicht nur das eigene.
  // (querySelectorAll findet auch mehrfach vergebene IDs.)
  function guideRemoveStrays() {
    try {
      document.querySelectorAll('[id="' + GUIDE_OVERLAY_ID + '"]').forEach((n) => {
        if (n !== guideOverlayEl) {
          try {
            n.remove();
          } catch (err) {
            /* egal */
          }
        }
      });
    } catch (err) {
      /* egal */
    }
  }

  function guideCleanup() {
    guideStopSearch();
    guideStopWatchdog();
    guideTargetLost = false;
    if (guideReacquireTimer) {
      clearTimeout(guideReacquireTimer);
      guideReacquireTimer = null;
    }
    document.removeEventListener("pointerdown", onGuidePointerDown, true);
    window.removeEventListener("scroll", guideReposition, true);
    window.removeEventListener("resize", guideReposition, true);
    if (guideFieldListeners) {
      const { el, onChange, onBlur, onKeydown, onDown, onClick } = guideFieldListeners;
      try {
        el.removeEventListener("change", onChange, true);
        el.removeEventListener("blur", onBlur, true);
        el.removeEventListener("keydown", onKeydown, true);
        if (onDown) el.removeEventListener("pointerdown", onDown, true);
        if (onClick) el.removeEventListener("click", onClick, true);
      } catch (err) {
        /* egal */
      }
      guideFieldListeners = null;
    }
    if (guideOverlayEl && guideOverlayEl.parentNode) {
      try {
        guideOverlayEl.parentNode.removeChild(guideOverlayEl);
      } catch (err) {
        /* egal */
      }
    }
    guideOverlayEl = null;
    guideFrameEl = null;
    guideBadgeEl = null;
    guideTargetEl = null;
    guideRemoveStrays();
  }

  // pointerdown auf dem Ziel (oder einem Kind) -> „weiter" — NUR fuer Klick-Ziele. Textfelder/
  // Checkbox/Select schalten ueber ihre eigenen Listener (s. attachGuideFieldListeners) weiter.
  // Capture-Phase, damit es auch feuert, wenn die Seite stopPropagation nutzt bzw. navigiert.
  function onGuidePointerDown(event) {
    if (!guideTargetEl || guideAdvanceModeCur !== "click") return;
    const t = event.target;
    if (t === guideTargetEl || (guideTargetEl.contains && guideTargetEl.contains(t))) {
      guideAdvance();
    }
  }

  // Rahmen + Badge zeigen/verstecken (Welle 33, Fix 2c): verschwindet das Ziel, darf das
  // Badge nicht bei 0,0 kleben — dann verstecken wir das Overlay komplett.
  function guideSetOverlayVisible(on) {
    if (guideFrameEl) guideFrameEl.style.display = on ? "" : "none";
    if (guideBadgeEl) guideBadgeEl.style.display = on ? "" : "none";
  }

  // Rahmen + Badge an die aktuelle Element-Position setzen (gedrosselt via rAF).
  function guideReposition() {
    if (guideRafPending) return;
    guideRafPending = true;
    requestAnimationFrame(() => {
      guideRafPending = false;
      if (!guideTargetEl || !guideFrameEl) return;
      let r;
      try {
        r = guideTargetEl.getBoundingClientRect();
      } catch (err) {
        r = null;
      }
      // Ziel weg (aus dem DOM entfernt / SPA-Umbau) oder unsichtbar (0×0)? Overlay NICHT bei
      // 0,0 kleben lassen — verstecken und EINMALIG found:false melden (kein Spam pro Frame).
      // Kommt das Element zurueck, zeigt das naechste Reposition/Show es wieder an.
      const lost = !guideTargetEl.isConnected || !r || (r.width <= 0 && r.height <= 0);
      if (lost) {
        guideSetOverlayVisible(false);
        if (!guideTargetLost) {
          guideTargetLost = true;
          // NICHT sofort aufgeben (Hotfix 06.07.): erst STILL komplett neu aufloesen —
          // der volle Suchlauf findet auch ERSETZTE Knoten (React/PPR) und meldet erst
          // nach seinem Timeout found:false. Erfolg -> guideAttach meldet found:true,
          // das Panel verlaesst den Fallback wieder.
          if (guideCurrentStep && !guideReacquireTimer) {
            guideReacquireTimer = setTimeout(() => {
              guideReacquireTimer = null;
              if (guideCurrentStep) {
                showGuideStep(guideCurrentStep);
                guideStartWatchdog();
              }
            }, 300);
          } else if (!guideCurrentStep) {
            try {
              chrome.runtime.sendMessage({ type: "steply-guide-status", found: false, reason: "target-gone" });
            } catch (err) {
              /* Panel evtl. zu - egal */
            }
          }
        }
        return;
      }
      if (guideTargetLost) {
        guideTargetLost = false;
        guideSetOverlayVisible(true);
      }
      const pad = 4;
      const left = r.left - pad;
      const top = r.top - pad;
      const fs = guideFrameEl.style;
      fs.left = left + "px";
      fs.top = top + "px";
      fs.width = r.width + pad * 2 + "px";
      fs.height = r.height + pad * 2 + "px";
      if (guideBadgeEl) {
        let badgeTop = top - 25;
        if (badgeTop < 2) badgeTop = top + 2; // oben kein Platz -> nach innen
        guideBadgeEl.style.left = Math.max(2, left) + "px";
        guideBadgeEl.style.top = badgeTop + "px";
      }
    });
  }

  function buildGuideOverlay(step) {
    const container = document.createElement("div");
    container.id = GUIDE_OVERLAY_ID;
    const cs = container.style;
    cs.position = "fixed";
    cs.zIndex = "2147483647";
    cs.pointerEvents = "none";
    cs.left = "0";
    cs.top = "0";
    cs.margin = "0";
    cs.padding = "0";
    cs.border = "0";
    cs.background = "transparent";

    const frame = document.createElement("div");
    const fst = frame.style;
    fst.position = "fixed";
    fst.boxSizing = "border-box";
    fst.border = "3px solid #ef6a4e";
    fst.borderRadius = "10px";
    fst.pointerEvents = "none";
    fst.transformOrigin = "center center";
    // Ruhe-Zustand des Glows (der Puls/Blitz animiert darauf auf).
    fst.boxShadow = GUIDE_GLOW_BASE;
    container.appendChild(frame);

    const badge = document.createElement("div");
    const bst = badge.style;
    bst.position = "fixed";
    bst.pointerEvents = "none";
    bst.background = "#ef6a4e";
    bst.color = "#fff";
    // Groesser + kontrastreicher (Welle 32, Punkt B): kraeftigere Schrift, weisser Rahmen +
    // dunkler Schlagschatten, damit die Pille auf jedem Untergrund lesbar bleibt.
    bst.font = "800 13px/1.35 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
    bst.padding = "3px 9px";
    bst.borderRadius = "999px";
    bst.boxShadow = "0 0 0 2px rgba(255,255,255,0.85), 0 2px 8px rgba(0,0,0,0.35)";
    bst.whiteSpace = "nowrap";
    bst.letterSpacing = "0.02em";
    badge.textContent = (step.index || 1) + "/" + (step.total || 1);
    container.appendChild(badge);

    (document.documentElement || document.body).appendChild(container);
    guideOverlayEl = container;
    guideFrameEl = frame;
    guideBadgeEl = badge;

    // ERSCHEINEN: kurzer „Hingucker" (Aufziehen 1.15 -> 1.0 + kraeftiger Glow-Blitz), danach
    // ruhiger Dauer-Puls (~1,2s). Alles ueber die Web-Animations-API — kein globales CSS.
    startGuideAppear(frame);
  }

  // Ruhe-Glow (Basis) und der kraeftige „Blitz"-Glow (Erscheinen/Puls-Hochpunkt).
  const GUIDE_GLOW_BASE =
    "0 0 0 3px rgba(239,106,78,0.55), 0 0 15px 3px rgba(239,106,78,0.35)";
  const GUIDE_GLOW_FLASH =
    "0 0 0 6px rgba(239,106,78,0.6), 0 0 34px 12px rgba(239,106,78,0.5)";
  const GUIDE_GLOW_DIM =
    "0 0 0 8px rgba(239,106,78,0.12), 0 0 26px 9px rgba(239,106,78,0.14)";

  // Ruhiger Dauer-Puls (~1,2s): Glow-Ring atmet zwischen kraeftig und weich. Bewusst NICHT
  // epilepsie-artig (weiche ease-in-out-Rampe, moderater Frequenzbereich).
  function startGuidePulse(frame) {
    try {
      frame.animate(
        [
          { boxShadow: GUIDE_GLOW_BASE },
          { boxShadow: GUIDE_GLOW_DIM },
          { boxShadow: GUIDE_GLOW_BASE },
        ],
        { duration: 1200, iterations: Infinity, easing: "ease-in-out" }
      );
    } catch (err) {
      /* ohne Animation trotzdem sichtbar (statischer Basis-Glow bleibt) */
    }
  }

  // „Hingucker" beim Erscheinen: einmaliges Aufziehen (Zoom 1.15 -> 1.0) + Glow-Blitz, dann
  // in den Dauer-Puls uebergehen. Faellt bei fehlender Animations-API sofort auf den Puls.
  function startGuideAppear(frame) {
    let anim = null;
    try {
      anim = frame.animate(
        [
          { transform: "scale(1.15)", boxShadow: GUIDE_GLOW_FLASH },
          { transform: "scale(0.98)", boxShadow: GUIDE_GLOW_BASE, offset: 0.72 },
          { transform: "scale(1)", boxShadow: GUIDE_GLOW_BASE },
        ],
        { duration: 520, easing: "cubic-bezier(0.22,1,0.36,1)" }
      );
    } catch (err) {
      anim = null;
    }
    if (anim) {
      anim.onfinish = () => startGuidePulse(frame);
      anim.oncancel = () => {};
    } else {
      startGuidePulse(frame);
    }
  }

  // Ziel gefunden: Overlay bauen, verankern, in Sicht scrollen, Listener setzen.
  function guideAttach(el, step) {
    guideTargetEl = el;
    guideAdvanceModeCur = guideAdvanceMode(el);
    buildGuideOverlay(step);
    guideReposition();
    window.addEventListener("scroll", guideReposition, true);
    window.addEventListener("resize", guideReposition, true);
    document.addEventListener("pointerdown", onGuidePointerDown, true);
    // Eingabe-Ziele (Textfeld/Checkbox/Select) schalten NICHT bei pointerdown weiter, sondern
    // erst nach Eingabe (Enter/blur/change) — s. attachGuideFieldListeners.
    attachGuideFieldListeners(el, guideAdvanceModeCur);
    try {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    } catch (err) {
      try {
        el.scrollIntoView();
      } catch (e) {
        /* egal */
      }
    }
    // Nach dem (smooth) Scrollen neu positionieren - die Box hat sich bewegt.
    setTimeout(guideReposition, 320);
    try {
      chrome.runtime.sendMessage({ type: "steply-guide-status", found: true });
    } catch (err) {
      /* egal */
    }
  }

  // „Signal" (show/ping) merken + Watchdog starten (Selbstschutz, Welle 33, Fix 2b).
  function guideNoteSignal() {
    guideLastSignalAt = Date.now();
  }
  function guideStartWatchdog() {
    if (guideWatchdog) return;
    guideWatchdog = setInterval(() => {
      if (!guideOverlayEl) {
        guideStopWatchdog(); // kein Overlay -> Watchdog nicht noetig
        return;
      }
      if (Date.now() - guideLastSignalAt > GUIDE_SIGNAL_MAX_IDLE) {
        // >60s kein show/ping -> Panel vermutlich hart weg, Overlay selbst abraeumen.
        guideCleanup();
        return;
      }
      // Ziel-Verlust auch OHNE Scroll/Resize erkennen (SPA entfernt das Element still).
      guideReposition();
    }, 10000);
  }

  // Einen Schritt anzeigen: Element aufloesen, dann bis ~5s SPA-tolerant nachversuchen
  // (MutationObserver + 250ms-Fallback-Tick), sonst found:false + Grund melden (Welle 33, Fix 3).
  function showGuideStep(step) {
    guideCleanup(); // vorherigen Zustand + laufende Suche restlos abbauen
    guideAdvanced = false; // „weiter"-Schutz je Schritt zuruecksetzen
    guideTargetLost = false;
    guideCurrentStep = step || null; // fuer die stille Wiederaufnahme nach Ziel-Verlust
    const resolver =
      (globalThis.SteplyGuideResolve && globalThis.SteplyGuideResolve.resolveSelector) || null;
    if (!step || !step.selector || !resolver) {
      try {
        chrome.runtime.sendMessage({ type: "steply-guide-status", found: false, reason: "no-selector" });
      } catch (err) {
        /* egal */
      }
      return;
    }

    const MAX_WAIT = 5000;
    let lastReason = "timeout"; // wenn nie ein definitiver Grund kam: schlicht „nicht rechtzeitig"
    let done = false;

    const finishMiss = () => {
      if (done) return;
      done = true;
      guideStopSearch();
      try {
        chrome.runtime.sendMessage({ type: "steply-guide-status", found: false, reason: lastReason });
      } catch (err) {
        /* egal */
      }
    };

    const tryResolve = () => {
      if (done) return true;
      let res = null;
      try {
        res = resolver(document, step.selector);
      } catch (err) {
        res = null;
      }
      if (res && res.el) {
        // Noch ohne Layout (0×0 — z. B. waehrend Hydration/PPR-Streaming versteckt)?
        // Dann NICHT andocken: scrollIntoView liefe ins Leere und die erste Reposition
        // meldete sofort „target-gone". Weiter suchen — der 250ms-Tick faengt auch
        // reine Layout-Aenderungen ohne DOM-Mutation (Hotfix 06.07.).
        let rr = null;
        try {
          rr = res.el.getBoundingClientRect();
        } catch (err) {
          rr = null;
        }
        if (!rr || (rr.width <= 0 && rr.height <= 0)) {
          lastReason = "target-hidden";
          return false;
        }
        done = true;
        guideStopSearch();
        guideAttach(res.el, step);
        return true;
      }
      if (res && res.reason) lastReason = res.reason;
      return false;
    };

    if (tryResolve()) return;

    // MutationObserver reagiert SOFORT auf neu gerenderten Inhalt; ein kurzer Zeit-Guard
    // (~60ms) buendelt Mutations-Stuerme, damit die Aufloesung nicht pro Knoten feuert.
    let obsPending = false;
    try {
      guideSearchObserver = new MutationObserver(() => {
        if (obsPending || done) return;
        obsPending = true;
        setTimeout(() => {
          obsPending = false;
          tryResolve();
        }, 60);
      });
      guideSearchObserver.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
      });
    } catch (err) {
      guideSearchObserver = null;
    }
    // Fallback-Tick fuer Aenderungen, die keine DOM-Mutation ausloesen (spaetes Layout u. ae.).
    guideSearchTick = setInterval(tryResolve, 250);
    guideSearchTimeout = setTimeout(finishMiss, MAX_WAIT);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "steply-guide-show") {
      guideNoteSignal();
      showGuideStep(msg.step);
      guideStartWatchdog();
      return;
    }
    if (msg.type === "steply-guide-ping") {
      // Lebenszeichen des Panels (Welle 33, Fix 2b): verlaengert den Selbstschutz-Zeitgeber.
      guideNoteSignal();
      return;
    }
    if (msg.type === "steply-guide-hide") {
      guideCurrentStep = null; // keine stille Wiederaufnahme nach explizitem Ende
      guideCleanup();
      return;
    }
  });

  // ============================================================================
  // AUTOMATIONEN-AUSFÜHRUNG (Welle 36b): Das Panel schickt pro Schritt
  // {type:"steply-exec-step", step:{selector, action, value?, index, total}, token}.
  // Wir lösen das Element via SteplyGuideResolve auf (5s, MutationObserver — Muster
  // showGuideStep), zeigen eine ANIMIERTE Maus (Koralle-Zeiger mit Schatten, gleitet vom
  // letzten Punkt/Bildschirmmitte zum Ziel in EXEC_CURSOR_TRAVEL_MS, verweilt kurz, dann
  // „Klick-Puls" beim Ausführen) + einen Rahmen ums Ziel, und FÜHREN dann die Aktion aus:
  //   click  → pointer/mouse-Gesten; Submit-Button im <form> via form.requestSubmit(el)
  //            (React-19-Form-Action-sicher), sonst el.click()
  //   fill   → React-sicherer value-Setter + input/change + blur (Wert NIE geloggt)
  //   select → Option per value ODER sichtbarem Text; nicht gefunden ⇒ Miss (kein Raten)
  //   toggle → Klick-Sequenz (Checkbox/Radio/Switch)
  // Antwort: {type:"steply-exec-result", token, ok:true} bzw. {ok:false, reason}.
  // SICHERHEIT: Bei ok:false wird NIEMALS geklickt — der Lauf pausiert im Panel.
  // „steply-exec-hide" räumt Cursor/Rahmen restlos ab; Ping/Watchdog (60s) wie die Führung.
  // Eigener Namespace + eigene IDs → keine Kollision mit der Führung.
  // ============================================================================
  const EXEC_OVERLAY_ID = "__steply-exec-frame";
  const EXEC_CURSOR_ID = "__steply-exec-cursor";
  const EXEC_GLOW = "0 0 0 3px rgba(239,106,78,0.5), 0 0 14px 3px rgba(239,106,78,0.32)";
  const EXEC_SIGNAL_MAX_IDLE = 60000;
  // Maus-Timing (Welle 37, Fix 3): Richard empfand die Cursor-Reise als zu hektisch. Die
  // Reise ist jetzt gemächlicher (weiterhin ease-out) und der Cursor VERWEILT kurz auf dem
  // Ziel, bevor die Aktion ausgelöst wird. Benannte Konstanten → künftiges Tuning ist trivial.
  const EXEC_CURSOR_TRAVEL_MS = 750; // Reisedauer des Cursors zum Ziel (vorher ~450 ms)
  const EXEC_CURSOR_DWELL_MS = 250; // Verweilpause auf dem Ziel VOR der Aktion (Klick-Puls danach)

  let execCursorEl = null; // persistente animierte Maus (überlebt Schritte)
  let execFrameEl = null; // Rahmen ums aktuelle Ziel
  let execLastPoint = null; // { x, y } — letzte Cursor-Position (Start der nächsten Animation)
  let execSearchObserver = null;
  let execSearchTick = null;
  let execSearchTimeout = null;
  let execLastSignalAt = 0;
  let execWatchdog = null;

  function execWait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function execStopSearch() {
    if (execSearchObserver) {
      try {
        execSearchObserver.disconnect();
      } catch (err) {
        /* egal */
      }
      execSearchObserver = null;
    }
    if (execSearchTick) {
      clearInterval(execSearchTick);
      execSearchTick = null;
    }
    if (execSearchTimeout) {
      clearTimeout(execSearchTimeout);
      execSearchTimeout = null;
    }
  }

  function execStopWatchdog() {
    if (execWatchdog) {
      clearInterval(execWatchdog);
      execWatchdog = null;
    }
  }

  // Verwaiste Cursor/Rahmen früherer (per Reload verwaister) Script-Instanzen abräumen.
  function execRemoveStrays() {
    try {
      document.querySelectorAll('[id="' + EXEC_OVERLAY_ID + '"]').forEach((n) => {
        if (n !== execFrameEl) {
          try {
            n.remove();
          } catch (err) {
            /* egal */
          }
        }
      });
      document.querySelectorAll('[id="' + EXEC_CURSOR_ID + '"]').forEach((n) => {
        if (n !== execCursorEl) {
          try {
            n.remove();
          } catch (err) {
            /* egal */
          }
        }
      });
    } catch (err) {
      /* egal */
    }
  }

  function execRemoveFrame() {
    if (execFrameEl && execFrameEl.parentNode) {
      try {
        execFrameEl.parentNode.removeChild(execFrameEl);
      } catch (err) {
        /* egal */
      }
    }
    execFrameEl = null;
  }

  // Buehne nach ERLEDIGTEM Schritt selbst abraeumen (Hotfix 06.07., Richard): im
  // Halbautomatik-Modus liegt zwischen zwei Schritten beliebig viel Zeit — Marker und
  // Maus des alten Schritts sollen dann nicht stehen bleiben. Kurze Verzoegerung, damit
  // der Klick-Puls noch sichtbar ist; startet vorher ein neuer Schritt, wird der Timer
  // storniert (execRunStep) und die Buehne ohnehin neu aufgebaut. execLastPoint bleibt
  // erhalten, damit die Maus beim naechsten Schritt von der alten Position weiterfaehrt.
  let execTidyTimer = null;
  function execScheduleTidy() {
    if (execTidyTimer) clearTimeout(execTidyTimer);
    execTidyTimer = setTimeout(() => {
      execTidyTimer = null;
      execRemoveFrame();
      if (execCursorEl && execCursorEl.parentNode) {
        try {
          execCursorEl.parentNode.removeChild(execCursorEl);
        } catch (err) {
          /* egal */
        }
      }
      execCursorEl = null;
    }, 650);
  }

  function execCleanup() {
    execStopSearch();
    execStopWatchdog();
    if (execTidyTimer) {
      clearTimeout(execTidyTimer);
      execTidyTimer = null;
    }
    execRemoveFrame();
    if (execCursorEl && execCursorEl.parentNode) {
      try {
        execCursorEl.parentNode.removeChild(execCursorEl);
      } catch (err) {
        /* egal */
      }
    }
    execCursorEl = null;
    execLastPoint = null;
    execRemoveStrays();
  }

  // Maus-Zeiger (Koralle, weißer Rand, weicher Schatten) — per createElementNS gebaut, damit
  // KEIN innerHTML/Trusted-Types-Problem auf strengen Seiten entsteht. Die Spitze liegt bei
  // (4,2) im SVG; der Container wird um (-4,-2) verschoben, damit sie auf dem Zielpunkt sitzt.
  function execEnsureCursor() {
    if (execCursorEl && execCursorEl.isConnected) return execCursorEl;
    const c = document.createElement("div");
    c.id = EXEC_CURSOR_ID;
    const s = c.style;
    s.position = "fixed";
    s.zIndex = "2147483647";
    s.pointerEvents = "none";
    s.left = "0";
    s.top = "0";
    s.width = "24px";
    s.height = "24px";
    s.transform = "translate(-4px, -2px)";
    s.filter = "drop-shadow(0 3px 5px rgba(0,0,0,0.35))";
    try {
      const NS = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(NS, "svg");
      svg.setAttribute("width", "24");
      svg.setAttribute("height", "24");
      svg.setAttribute("viewBox", "0 0 24 24");
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", "M4 2 L4 20 L9 15 L12.5 22 L15.5 20.8 L12 14 L19 14 Z");
      path.setAttribute("fill", "#ef6a4e");
      path.setAttribute("stroke", "#ffffff");
      path.setAttribute("stroke-width", "1.4");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      c.appendChild(svg);
    } catch (err) {
      // Ohne SVG: ein einfacher Koralle-Punkt reicht als sichtbare Maus.
      c.style.background = "#ef6a4e";
      c.style.borderRadius = "50%";
      c.style.border = "2px solid #fff";
    }
    (document.documentElement || document.body).appendChild(c);
    execCursorEl = c;
    if (!execLastPoint) {
      execLastPoint = { x: (window.innerWidth || 0) / 2, y: (window.innerHeight || 0) / 2 };
    }
    execPlaceCursor(execLastPoint.x, execLastPoint.y);
    return c;
  }

  function execPlaceCursor(x, y) {
    if (!execCursorEl) return;
    execCursorEl.style.left = x + "px";
    execCursorEl.style.top = y + "px";
    execLastPoint = { x: x, y: y };
  }

  function execRectOf(el) {
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    let r = null;
    try {
      r = el.getBoundingClientRect();
    } catch (err) {
      r = null;
    }
    if (!r) return { left: vw / 2, top: vh / 2, width: 0, height: 0, cx: vw / 2, cy: vh / 2 };
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      cx: r.left + r.width / 2,
      cy: r.top + r.height / 2,
    };
  }

  // Maus in EXEC_CURSOR_TRAVEL_MS ease-out zum Ziel gleiten lassen. Promise löst nach dem Ankommen.
  function execAnimateCursorTo(x, y) {
    execEnsureCursor();
    const from = execLastPoint || { x: (window.innerWidth || 0) / 2, y: (window.innerHeight || 0) / 2 };
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        execPlaceCursor(x, y);
        resolve();
      };
      try {
        const anim = execCursorEl.animate(
          [
            { left: from.x + "px", top: from.y + "px" },
            { left: x + "px", top: y + "px" },
          ],
          { duration: EXEC_CURSOR_TRAVEL_MS, easing: "cubic-bezier(0.22,1,0.36,1)", fill: "forwards" }
        );
        anim.onfinish = finish;
        anim.oncancel = finish;
        // Sicherheitsnetz, falls onfinish nie feuert (Tab im Hintergrund u. ä.): Reisedauer + Puffer.
        setTimeout(finish, EXEC_CURSOR_TRAVEL_MS + 170);
      } catch (err) {
        finish();
      }
    });
  }

  // Kurzer „Klick-Puls": Koralle-Ring, der aufploppt und verblasst.
  function execClickPulse(x, y) {
    try {
      const ring = document.createElement("div");
      const s = ring.style;
      s.position = "fixed";
      s.zIndex = "2147483647";
      s.pointerEvents = "none";
      s.left = x - 14 + "px";
      s.top = y - 14 + "px";
      s.width = "28px";
      s.height = "28px";
      s.borderRadius = "50%";
      s.border = "3px solid #ef6a4e";
      s.boxShadow = "0 0 0 3px rgba(239,106,78,0.25)";
      (document.documentElement || document.body).appendChild(ring);
      ring
        .animate(
          [
            { opacity: 0.9, transform: "scale(0.5)" },
            { opacity: 0.7, transform: "scale(1.0)", offset: 0.5 },
            { opacity: 0, transform: "scale(1.7)" },
          ],
          { duration: 500, easing: "ease-out" }
        ).onfinish = () => ring.remove();
    } catch (err) {
      /* Puls ist optional */
    }
  }

  function execShowFrame(rect) {
    execRemoveFrame();
    const f = document.createElement("div");
    f.id = EXEC_OVERLAY_ID;
    const s = f.style;
    s.position = "fixed";
    s.zIndex = "2147483646";
    s.pointerEvents = "none";
    s.boxSizing = "border-box";
    s.border = "3px solid #ef6a4e";
    s.borderRadius = "10px";
    s.boxShadow = EXEC_GLOW;
    const pad = 4;
    s.left = rect.left - pad + "px";
    s.top = rect.top - pad + "px";
    s.width = rect.width + pad * 2 + "px";
    s.height = rect.height + pad * 2 + "px";
    (document.documentElement || document.body).appendChild(f);
    execFrameEl = f;
  }

  function execSendResult(token, ok, reason) {
    try {
      chrome.runtime.sendMessage({
        type: "steply-exec-result",
        token: token,
        ok: !!ok,
        reason: ok ? "" : reason || "unbekannt",
      });
    } catch (err) {
      /* Panel evtl. geschlossen — egal */
    }
  }

  // Realistische Zeiger-/Maus-Gesten (pointerdown, mousedown, pointerup, mouseup). Der
  // eigentliche Klick kommt danach über el.click() — GENAU EINMAL. (Kein zusätzlich
  // dispatchtes click-Event, sonst würde eine Checkbox/ein Switch doppelt umgeschaltet.)
  function execPointerGesture(el) {
    let cx = 0;
    let cy = 0;
    try {
      const r = el.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    } catch (err) {
      /* egal */
    }
    const base = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0 };
    const fire = (type, usePointer) => {
      try {
        if (usePointer && typeof PointerEvent === "function") {
          el.dispatchEvent(new PointerEvent(type, base));
        } else {
          el.dispatchEvent(new MouseEvent(type, base));
        }
      } catch (err) {
        try {
          el.dispatchEvent(new MouseEvent(type, base));
        } catch (e) {
          /* egal */
        }
      }
    };
    fire("pointerdown", true);
    fire("mousedown", false);
    fire("pointerup", true);
    fire("mouseup", false);
  }

  // Ist `el` ein SUBMIT-Button innerhalb eines <form>? Dann liefern wir das Formular zurück,
  // damit der Klick über die standardkonforme Submission (form.requestSubmit(el)) statt über
  // eine rohe click()-Sequenz läuft.
  //
  // WARUM (Welle 37, Fix 1 — echter Bug, per Playwright reproduziert): Auf React-19-Form-
  // Actions (`<form action={fn}>` + useActionState) füllte unsere Sequenz E-Mail + Passwort
  // und rief dann el.click() auf dem „Anmelden"-Button. Die Server-Action LIEF zwar (Cookie
  // gesetzt), aber die Seite blieb/„reloadete" auf /login statt zur App zu navigieren: der
  // synthetische Klick löst die native Formular-Submission aus, die React nicht als seine
  // eigene Action-Submission übernimmt → das clientseitige redirect() der Action greift nicht.
  // form.requestSubmit(el) fährt die Formular-Submission-Algorithmus GENAU EINMAL mit dem
  // Button als submitter — React behandelt das exakt wie einen echten Klick (inkl. Navigation).
  function execFormForSubmit(el) {
    try {
      // Nur <button>/<input>/<select>/<textarea> haben eine .form-Property; sonst undefined.
      var form = el && el.form ? el.form : null;
      if (!form || typeof form.requestSubmit !== "function") return null;
      var tag = (el.tagName || "").toLowerCase();
      var type = (el.getAttribute && el.getAttribute("type") ? el.getAttribute("type") : "").toLowerCase();
      // Submit-Button: <button> ohne type ODER type=submit; <input type=submit|image>.
      var isSubmit =
        (tag === "button" && (type === "" || type === "submit")) ||
        (tag === "input" && (type === "submit" || type === "image"));
      return isSubmit ? form : null;
    } catch (err) {
      return null;
    }
  }

  function execClick(el) {
    try {
      execPointerGesture(el);
      var form = execFormForSubmit(el);
      if (form) {
        // Standardkonforme Submission mit dem Button als submitter (React-19-Form-Action-sicher).
        try {
          form.requestSubmit(el);
        } catch (err) {
          // requestSubmit(submitter) sehr selten nicht unterstützt → Fallback auf rohen Klick.
          el.click();
        }
        return { ok: true };
      }
      el.click();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "click-error" };
    }
  }

  function execToggle(el) {
    try {
      execPointerGesture(el);
      el.click();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "toggle-error" };
    }
  }

  // React-sicheres Befüllen: nativen value-Setter nutzen (React hört auf den echten Setter),
  // dann input + change dispatchen, dann blur. Der WERT wird NIE geloggt.
  function execFill(el, value) {
    const v = value == null ? "" : String(value);
    try {
      if (el.isContentEditable === true) {
        try {
          el.focus();
        } catch (e) {
          /* egal */
        }
        el.textContent = v;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        try {
          el.blur();
        } catch (e) {
          /* egal */
        }
        return { ok: true };
      }
      const tag = (el.tagName || "").toLowerCase();
      const proto =
        tag === "textarea"
          ? HTMLTextAreaElement.prototype
          : tag === "input"
            ? HTMLInputElement.prototype
            : null;
      if (!proto) return { ok: false, reason: "not-fillable" };
      try {
        el.focus();
      } catch (e) {
        /* egal */
      }
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc && desc.set) desc.set.call(el, v);
      else el.value = v;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      try {
        el.blur();
      } catch (e) {
        /* egal */
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "fill-error" };
    }
  }

  // Option per value ODER sichtbarem Text wählen (beides versuchen). Nicht gefunden ⇒ Miss
  // (kein Raten). Nur natives <select>.
  function execSelect(el, value) {
    if ((el.tagName || "").toLowerCase() !== "select") return { ok: false, reason: "not-a-select" };
    const want = value == null ? "" : String(value);
    const wantLc = want.trim().toLowerCase();
    const opts = el.options || [];
    let match = null;
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].value === want) {
        match = opts[i];
        break;
      }
    }
    if (!match) {
      for (let j = 0; j < opts.length; j++) {
        const t = (opts[j].textContent || "").trim().toLowerCase();
        if (t && t === wantLc) {
          match = opts[j];
          break;
        }
      }
    }
    if (!match) return { ok: false, reason: "option-not-found" };
    try {
      const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
      if (desc && desc.set) desc.set.call(el, match.value);
      else el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "select-error" };
    }
  }

  function execDoAction(el, step) {
    const action = step && step.action;
    if (action === "fill") return execFill(el, step.value);
    if (action === "select") return execSelect(el, step.value);
    if (action === "toggle") return execToggle(el);
    return execClick(el); // Default: click
  }

  // Ziel gefunden → in Sicht scrollen, Maus hinführen, Puls, Aktion, Ergebnis melden.
  async function execPerform(el, step, token) {
    execEnsureCursor();
    try {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    } catch (err) {
      try {
        el.scrollIntoView();
      } catch (e) {
        /* egal */
      }
    }
    await execWait(180); // kurzem smooth-Scroll Zeit geben, dann die reale Lage messen
    const rect = execRectOf(el);
    execShowFrame(rect);
    await execAnimateCursorTo(rect.cx, rect.cy);
    await execWait(EXEC_CURSOR_DWELL_MS); // kurz auf dem Ziel verweilen (Welle 37, Fix 3), dann handeln
    execClickPulse(rect.cx, rect.cy); // „Klick-Puls" beim Ausführen
    let result;
    try {
      result = execDoAction(el, step);
    } catch (err) {
      result = { ok: false, reason: "action-error" };
    }
    // WICHTIG bei navigierenden Klicks: das Ergebnis SYNCHRON nach der Aktion senden — die
    // Nachricht ist dann beim Browser, bevor eine Navigation die Seite abbaut (Muster wie
    // steply-guide-advance).
    execSendResult(token, result && result.ok, result && result.reason);
    execScheduleTidy();
  }

  // Einen Ausführ-Schritt bearbeiten: Element auflösen (bis 5s, MutationObserver + Tick),
  // sonst Miss + Grund melden. NIEMALS bei Miss klicken (Sicherheit).
  function execRunStep(step, token) {
    execStopSearch();
    if (execTidyTimer) {
      clearTimeout(execTidyTimer); // neuer Schritt baut die Buehne selbst neu auf
      execTidyTimer = null;
    }
    execRemoveFrame(); // alten Rahmen weg; die Maus bleibt für die nächste Animation
    if (!step || !step.selector) {
      execSendResult(token, false, "no-selector");
      return;
    }
    const resolver =
      (globalThis.SteplyGuideResolve && globalThis.SteplyGuideResolve.resolveSelector) || null;
    if (!resolver) {
      execSendResult(token, false, "no-resolver");
      return;
    }
    const MAX_WAIT = 5000;
    let lastReason = "timeout";
    let done = false;

    const finishMiss = () => {
      if (done) return;
      done = true;
      execStopSearch();
      execSendResult(token, false, lastReason);
    };

    const tryResolve = () => {
      if (done) return true;
      let res = null;
      try {
        res = resolver(document, step.selector);
      } catch (err) {
        res = null;
      }
      if (res && res.el) {
        // Noch ohne Layout (0×0 — Hydration/PPR)? Nicht andocken, weiter suchen.
        let rr = null;
        try {
          rr = res.el.getBoundingClientRect();
        } catch (err) {
          rr = null;
        }
        if (!rr || (rr.width <= 0 && rr.height <= 0)) {
          lastReason = "target-hidden";
          return false;
        }
        done = true;
        execStopSearch();
        execPerform(res.el, step, token);
        return true;
      }
      if (res && res.reason) lastReason = res.reason;
      return false;
    };

    if (tryResolve()) return;

    let obsPending = false;
    try {
      execSearchObserver = new MutationObserver(() => {
        if (obsPending || done) return;
        obsPending = true;
        setTimeout(() => {
          obsPending = false;
          tryResolve();
        }, 60);
      });
      execSearchObserver.observe(document.documentElement || document, {
        childList: true,
        subtree: true,
      });
    } catch (err) {
      execSearchObserver = null;
    }
    execSearchTick = setInterval(tryResolve, 250);
    execSearchTimeout = setTimeout(finishMiss, MAX_WAIT);
  }

  function execNoteSignal() {
    execLastSignalAt = Date.now();
  }

  function execStartWatchdog() {
    if (execWatchdog) return;
    execWatchdog = setInterval(() => {
      if (!execCursorEl && !execFrameEl) {
        execStopWatchdog();
        return;
      }
      if (Date.now() - execLastSignalAt > EXEC_SIGNAL_MAX_IDLE) {
        // >60s kein Schritt/Ping → Panel vermutlich hart weg, selbst abräumen.
        execCleanup();
      }
    }, 10000);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg) return;
    if (msg.type === "steply-exec-step") {
      execNoteSignal();
      execRunStep(msg.step, msg.token);
      execStartWatchdog();
      return;
    }
    if (msg.type === "steply-exec-ping") {
      execNoteSignal();
      return;
    }
    if (msg.type === "steply-exec-hide") {
      execCleanup();
      return;
    }
  });

  // Beim Laden dieser Script-Instanz sofort Zombie-Overlays verwaister Vorgaenger entsorgen
  // (die Nachimpfung offener Tabs raeumt so nach jedem Extension-Reload automatisch auf).
  guideRemoveStrays();
  execRemoveStrays();

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

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

  let recording = false;
  let startEpoch = 0;
  // Modus der laufenden Aufnahme: "video" (Screencast + Klick-Zeitstempel, Bestand) oder
  // "guide" (Sofort-Anleitung: pro Klick ein Screenshot + Element-Box, KEIN Video).
  let mode = "video";

  function truncate(text, max) {
    if (!text) return "";
    const clean = String(text).replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
  }

  // Das "sinnvolle" Element fuer einen Klick (fuer Label UND Bounding-Box): das naechste
  // interaktive Element in der Ahnenkette, sonst das Ziel selbst.
  function clickableFor(target) {
    if (!target || target.nodeType !== 1) return null;
    const clickable = target.closest(
      'button, a, [role="button"], [role="link"], [role="menuitem"], input, textarea, select, summary, label'
    );
    return clickable || target;
  }

  // Kuerzester sinnvoller Text fuer das geklickte Element.
  // Prioritaet: aria-label > Text des naechsten button/a/[role=button] > title/alt > tagName.
  function labelFor(target) {
    if (!target || target.nodeType !== 1) return "";

    const el = clickableFor(target) || target;

    const aria = el.getAttribute && el.getAttribute("aria-label");
    if (aria && aria.trim()) return truncate(aria, 60);

    // aria-labelledby aufloesen
    const labelledby = el.getAttribute && el.getAttribute("aria-labelledby");
    if (labelledby) {
      const ref = document.getElementById(labelledby.split(/\s+/)[0]);
      if (ref && ref.textContent && ref.textContent.trim()) {
        return truncate(ref.textContent, 60);
      }
    }

    const text = el.textContent && el.textContent.trim();
    if (text) return truncate(text, 60);

    // Bild-Buttons u. ae.
    const alt = el.getAttribute && (el.getAttribute("alt") || el.getAttribute("title"));
    if (alt && alt.trim()) return truncate(alt, 60);

    const value = el.value;
    if (value && String(value).trim()) return truncate(value, 60);

    return truncate((el.tagName || "").toLowerCase(), 60);
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

  // SOFORT-ANLEITUNG (guide-Modus): auf pointerdown (Capture-Phase, VOR der Klick-Wirkung
  // und damit VOR einer moeglichen Navigation) das geklickte Element erfassen. Der TANGO-
  // Trick: nicht nur der Klickpunkt, sondern die BoundingClientRect des Elements,
  // normalisiert 0..1 zum Viewport -> pixelgenaue Markierung im Bild. Die Seitenleiste
  // macht auf diese Nachricht hin SOFORT einen Screenshot (captureVisibleTab).
  function onPointerDown(event) {
    if (!recording || mode !== "guide") return;
    // Nur Haupt-Taste (linksklick / primaerer Zeiger).
    if (typeof event.button === "number" && event.button !== 0) return;

    const w = window.innerWidth || document.documentElement.clientWidth || 1;
    const h = window.innerHeight || document.documentElement.clientHeight || 1;

    const el = clickableFor(event.target) || event.target;
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    // Pixel-Lage fuer den Klick-Puls merken (gezeichnet erst NACH der Screenshot-
    // Bestaetigung durch den Recorder, damit er nie mit im Bild landet).
    lastClickPx = { left: 0, top: 0, width: 0, height: 0, cx: event.clientX || 0, cy: event.clientY || 0 };
    try {
      const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
      if (r && r.width >= 0 && r.height >= 0) {
        lastClickPx.left = r.left; lastClickPx.top = r.top;
        lastClickPx.width = r.width; lastClickPx.height = r.height;
        const clamp = (n) => Math.min(1, Math.max(0, n));
        const round = (n) => Math.round(n * 10000) / 10000;
        rect = {
          x: round(clamp(r.left / w)),
          y: round(clamp(r.top / h)),
          w: round(clamp(r.width / w)),
          h: round(clamp(r.height / h)),
        };
        // Nicht ueber den Rand hinauslaufen lassen.
        if (rect.x + rect.w > 1) rect.w = round(1 - rect.x);
        if (rect.y + rect.h > 1) rect.h = round(1 - rect.y);
      }
    } catch (err) {
      // Bounding-Box nicht ermittelbar -> leeres Rechteck (Markierung entfaellt still).
    }

    // Aktionstyp: Texteingabe bei editierbaren Feldern, sonst Klick.
    const tag = (el.tagName || "").toLowerCase();
    const editable =
      tag === "textarea" ||
      (tag === "input" && !/^(button|submit|checkbox|radio|reset|file|image)$/i.test(el.type || "text")) ||
      el.isContentEditable === true;
    const action = editable ? "type" : "click";

    const step = {
      rect,
      label: labelFor(event.target),
      action,
      url: (location && location.href ? location.href : "").slice(0, 500),
      title: truncate(document.title || "", 200),
      ts: Date.now(),
    };

    try {
      chrome.runtime.sendMessage({ type: "steply-guide-step", step });
    } catch (err) {
      recording = false;
    }
  }

  // pointerdown feuert VOR click und VOR der Navigation -> der Screenshot zeigt die Seite
  // im Ausgangszustand (mit dem Element, das gleich geklickt wird).
  document.addEventListener("pointerdown", onPointerDown, true);

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
    st.border = "3px solid #3d4ee6";
    st.boxShadow = "0 0 0 4px rgba(61,78,230,0.25)";
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

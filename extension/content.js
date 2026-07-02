"use strict";

// Steply Recorder - Content-Script (laeuft im aufzunehmenden Tab).
// Erfasst Klicks und meldet sie an den Aufnahme-Tab (recorder.html).
//
// UHR-SYNCHRONISATION (bewusst einfach + robust):
// Content-Script und Aufnahme-Tab laufen auf DERSELBEN Maschine und teilen sich
// damit dieselbe Wanduhr (Date.now()). Der Recorder schickt beim Aufnahmestart
// eine Nachricht "steply-rec-start" mit startEpoch = Date.now(). Fuer jeden Klick
// berechnen wir t = (Date.now() - startEpoch) / 1000. Kein Abgleich von
// performance.now()-Zeiturspruengen ueber Kontextgrenzen noetig.

(() => {
  // Doppel-Injektion vermeiden (falls der Nutzer mehrfach startet).
  if (window.__steplyRecorderInstalled) {
    // Bereits installiert -> nur den Zustand zuruecksetzen, falls eine neue
    // Aufnahme beginnt. Der vorhandene Listener uebernimmt.
    return;
  }
  window.__steplyRecorderInstalled = true;

  let recording = false;
  let startEpoch = 0;

  function truncate(text, max) {
    if (!text) return "";
    const clean = String(text).replace(/\s+/g, " ").trim();
    return clean.length > max ? clean.slice(0, max - 1) + "…" : clean;
  }

  // Kuerzester sinnvoller Text fuer das geklickte Element.
  // Prioritaet: aria-label > Text des naechsten button/a/[role=button] > title/alt > tagName.
  function labelFor(target) {
    if (!target || target.nodeType !== 1) return "";

    const clickable = target.closest(
      'button, a, [role="button"], [role="link"], [role="menuitem"], input[type="submit"], input[type="button"], summary, label'
    );
    const el = clickable || target;

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
    if (!recording) return;

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
      // Recorder-Tab evtl. geschlossen -> Aufnahme gilt als beendet.
      recording = false;
    }
  }

  // Capture-Phase: Klick wird erfasst, auch wenn die Seite stopPropagation nutzt.
  document.addEventListener("click", onClick, true);

  // Steuernachrichten vom Recorder.
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || !msg.type) return;
    if (msg.type === "steply-rec-start") {
      startEpoch = typeof msg.startEpoch === "number" ? msg.startEpoch : Date.now();
      recording = true;
    } else if (msg.type === "steply-rec-stop") {
      recording = false;
    }
  });
})();

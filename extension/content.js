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
// Der Aufnahme-Tab (recorder.js) schreibt beim Start { rec: { startedAt } } nach
// chrome.storage.local und loescht es beim Stopp. Dieses Content-Script liest den
// Zustand beim Laden UND lauscht auf storage-Aenderungen (chrome.storage.onChanged).
// So braucht es KEINE direkte Nachricht - eine frisch geladene Folge-Seite sieht den
// laufenden Zustand sofort.
//
// UHR-SYNCHRONISATION (bewusst einfach + robust):
// Content-Script und Aufnahme-Tab laufen auf DERSELBEN Maschine und teilen sich damit
// dieselbe Wanduhr (Date.now()). startedAt ist Date.now() aus dem Aufnahme-Tab. Fuer
// jeden Klick gilt t = (Date.now() - startedAt) / 1000. Kein Abgleich von
// performance.now()-Zeiturspruengen ueber Kontextgrenzen noetig.

(() => {
  // Doppel-Registrierung vermeiden (z. B. wenn Chrome das Script mehrfach laedt).
  if (window.__steplyRecorderInstalled) return;
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
      // Extension-Kontext evtl. weg (Reload) -> als beendet betrachten.
      recording = false;
    }
  }

  // Capture-Phase: Klick wird erfasst, auch wenn die Seite stopPropagation nutzt.
  document.addEventListener("click", onClick, true);

  // Aufnahmezustand aus einem storage-Wert uebernehmen.
  function applyRecState(rec) {
    if (rec && typeof rec.startedAt === "number") {
      startEpoch = rec.startedAt;
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

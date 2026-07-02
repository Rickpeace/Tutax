"use strict";

// Steply Recorder - Popup.
// Aufgabe: Content-Script in den AKTIVEN Tab injizieren (sammelt Klicks) und
// danach den Aufnahme-Tab (recorder.html) oeffnen. Die eigentliche Aufnahme
// laeuft im Aufnahme-Tab, damit sie das Schliessen des Popups ueberlebt.

const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text || "";
  statusEl.className = "status" + (kind ? " status-" + kind : "");
}

function setBusy(busy) {
  startBtn.disabled = busy;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Manche Seiten koennen kein Content-Script aufnehmen (chrome://, Web Store,
// PDF-Viewer, ...). Dann nehmen wir trotzdem auf - nur ohne Klick-Erfassung.
function isInjectableUrl(url) {
  if (!url) return false;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("file://");
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
}

startBtn.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Wird vorbereitet ...");

  try {
    const tab = await getActiveTab();
    if (!tab || tab.id == null) {
      throw new Error("Kein aktiver Tab gefunden.");
    }

    let clicksTabId = null;
    if (isInjectableUrl(tab.url)) {
      try {
        await injectContentScript(tab.id);
        clicksTabId = tab.id;
      } catch (err) {
        // Injektion fehlgeschlagen (z. B. durch Seiten-Policy): weiter ohne Klicks.
        console.warn("Steply: Content-Script konnte nicht injiziert werden:", err);
        clicksTabId = null;
      }
    }

    // Aufnahme-Tab oeffnen. clicksTabId als Query, damit der Recorder weiss,
    // aus welchem Tab er Klicks akzeptiert (und dem Nutzer den Zustand zeigt).
    const url = chrome.runtime.getURL(
      "recorder.html?clicksTab=" + (clicksTabId == null ? "" : String(clicksTabId))
    );
    await chrome.tabs.create({ url, active: true });

    setStatus(
      clicksTabId == null
        ? "Aufnahme-Tab geoeffnet. Hinweis: Auf dieser Seite koennen keine Klicks erfasst werden."
        : "Aufnahme-Tab geoeffnet - dort geht es weiter.",
      "ok"
    );

    // Popup kann nun geschlossen werden; die Aufnahme laeuft im Tab weiter.
    setTimeout(() => window.close(), 1200);
  } catch (err) {
    console.error("Steply:", err);
    setStatus("Fehler: " + (err && err.message ? err.message : String(err)), "error");
    setBusy(false);
  }
});

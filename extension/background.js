"use strict";

// Steply Recorder - Hintergrund-Service-Worker (v2).
//
// Zwei winzige Aufgaben, mehr nicht:
//  1) Klick aufs Symbol oeffnet die Seitenleiste (statt eines Popups/Fensters).
//     chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }) verdrahtet
//     das global. Wir setzen es bei Installation UND bei jedem Worker-Start (idempotent),
//     damit es nach einem Neustart des Browsers sicher aktiv ist.
//  2) Ein No-Op-Nachrichten-Listener: Content-Scripts senden Klick-/Schritt-Nachrichten
//     per chrome.runtime.sendMessage. Ist die Seitenleiste offen, empfaengt SIE die
//     Nachricht (eigener onMessage-Listener im Panel). Ist sie geschlossen, gaebe es
//     ohne Empfaenger die Konsolen-Warnung "Receiving end does not exist" im Content-
//     Script. Dieser Listener schluckt solche verwaisten Nachrichten still. Er
//     verhindert NICHT, dass das offene Panel dieselbe Nachricht ebenfalls erhaelt
//     (mehrere Listener bekommen jedes Event).

function enableSidePanelOnActionClick() {
  try {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {
        /* aeltere Chrome-Version ohne sidePanel -> ignorieren */
      });
  } catch (err) {
    /* sidePanel-API nicht vorhanden (Chrome < 114) */
  }
}

chrome.runtime.onInstalled.addListener(enableSidePanelOnActionClick);
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(enableSidePanelOnActionClick);
}
// Auch beim gewoehnlichen Aufwachen des Workers setzen (billig, idempotent).
enableSidePanelOnActionClick();

// Verwaiste Klick-/Schritt-Nachrichten absorbieren (siehe oben). Nichts zu tun.
chrome.runtime.onMessage.addListener(() => false);

// Screenshot-Dienst fuer die Seitenleiste: chrome.tabs.captureVisibleTab scheitert
// direkt im Panel-Kontext an einem Chromium-Bug (crbug.com/40916430 - activeTab
// greift dort nicht), im Service Worker funktioniert derselbe Aufruf. Das Panel
// schickt {type:"steply-capture", windowId} und bekommt {ok, dataUrl | error}.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "steply-capture") return false;
  const opts = { format: "png" };
  const p =
    typeof msg.windowId === "number"
      ? chrome.tabs.captureVisibleTab(msg.windowId, opts)
      : chrome.tabs.captureVisibleTab(opts);
  p.then(
    (dataUrl) => sendResponse({ ok: true, dataUrl }),
    (err) =>
      sendResponse({
        ok: false,
        error: err && err.message ? err.message : String(err),
      })
  );
  return true; // Antwort kommt asynchron
});

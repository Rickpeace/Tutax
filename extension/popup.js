"use strict";

// Steply Recorder - Popup.
// Aufgaben:
//  1) Verbindungs-Token + App-URL verwalten (chrome.storage.local, ueberlebt Neustarts).
//  2) Aufnahme-Tab (recorder.html) oeffnen. Die eigentliche Aufnahme laeuft dort, damit
//     sie das Schliessen des Popups ueberlebt.
//
// Das Content-Script ist jetzt DEKLARATIV im Manifest registriert (laeuft auf jeder
// http(s)-Seite) - wir muessen hier NICHTS mehr injizieren. Wir pruefen nur noch, ob
// die aktuelle Seite eine Browser-Systemseite ist, um den Hinweis passend zu setzen.

const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const tokenInput = document.getElementById("token");
const appUrlInput = document.getElementById("appUrl");
const saveBtn = document.getElementById("saveCfg");
const cfgStatus = document.getElementById("cfgStatus");
const guideNeedsToken = document.getElementById("guideNeedsToken");

const DEFAULT_APP_URL = "https://app.steply.de";

// Aktuell gespeicherter Verbindungs-Token (steuert, ob der Sofort-Modus verfuegbar ist).
let hasToken = false;

function selectedMode() {
  const checked = document.querySelector('input[name="mode"]:checked');
  return checked ? checked.value : "video";
}

// Sofort-Anleitung braucht einen Verbindungs-Token (Direkt-Upload). Ohne Token: Radio
// deaktivieren, auf Video zurueckfallen und den Hinweis zeigen.
function applyModeAvailability() {
  const guideRadio = document.querySelector('input[name="mode"][value="guide"]');
  const videoRadio = document.querySelector('input[name="mode"][value="video"]');
  if (!guideRadio || !videoRadio) return;
  guideRadio.disabled = !hasToken;
  if (!hasToken && guideRadio.checked) {
    videoRadio.checked = true;
  }
  if (guideNeedsToken) guideNeedsToken.hidden = hasToken;
}

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

// Normale Website (http/https) -> Klicks moeglich. Systemseiten (chrome://, Web Store,
// PDF-Viewer, about:, file:, ...) -> keine Klick-Erfassung (das Content-Script laeuft
// dort nicht). Wir nutzen das nur fuer den Hinweistext im Aufnahme-Tab.
function isNormalWebPage(url) {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  // Chrome Web Store: dort sind Content-Scripts gesperrt.
  if (/^https?:\/\/chromewebstore\.google\.com\//i.test(url)) return false;
  if (/^https?:\/\/chrome\.google\.com\/webstore\//i.test(url)) return false;
  return true;
}

// Gespeicherte Konfiguration ins Formular laden.
async function loadCfg() {
  try {
    const res = await chrome.storage.local.get(["steplyToken", "steplyAppUrl"]);
    const token = (res && res.steplyToken) || "";
    if (tokenInput) tokenInput.value = token;
    if (appUrlInput) appUrlInput.value = (res && res.steplyAppUrl) || "";
    if (appUrlInput) appUrlInput.placeholder = DEFAULT_APP_URL;
    hasToken = !!token;
  } catch (err) {
    hasToken = false;
  }
  applyModeAvailability();
}

async function saveCfg() {
  const token = (tokenInput?.value || "").trim();
  const appUrl = (appUrlInput?.value || "").trim().replace(/\/+$/, "");
  try {
    await chrome.storage.local.set({ steplyToken: token, steplyAppUrl: appUrl });
    hasToken = !!token;
    applyModeAvailability();
    if (cfgStatus) {
      cfgStatus.textContent = token
        ? "Gespeichert. Sofort-Anleitung und Video-Upload sind verfuegbar."
        : "Gespeichert. Ohne Token nur Video-Modus (zwei Dateien zum Hochladen).";
      cfgStatus.className = "status status-ok";
    }
  } catch (err) {
    if (cfgStatus) {
      cfgStatus.textContent = "Konnte nicht gespeichert werden.";
      cfgStatus.className = "status status-error";
    }
  }
}

if (saveBtn) saveBtn.addEventListener("click", saveCfg);

startBtn.addEventListener("click", async () => {
  setBusy(true);
  setStatus("Wird vorbereitet ...");

  try {
    const tab = await getActiveTab();
    const normal = tab && tab.id != null && isNormalWebPage(tab.url);

    // Sofort-Modus nur mit Token und nur auf normalen Seiten (Screenshots + Klicks noetig).
    let mode = selectedMode();
    if (mode === "guide" && (!hasToken || !normal)) {
      mode = "video";
    }

    // Aufnahme-Tab oeffnen. Bei normalen Seiten die Tab-ID mitgeben (clicksTab), damit
    // der Recorder Klicks/Screenshots NUR aus diesem Tab erfasst - auch ueber
    // Seitenwechsel hinweg. Fuer den Sofort-Modus zusaetzlich die Fenster-ID (clicksWin):
    // captureVisibleTab braucht die Fenster-ID des aufgenommenen Tabs. Bei Systemseiten
    // ohne ID -> der Recorder zeigt den passenden Hinweis.
    const q = new URLSearchParams();
    if (normal) {
      q.set("clicksTab", String(tab.id));
      if (tab.windowId != null) q.set("clicksWin", String(tab.windowId));
    }
    q.set("mode", mode);
    const url = chrome.runtime.getURL("recorder.html?" + q.toString());
    await chrome.tabs.create({ url, active: true });

    setStatus(
      normal
        ? "Aufnahme-Tab geoeffnet - dort geht es weiter."
        : "Aufnahme-Tab geoeffnet. Hinweis: Auf dieser Systemseite koennen keine Klicks erfasst werden.",
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

loadCfg();

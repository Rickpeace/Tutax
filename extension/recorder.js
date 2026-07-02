"use strict";

// Steply Recorder - Aufnahme-Tab.
// Hier laeuft die eigentliche Aufnahme (getDisplayMedia + MediaRecorder), damit sie
// nicht mit dem Popup stirbt. Klicks kommen per Runtime-Nachricht aus dem
// Content-Script (deklarativ auf jeder Seite; siehe content.js).
//
// AUFNAHMEZUSTAND: Wir schreiben beim Start { rec: { startedAt } } nach
// chrome.storage.local und loeschen es beim Stopp. Das Content-Script liest/beobachtet
// diesen Wert und zeichnet NUR dann Klicks auf. So ueberleben Klicks Seitenwechsel
// innerhalb des Tabs (jede Folge-Seite laedt das Script neu und sieht den Zustand).
//
// clicks.json-Vertrag (Migration 0020 / Worker):
//   [{ t: Sekunden seit Aufnahmestart, x: 0..1, y: 0..1, label: Text (<=60) }]
//
// DIREKT-UPLOAD (v2): Ist in den Einstellungen ein Verbindungs-Token hinterlegt, laedt
// die Extension nach dem Stopp direkt zu Steply hoch (handshake -> PUT an signierte URL
// -> complete). Ohne Token: heutiges Verhalten (2 Downloads).

const els = {
  setup: document.getElementById("setup"),
  live: document.getElementById("live"),
  done: document.getElementById("done"),
  begin: document.getElementById("begin"),
  stop: document.getElementById("stop"),
  again: document.getElementById("again"),
  mic: document.getElementById("mic"),
  timer: document.getElementById("timer"),
  clickCount: document.getElementById("clickCount"),
  status: document.getElementById("status"),
  clicksTabInfo: document.getElementById("clicksTabInfo"),
  // Upload-UI
  uploadBox: document.getElementById("uploadBox"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadDone: document.getElementById("uploadDone"),
  openApp: document.getElementById("openApp"),
  downloadBox: document.getElementById("downloadBox"),
  fileVideo: document.getElementById("fileVideo"),
  fileClicks: document.getElementById("fileClicks"),
};

// Zustand
let mediaRecorder = null;
let recordedChunks = [];
let clicks = [];
let displayStream = null;
let micStream = null;
let startEpoch = 0;
let timerInterval = null;
let stopping = false;
let started = false; // Doppelstart-Schutz

// Konfiguration (Token + App-URL) aus chrome.storage.local.
let cfg = { token: "", appUrl: "" };

// Prod-Domain als Default. Feld ist im Popup editierbar (localhost-Tests).
const DEFAULT_APP_URL = "https://app.steply.de";

function appBase() {
  const raw = (cfg.appUrl || DEFAULT_APP_URL).trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_URL;
}

async function loadConfig() {
  try {
    const res = await chrome.storage.local.get(["steplyToken", "steplyAppUrl"]);
    cfg.token = (res && res.steplyToken) || "";
    cfg.appUrl = (res && res.steplyAppUrl) || "";
  } catch (err) {
    cfg.token = "";
    cfg.appUrl = "";
  }
}

function setStatus(text, kind) {
  els.status.textContent = text || "";
  els.status.className = "status" + (kind ? " status-" + kind : "");
}

function show(section) {
  els.setup.hidden = section !== "setup";
  els.live.hidden = section !== "live";
  els.done.hidden = section !== "done";
}

function fmtTime(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return pad(m) + ":" + pad(s);
}

function tick() {
  els.timer.textContent = fmtTime((Date.now() - startEpoch) / 1000);
}

// Aus welchem Tab akzeptieren wir Klicks? (vom Popup als Query gesetzt) So zaehlen wir
// NUR Klicks des aufgenommenen Tabs - auch ueber Seitenwechsel hinweg (gleiche Tab-ID),
// aber NICHT Klicks aus anderen Tabs (die waeren nicht Teil des Screencasts). Fehlt die
// ID (Systemseite), akzeptieren wir keine Klicks.
const params = new URLSearchParams(location.search);
const rawClicksTab = params.get("clicksTab");
const clicksTabId =
  rawClicksTab && /^\d+$/.test(rawClicksTab) ? parseInt(rawClicksTab, 10) : null;

// Klicks aus dem Content-Script empfangen (aus JEDER Seite DES aufgenommenen Tabs).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-click") return;
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  // Nur Klicks aus dem gestarteten Tab zaehlen.
  if (clicksTabId == null) return;
  if (!sender || !sender.tab || sender.tab.id !== clicksTabId) return;
  clicks.push(msg.click);
  els.clickCount.textContent = String(clicks.length);
});

// Aufnahmezustand fuer die Content-Scripts setzen/loeschen.
async function setRecState(on) {
  try {
    if (on) {
      await chrome.storage.local.set({ rec: { startedAt: startEpoch } });
    } else {
      await chrome.storage.local.remove("rec");
    }
  } catch (err) {
    console.warn("Steply: Aufnahmezustand konnte nicht gesetzt werden:", err);
  }
}

function pickMimeType() {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return "video/webm";
}

function stampName(prefix, ext) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp =
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds());
  return "steply-" + prefix + "-" + stamp + "." + ext;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => {
    // URL erst nach dem Start des Downloads freigeben.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  return filename;
}

async function begin() {
  if (started) return; // Doppelstart-Schutz
  started = true;
  els.begin.disabled = true;
  setStatus("Bitte waehlen Sie im Dialog den Tab oder das Fenster ...");

  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
      audio: false,
    });
  } catch (err) {
    // Nutzer hat abgebrochen oder Berechtigung verweigert.
    started = false;
    els.begin.disabled = false;
    setStatus("Aufnahme abgebrochen. Sie koennen es erneut versuchen.", "error");
    return;
  }

  // Optional: Mikrofon dazumischen.
  let combinedStream = displayStream;
  if (els.mic.checked) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      combinedStream = new MediaStream([
        ...displayStream.getVideoTracks(),
        ...displayStream.getAudioTracks(),
        ...micStream.getAudioTracks(),
      ]);
    } catch (err) {
      setStatus("Mikrofon nicht verfuegbar - Aufnahme laeuft ohne Ton.", "error");
    }
  }

  const mimeType = pickMimeType();
  recordedChunks = [];
  clicks = [];

  try {
    mediaRecorder = new MediaRecorder(combinedStream, { mimeType });
  } catch (err) {
    cleanupStreams();
    started = false;
    els.begin.disabled = false;
    setStatus("Aufnahme konnte nicht gestartet werden: " + err.message, "error");
    return;
  }

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = onRecorderStop;

  // Nutzer beendet die Freigabe ueber die native Chrome-Leiste ("Freigabe beenden").
  const videoTrack = displayStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.addEventListener("ended", () => {
      if (mediaRecorder && mediaRecorder.state !== "inactive") stop();
    });
  }

  // UHR-SYNC: gemeinsame Startzeit im storage hinterlegen -> Content-Scripts erfassen ab jetzt.
  startEpoch = Date.now();
  await setRecState(true);

  mediaRecorder.start(1000); // alle 1s ein Chunk (robust gegen Absturz)
  show("live");
  setStatus("");
  els.clickCount.textContent = "0";
  els.timer.textContent = "00:00";
  tick();
  timerInterval = setInterval(tick, 500);
}

function stop() {
  if (stopping) return;
  stopping = true;
  els.stop.disabled = true;
  setStatus("Aufnahme wird abgeschlossen ...");
  setRecState(false); // Content-Scripts hoeren auf, Klicks zu erfassen
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop(); // loest onstop aus
  } else {
    onRecorderStop();
  }
}

function cleanupStreams() {
  if (displayStream) {
    displayStream.getTracks().forEach((t) => t.stop());
    displayStream = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((t) => t.stop());
    micStream = null;
  }
}

function onRecorderStop() {
  cleanupStreams();

  const mime = (mediaRecorder && mediaRecorder.mimeType) || "video/webm";
  const videoBlob = new Blob(recordedChunks, { type: mime });
  const clicksBlob = new Blob([JSON.stringify(clicks, null, 2)], {
    type: "application/json",
  });

  show("done");

  // Mit Token: Direkt-Upload anbieten. Ohne Token: die zwei Dateien herunterladen.
  if (cfg.token) {
    uploadToSteply(videoBlob).catch((err) => {
      showUploadError(err && err.message ? err.message : String(err), videoBlob, clicksBlob);
    });
  } else {
    downloadFallback(videoBlob, clicksBlob);
  }
}

// Fallback: beide Dateien herunterladen (v1-Verhalten).
function downloadFallback(videoBlob, clicksBlob) {
  els.uploadBox.hidden = true;
  els.downloadBox.hidden = false;
  const videoName = downloadBlob(videoBlob, stampName("aufnahme", "webm"));
  const clicksName = downloadBlob(clicksBlob, stampName("clicks", "json"));
  els.fileVideo.textContent = videoName;
  els.fileClicks.textContent = clicksName;
  setStatus(
    "2 Dateien heruntergeladen - laden Sie beide in Steply hoch (Aus Video).",
    "ok"
  );
}

function setUploadProgress(text) {
  if (els.uploadProgress) els.uploadProgress.textContent = text || "";
}

// Bei Upload-Fehler: klare Meldung + Fallback-Downloads, damit nichts verloren geht.
function showUploadError(message, videoBlob, clicksBlob) {
  setStatus("Upload fehlgeschlagen: " + message + " - Dateien wurden stattdessen heruntergeladen.", "error");
  downloadFallback(videoBlob, clicksBlob);
}

// Video an eine signierte URL per PUT hochladen (XHR fuer Fortschrittsanzeige).
function putVideo(uploadUrl, blob) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", blob.type || "video/webm");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        setUploadProgress("Video wird hochgeladen ... " + pct + "%");
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Server antwortete mit " + xhr.status));
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload"));
    xhr.send(blob);
  });
}

async function uploadToSteply(videoBlob) {
  els.downloadBox.hidden = true;
  els.uploadBox.hidden = false;
  els.uploadDone.hidden = true;
  setStatus("");
  setUploadProgress("Verbindung zu Steply wird hergestellt ...");

  const base = appBase();

  // 1) Handshake: Token -> signierte Upload-URL + Pfad.
  let hs;
  try {
    const res = await fetch(base + "/api/recorder/handshake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: cfg.token }),
    });
    hs = await res.json().catch(() => ({}));
    if (!res.ok || !hs.uploadUrl || !hs.path) {
      throw new Error(hs.error || ("Handshake fehlgeschlagen (" + res.status + ")"));
    }
  } catch (err) {
    throw new Error(err && err.message ? err.message : "Handshake fehlgeschlagen");
  }

  // 2) Video direkt an die signierte URL hochladen (NICHT durch unsere API).
  await putVideo(hs.uploadUrl, videoBlob);

  // 3) Complete: Job einreihen (mit Pfad, Titel, Klicks).
  setUploadProgress("Wird verarbeitet ...");
  let done;
  try {
    const res = await fetch(base + "/api/recorder/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: cfg.token,
        path: hs.path,
        title: "Bildschirmaufnahme",
        clicks: clicks,
      }),
    });
    done = await res.json().catch(() => ({}));
    if (!res.ok || !done.jobId) {
      throw new Error(done.error || ("Einreihen fehlgeschlagen (" + res.status + ")"));
    }
  } catch (err) {
    throw new Error(err && err.message ? err.message : "Einreihen fehlgeschlagen");
  }

  // Erfolg.
  els.uploadProgress.textContent = "";
  els.uploadDone.hidden = false;
  const orgHint = hs.accountName ? " (" + hs.accountName + ")" : "";
  setStatus("Hochgeladen" + orgHint + " - das Tutorial wird erstellt.", "ok");
  if (els.openApp) {
    els.openApp.onclick = () => {
      chrome.tabs.create({ url: base + "/app", active: true });
    };
  }
}

els.begin.addEventListener("click", begin);
els.stop.addEventListener("click", stop);
els.again.addEventListener("click", () => {
  // clicksTab erhalten, damit die naechste Aufnahme wieder Klicks aus demselben Tab zaehlt.
  const q = clicksTabId == null ? "" : "?clicksTab=" + String(clicksTabId);
  location.href = chrome.runtime.getURL("recorder.html" + q);
});

// Warnen, wenn der Nutzer den Tab waehrend der Aufnahme schliessen will.
window.addEventListener("beforeunload", (e) => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    e.preventDefault();
    e.returnValue = "";
  }
});

// Hinweis: Fehlt die Tab-ID, war die Ausgangsseite eine Systemseite -> dort keine Klicks.
// Der Hinweis wird NUR dann gezeigt (praezise, nicht generisch).
if (clicksTabId == null) {
  els.clicksTabInfo.textContent =
    "Hinweis: Auf Browser-Systemseiten koennen keine Klicks erfasst werden - auf normalen Websites schon. Das Video wird trotzdem aufgenommen.";
}

// Config laden (Token + App-URL) fuer den Direkt-Upload.
(async () => {
  await loadConfig();
})();

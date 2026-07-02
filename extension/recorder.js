"use strict";

// Steply Recorder - Aufnahme-Tab.
// Hier laeuft die eigentliche Aufnahme (getDisplayMedia + MediaRecorder), damit
// sie nicht mit dem Popup stirbt. Klicks kommen per Runtime-Nachricht aus dem
// Content-Script des aufzunehmenden Tabs.
//
// clicks.json-Vertrag (Migration 0020 / Worker):
//   [{ t: Sekunden seit Aufnahmestart, x: 0..1, y: 0..1, label: Text (<=60) }]

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
  fileVideo: document.getElementById("fileVideo"),
  fileClicks: document.getElementById("fileClicks"),
};

// Aus welchem Tab akzeptieren wir Klicks? (vom Popup gesetzt)
const params = new URLSearchParams(location.search);
const rawClicksTab = params.get("clicksTab");
const clicksTabId =
  rawClicksTab && /^\d+$/.test(rawClicksTab) ? parseInt(rawClicksTab, 10) : null;

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

if (clicksTabId == null) {
  els.clicksTabInfo.textContent =
    "Hinweis: Fuer die aktuelle Seite konnten keine Klicks vorbereitet werden. Das Video wird trotzdem aufgenommen.";
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

// Klicks aus dem Content-Script empfangen.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-click") return;
  // Nur Klicks aus dem gestarteten Tab zaehlen (falls bekannt).
  if (clicksTabId != null && sender && sender.tab && sender.tab.id !== clicksTabId) {
    return;
  }
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  clicks.push(msg.click);
  els.clickCount.textContent = String(clicks.length);
});

async function tellContentScript(type, payload) {
  if (clicksTabId == null) return;
  try {
    await chrome.tabs.sendMessage(clicksTabId, Object.assign({ type }, payload || {}));
  } catch (err) {
    // Content-Script evtl. nicht erreichbar (Tab geschlossen/navigiert).
    console.warn("Steply: Nachricht an Content-Script fehlgeschlagen:", err);
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

  // UHR-SYNC: gemeinsame Startzeit an das Content-Script broadcasten.
  startEpoch = Date.now();
  await tellContentScript("steply-rec-start", { startEpoch });

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
  tellContentScript("steply-rec-stop");
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

  const videoName = downloadBlob(videoBlob, stampName("aufnahme", "webm"));
  const clicksName = downloadBlob(clicksBlob, stampName("clicks", "json"));

  els.fileVideo.textContent = videoName;
  els.fileClicks.textContent = clicksName;

  show("done");
  setStatus(
    "2 Dateien heruntergeladen - laden Sie beide in Steply hoch (Aus Video).",
    "ok"
  );
}

els.begin.addEventListener("click", begin);
els.stop.addEventListener("click", stop);
els.again.addEventListener("click", () => {
  location.href = chrome.runtime.getURL(
    "recorder.html?clicksTab=" + (clicksTabId == null ? "" : String(clicksTabId))
  );
});

// Warnen, wenn der Nutzer den Tab waehrend der Aufnahme schliessen will.
window.addEventListener("beforeunload", (e) => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    e.preventDefault();
    e.returnValue = "";
  }
});

"use strict";

// Steply Recorder - Side Panel (v2, Tango-Architektur).
//
// EIN durchgehendes Panel in der Browser-Seitenleiste ersetzt das alte Popup + den
// separaten Aufnahme-Tab. Es bleibt beim Navigieren und beim Tab-Wechsel offen (das
// erledigt Chrome), lebt also die ganze Aufnahme lang - dadurch verschwindet die
// "Fenster oeffnet/minimiert/vergisst man"-Falle des Bestands.
//
// ZUSTAENDE (show(...)):
//   connect    (a) Nicht verbunden: Token/App-URL eingeben.
//   start      (b) Zwei Karten: Sofort-Anleitung | Video mit Ton.
//   videoSetup     Video-Vorbereitung: Mikro-Preflight + "ohne Ton" + Start.
//   videoLive  (d) Video-Aufnahme laeuft.
//   videoDone  (e) Upload/Fertig (Video).
//   guideLive  (c) Sofort-Anleitung laeuft: Live-Zaehler + Schrittliste mit Thumbnails.
//   guideDone  (e) Upload/Fertig (Sofort-Anleitung).
//
// MESSAGE-FLUSS: content.js (deklarativ auf jeder http(s)-Seite) sendet per
// chrome.runtime.sendMessage:
//   - "steply-click"       {click:{t,x,y,label}}   (Video-Modus)
//   - "steply-guide-step"  {step:{rect,label,...}}  (Sofort-Modus)
// Das offene Panel empfaengt beides via chrome.runtime.onMessage. Wir akzeptieren
// Nachrichten aus JEDEM http(s)-Tab DES PANEL-FENSTERS (sender.tab.windowId ===
// panelWindowId) - NICHT mehr an einen einzelnen Tab gebunden. So zaehlt ein Tab-
// Wechsel mitten in der Anleitung normal mit (Richards Bug: "in anderem Tab geklickt").
// Zurueck ans jeweilige Content-Script geht der Klick-Puls ("steply-guide-captured")
// gezielt an sender.tab.id des ausloesenden Schritts.
//
// clicks.json-Vertrag (Migration 0020 / Worker) UNVERAENDERT:
//   [{ t: Sekunden seit Aufnahmestart, x: 0..1, y: 0..1, label: Text (<=60) }]

const els = {
  interruptedHint: document.getElementById("interruptedHint"),
  status: document.getElementById("status"),
  // connect (a)
  connect: document.getElementById("connect"),
  token: document.getElementById("token"),
  appUrl: document.getElementById("appUrl"),
  saveCfg: document.getElementById("saveCfg"),
  cfgStatus: document.getElementById("cfgStatus"),
  skipConnect: document.getElementById("skipConnect"),
  // start (b)
  start: document.getElementById("start"),
  cardGuide: document.getElementById("cardGuide"),
  cardVideo: document.getElementById("cardVideo"),
  connText: document.getElementById("connText"),
  connBtn: document.getElementById("connBtn"),
  // videoSetup
  videoSetup: document.getElementById("videoSetup"),
  videoBack: document.getElementById("videoBack"),
  micStatus: document.getElementById("micStatus"),
  micRetry: document.getElementById("micRetry"),
  noAudio: document.getElementById("noAudio"),
  begin: document.getElementById("begin"),
  clicksTabInfo: document.getElementById("clicksTabInfo"),
  // videoLive (d)
  videoLive: document.getElementById("videoLive"),
  timer: document.getElementById("timer"),
  micLive: document.getElementById("micLive"),
  clickCount: document.getElementById("clickCount"),
  stop: document.getElementById("stop"),
  // videoDone (e)
  videoDone: document.getElementById("videoDone"),
  uploadBox: document.getElementById("uploadBox"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadDone: document.getElementById("uploadDone"),
  openApp: document.getElementById("openApp"),
  downloadBox: document.getElementById("downloadBox"),
  fileVideo: document.getElementById("fileVideo"),
  fileClicks: document.getElementById("fileClicks"),
  again: document.getElementById("again"),
  // guideLive (c)
  guideLive: document.getElementById("guideLive"),
  guideTimer: document.getElementById("guideTimer"),
  guideCount: document.getElementById("guideCount"),
  guideList: document.getElementById("guideList"),
  guideStop: document.getElementById("guideStop"),
  // guideDone (e)
  guideDone: document.getElementById("guideDone"),
  guideProgress: document.getElementById("guideProgress"),
  guideUploadDone: document.getElementById("guideUploadDone"),
  guideOpenApp: document.getElementById("guideOpenApp"),
  guideAgain: document.getElementById("guideAgain"),
};

// ---- Zustand ----
let mediaRecorder = null;
let recordedChunks = [];
let clicks = [];
let displayStream = null;
let micStream = null;
let startEpoch = 0;
let timerInterval = null;
let stopping = false;
let started = false; // Doppelstart-Schutz (Video)
let panelWindowId = null; // Fenster-ID, an dem die Seitenleiste haengt
let micReady = false; // Mikro-Preflight bestanden?
let interruptedDiscarded = false; // beim Oeffnen eine klemmende Aufnahme verworfen?

// Konfiguration (Token + App-URL) aus chrome.storage.local.
let cfg = { token: "", appUrl: "" };
let hasToken = false;

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
  hasToken = !!cfg.token;
}

function setStatus(text, kind) {
  els.status.textContent = text || "";
  els.status.className = "status" + (kind ? " status-" + kind : "");
}

// Genau EINEN Abschnitt zeigen.
function show(section) {
  els.connect.hidden = section !== "connect";
  els.start.hidden = section !== "start";
  els.videoSetup.hidden = section !== "videoSetup";
  els.videoLive.hidden = section !== "videoLive";
  els.videoDone.hidden = section !== "videoDone";
  els.guideLive.hidden = section !== "guideLive";
  els.guideDone.hidden = section !== "guideDone";
}

function fmtTime(totalSeconds) {
  const s = Math.floor(totalSeconds % 60);
  const m = Math.floor(totalSeconds / 60);
  const pad = (n) => String(n).padStart(2, "0");
  return pad(m) + ":" + pad(s);
}

function startTimer(el) {
  stopTimer();
  el.textContent = "00:00";
  const t = () => {
    el.textContent = fmtTime((Date.now() - startEpoch) / 1000);
  };
  t();
  timerInterval = setInterval(t, 500);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateInterruptedHint() {
  els.interruptedHint.hidden = !interruptedDiscarded;
}

// ---- (a) Verbinden ----
function showConnect() {
  els.token.value = cfg.token || "";
  els.appUrl.value = cfg.appUrl || "";
  els.appUrl.placeholder = DEFAULT_APP_URL;
  els.cfgStatus.textContent = "";
  els.cfgStatus.className = "status";
  show("connect");
  updateInterruptedHint();
}

async function saveCfg() {
  const token = (els.token.value || "").trim();
  const appUrl = (els.appUrl.value || "").trim().replace(/\/+$/, "");
  try {
    await chrome.storage.local.set({ steplyToken: token, steplyAppUrl: appUrl });
    cfg.token = token;
    cfg.appUrl = appUrl;
    hasToken = !!token;
    els.cfgStatus.textContent = token
      ? "Gespeichert. Sofort-Anleitung und Video-Upload sind verfuegbar."
      : "Gespeichert. Ohne Token nur Video-Modus (zwei Dateien zum Hochladen).";
    els.cfgStatus.className = "status status-ok";
    // Nach dem Speichern zur Auswahl.
    setTimeout(() => showStart(), 500);
  } catch (err) {
    els.cfgStatus.textContent = "Konnte nicht gespeichert werden.";
    els.cfgStatus.className = "status status-error";
  }
}

// ---- (b) Start / Auswahl ----
function showStart() {
  els.cardGuide.disabled = !hasToken;
  els.cardGuide.title = hasToken
    ? ""
    : "Zuerst mit Steply verbinden (Direkt-Upload noetig).";
  if (hasToken) {
    els.connText.textContent = "Mit Steply verbunden.";
    els.connBtn.textContent = "Verbindung aendern";
  } else {
    els.connText.textContent =
      "Nicht verbunden - Sofort-Anleitung braucht eine Verbindung.";
    els.connBtn.textContent = "Verbinden";
  }
  setStatus("");
  show("start");
  updateInterruptedHint();
}

// ============================================================================
// ZUSTANDS-VERSOEHNUNG BEIM OEFFNEN
// Das Panel-Dokument wird beim Schliessen der Seitenleiste zerstoert und beim
// naechsten Oeffnen frisch geladen. Eine frisch geladene Instanz hat also NIE eine
// laufende Session. Finden wir trotzdem ein rec-Flag im storage, ist es der Ueberrest
// einer abgebrochenen/klemmenden Aufnahme -> verwerfen (storage clear) und sauber im
// Start-Screen landen, mit dezentem Hinweis. NIE wieder im "recording"-Modus aufwachen.
// ============================================================================
async function reconcile() {
  try {
    const res = await chrome.storage.local.get("rec");
    if (res && res.rec) {
      await chrome.storage.local.remove("rec");
      interruptedDiscarded = true;
    }
  } catch (err) {
    /* storage nicht verfuegbar -> es gibt eh nichts zu verwerfen */
  }
}

// Akzeptieren wir eine Nachricht aus diesem Sender? Nur aus einem Tab DES Panel-
// Fensters (Tab-Wechsel innerhalb des Fensters ist erlaubt). Faellt die Fenster-ID
// weg (unbekannt), akzeptieren wir defensiv aus jedem Tab.
function fromPanelWindow(sender) {
  if (!sender || !sender.tab) return false;
  if (panelWindowId == null) return true;
  return sender.tab.windowId === panelWindowId;
}

// Aufnahmezustand fuer die Content-Scripts setzen/loeschen (Video-Modus).
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

// ============================================================================
// VIDEO-MODUS
// ============================================================================

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
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
  return filename;
}

// --- Mikro-Preflight: VOR dem Start pruefen, ob das Mikrofon nutzbar ist. ---
function setMicStatus(kind, text) {
  els.micStatus.className = "mic-status " + kind;
  els.micStatus.textContent = text;
}

function updateBeginEnabled() {
  // Start erst aktiv, wenn Mikro ok ODER Nutzer bewusst "ohne Ton" waehlt.
  els.begin.disabled = !(micReady || els.noAudio.checked);
}

async function micPreflight() {
  setMicStatus("pending", "Mikrofon wird geprueft ...");
  els.micRetry.hidden = true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Sofort wieder freigeben - beim eigentlichen Start neu anfordern (Recht bleibt).
    s.getTracks().forEach((t) => t.stop());
    micReady = true;
    setMicStatus("ok", "🎙 Mikrofon bereit");
  } catch (err) {
    micReady = false;
    setMicStatus(
      "err",
      "Mikrofon nicht verfuegbar. Bitte Zugriff erlauben - oder unten „ohne Ton aufnehmen“ waehlen."
    );
    els.micRetry.hidden = false;
  }
  updateBeginEnabled();
}

function goVideoSetup() {
  started = false;
  micReady = false;
  els.noAudio.checked = false;
  els.begin.disabled = true;
  // Der Verworfen-Hinweis hat seinen Zweck erfuellt, sobald der Nutzer weitergeht.
  interruptedDiscarded = false;
  els.interruptedHint.hidden = true;
  setStatus("");
  show("videoSetup");
  micPreflight();
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
    updateBeginEnabled();
    setStatus("Aufnahme abgebrochen. Sie koennen es erneut versuchen.", "error");
    return;
  }

  // Ton dazumischen, wenn Mikro ok und nicht bewusst abgewaehlt.
  let combinedStream = displayStream;
  const wantAudio = micReady && !els.noAudio.checked;
  if (wantAudio) {
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
    updateBeginEnabled();
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

  // UHR-SYNC: gemeinsame Startzeit im storage -> Content-Scripts erfassen ab jetzt.
  startEpoch = Date.now();
  await setRecState(true);

  mediaRecorder.start(1000); // alle 1s ein Chunk (robust gegen Absturz)
  stopping = false;
  els.stop.disabled = false;
  els.clickCount.textContent = "0";
  els.micLive.textContent =
    wantAudio && micStream ? "🎙 Mikrofon aktiv" : "Ohne Ton";
  show("videoLive");
  setStatus("");
  startTimer(els.timer);
}

function stop() {
  if (stopping) return;
  stopping = true;
  els.stop.disabled = true;
  setStatus("Aufnahme wird abgeschlossen ...");
  setRecState(false); // Content-Scripts hoeren auf, Klicks zu erfassen
  stopTimer();
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

  show("videoDone");

  // Mit Token: Direkt-Upload. Ohne Token: die zwei Dateien herunterladen.
  if (cfg.token) {
    uploadToSteply(videoBlob).catch((err) => {
      showUploadError(err && err.message ? err.message : String(err), videoBlob, clicksBlob);
    });
  } else {
    downloadFallback(videoBlob, clicksBlob);
  }
}

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

function showUploadError(message, videoBlob, clicksBlob) {
  setStatus(
    "Upload fehlgeschlagen: " + message + " - Dateien wurden stattdessen heruntergeladen.",
    "error"
  );
  downloadFallback(videoBlob, clicksBlob);
}

// Video an eine signierte URL per PUT (XHR fuer Fortschritt).
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
      throw new Error(hs.error || "Handshake fehlgeschlagen (" + res.status + ")");
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
      throw new Error(done.error || "Einreihen fehlgeschlagen (" + res.status + ")");
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

// ============================================================================
// SOFORT-ANLEITUNG (guide-Modus): pro Klick ein Screenshot + Element-Box -> fertiger
// Tutorial-Entwurf, ohne Video. Multi-Tab-faehig: captureVisibleTab erfasst immer den
// aktiven (sichtbaren) Tab des Fensters, in dem geklickt wurde - egal in welchem Tab.
// Der Aufruf laeuft ueber background.js (Chromium-Bug im Panel-Kontext, s. captureFor).
//
// RATENLIMIT: captureVisibleTab ist ~2/s begrenzt. Wir serialisieren die Captures
// (Warteschlange) und fassen schnelle Doppelklicks zusammen (letzter gewinnt).
// ============================================================================

const MAX_GUIDE_STEPS = 40;
const CAPTURE_MIN_INTERVAL = 550; // ms Mindestabstand zwischen Captures

let guideActive = false;
let guideSteps = []; // { rect, label, action, url, title, ts, blob, width, height, thumbUrl }
let guidePending = null; // { step, tabId } - wartender Schritt (letzter gewinnt)
let guideCapturing = false;
let guideLastCaptureAt = 0;
let guideFinishing = false;

function guideBusyHint() {
  setStatus("Screenshot wird erfasst ...");
}

async function startGuide() {
  resetGuide();
  guideActive = true;
  guideFinishing = false;
  interruptedDiscarded = false;
  els.interruptedHint.hidden = true;
  els.guideStop.disabled = false;
  els.guideCount.textContent = "0";
  els.guideList.textContent = "";
  setStatus("");
  show("guideLive");
  startEpoch = Date.now();
  startTimer(els.guideTimer);
  try {
    await chrome.storage.local.set({ rec: { startedAt: startEpoch, mode: "guide" } });
  } catch (err) {
    console.warn("Steply: Aufnahmezustand (guide) nicht gesetzt:", err);
  }
}

// PNG-DataURL -> WebP-Blob (Qualitaet 0.85). Faellt bei Fehler auf PNG zurueck.
async function pngDataUrlToWebp(dataUrl) {
  const res = await fetch(dataUrl);
  const pngBlob = await res.blob();
  try {
    const bitmap = await createImageBitmap(pngBlob);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close && bitmap.close();
    const webp = await canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
    return { blob: webp, width: canvas.width, height: canvas.height };
  } catch (err) {
    const dim = await imageSize(pngBlob).catch(() => ({ width: 0, height: 0 }));
    return { blob: pngBlob, width: dim.width, height: dim.height };
  }
}

function imageSize(blob) {
  return createImageBitmap(blob).then((b) => {
    const d = { width: b.width, height: b.height };
    b.close && b.close();
    return d;
  });
}

// Screenshot ueber den Hintergrund-Worker anfordern (siehe Kommentar in captureFor).
function captureViaBackground(windowId) {
  return chrome.runtime
    .sendMessage({ type: "steply-capture", windowId })
    .then((resp) => {
      if (!resp || !resp.ok || !resp.dataUrl) {
        throw new Error(
          (resp && resp.error) || "keine Antwort vom Hintergrund-Worker"
        );
      }
      return resp.dataUrl;
    });
}

// Einen Screenshot des aktiven Tabs im Panel-Fenster machen (serialisiert, ratenlimit-bewusst).
async function captureFor(pending) {
  const src = pending.step;
  if (guideSteps.length >= MAX_GUIDE_STEPS) {
    setStatus("Maximale Schrittzahl (" + MAX_GUIDE_STEPS + ") erreicht.", "error");
    return;
  }
  // Ratenlimit einhalten.
  const wait = CAPTURE_MIN_INTERVAL - (Date.now() - guideLastCaptureAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  // Fenster des Klicks bevorzugen; Fallback: Panel-Fenster.
  const targetWindowId =
    pending.windowId != null
      ? pending.windowId
      : panelWindowId == null
        ? null
        : panelWindowId;

  // WICHTIG: Der Screenshot laeuft ueber den Hintergrund-Worker, NICHT direkt hier -
  // captureVisibleTab scheitert im Seitenleisten-Kontext an einem Chromium-Bug
  // (crbug.com/40916430). Zwei Versuche (kurze Pause dazwischen faengt Seitenwechsel/
  // Fokuswechsel ab), danach ein letzter Direktversuch aus dem Panel.
  let dataUrl = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 2 && !dataUrl; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 350));
    try {
      dataUrl = await captureViaBackground(targetWindowId);
    } catch (err) {
      lastErr = err;
    }
  }
  if (!dataUrl) {
    try {
      dataUrl = await chrome.tabs.captureVisibleTab(
        targetWindowId == null ? undefined : targetWindowId,
        { format: "png" }
      );
    } catch (err) {
      lastErr = lastErr || err;
    }
  }
  if (!dataUrl) {
    const why = lastErr && lastErr.message ? lastErr.message : "unbekannter Fehler";
    console.warn("Steply: Screenshot fehlgeschlagen:", why);
    setStatus(
      "Screenshot fehlgeschlagen (" +
        why +
        "). Passiert das bei jedem Klick: chrome://extensions -> Steply Recorder -> " +
        'Details -> Websitezugriff auf "Bei allen Websites" stellen und neu laden.',
      "error"
    );
    return;
  }
  guideLastCaptureAt = Date.now();

  // Klick-Puls im ausloesenden Tab - ERST NACH dem Screenshot, damit er nie mit im Bild
  // landet. Multi-Tab: gezielt an sender.tab.id des Schritts (nicht an einen fixen Tab).
  if (pending.tabId != null) {
    try {
      chrome.tabs.sendMessage(pending.tabId, { type: "steply-guide-captured" });
    } catch (err) {
      /* Puls ist optional */
    }
  }

  let img;
  try {
    img = await pngDataUrlToWebp(dataUrl);
  } catch (err) {
    console.warn("Steply: WebP-Konvertierung fehlgeschlagen:", err && err.message);
    return;
  }

  const step = {
    rect: src.rect,
    label: src.label || "",
    action: src.action === "type" ? "type" : "click",
    url: src.url || "",
    title: src.title || "",
    ts: src.ts || Date.now(),
    blob: img.blob,
    width: img.width,
    height: img.height,
    thumbUrl: null,
  };
  try {
    step.thumbUrl = URL.createObjectURL(step.blob);
  } catch (err) {
    step.thumbUrl = null;
  }
  guideSteps.push(step);
  renderGuideSteps();
  setStatus("");
}

// Nach jedem Capture den naechsten wartenden Schritt abarbeiten (Serialisierung).
async function drainGuideQueue() {
  if (guideCapturing) return;
  guideCapturing = true;
  try {
    while (guidePending && guideActive) {
      const pending = guidePending;
      guidePending = null;
      await captureFor(pending);
    }
  } finally {
    guideCapturing = false;
  }
}

function removeGuideStep(step) {
  const i = guideSteps.indexOf(step);
  if (i < 0) return;
  if (step.thumbUrl) {
    try {
      URL.revokeObjectURL(step.thumbUrl);
    } catch (err) {
      /* egal */
    }
  }
  guideSteps.splice(i, 1);
  renderGuideSteps();
}

// Schrittliste mit Thumbnail JE Schritt (nicht nur letzter) + Entfernen-Knopf.
function renderGuideSteps() {
  els.guideCount.textContent = String(guideSteps.length);
  els.guideList.textContent = "";
  guideSteps.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "guide-item";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(i + 1);

    const thumb = document.createElement("img");
    thumb.className = "thumb";
    thumb.alt = "";
    if (s.thumbUrl) thumb.src = s.thumbUrl;

    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent =
      s.label || (s.action === "type" ? "Eingabe" : "Schritt " + (i + 1));

    const rm = document.createElement("button");
    rm.className = "rm";
    rm.type = "button";
    rm.textContent = "✕";
    rm.title = "Schritt entfernen";
    rm.addEventListener("click", () => removeGuideStep(s));

    row.appendChild(idx);
    row.appendChild(thumb);
    row.appendChild(lbl);
    row.appendChild(rm);
    els.guideList.appendChild(row);
  });
  // Neuen Schritt in Sicht scrollen.
  els.guideList.scrollTop = els.guideList.scrollHeight;
}

// "Anleitung fertigstellen" -> hochladen.
async function finishGuide() {
  if (guideFinishing) return;
  guideFinishing = true;
  els.guideStop.disabled = true;
  guideActive = false;
  stopTimer();
  // Content-Scripts stoppen die Erfassung.
  try {
    await chrome.storage.local.remove("rec");
  } catch (err) {
    /* egal */
  }
  // Noch laufende Captures kurz auslaufen lassen.
  await new Promise((r) => setTimeout(r, 50));

  if (guideSteps.length === 0) {
    setStatus("Es wurden keine Schritte aufgenommen.", "error");
    els.guideStop.disabled = false;
    guideFinishing = false;
    guideActive = true;
    startTimer(els.guideTimer);
    try {
      await chrome.storage.local.set({ rec: { startedAt: startEpoch, mode: "guide" } });
    } catch (err) {
      /* egal */
    }
    return;
  }

  show("guideDone");
  els.guideUploadDone.hidden = true;
  try {
    await uploadGuide();
  } catch (err) {
    setStatus(
      "Upload fehlgeschlagen: " + (err && err.message ? err.message : String(err)),
      "error"
    );
    els.guideProgress.textContent = "";
  }
}

async function uploadGuide() {
  const base = appBase();
  els.guideProgress.textContent = "Verbindung zu Steply wird hergestellt ...";

  // 1) Handshake: N signierte Upload-URLs.
  const count = guideSteps.length;
  const hsRes = await fetch(base + "/api/recorder/guide-handshake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: cfg.token, count }),
  });
  const hs = await hsRes.json().catch(() => ({}));
  if (!hsRes.ok || !Array.isArray(hs.uploads) || hs.uploads.length !== count) {
    throw new Error(hs.error || "Handshake fehlgeschlagen (" + hsRes.status + ")");
  }

  // 2) Alle WebPs per PUT hochladen (Fortschritt).
  for (let i = 0; i < count; i++) {
    els.guideProgress.textContent =
      "Screenshots werden hochgeladen ... " + (i + 1) + "/" + count;
    const put = await fetch(hs.uploads[i].uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": guideSteps[i].blob.type || "image/webp" },
      body: guideSteps[i].blob,
    });
    if (!(put.status >= 200 && put.status < 300)) {
      throw new Error("Bild " + (i + 1) + " (" + put.status + ")");
    }
  }

  // 3) Complete: Entwurf anlegen.
  els.guideProgress.textContent = "Anleitung wird erstellt ...";
  const steps = guideSteps.map((s, i) => ({
    path: hs.uploads[i].path,
    label: s.label,
    action: s.action,
    rect: s.rect,
    url: s.url,
    w: s.width,
    h: s.height,
  }));
  const compRes = await fetch(base + "/api/recorder/guide-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: cfg.token, steps }),
  });
  const comp = await compRes.json().catch(() => ({}));
  if (!compRes.ok || !comp.tutorialId) {
    throw new Error(comp.error || "Anleitung konnte nicht erstellt werden (" + compRes.status + ")");
  }

  // Erfolg.
  els.guideProgress.textContent = "";
  els.guideUploadDone.hidden = false;
  const orgHint = hs.accountName ? " (" + hs.accountName + ")" : "";
  setStatus("Anleitung erstellt" + orgHint + " - als Entwurf in Steply.", "ok");
  const openUrl = base + "/app/tutorials/" + comp.tutorialId;
  if (els.guideOpenApp) {
    els.guideOpenApp.onclick = () => chrome.tabs.create({ url: openUrl, active: true });
  }
}

// ============================================================================
// NACHRICHTEN-EMPFANG (aus content.js, jeder Tab des Panel-Fensters)
// ============================================================================

// Video-Modus: Klick-Zeitstempel.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-click") return;
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  if (!fromPanelWindow(sender)) return;
  clicks.push(msg.click);
  els.clickCount.textContent = String(clicks.length);
});

// Sofort-Modus: Klick-Schritt (Element-Box) -> Screenshot ausloesen.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-guide-step") return;
  if (!guideActive) return;
  if (!fromPanelWindow(sender)) return;
  if (guideSteps.length >= MAX_GUIDE_STEPS) return;
  // Letzter gewinnt: ein noch nicht verarbeiteter Klick wird vom naechsten ersetzt.
  // windowId des Klick-Tabs merken: Screenshot gezielt aus DIESEM Fenster (robuster
  // als das beim Panel-Start ermittelte Fenster, z. B. bei mehreren Chrome-Fenstern).
  guidePending = { step: msg.step, tabId: sender.tab.id, windowId: sender.tab.windowId };
  if (guideCapturing) guideBusyHint();
  drainGuideQueue();
});

// ============================================================================
// RESET / NEUE AUFNAHME
// ============================================================================

function resetGuide() {
  guideSteps.forEach((s) => {
    if (s.thumbUrl) {
      try {
        URL.revokeObjectURL(s.thumbUrl);
      } catch (err) {
        /* egal */
      }
    }
  });
  guideSteps = [];
  guidePending = null;
  guideCapturing = false;
  guideFinishing = false;
  guideActive = false;
}

function resetVideo() {
  mediaRecorder = null;
  recordedChunks = [];
  clicks = [];
  stopping = false;
  started = false;
  els.uploadBox.hidden = true;
  els.downloadBox.hidden = true;
  els.uploadDone.hidden = true;
}

function newRecording() {
  cleanupStreams();
  stopTimer();
  resetGuide();
  resetVideo();
  // Ab jetzt ist die verworfene Aufnahme "abgehakt".
  interruptedDiscarded = false;
  els.guideStop.disabled = false;
  showStart();
}

// ============================================================================
// EVENTS
// ============================================================================

els.saveCfg.addEventListener("click", saveCfg);
els.skipConnect.addEventListener("click", () => showStart());
els.connBtn.addEventListener("click", () => showConnect());
els.cardGuide.addEventListener("click", () => {
  if (!hasToken) return;
  startGuide();
});
els.cardVideo.addEventListener("click", () => goVideoSetup());
els.videoBack.addEventListener("click", () => showStart());
els.noAudio.addEventListener("change", updateBeginEnabled);
els.micRetry.addEventListener("click", micPreflight);
els.begin.addEventListener("click", begin);
els.stop.addEventListener("click", stop);
els.guideStop.addEventListener("click", finishGuide);
els.again.addEventListener("click", newRecording);
els.guideAgain.addEventListener("click", newRecording);

// Panel wird geschlossen (Seitenleiste zu / Fenster zu): laufende Streams sauber
// stoppen (sonst bleibt der Mikro-/Freigabe-Indikator haengen) und Zustand raeumen,
// damit die NAECHSTE Oeffnung garantiert sauber startet. pagehide feuert beim Abbau
// des Panel-Dokuments; wir blockieren das Schliessen bewusst NICHT (kein Nag-Dialog).
window.addEventListener("pagehide", () => {
  cleanupStreams();
  guideActive = false;
  try {
    chrome.storage.local.remove("rec");
  } catch (err) {
    /* best effort - die Versoehnung beim naechsten Oeffnen faengt es sowieso ab */
  }
});

// ============================================================================
// INIT
// ============================================================================
(async () => {
  // Fenster-ID des Panels bestimmen (fuer captureVisibleTab + Multi-Tab-Filter).
  try {
    const w = await chrome.windows.getCurrent();
    panelWindowId = w && w.id != null ? w.id : null;
  } catch (err) {
    panelWindowId = null;
  }
  // Klemmende/abgebrochene Aufnahme verwerfen, BEVOR wir irgendetwas anzeigen.
  await reconcile();
  await loadConfig();
  if (hasToken) {
    showStart();
  } else {
    showConnect();
  }
})();

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
  // Sofort-Anleitung (guide-Modus)
  guideLive: document.getElementById("guideLive"),
  guideDone: document.getElementById("guideDone"),
  guideCount: document.getElementById("guideCount"),
  guidePreviewWrap: document.getElementById("guidePreviewWrap"),
  guidePreview: document.getElementById("guidePreview"),
  guideList: document.getElementById("guideList"),
  guideStop: document.getElementById("guideStop"),
  guideProgress: document.getElementById("guideProgress"),
  guideUploadDone: document.getElementById("guideUploadDone"),
  guideOpenApp: document.getElementById("guideOpenApp"),
  guideAgain: document.getElementById("guideAgain"),
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
  els.guideLive.hidden = section !== "guideLive";
  els.guideDone.hidden = section !== "guideDone";
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
// Fenster-ID des aufgenommenen Tabs (guide-Modus): captureVisibleTab braucht sie, um den
// richtigen Tab zu erwischen (aktiver Tab DIESES Fensters im Moment des Klicks).
const rawClicksWin = params.get("clicksWin");
const clicksWinId =
  rawClicksWin && /^\d+$/.test(rawClicksWin) ? parseInt(rawClicksWin, 10) : null;
// Modus: "guide" (Sofort-Anleitung) oder "video" (Bestand). Default video.
const recorderMode = params.get("mode") === "guide" ? "guide" : "video";

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

// ============================================================================
// SOFORT-ANLEITUNG (guide-Modus): pro Klick ein Screenshot + Element-Box -> fertiger
// Tutorial-Entwurf, ohne Video, ohne Server-KI-Pipeline (Tango-Stil).
//
// ABLAUF:
//  1) startGuide(): Aufnahmezustand { mode:"guide" } setzen -> das Content-Script sendet
//     bei jedem pointerdown ein { rect,label,action,url,title,ts }.
//  2) Pro Nachricht SOFORT chrome.tabs.captureVisibleTab(fensterId) -> PNG des
//     aufgenommenen Tabs (der im Moment des Klicks aktiv/sichtbar ist).
//  3) PNG -> WebP (OffscreenCanvas, spart ~70 % Upload), als Schritt speichern.
//  4) "Fertigstellen": guide-handshake (N signierte URLs) -> alle WebPs per PUT ->
//     guide-complete (Titel + Schritte) -> Entwurf. "In Steply oeffnen".
//
// RATENLIMIT: captureVisibleTab ist auf ~2/s begrenzt (MAX_CAPTURE_VISIBLE_TAB_CALLS_
// PER_SECOND). Wir serialisieren die Captures (eine Warteschlange) und fassen schnelle
// Doppelklicks zusammen: ein neuer Klick, der kommt bevor der vorige verarbeitet ist,
// ersetzt den wartenden (letzter gewinnt), statt eine Fehlerflut auszuloesen.
// ============================================================================

const MAX_GUIDE_STEPS = 40;
// Mindestabstand zwischen zwei Captures (ms). ~2/s -> 550 ms mit Puffer.
const CAPTURE_MIN_INTERVAL = 550;

let guideActive = false;
let guideSteps = []; // { rect, label, action, url, title, ts, blob }
let guidePending = null; // wartender Schritt (letzter gewinnt), falls Capture noch laeuft
let guideCapturing = false;
let guideLastCaptureAt = 0;
let guideFinishing = false;

function guideBusyHint() {
  // Kleiner Hinweis, wenn das Ratenlimit greift.
  setStatus("Screenshot wird erfasst ...");
}

async function startGuide() {
  guideActive = true;
  guideSteps = [];
  show("guideLive");
  setStatus("");
  els.guideCount.textContent = "0";
  // Aufnahmezustand fuer die Content-Scripts (mit Modus guide).
  startEpoch = Date.now();
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
    // OffscreenCanvas/WebP nicht verfuegbar -> PNG behalten (Server akzeptiert es).
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

// Einen Screenshot des aufgenommenen Tabs machen (Ratenlimit-bewusst, serialisiert).
async function captureFor(pending) {
  if (guideSteps.length >= MAX_GUIDE_STEPS) {
    setStatus("Maximale Schrittzahl (" + MAX_GUIDE_STEPS + ") erreicht.", "error");
    return;
  }
  // Ratenlimit einhalten.
  const wait = CAPTURE_MIN_INTERVAL - (Date.now() - guideLastCaptureAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(
      clicksWinId == null ? undefined : clicksWinId,
      { format: "png" }
    );
  } catch (err) {
    // Haeufigste Ursache: Seite bereits weiternavigiert / Tab nicht sichtbar.
    console.warn("Steply: Screenshot fehlgeschlagen:", err && err.message);
    setStatus("Ein Screenshot konnte nicht erfasst werden (Seitenwechsel?).", "error");
    return;
  }
  guideLastCaptureAt = Date.now();
  if (!dataUrl) return;

  let img;
  try {
    img = await pngDataUrlToWebp(dataUrl);
  } catch (err) {
    console.warn("Steply: WebP-Konvertierung fehlgeschlagen:", err && err.message);
    return;
  }

  const step = {
    rect: pending.rect,
    label: pending.label || "",
    action: pending.action === "type" ? "type" : "click",
    url: pending.url || "",
    title: pending.title || "",
    ts: pending.ts || Date.now(),
    blob: img.blob,
    width: img.width,
    height: img.height,
  };
  guideSteps.push(step);
  renderGuideSteps();
  showGuidePreview(img.blob);
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

function showGuidePreview(blob) {
  try {
    const url = URL.createObjectURL(blob);
    const prev = els.guidePreview.dataset.url;
    els.guidePreview.src = url;
    els.guidePreview.dataset.url = url;
    els.guidePreviewWrap.hidden = false;
    if (prev) setTimeout(() => URL.revokeObjectURL(prev), 1000);
  } catch (err) {
    /* Vorschau ist optional */
  }
}

function renderGuideSteps() {
  els.guideCount.textContent = String(guideSteps.length);
  els.guideList.textContent = "";
  guideSteps.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "guide-item";

    const idx = document.createElement("span");
    idx.className = "idx";
    idx.textContent = String(i + 1);

    const lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent =
      s.label || (s.action === "type" ? "Eingabe" : "Schritt " + (i + 1));

    const rm = document.createElement("button");
    rm.className = "rm";
    rm.type = "button";
    rm.textContent = "✕";
    rm.title = "Schritt entfernen";
    rm.addEventListener("click", () => {
      guideSteps.splice(i, 1);
      renderGuideSteps();
    });

    row.appendChild(idx);
    row.appendChild(lbl);
    row.appendChild(rm);
    els.guideList.appendChild(row);
  });
}

// Klick-Schritte aus dem Content-Script empfangen (nur guide-Modus, nur aufgenommener Tab).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-guide-step") return;
  if (!guideActive) return;
  if (clicksTabId == null) return;
  if (!sender || !sender.tab || sender.tab.id !== clicksTabId) return;
  if (guideSteps.length >= MAX_GUIDE_STEPS) return;
  // Letzter gewinnt: ein noch nicht verarbeiteter Klick wird vom naechsten ersetzt
  // (schnelle Doppelklicks -> ein Screenshot).
  guidePending = msg.step;
  if (guideCapturing) guideBusyHint();
  drainGuideQueue();
});

// "Anleitung fertigstellen" -> hochladen.
async function finishGuide() {
  if (guideFinishing) return;
  guideFinishing = true;
  els.guideStop.disabled = true;
  guideActive = false;
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

els.guideStop.addEventListener("click", finishGuide);

els.begin.addEventListener("click", begin);
els.stop.addEventListener("click", stop);

// Query fuer die naechste Aufnahme: Tab-/Fenster-ID + Modus erhalten.
function nextQuery() {
  const q = new URLSearchParams();
  if (clicksTabId != null) q.set("clicksTab", String(clicksTabId));
  if (clicksWinId != null) q.set("clicksWin", String(clicksWinId));
  q.set("mode", recorderMode);
  const s = q.toString();
  return s ? "?" + s : "";
}

function restart() {
  location.href = chrome.runtime.getURL("recorder.html" + nextQuery());
}
els.again.addEventListener("click", restart);
els.guideAgain.addEventListener("click", restart);

// Warnen, wenn der Nutzer den Tab waehrend einer laufenden Aufnahme schliessen will.
window.addEventListener("beforeunload", (e) => {
  const videoRunning = mediaRecorder && mediaRecorder.state === "recording";
  if (videoRunning || guideActive) {
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

// Config laden (Token + App-URL) fuer den Direkt-Upload, dann Modus starten.
(async () => {
  await loadConfig();
  if (recorderMode === "guide") {
    startGuide();
  } else {
    show("setup");
  }
})();

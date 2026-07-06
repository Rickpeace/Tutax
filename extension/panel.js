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
  updateHint: document.getElementById("updateHint"),
  // Aufnahme-Anker (Welle 27)
  targetBanner: document.getElementById("targetBanner"),
  targetPrefix: document.getElementById("targetPrefix"),
  targetLabel: document.getElementById("targetLabel"),
  targetClear: document.getElementById("targetClear"),
  status: document.getElementById("status"),
  // connect (a)
  connect: document.getElementById("connect"),
  connectAccount: document.getElementById("connectAccount"),
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

// Kontoname des verbundenen Tokens (via /api/recorder/me; fail-silent). Wird in Connect-
// und Start-Screen als „Verbunden mit X" gezeigt - so faellt eine Fehlbindung sofort auf.
let accountName = "";

const DEFAULT_APP_URL = "https://app.steply.de";

function appBase() {
  const raw = (cfg.appUrl || DEFAULT_APP_URL).trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_URL;
}

// ── Aufnahme-Anker (Welle 27) ──────────────────────────────────────────────
// Wurde die Aufnahme aus einem Einfuegepunkt im Builder angestossen, liegt hier das Ziel
// (background.js hat es beim Oeffnen in chrome.storage.local.pendingTarget gelegt):
//   { target: { tutorialId, anchor }, label, origin, ts }
// Die Aufnahme wird beim Fertigstellen an genau diese Stelle eingehaengt - aber NUR, wenn
// origin zur konfigurierten App-URL passt (sonst normal als neues Tutorial hochladen).
let pendingTarget = null;
// Aeltere Ziele beim Oeffnen verwerfen (der Nutzer hat die Aufnahme vermutlich vergessen).
const PENDING_TARGET_MAX_AGE_MS = 30 * 60 * 1000;

// Ziel aus dem Storage laden; abgelaufene (>30 min) sofort verwerfen. Fail-silent.
async function loadPendingTarget() {
  try {
    const res = await chrome.storage.local.get("pendingTarget");
    const pt = res && res.pendingTarget;
    if (pt && pt.target && typeof pt.ts === "number" && Date.now() - pt.ts <= PENDING_TARGET_MAX_AGE_MS) {
      pendingTarget = pt;
    } else {
      pendingTarget = null;
      if (pt) await chrome.storage.local.remove("pendingTarget").catch(() => {});
    }
  } catch (err) {
    pendingTarget = null;
  }
  renderTargetBanner();
}

// Ziel-Banner: sagt IMMER, wo die Aufnahme landet (Richards Wunsch) -
//   mit Ziel:  "Aufnahme fuer: <label>" + "Ziel verwerfen"
//   ohne Ziel: neutral "Aufnahme wird als neues Tutorial angelegt" (nur wenn verbunden)
function renderTargetBanner() {
  if (!els.targetBanner) return;
  if (pendingTarget) {
    // trim: ein Leerzeichen-Label liess die Zeile frueher LEER aussehen.
    const label = String(pendingTarget.label || "").trim();
    if (els.targetPrefix) els.targetPrefix.textContent = "Aufnahme für: ";
    els.targetLabel.textContent = label || "die gewählte Stelle im Tutorial";
    els.targetBanner.classList.remove("target-banner-neutral");
    if (els.targetClear) els.targetClear.hidden = false;
    els.targetBanner.hidden = false;
  } else if (hasToken) {
    if (els.targetPrefix) els.targetPrefix.textContent = "";
    els.targetLabel.textContent = "Aufnahme wird als neues Tutorial angelegt";
    els.targetBanner.classList.add("target-banner-neutral");
    if (els.targetClear) els.targetClear.hidden = true;
    els.targetBanner.hidden = false;
  } else {
    els.targetBanner.hidden = true;
  }
}

// Ziel vergessen: aus dem Storage raeumen + Banner weg. (Verwerfen-Knopf & nach Abschluss.)
async function clearPendingTarget() {
  pendingTarget = null;
  try {
    await chrome.storage.local.remove("pendingTarget");
  } catch (err) {
    /* egal */
  }
  renderTargetBanner();
}

// „Ziel verwerfen"-Knopf: Ziel raeumen; die naechste Aufnahme laeuft normal (neues Tutorial).
async function discardTarget() {
  await clearPendingTarget();
  setStatus("Ziel verworfen - die Aufnahme wird als neues Tutorial gespeichert.", "");
}

// Nur nutzen, wenn die Herkunft der konfigurierten App-URL entspricht (sonst ignorieren).
function targetForUpload() {
  if (!pendingTarget || !pendingTarget.target) return null;
  const origin = (pendingTarget.origin || "").replace(/\/+$/, "");
  let appOrigin = "";
  try {
    appOrigin = new URL(appBase()).origin;
  } catch (err) {
    appOrigin = "";
  }
  if (!origin || origin !== appOrigin) return null;
  return pendingTarget.target;
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

// Kontoname des aktuellen Tokens holen (GET /api/recorder/me). FAIL-SILENT: bei jedem
// Fehler bleibt der neutrale Text ("Mit Steply verbunden.") stehen. Kurzer Timeout, damit
// das Panel nie auf das Netz wartet. Aktualisiert die Anzeige, wenn sie gerade sichtbar ist.
async function fetchAccountName() {
  if (!cfg.token) {
    accountName = "";
    return;
  }
  const base = appBase();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(base + "/api/recorder/me", {
      method: "GET",
      headers: { Authorization: "Bearer " + cfg.token },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return; // neutraler Text bleibt (z. B. Token abgelaufen -> zeigt „verbunden")
    const body = await res.json().catch(() => ({}));
    if (body && body.account) {
      accountName = String(body.account).slice(0, 80);
      refreshConnectionUi();
    }
  } catch (err) {
    /* fail-silent: neutraler Text wie bisher */
  }
}

// Verbindungs-Anzeige (Connect + Start) auffrischen, ohne den Screen zu wechseln.
function refreshConnectionUi() {
  if (!els.start.hidden) updateConnInfo();
  if (!els.connect.hidden) updateConnectAccount();
}

function updateConnectAccount() {
  if (hasToken && accountName) {
    els.connectAccount.textContent = "Verbunden mit " + accountName + ".";
    els.connectAccount.hidden = false;
  } else {
    els.connectAccount.textContent = "";
    els.connectAccount.hidden = true;
  }
}

function updateConnInfo() {
  if (hasToken) {
    els.connText.textContent = accountName
      ? "Verbunden mit " + accountName + "."
      : "Mit Steply verbunden.";
    els.connBtn.textContent = "Verbindung aendern";
  } else {
    els.connText.textContent =
      "Nicht verbunden - Sofort-Anleitung braucht eine Verbindung.";
    els.connBtn.textContent = "Verbinden";
  }
}

// Numerischer Segment-Vergleich zweier Versionen ("2.2.0" vs "2.10.1"). true, wenn
// `server` echt neuer als `current` ist. Kein npm-Paket - Manifest-Versionen sind
// einfache Zahlen-Segmente.
function isNewerVersion(server, current) {
  const parse = (v) =>
    String(v || "")
      .split(".")
      .map((n) => parseInt(n, 10) || 0);
  const a = parse(server);
  const b = parse(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// Update-Hinweis: die auf dem Server hinterlegte Version lesen (public/downloads/
// steply-recorder.json aus Paket 2). Ist sie neuer als diese Installation, eine dezente,
// NIE blockierende Statuszeile mit Link auf /extension zeigen. Fail-silent + kurzer Timeout.
async function checkForUpdate() {
  const base = appBase();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(base + "/downloads/steply-recorder.json", {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    const serverVer = data && typeof data.version === "string" ? data.version : "";
    let current = "";
    try {
      current = chrome.runtime.getManifest().version;
    } catch (err) {
      current = "";
    }
    if (serverVer && current && isNewerVersion(serverVer, current)) {
      showUpdateHint(base, serverVer);
    }
  } catch (err) {
    /* fail-silent - der Update-Hinweis ist rein optional */
  }
}

function showUpdateHint(base, serverVer) {
  if (!els.updateHint) return;
  els.updateHint.textContent = "Neue Version verfuegbar (" + serverVer + "). ";
  const a = document.createElement("a");
  a.textContent = "Jetzt aktualisieren";
  a.href = "#";
  a.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: base + "/extension", active: true });
  });
  els.updateHint.appendChild(a);
  els.updateHint.hidden = false;
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
  updateConnectAccount();
  show("connect");
  updateInterruptedHint();
  // Kontoname (nach-)laden, falls verbunden aber noch nicht ermittelt.
  if (hasToken && !accountName) fetchAccountName();
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
  // Banner-Zustand kann von hasToken abhaengen (neutraler "neues Tutorial"-Modus).
  renderTargetBanner();
  els.cardGuide.disabled = !hasToken;
  els.cardGuide.title = hasToken
    ? ""
    : "Zuerst mit Steply verbinden (Direkt-Upload noetig).";
  updateConnInfo();
  setStatus("");
  show("start");
  updateInterruptedHint();
  // Kontoname (nach-)laden, falls verbunden aber noch nicht ermittelt.
  if (hasToken && !accountName) fetchAccountName();
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
  notifyAppTabs();
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
// RATENLIMIT: captureVisibleTab ist ~2/s begrenzt. Wir serialisieren die Captures ueber
// eine kleine FIFO-Warteschlange (Kappe GUIDE_QUEUE_CAP; bei Ueberlauf faellt der aelteste
// wartende Schritt heraus). So gehen Eingabe- + Klick-Schritt, die kurz nacheinander
// eintreffen (pointerdown-Flush), NICHT verloren. OPTIMIERUNG: kommen zwei Schritte im
// COALESCE_WINDOW an, teilen sie sich EINEN Screenshot - so zeigt der Klick-Schritt nicht
// versehentlich schon die Folgeseite (die Rects unterscheiden sich ja).
// ============================================================================

const MAX_GUIDE_STEPS = 40;
const CAPTURE_MIN_INTERVAL = 550; // ms Mindestabstand zwischen Captures (captureVisibleTab ~2/s)
const GUIDE_QUEUE_CAP = 4; // max. wartende Schritte; bei Ueberlauf aeltesten verwerfen
const COALESCE_WINDOW = 300; // ms: Eingabe + direkt folgender Klick teilen sich EINEN Screenshot

let guideActive = false;
let guideSteps = []; // { rect, label, action, url, title, selector, sensitive, ts, blob, width, height, thumbUrl }
let guideQueue = []; // FIFO: [{ step, tabId, windowId }] - wartende Schritte (Kappe GUIDE_QUEUE_CAP)
let guideCapturing = false;
let guideLastCaptureAt = 0;
let guideFinishing = false;

function guideBusyHint() {
  setStatus("Screenshot wird erfasst ...");
}

// Nach erfolgreichem Upload alle offenen App-Tabs benachrichtigen: content.js reicht
// das Signal in die Seite weiter, die App (ContentUpdatedRefresh) laedt die Daten nach -
// ein offener Builder/die Bibliothek zeigt die neue Aufnahme ohne F5.
function notifyAppTabs() {
  try {
    const base = appBase();
    chrome.tabs
      .query({})
      .then((tabs) => {
        for (const t of tabs || []) {
          if (t.id != null && typeof t.url === "string" && t.url.startsWith(base)) {
            chrome.tabs
              .sendMessage(t.id, { type: "steply-content-updated" })
              .catch(() => {
                /* Tab ohne Content-Script - egal */
              });
          }
        }
      })
      .catch(() => {
        /* egal - reiner Komfort */
      });
  } catch (err) {
    /* egal */
  }
}

// Warnen, wenn der gerade aktive Tab prinzipiell nicht aufnehmbar ist (chrome://,
// Web Store, PDF-Viewer, neuer-Tab-Seite): dort laeuft kein Content-Script, Klicks
// waeren stumm - der Nutzer soll wissen, dass er zum Ziel-Tab wechseln muss.
async function warnIfActiveTabNotCapturable() {
  try {
    const q =
      panelWindowId == null
        ? { active: true, currentWindow: true }
        : { active: true, windowId: panelWindowId };
    const tabs = await chrome.tabs.query(q);
    const tab = tabs && tabs[0];
    if (tab && tab.url && !/^https?:\/\//i.test(tab.url)) {
      setStatus(
        "Hinweis: Der aktive Tab ist eine Browser-Seite und kann nicht aufgenommen " +
          "werden. Wechsle zum Tab der Ziel-Website - dort zaehlen die Klicks.",
        "error"
      );
    }
  } catch (err) {
    /* egal - reine Komfort-Warnung */
  }
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
  // Altoffene Tabs nachimpfen (v2.2.2): ohne das fehlte content.js in Tabs, die vor dem
  // (Neu-)Laden der Extension geoeffnet wurden - Klicks dort blieben stumm.
  try {
    chrome.runtime.sendMessage({ type: "steply-ensure-content" });
  } catch (err) {
    /* egal - deklarative Injektion deckt neue Seiten ab */
  }
  warnIfActiveTabNotCapturable();
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

// Klick-Puls im ausloesenden Tab anstossen (optional, Multi-Tab: gezielt an dessen tabId).
function pulseTab(tabId) {
  if (tabId == null) return;
  try {
    chrome.tabs.sendMessage(tabId, { type: "steply-guide-captured" });
  } catch (err) {
    /* Puls ist optional */
  }
}

// EINEN Screenshot des aktiven Tabs im Panel-Fenster machen (serialisiert, ratenlimit-
// bewusst). Gibt { blob, width, height } zurueck oder null (Fehler -> Status gesetzt).
async function captureImage(pending) {
  if (guideSteps.length >= MAX_GUIDE_STEPS) {
    setStatus("Maximale Schrittzahl (" + MAX_GUIDE_STEPS + ") erreicht.", "error");
    return null;
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
    return null;
  }
  guideLastCaptureAt = Date.now();

  // Klick-Puls im ausloesenden Tab - ERST NACH dem Screenshot, damit er nie mit im Bild
  // landet. Multi-Tab: gezielt an sender.tab.id des Schritts (nicht an einen fixen Tab).
  pulseTab(pending.tabId);

  try {
    return await pngDataUrlToWebp(dataUrl);
  } catch (err) {
    console.warn("Steply: WebP-Konvertierung fehlgeschlagen:", err && err.message);
    return null;
  }
}

// Einen erfassten Schritt (Rohdaten + fertiges Bild) in die Liste aufnehmen. Bei geteiltem
// Screenshot (Coalesce) bekommt jeder Schritt einen EIGENEN Objekt-URL (sauberes Revoke).
function addGuideStep(src, img) {
  if (guideSteps.length >= MAX_GUIDE_STEPS) return;
  const step = {
    rect: src.rect,
    label: src.label || "",
    action: src.action === "type" ? "type" : "click",
    url: src.url || "",
    title: src.title || "",
    // selector (Welle 24): optionaler Vorbau, wird beim Upload mitgeschickt und serverseitig
    // streng validiert. Nur ein Objekt durchreichen (nie fremde Typen).
    selector: src.selector && typeof src.selector === "object" ? src.selector : null,
    // sensitive (Welle 28): Rechtecke sensibler Felder (reine Geometrie) fuer die Auto-
    // Schwaerzung. Nur ein Array durchreichen; der Server validiert streng und klemmt.
    sensitive: Array.isArray(src.sensitive) ? src.sensitive : null,
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

// FIFO-Queue abarbeiten (Serialisierung + Ratenlimit). OPTIMIERUNG: Schritte, die im
// ~COALESCE_WINDOW nach dem ersten ankamen (pointerdown-Flush: Eingabe + Klick), teilen
// sich DENSELBEN Screenshot - so zeigt der Klick-Schritt nicht schon die Folgeseite.
async function drainGuideQueue() {
  if (guideCapturing) return;
  guideCapturing = true;
  try {
    while (guideQueue.length && guideActive) {
      const first = guideQueue.shift();
      const img = await captureImage(first);
      if (!img) continue;
      addGuideStep(first.step, img);
      while (
        guideQueue.length &&
        guideActive &&
        guideSteps.length < MAX_GUIDE_STEPS &&
        Math.abs((guideQueue[0].step.ts || 0) - (first.step.ts || 0)) <= COALESCE_WINDOW
      ) {
        const shared = guideQueue.shift();
        pulseTab(shared.tabId);
        addGuideStep(shared.step, img);
      }
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
  // Aufnahme-Anker (Welle 27): nach dem Upload-Versuch (Erfolg/Fallback/Fehler) IMMER raeumen,
  // damit die naechste Aufnahme nicht versehentlich am alten Ziel landet + Banner verschwindet.
  await clearPendingTarget();
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
  const steps = guideSteps.map((s, i) => {
    const step = {
      path: hs.uploads[i].path,
      label: s.label,
      action: s.action,
      rect: s.rect,
      url: s.url,
      w: s.width,
      h: s.height,
    };
    // selector nur mitschicken, wenn vorhanden (Abwaertskompatibilitaet: optionales Feld).
    if (s.selector) step.selector = s.selector;
    // sensitive nur mitschicken, wenn vorhanden (additiv; alte Server ignorieren es).
    if (Array.isArray(s.sensitive) && s.sensitive.length) step.sensitive = s.sensitive;
    return step;
  });
  // Aufnahme-Anker (Welle 27): Ziel nur mitschicken, wenn die Herkunft zur App-URL passt.
  const uploadTarget = targetForUpload();
  const completeBody = { token: cfg.token, steps };
  if (uploadTarget) completeBody.target = uploadTarget;

  const compRes = await fetch(base + "/api/recorder/guide-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(completeBody),
  });
  const comp = await compRes.json().catch(() => ({}));
  if (!compRes.ok || !comp.tutorialId) {
    throw new Error(comp.error || "Anleitung konnte nicht erstellt werden (" + compRes.status + ")");
  }

  // Erfolg.
  els.guideProgress.textContent = "";
  els.guideUploadDone.hidden = false;
  notifyAppTabs();
  const orgHint = hs.accountName ? " (" + hs.accountName + ")" : "";
  if (comp.fallback) {
    // Ziel war nicht nutzbar -> der Server hat ein NEUES Tutorial angelegt (Aufnahme nie verloren).
    const why = comp.fallbackReason ? " " + comp.fallbackReason : "";
    setStatus(
      "An der Zielstelle nicht moeglich - als neues Tutorial gespeichert" + orgHint + "." + why,
      "error"
    );
  } else if (uploadTarget) {
    setStatus("Aufnahme an der Zielstelle eingefuegt" + orgHint + " - als Entwurf in Steply.", "ok");
  } else {
    setStatus("Anleitung erstellt" + orgHint + " - als Entwurf in Steply.", "ok");
  }
  // „In Steply oeffnen" fuehrt zum ZIEL-Tutorial (bei Einfuegen) bzw. zum neuen (Fallback/Standard).
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
  // Kleine FIFO-Queue statt Einzel-Slot: schnelle Folgen (Eingabe + Klick) gehen NICHT
  // verloren. windowId des Klick-Tabs merken: Screenshot gezielt aus DIESEM Fenster
  // (robuster als das beim Panel-Start ermittelte Fenster, z. B. bei mehreren Fenstern).
  guideQueue.push({ step: msg.step, tabId: sender.tab.id, windowId: sender.tab.windowId });
  // Ueberlauf: aeltesten wartenden Schritt verwerfen (+ dezenter Hinweis).
  if (guideQueue.length > GUIDE_QUEUE_CAP) {
    guideQueue.shift();
    setStatus("Zu viele Klicks in Folge - ein Schritt wurde uebersprungen.", "error");
  } else if (guideCapturing) {
    guideBusyHint();
  }
  drainGuideQueue();
});

// Live-Pairing (Welle 25): Wird das Panel gepairt, WAEHREND es offen ist (Seite ->
// content.js -> background.js -> chrome.storage.local.set), aktualisiert sich die Anzeige
// SOFORT - ohne Neuoeffnen. Wir reagieren NUR auf steplyToken/steplyAppUrl (nicht auf den
// rec-Zustand) und stoeren eine laufende Aufnahme NICHT (nur Connect/Start werden gewechselt).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.steplyToken && !changes.steplyAppUrl) return;
  const recording =
    (mediaRecorder && mediaRecorder.state !== "inactive") || guideActive;
  loadConfig().then(() => {
    accountName = ""; // neu ermitteln (Token koennte auf ein anderes Konto zeigen)
    fetchAccountName();
    if (recording) return; // laufende Aufnahme nie unterbrechen
    // Nur wenn wir gerade auf Connect oder Start stehen, die Auswahl (neu) zeigen.
    if (!els.connect.hidden || !els.start.hidden) showStart();
  });
});

// Aufnahme-Anker (Welle 27): Wird das Panel WAEHREND es offen ist aus einem Einfuegepunkt
// angestossen (Builder -> content.js -> background.js -> pendingTarget), aktualisiert sich
// das Banner SOFORT. (background.js oeffnet die Seitenleiste zwar synchron, aber ein bereits
// offenes Panel bekommt kein „open" -> darum hier auf die storage-Aenderung reagieren.)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.pendingTarget) return;
  loadPendingTarget();
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
  guideQueue = [];
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
if (els.targetClear) els.targetClear.addEventListener("click", discardTarget);

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
  // Aufnahme-Anker (Welle 27): Ziel laden (abgelaufene >30 min werden verworfen) + Banner.
  await loadPendingTarget();
  if (hasToken) {
    showStart();
  } else {
    showConnect();
  }
  // Nebenlaeufig, nicht blockierend: Kontoname anzeigen + auf neue Version pruefen.
  fetchAccountName();
  checkForUpdate();
})();

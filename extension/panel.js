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
  // Titel + Kategorie (Welle 31d)
  guideMeta: document.getElementById("guideMeta"),
  guideTitle: document.getElementById("guideTitle"),
  guideCatWrap: document.getElementById("guideCatWrap"),
  guideCategory: document.getElementById("guideCategory"),
  guideCategoryNew: document.getElementById("guideCategoryNew"),
  // guideDone (e)
  guideDone: document.getElementById("guideDone"),
  guideProgress: document.getElementById("guideProgress"),
  guideUploadDone: document.getElementById("guideUploadDone"),
  guideOpenApp: document.getElementById("guideOpenApp"),
  guideAgain: document.getElementById("guideAgain"),
  // Live-Führung (Welle 31): Einstieg + Führen-Liste + Führungs-Ansicht.
  cardGuideRun: document.getElementById("cardGuideRun"),
  fuehren: document.getElementById("fuehren"),
  fuehrenBack: document.getElementById("fuehrenBack"),
  fuehrenHint: document.getElementById("fuehrenHint"),
  fuehrenList: document.getElementById("fuehrenList"),
  // Filter-Chips (Welle 32, Punkt C)
  fuehrenFilters: document.getElementById("fuehrenFilters"),
  chipSite: document.getElementById("chipSite"),
  chipAll: document.getElementById("chipAll"),
  chipLive: document.getElementById("chipLive"),
  chipDrafts: document.getElementById("chipDrafts"),
  guideRun: document.getElementById("guideRun"),
  runExit: document.getElementById("runExit"),
  runProgress: document.getElementById("runProgress"),
  runBar: document.getElementById("runBar"),
  runImageWrap: document.getElementById("runImageWrap"),
  runImageFrame: document.getElementById("runImageFrame"),
  runImage: document.getElementById("runImage"),
  runFallbackHint: document.getElementById("runFallbackHint"),
  runSkipNote: document.getElementById("runSkipNote"),
  runTitle: document.getElementById("runTitle"),
  runBody: document.getElementById("runBody"),
  runDecision: document.getElementById("runDecision"),
  runNav: document.getElementById("runNav"),
  runBack: document.getElementById("runBack"),
  runNext: document.getElementById("runNext"),
  runDone: document.getElementById("runDone"),
  runDoneList: document.getElementById("runDoneList"),
  // „Steply lernen" (Welle 35): Karte im Start-Screen + eigene Doku-Touren-Ansicht.
  cardSteplyLearn: document.getElementById("cardSteplyLearn"),
  steplyLearn: document.getElementById("steplyLearn"),
  steplyLearnBack: document.getElementById("steplyLearnBack"),
  steplyLearnHint: document.getElementById("steplyLearnHint"),
  steplyLearnList: document.getElementById("steplyLearnList"),
  // Automationen (Welle 36b): Start-Karte + Liste + Vorbereitung + Lauf-Ansicht.
  cardAutomations: document.getElementById("cardAutomations"),
  automations: document.getElementById("automations"),
  autoListBack: document.getElementById("autoListBack"),
  autoListHint: document.getElementById("autoListHint"),
  autoList: document.getElementById("autoList"),
  autoPrep: document.getElementById("autoPrep"),
  autoPrepBack: document.getElementById("autoPrepBack"),
  autoPrepTitle: document.getElementById("autoPrepTitle"),
  autoDomainHint: document.getElementById("autoDomainHint"),
  autoParamForm: document.getElementById("autoParamForm"),
  autoClearValues: document.getElementById("autoClearValues"),
  autoModeSemi: document.getElementById("autoModeSemi"),
  autoModeAuto: document.getElementById("autoModeAuto"),
  autoStart: document.getElementById("autoStart"),
  autoPrepHint: document.getElementById("autoPrepHint"),
  autoRun: document.getElementById("autoRun"),
  autoExit: document.getElementById("autoExit"),
  autoProgress: document.getElementById("autoProgress"),
  autoBar: document.getElementById("autoBar"),
  autoStepTitle: document.getElementById("autoStepTitle"),
  autoStepAction: document.getElementById("autoStepAction"),
  autoLiveStatus: document.getElementById("autoLiveStatus"),
  autoWaitLogin: document.getElementById("autoWaitLogin"),
  autoSkipNote: document.getElementById("autoSkipNote"),
  autoCondSkipNote: document.getElementById("autoCondSkipNote"),
  autoMissBox: document.getElementById("autoMissBox"),
  autoMissText: document.getElementById("autoMissText"),
  autoMissImageWrap: document.getElementById("autoMissImageWrap"),
  autoMissImageFrame: document.getElementById("autoMissImageFrame"),
  autoMissImage: document.getElementById("autoMissImage"),
  autoDownloadNote: document.getElementById("autoDownloadNote"),
  autoFileChip: document.getElementById("autoFileChip"),
  autoCtlSemi: document.getElementById("autoCtlSemi"),
  autoCtlAuto: document.getElementById("autoCtlAuto"),
  autoCtlPaused: document.getElementById("autoCtlPaused"),
  autoCtlMiss: document.getElementById("autoCtlMiss"),
  autoExec: document.getElementById("autoExec"),
  autoSkip: document.getElementById("autoSkip"),
  autoPause: document.getElementById("autoPause"),
  autoResume: document.getElementById("autoResume"),
  autoContinue: document.getElementById("autoContinue"),
  autoCancel: document.getElementById("autoCancel"),
  autoDone: document.getElementById("autoDone"),
  autoDoneTitle: document.getElementById("autoDoneTitle"),
  autoDoneText: document.getElementById("autoDoneText"),
  autoDoneList: document.getElementById("autoDoneList"),
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

// Fallback ohne Pairing (u. a. „Steply lernen" direkt nach der Installation).
// app.steply.de ist noch NICHT mit der App verdrahtet (antwortet 403) — bis die
// Domain steht, zeigt der Fallback auf die echte Prod-URL. Beim Domain-Umzug
// HIER + in background.js (BADGE_DEFAULT_APP_URL) umstellen.
const DEFAULT_APP_URL = "https://tutax-ivory.vercel.app";

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

// Ziel-Banner (Welle 32, Punkt D1): erscheint NUR noch im Aufnahme-Anker-Modus
// (pendingTarget aktiv) als „Aufnahme für: <Ziel-Label>" + „Ziel verwerfen". Im DEFAULT-Fall
// (neues Tutorial) bleibt das Banner AUS — der frühere neutrale Hinweis „… als neues
// Tutorial angelegt" ist bewusst entfernt (Richards Wunsch, zu viel Rauschen).
function renderTargetBanner() {
  if (!els.targetBanner) return;
  // Defensiv (Welle 33, Fix 4): Banner NUR bei echtem Ziel (pendingTarget && .target). Die
  // Entscheidung liegt in der puren, testbaren target-banner.js; fehlt das Modul, greift die
  // Inline-Logik als Fallback.
  const state =
    (typeof SteplyTargetBanner !== "undefined" && SteplyTargetBanner.targetBannerState(pendingTarget)) || {
      show: !!(pendingTarget && pendingTarget.target),
      label: "die gewählte Stelle im Tutorial",
      broken: !!(pendingTarget && !pendingTarget.target),
    };
  if (state.show) {
    if (els.targetPrefix) els.targetPrefix.textContent = "Aufnahme für: ";
    els.targetLabel.textContent = state.label;
    els.targetBanner.classList.remove("target-banner-neutral");
    if (els.targetClear) els.targetClear.hidden = false;
    els.targetBanner.hidden = false;
  } else {
    // Kaputtes pendingTarget (Objekt ohne target, Altbestand) aktiv wegräumen (Selbstheilung).
    if (state.broken) {
      pendingTarget = null;
      try {
        const r = chrome.storage.local.remove("pendingTarget");
        if (r && r.catch) r.catch(() => {});
      } catch (err) {
        /* egal */
      }
    }
    els.targetBanner.hidden = true;
  }
}

// Ziel vergessen: aus dem Storage raeumen + Banner weg. (Verwerfen-Knopf & nach Abschluss.)
// Härtung (Welle 33, Fix 4): jeder Schritt in try/catch; das Banner wird als LETZTE Zeile
// notfalls hart versteckt — egal, was Storage/Render vorher werfen.
async function clearPendingTarget() {
  pendingTarget = null;
  try {
    await chrome.storage.local.remove("pendingTarget");
  } catch (err) {
    /* egal */
  }
  try {
    renderTargetBanner();
  } catch (err) {
    /* egal */
  }
  if (els.targetBanner) els.targetBanner.hidden = true;
}

// „Ziel verwerfen"-Knopf: Ziel raeumen; die naechste Aufnahme laeuft normal (neues Tutorial).
async function discardTarget() {
  try {
    await clearPendingTarget();
    setStatus("Ziel verworfen - die Aufnahme wird als neues Tutorial gespeichert.", "");
  } catch (err) {
    // Selbst bei einem Fehler muss der Knopf sichtbar wirken: Banner hart verstecken.
    if (els.targetBanner) els.targetBanner.hidden = true;
  }
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
  // Live-Führung (Welle 31): eigene Bereiche.
  els.fuehren.hidden = section !== "fuehren";
  els.guideRun.hidden = section !== "guideRun";
  // „Steply lernen" (Welle 35): eigene Doku-Touren-Ansicht.
  if (els.steplyLearn) els.steplyLearn.hidden = section !== "steplyLearn";
  // Automationen (Welle 36b): Liste / Vorbereitung / Lauf.
  if (els.automations) els.automations.hidden = section !== "automations";
  if (els.autoPrep) els.autoPrep.hidden = section !== "autoPrep";
  if (els.autoRun) els.autoRun.hidden = section !== "autoRun";
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
  // Live-Führung (Welle 31): braucht ebenfalls eine Verbindung (Tutorial-Liste laden).
  els.cardGuideRun.disabled = !hasToken;
  els.cardGuideRun.title = hasToken ? "" : "Zuerst mit Steply verbinden.";
  // Automationen (Welle 36b): NUR bei gepairtem Token sichtbar (Automationen sind Kontodaten).
  if (els.cardAutomations) els.cardAutomations.hidden = !hasToken;
  updateConnInfo();
  setStatus("");
  show("start");
  updateInterruptedHint();
  // Kontoname (nach-)laden, falls verbunden aber noch nicht ermittelt.
  if (hasToken && !accountName) fetchAccountName();
  // Kategorien (Welle 31d) schon jetzt warm laden (kurz gecacht), damit die Auswahl beim
  // Aufnahme-Start ohne Wartezeit steht. Fail-silent, nicht blockierend.
  if (hasToken) loadRecCategories();
  // „Fuer diese Seite" (Welle 31c) auffrischen (nutzt gecachte Liste; matcht lokal).
  refreshSiteMatch();
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
let guideSteps = []; // { rect, label, action, url, title, selector, sensitive, fileMeta, ts, blob, width, height, thumbUrl }
let guideQueue = []; // FIFO: [{ step, tabId, windowId }] - wartende Schritte (Kappe GUIDE_QUEUE_CAP)
let guideCapturing = false;
let guideLastCaptureAt = 0;
let guideFinishing = false;

// ── Datei-Brücke (Welle 39): Download-Erkennung während der Aufnahme ────────────────────────
// Beginnt binnen ~3s nach einem erfassten Klick ein Download, ordnen wir dem Klick-Schritt
// file_meta {role:'download', …} zu. Es reisen NUR Metadaten (Name/MIME/Größe) — die kurzlebige
// Download-URL wird NICHT persistiert (Session-Tokens). Der Fold für Uploads (den davor
// erfassten „Datei auswählen"-Klick in den Upload-Schritt falten) läuft ebenfalls hier.
const GUIDE_DL_MATCH_MS = 3000; // Download binnen ~3s nach dem Klick → diesem Schritt zuordnen
const GUIDE_DL_TOLERANCE = 800; // kleine Uhr-Toleranz (Download minimal „vor" dem Klick-ts)
const GUIDE_FOLD_MS = 10000; // Klick + Upload-change binnen ~10s → EIN Schritt
let guidePendingDownloads = []; // [{ at, filename, mime, size, consumed }]
let guideDownloadHandler = null;

function guideAddDownloadWatch() {
  if (!chrome.downloads || !chrome.downloads.onCreated) return;
  guidePendingDownloads = [];
  guideDownloadHandler = (item) => {
    if (!guideActive) return;
    const now = Date.now();
    // Alte, nie zugeordnete Einträge verwerfen (kein Stau).
    guidePendingDownloads = guidePendingDownloads.filter((d) => now - d.at < 8000);
    guidePendingDownloads.push({
      at: now,
      filename: execDownloadName(item),
      mime: item && item.mime ? String(item.mime).slice(0, 120) : "",
      size:
        item && typeof item.fileSize === "number" && item.fileSize > 0
          ? item.fileSize
          : item && typeof item.totalBytes === "number" && item.totalBytes > 0
            ? item.totalBytes
            : 0,
      consumed: false,
    });
    guideMatchDownloads();
  };
  try {
    chrome.downloads.onCreated.addListener(guideDownloadHandler);
  } catch (e) {
    guideDownloadHandler = null;
  }
}

function guideRemoveDownloadWatch() {
  if (guideDownloadHandler && chrome.downloads && chrome.downloads.onCreated) {
    try {
      chrome.downloads.onCreated.removeListener(guideDownloadHandler);
    } catch (e) {
      /* egal */
    }
  }
  guideDownloadHandler = null;
  guidePendingDownloads = [];
}

// Wartende Downloads dem jüngsten passenden Klick-Schritt (ohne file_meta) zuordnen.
function guideMatchDownloads() {
  if (!guidePendingDownloads.length) return;
  let changed = false;
  for (const dl of guidePendingDownloads) {
    if (dl.consumed) continue;
    for (let i = guideSteps.length - 1; i >= 0; i--) {
      const s = guideSteps[i];
      if (s.fileMeta || s.action !== "click") continue;
      const gap = dl.at - (s.ts || 0);
      if (gap >= -GUIDE_DL_TOLERANCE && gap <= GUIDE_DL_MATCH_MS) {
        s.fileMeta = { role: "download", filename: dl.filename, mime: dl.mime, size: dl.size };
        dl.consumed = true;
        changed = true;
        break;
      }
    }
  }
  if (changed) renderGuideSteps();
}

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
  // Titel + Kategorie (Welle 31d): Block vorbereiten (nicht blockierend — die Kategorie-
  // Liste lädt asynchron; Aufnahme startet sofort). Bei Aufnahme-Anker bleibt er aus.
  guideMetaPrepare();
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
  // Datei-Brücke (Welle 39): Downloads während der Aufnahme beobachten (Metadaten-Zuordnung).
  guideAddDownloadWatch();
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
    // file_meta (Welle 39, Datei-Brücke): {role:'download'|'upload', …} — NUR Metadaten.
    // Download wird per guideMatchDownloads nachträglich gesetzt; Upload kommt hier mit.
    fileMeta: src.fileMeta && typeof src.fileMeta === "object" ? src.fileMeta : null,
    ts: src.ts || Date.now(),
    blob: img.blob,
    width: img.width,
    height: img.height,
    thumbUrl: null,
  };

  // Dedupe/Fold (Welle 39): Ein Upload-Schritt faltet den davor erfassten „Datei auswählen"-
  // Klick in sich hinein (binnen ~10s), sonst entstünde beim Lauf ein sinnloser Klick, der nur
  // den OS-Dialog öffnet. Den jüngsten Klick-Schritt OHNE file_meta entfernen.
  if (step.fileMeta && step.fileMeta.role === "upload" && src.foldPrevClick) {
    for (let i = guideSteps.length - 1; i >= 0; i--) {
      const prev = guideSteps[i];
      if (prev.fileMeta || prev.action !== "click") continue;
      if ((step.ts || 0) - (prev.ts || 0) > GUIDE_FOLD_MS) break; // zu alt → nicht falten
      if (prev.thumbUrl) {
        try {
          URL.revokeObjectURL(prev.thumbUrl);
        } catch (err) {
          /* egal */
        }
      }
      guideSteps.splice(i, 1);
      break;
    }
  }

  try {
    step.thumbUrl = URL.createObjectURL(step.blob);
  } catch (err) {
    step.thumbUrl = null;
  }
  guideSteps.push(step);
  // Datei-Brücke: kam ein Download VOR dem Screenshot dieses Klicks, jetzt zuordnen.
  if (step.action === "click" && !step.fileMeta) guideMatchDownloads();
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

    // Bedingte Schritte (Welle 42): „nur wenn dieses Element da ist" — dezenter Toggle je Schritt.
    // Aktiviert → dem Schritt eine Element-Bedingung mit SEINEM eigenen Selektor geben. Der Mensch
    // in der Führung ignoriert die Bedingung; NUR die Automation wertet sie aus (überspringt den
    // Schritt, wenn das Element fehlt — z. B. ein Cookie-Banner-Knopf). Nur sinnvoll mit Selektor.
    if (s.selector && typeof s.selector === "object") {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "guide-opt" + (s.condition ? " on" : "");
      opt.textContent = "?";
      opt.setAttribute("aria-pressed", s.condition ? "true" : "false");
      opt.title = s.condition
        ? "Optional: läuft in Automationen nur, wenn dieses Element da ist. Zum Ausschalten klicken."
        : "Als optional markieren: in Automationen nur ausführen, wenn dieses Element vorhanden ist.";
      opt.addEventListener("click", () => {
        s.condition = s.condition ? null : { kind: "element", selector: s.selector };
        renderGuideSteps();
      });
      row.appendChild(opt);
    }

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
  guideRemoveDownloadWatch();
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
    guideAddDownloadWatch();
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
    // file_meta (Welle 39): Datei-Brücke — NUR Metadaten (Rolle/Name/MIME/Größe), nie Bytes.
    if (s.fileMeta && typeof s.fileMeta === "object") step.file_meta = s.fileMeta;
    // condition (Welle 42): „nur ausführen, wenn Element vorhanden" — additiv, alte Server
    // ignorieren es. Der Server (guide.ts) validiert tolerant und persistiert steps.condition.
    if (s.condition && typeof s.condition === "object") step.condition = s.condition;
    return step;
  });
  // Aufnahme-Anker (Welle 27): Ziel nur mitschicken, wenn die Herkunft zur App-URL passt.
  const uploadTarget = targetForUpload();
  const completeBody = { token: cfg.token, steps };
  if (uploadTarget) completeBody.target = uploadTarget;
  // Titel + Kategorie (Welle 31d): NUR im Neu-Tutorial-Modus. guideTitleValue/
  // guideCategoryPayload liefern nur etwas, wenn der Meta-Block sichtbar ist (kein
  // Aufnahme-Anker) — beim Einfügen ins Ziel-Tutorial werden beide bewusst weggelassen.
  const metaTitle = guideTitleValue();
  if (metaTitle) completeBody.title = metaTitle;
  const metaCategory = guideCategoryPayload();
  if (metaCategory) completeBody.category = metaCategory;

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
  // Titel + Kategorie (Welle 31d): nach erfolgreichem Upload Felder + Session zurücksetzen,
  // damit die nächste Aufnahme frisch startet. (Bei Fehler bleiben die Werte erhalten.)
  guideMetaReset();
  guideMetaClear();
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
// TITEL + KATEGORIE (Welle 31d): beim Aufnehmen einer NEUEN Sofort-Anleitung schon im
// Panel einen Titel eingeben + eine Kategorie wählen (bestehende ODER neue anlegen). NUR
// im Neu-Aufnahme-Modus — bei aktivem Aufnahme-Anker (pendingTarget) blendet der Block
// aus (das Ziel-Tutorial hat Titel + Kategorie bereits). Werte leben in
// chrome.storage.session (überleben einen Panel-Reload während der Aufnahme) und reisen
// beim Fertigstellen mit an guide-complete. Nach erfolgreichem Upload: zurücksetzen.
// ============================================================================

const NEW_CATEGORY_VALUE = "__new__"; // Sentinel der Option „＋ Neue Kategorie …"

let recCategories = null; // gecachte Liste [{id,name}] oder null (nicht verfügbar)
let recCategoriesFetchedAt = 0; // Zeitpunkt des letzten Fetch-VERSUCHS
let recCategoriesOk = false; // war der letzte Fetch erfolgreich?
const REC_CATEGORIES_TTL = 5 * 60 * 1000; // Liste ~5 min im Speicher cachen

// Kategorien des verbundenen Kontos holen (Bearer-Token), ~5 min gecacht. Bei Fehler/
// Offline: null -> die Auswahl bleibt still ausgeblendet, das Titel-Feld bleibt.
async function loadRecCategories() {
  if (!cfg.token) return null;
  if (Date.now() - recCategoriesFetchedAt < REC_CATEGORIES_TTL) {
    return recCategoriesOk ? recCategories : null; // Cache (auch „unverfügbar" wird gecacht)
  }
  recCategoriesFetchedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(appBase() + "/api/recorder/categories", {
      method: "GET",
      headers: { Authorization: "Bearer " + cfg.token },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      recCategoriesOk = false;
      recCategories = null;
      return null;
    }
    const body = await res.json().catch(() => ({}));
    recCategories = Array.isArray(body.categories) ? body.categories : [];
    recCategoriesOk = true;
    return recCategories;
  } catch (err) {
    recCategoriesOk = false;
    recCategories = null;
    return null;
  }
}

// Aktuelle Feldwerte in chrome.storage.session spiegeln (fail-silent).
async function guideMetaSave() {
  try {
    await chrome.storage.session.set({
      guideMeta: {
        title: els.guideTitle ? els.guideTitle.value || "" : "",
        cat: els.guideCategory ? els.guideCategory.value || "" : "",
        catNew: els.guideCategoryNew ? els.guideCategoryNew.value || "" : "",
      },
    });
  } catch (err) {
    /* Session-Storage optional */
  }
}

async function guideMetaLoad() {
  try {
    const r = await chrome.storage.session.get("guideMeta");
    return r && r.guideMeta ? r.guideMeta : null;
  } catch (err) {
    return null;
  }
}

async function guideMetaClear() {
  try {
    await chrome.storage.session.remove("guideMeta");
  } catch (err) {
    /* egal */
  }
}

// Felder leeren (nach erfolgreichem Upload / für die nächste Aufnahme).
function guideMetaReset() {
  if (els.guideTitle) els.guideTitle.value = "";
  if (els.guideCategory) els.guideCategory.value = "";
  if (els.guideCategoryNew) {
    els.guideCategoryNew.value = "";
    els.guideCategoryNew.hidden = true;
  }
}

// Kategorie-Dropdown aufbauen: „Keine Kategorie" + Konto-Kategorien + „＋ Neue Kategorie …".
// Bei fehlender/kaputter Liste (Offline/Fehler): Auswahl still ausblenden.
function buildCategoryOptions(cats, selectedValue) {
  const wrap = els.guideCatWrap;
  const sel = els.guideCategory;
  if (!wrap || !sel) return;
  if (!Array.isArray(cats)) {
    wrap.hidden = true;
    if (els.guideCategoryNew) els.guideCategoryNew.hidden = true;
    return;
  }
  sel.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "Keine Kategorie";
  sel.appendChild(none);
  for (const c of cats) {
    if (!c || typeof c.id !== "string") continue;
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.name || "Ohne Namen";
    sel.appendChild(o);
  }
  const neu = document.createElement("option");
  neu.value = NEW_CATEGORY_VALUE;
  neu.textContent = "＋ Neue Kategorie …";
  sel.appendChild(neu);

  // Auswahl wiederherstellen (nur, wenn die Option noch existiert).
  if (selectedValue && Array.prototype.some.call(sel.options, (o) => o.value === selectedValue)) {
    sel.value = selectedValue;
  } else {
    sel.value = "";
  }
  if (els.guideCategoryNew) els.guideCategoryNew.hidden = sel.value !== NEW_CATEGORY_VALUE;
  wrap.hidden = false;
}

// Beim Start einer Sofort-Aufnahme: Block vorbereiten (ein-/ausblenden, Werte + Kategorien).
async function guideMetaPrepare() {
  if (!els.guideMeta) return;
  // Aufnahme-Anker aktiv -> ganzer Block aus (Titel/Kategorie gehören dem Ziel-Tutorial).
  if (pendingTarget && pendingTarget.target) {
    els.guideMeta.hidden = true;
    return;
  }
  els.guideMeta.hidden = false;

  // Gespeicherte Werte (überleben einen Panel-Reload während der Aufnahme).
  const saved = await guideMetaLoad();
  if (els.guideTitle) {
    els.guideTitle.value = saved && typeof saved.title === "string" ? saved.title : "";
  }
  if (els.guideCategoryNew) {
    els.guideCategoryNew.value = saved && typeof saved.catNew === "string" ? saved.catNew : "";
  }

  // Kategorien lazy laden (kurz gecacht); bei Fehler bleibt nur das Titel-Feld.
  const cats = await loadRecCategories();
  buildCategoryOptions(cats, saved && typeof saved.cat === "string" ? saved.cat : "");
}

// Auswahl geändert: „＋ Neue Kategorie …" blendet das Namensfeld ein.
function onGuideCategoryChange() {
  const isNew = els.guideCategory && els.guideCategory.value === NEW_CATEGORY_VALUE;
  if (els.guideCategoryNew) {
    els.guideCategoryNew.hidden = !isNew;
    if (isNew) {
      try {
        els.guideCategoryNew.focus();
      } catch (err) {
        /* egal */
      }
    }
  }
  guideMetaSave();
}

// Titel für den complete-Request (leer -> nicht mitschicken, Server vergibt Default-Titel).
function guideTitleValue() {
  if (!els.guideMeta || els.guideMeta.hidden || !els.guideTitle) return "";
  return (els.guideTitle.value || "").trim();
}

// Kategorie-Nutzlast für den complete-Request: { id } | { name } | null.
function guideCategoryPayload() {
  if (!els.guideMeta || els.guideMeta.hidden) return null;
  if (!els.guideCatWrap || els.guideCatWrap.hidden || !els.guideCategory) return null;
  const v = els.guideCategory.value;
  if (!v) return null; // „Keine Kategorie"
  if (v === NEW_CATEGORY_VALUE) {
    const name = els.guideCategoryNew ? (els.guideCategoryNew.value || "").trim() : "";
    return name ? { name } : null;
  }
  return { id: v };
}

// ============================================================================
// „FUER DIESE SEITE" (Welle 31c) — passende Tutorials zur gerade offenen Seite.
//
// DATENSCHUTZ (PFLICHT): Die besuchte URL verlaesst NIEMALS den Browser. Wir holen die
// Tutorial-Liste (inkl. site_domains) EINMAL vom Server und cachen sie ~5 min im Speicher;
// das Abgleichen der aktuellen Tab-URL passiert danach REIN LOKAL (site-match.js). Es geht
// KEIN Request pro Seitenwechsel raus — die Tab-Listener unten matchen nur gegen die
// gecachte Liste. So sieht Steply nie, welche Seiten der Nutzer besucht.
//
// Die Tutorial-Route (GET /api/recorder/tutorials) baut PARALLEL Welle 31a. Fehlt sie noch
// (404) oder scheitert der Fetch, bleibt die Sektion einfach still ausgeblendet.
// ============================================================================

let siteTutorials = null; // gecachte Tutorial-Liste (oder null = nicht verfuegbar)
let siteMatchFetchedAt = 0; // Zeitpunkt des letzten Fetch-VERSUCHS
let siteMatchOk = false; // war der letzte Fetch erfolgreich?
const SITE_MATCH_TTL = 5 * 60 * 1000; // Liste ~5 min im Speicher cachen

// Tutorial-Liste holen (Bearer-Token), ~5 min gecacht. Bei 404/Fehler: null (Sektion aus).
async function loadSiteTutorials() {
  if (!cfg.token) return null;
  if (Date.now() - siteMatchFetchedAt < SITE_MATCH_TTL) {
    return siteMatchOk ? siteTutorials : null; // Cache (auch „unverfuegbar" wird gecacht)
  }
  siteMatchFetchedAt = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(appBase() + "/api/recorder/tutorials", {
      method: "GET",
      headers: { Authorization: "Bearer " + cfg.token },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      siteMatchOk = false;
      siteTutorials = null;
      return null;
    }
    const body = await res.json().catch(() => ({}));
    siteTutorials = Array.isArray(body.tutorials) ? body.tutorials : [];
    siteMatchOk = true;
    // Icon-Badge (Welle 32, Punkt E): Liste für den Service-Worker in chrome.storage.local
    // mit auffrischen (TTL lebt im background.js). DATENSCHUTZ: NUR die Tutorial-Liste (inkl.
    // site_domains) wird gecacht — die besuchte URL wird NIE gespeichert/gesendet; das
    // Matching gegen die Live-URL läuft rein lokal im Service-Worker.
    try {
      chrome.storage.local.set({ badgeCache: { tutorials: siteTutorials, at: Date.now() } });
    } catch (err) {
      /* Badge ist reiner Komfort */
    }
    return siteTutorials;
  } catch (err) {
    siteMatchOk = false;
    siteTutorials = null;
    return null;
  }
}

// ============================================================================
// „STEPLY LERNEN" (Welle 35): die ÖFFENTLICHEN Steply-Doku-Touren erscheinen für JEDEN
// Kunden — auch OHNE Verbindung (Onboarding). Sie kommen von GET /api/guide/steply (kein
// Token!). App-URL = appBase() (gespeicherte steplyAppUrl bzw. DEFAULT_APP_URL als Fallback
// — dieselbe Default-Prod-URL, die das Panel schon für Update-Check/Pairing nutzt).
// ~15 min Cache: in-memory + chrome.storage.local (mit dem Icon-Badge im Service-Worker
// geteilt). Jeder Eintrag wird auf { ..., status:"published", source:"steply" } normalisiert,
// damit site-match/Badge (published-Filter) und der Führungs-Flow (Quelle) ihn erkennen.
// ============================================================================
const STEPLY_DOC_TTL = 15 * 60 * 1000; // 15 min
let steplyDocs = null; // normalisierte Liste oder null (nicht verfügbar)
let steplyDocsFetchedAt = 0; // Zeitpunkt des letzten Fetch-VERSUCHS

// Rohliste -> normalisiert (published + Quelle „steply"); nur brauchbare Einträge.
function normalizeDocs(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && t.id && t.slug)
    .map((t) => ({ ...t, status: "published", source: "steply" }));
}

// Doku-Liste holen (kein Token), ~15 min gecacht. Bei Fehler/Offline: zuletzt gecachte Liste
// (in-memory oder chrome.storage.local); erst danach null. Fail-silent.
async function loadSteplyDocs() {
  const now = Date.now();
  if (steplyDocs && now - steplyDocsFetchedAt < STEPLY_DOC_TTL) return steplyDocs;
  steplyDocsFetchedAt = now;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(appBase() + "/api/guide/steply", { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      steplyDocs = normalizeDocs(body.tutorials);
      // Für den Icon-Badge (Service-Worker) mitcachen. DATENSCHUTZ: nur die Liste (inkl.
      // site_domains) — die besuchte URL wird NIE gespeichert/gesendet.
      try {
        chrome.storage.local.set({ steplyDocCache: { tutorials: steplyDocs, at: now } });
      } catch (e) {
        /* Badge ist reiner Komfort */
      }
      return steplyDocs;
    }
  } catch (err) {
    /* offline/Fehler: gecachte Liste unten */
  }
  if (steplyDocs) return steplyDocs;
  try {
    const c = (await chrome.storage.local.get("steplyDocCache")).steplyDocCache;
    if (c && Array.isArray(c.tutorials)) {
      steplyDocs = c.tutorials;
      return steplyDocs;
    }
  } catch (e) {
    /* egal */
  }
  return null;
}

// Zwei Tutorial-Listen per id zusammenführen: `primary` gewinnt bei Duplikaten (so erscheinen
// Doku-Touren NICHT doppelt, wenn der Nutzer mit dem Steply-Konto gepairt ist).
function mergeTutorialsById(primary, secondary) {
  const seen = new Set((primary || []).map((t) => t && t.id).filter(Boolean));
  const out = (primary || []).slice();
  for (const t of secondary || []) if (t && t.id && !seen.has(t.id)) out.push(t);
  return out;
}

// Doku-Karten rendern (Reihenfolge des Servers = Hub-Reihenfolge beibehalten; Überschrift je
// Kategorie-Wechsel). Klick startet eine Doku-Tour (Quelle „steply", per slug).
function renderDocCards(container, list) {
  let lastKey = null;
  for (const t of list) {
    const cat = t.category && typeof t.category === "object" ? t.category : null;
    const key = cat && cat.id ? cat.id : "__none__";
    if (key !== lastKey) {
      lastKey = key;
      const h = document.createElement("p");
      h.className = "fuehren-group";
      h.textContent = cat && cat.name ? cat.name : "Weitere";
      container.appendChild(h);
    }
    container.appendChild(buildTutorialCard(t, (tut) => guideStart(tut.slug, "steply")));
  }
}

// Eigene Ansicht „Steply lernen" (vom Start-Screen; auch UNVERBUNDEN erreichbar).
async function showSteplyLearn() {
  show("steplyLearn");
  setStatus("");
  els.steplyLearnHint.hidden = true;
  els.steplyLearnList.textContent = "";
  const loading = document.createElement("p");
  loading.className = "note";
  loading.textContent = "Touren werden geladen …";
  els.steplyLearnList.appendChild(loading);
  const list = await loadSteplyDocs();
  els.steplyLearnList.textContent = "";
  if (!list || !list.length) {
    els.steplyLearnHint.textContent = "Die Steply-Touren konnten gerade nicht geladen werden.";
    els.steplyLearnHint.hidden = false;
    return;
  }
  renderDocCards(els.steplyLearnList, list);
}

// URL des aktiven Tabs im Panel-Fenster (nur LOKAL genutzt, nie gesendet).
async function currentActiveUrl() {
  try {
    const q =
      panelWindowId == null
        ? { active: true, currentWindow: true }
        : { active: true, windowId: panelWindowId };
    const tabs = await chrome.tabs.query(q);
    const tab = tabs && tabs[0];
    return tab && typeof tab.url === "string" ? tab.url : "";
  } catch (err) {
    return "";
  }
}

// Ein Treffer öffnen: Doku-Tour (Quelle „steply", per slug) ODER Konto-Tour (per id) — beide
// über den Führungs-Flow (guideStart). Konto-Fallback: Vorschau-Link (funktioniert für Entwurf
// UND veröffentlicht, eingeloggter Autor). Doku-Touren haben keine App-Vorschau ohne Login.
function openMatched(t) {
  if (!t || !t.id) return;
  try {
    if (t.source === "steply") guideStart(t.slug, "steply");
    else guideStart(t.id, "account");
    return;
  } catch (err) {
    /* Fallback nur für Konto-Touren */
  }
  if (t.source !== "steply") chrome.tabs.create({ url: appBase() + "/app/preview/" + t.id, active: true });
}

// ── Gemeinsames Karten-Layout (Welle 32, Punkt D2) ──────────────────────────────────────
// EINE Karte für „Für diese Seite" UND die „Führen"-Liste: zweizeiliger Titel (line-clamp 2),
// Meta-Zeile (Kategorie-Chip + Schrittzahl) und ein kleiner Status-Punkt rechts (Teal =
// veröffentlicht, Amber = Entwurf). So sieht man auf einen Blick, WAS man anklickt.
function buildTutorialCard(t, onClick) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "tut-card";

  const main = document.createElement("span");
  main.className = "tut-card-main";

  const title = document.createElement("span");
  title.className = "tut-card-title";
  title.textContent = t.title || "Ohne Titel";
  main.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "tut-card-meta";
  const cat = t.category && typeof t.category === "object" ? t.category : null;
  if (cat && cat.name) {
    const catChip = document.createElement("span");
    catChip.className = "tut-cat-chip";
    catChip.textContent = cat.name;
    meta.appendChild(catChip);
  }
  const steps = document.createElement("span");
  steps.className = "tut-steps";
  const n = Number(t.stepCount) || 0;
  steps.textContent = n === 1 ? "1 Schritt" : n + " Schritte";
  meta.appendChild(steps);
  main.appendChild(meta);
  row.appendChild(main);

  const published = t.status === "published";
  const dot = document.createElement("span");
  dot.className = "tut-status " + (published ? "tut-status-pub" : "tut-status-draft");
  dot.title = published ? "Veröffentlicht" : "Entwurf";
  dot.setAttribute("aria-label", published ? "Veröffentlicht" : "Entwurf");
  row.appendChild(dot);

  row.addEventListener("click", () => onClick(t));
  return row;
}

// Treffer (oder Leer-Zustand) rendern.
function renderSiteMatch(matches) {
  const listEl = document.getElementById("siteMatchList");
  if (!listEl) return;
  listEl.textContent = "";

  if (!matches.length) {
    // Dezenter Leer-Zustand: Sprung zur Aufnehmen-Karte (KEIN Autostart der Aufnahme).
    const empty = document.createElement("button");
    empty.type = "button";
    empty.className = "site-match-empty";
    empty.textContent =
      "Für diese Seite gibt es noch keine Anleitung — jetzt aufnehmen?";
    empty.addEventListener("click", () => {
      try {
        els.cardGuide.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } catch (err) {
        /* egal */
      }
      try {
        els.cardGuide.focus({ preventScroll: true });
      } catch (err) {
        /* egal */
      }
    });
    listEl.appendChild(empty);
    return;
  }

  for (const t of matches) {
    listEl.appendChild(buildTutorialCard(t, (tut) => openMatched(tut)));
  }
}

// Sektion neu bewerten: nur auf dem Start-Screen + verbunden + auf einer normalen Website
// mit verfuegbarer Route. Sonst still ausblenden. Matching REIN LOKAL (site-match.js).
async function refreshSiteMatch() {
  const box = document.getElementById("siteMatch");
  if (!box) return;
  if (typeof SteplySiteMatch === "undefined") {
    box.hidden = true;
    return;
  }
  if (els.start.hidden) {
    box.hidden = true;
    return;
  }
  // Matching-Pool = Konto-Tutorials (NUR mit Token) + Steply-Doku-Touren (immer, auch
  // unverbunden — Onboarding). Dedupe per id (Konto gewinnt, falls Steply-Konto gepairt).
  const account = hasToken ? await loadSiteTutorials() : null;
  const docs = (await loadSteplyDocs()) || [];
  const merged = mergeTutorialsById(account || [], docs);
  if (!merged.length) {
    box.hidden = true; // nichts verfügbar -> kein Kaputt-Zustand
    return;
  }
  const url = await currentActiveUrl();
  // DATENSCHUTZ: `url` bleibt hier lokal — nur der Abgleich gegen die gecachten
  // site_domains passiert im Browser, es geht nichts nach draussen.
  const host = SteplySiteMatch.hostnameOf(url);
  if (!host) {
    box.hidden = true; // keine normale Website (chrome://, about:, PDF-Viewer …)
    return;
  }
  const matches = SteplySiteMatch.matchTutorials(url, merged);
  // Keine Treffer + unverbunden -> Box aus (kein Nag mit deaktiviertem „aufnehmen"). Verbunden:
  // wie bisher den „jetzt aufnehmen?"-Hinweis zeigen (renderSiteMatch behandelt den Leerfall).
  if (!matches.length && !hasToken) {
    box.hidden = true;
    return;
  }
  renderSiteMatch(matches);
  box.hidden = false;
}

// Aktiven Tab beobachten (Tab-Wechsel + URL-Aenderung). KEIN Netz-Request pro Wechsel —
// refreshSiteMatch matcht nur gegen die gecachte Liste (Datenschutz, s. o.).
try {
  chrome.tabs.onActivated.addListener(() => {
    refreshSiteMatch();
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo && changeInfo.url) refreshSiteMatch();
  });
} catch (err) {
  /* tabs-API nicht verfuegbar -> Sektion bleibt still */
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
    siteMatchFetchedAt = 0; // „Fuer diese Seite"-Cache verwerfen (Token wechselte evtl. Konto)
    recCategoriesFetchedAt = 0; // Kategorie-Cache (Welle 31d) verwerfen (Token evtl. anderes Konto)
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
  guideRemoveDownloadWatch();
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
// LIVE-FÜHRUNG (Welle 31): Tutorials aus der Seitenleiste auf der ECHTEN Website führen
// (Tango/WalkMe). KLAR ABGEGRENZTER BLOCK (Welle 31c ergänzt PARALLEL andere Panel-Bereiche
// und ruft window.SteplyGuide.start(id) aus ihrer Sektion „Für diese Seite" auf).
//
// Ablauf: „Führen"-Liste (GET /api/recorder/tutorials) -> Tutorial wählen -> Detail laden
// (GET /api/recorder/tutorials/[id]) -> Schritt für Schritt. Pro NICHT-Entscheidungsschritt
// MIT Selektor: „steply-guide-show" an den gebundenen Tab (Overlay auf der Seite). Ohne
// Selektor / bei found:false: Fallback (Screenshot groß + Hinweis). Entscheidungen: Frage +
// Antwort-Buttons aus den Branch-Labels (KEIN Overlay). Zustand in chrome.storage.session ->
// Panel-Schließen/Öffnen überlebt die Führung. Führung ist an EINEN Tab gebunden.
// ============================================================================

const guide = {
  tutorial: null, // { id, title, slug, status, visibility, root_step_id }
  steps: [], // [{ id, title, body(HTML), imageUrl, imageWidth, imageHeight, highlights, selector, page_url, is_decision, question }]
  branches: [], // [{ id, step_id, label, target_step_id, position }]
  stepById: new Map(),
  branchesByStep: new Map(),
  curId: null,
  history: [], // Pfad-History (Schritt-IDs)
  tabId: null, // gebundener Tab
  source: "account", // „account" (Konto-Tour, per id/Token) | „steply" (öffentliche Doku, per slug)
  // Zustands-Intelligenz (Welle 40): Anmelde-Wache-Flag + Vorspul-Notiz {a,b,login} + Re-Entrance.
  waitingLogin: false,
  skipNote: null,
  navBusy: false,
};

const clamp01 = (n) => (typeof n === "number" && isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

// Rich-Text-HTML sicher rendern: NUR einfache Tags (p/br/b/i/u/ul/ol/li), Rest wird zu
// reinem Text (escaped). DOMParser("text/html") führt keine Skripte aus; wir bauen den Baum
// aus FRISCHEN Elementen ohne Attribute neu -> keine Handler, keine href/style/on*.
function renderSafeHtml(container, html) {
  container.textContent = "";
  const ALLOWED = { P: "p", BR: "br", B: "b", STRONG: "b", I: "i", EM: "i", U: "u", UL: "ul", OL: "ol", LI: "li" };
  let parsed;
  try {
    parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
  } catch (err) {
    container.textContent = String(html || "");
    return;
  }
  const walk = (src, dst) => {
    src.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        dst.appendChild(document.createTextNode(node.nodeValue));
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = ALLOWED[node.tagName];
      if (tag) {
        const el = document.createElement(tag);
        walk(node, el);
        dst.appendChild(el);
      } else {
        // Unbekannter Tag: nur seinen Inhalt übernehmen (der Tag selbst verschwindet).
        walk(node, dst);
      }
    });
  };
  walk(parsed.body, container);
}

// Aktiver Tab des Panel-Fensters (die Führung bindet sich an diesen einen Tab).
async function guideActiveTabId() {
  try {
    const q = panelWindowId == null ? { active: true, currentWindow: true } : { active: true, windowId: panelWindowId };
    const tabs = await chrome.tabs.query(q);
    return tabs && tabs[0] && tabs[0].id != null ? tabs[0].id : null;
  } catch (err) {
    return null;
  }
}

function sendGuideToTab(msg) {
  if (guide.tabId == null) return;
  try {
    const p = chrome.tabs.sendMessage(guide.tabId, msg);
    if (p && p.catch) p.catch(() => {});
  } catch (err) {
    /* Tab evtl. ohne Content-Script - egal */
  }
}

// ── Führungs-Lebensader (Welle 33, Fix 2) ──────────────────────────────────────────────
// a) Ein Port zum background hält den gebundenen Tab fest: Schließt/crasht das Panel, bricht
//    der Port ab und background blendet das Overlay auf DEM Tab aus (kein „6/6"-Kleber).
// b) Ein Ping (~20s) hält den Selbstschutz-Timer im content.js wach.
let guidePort = null;
let guidePingTimer = null;
// Tab-/Fenster-Folgen (Welle 43): offene „get-tabs"-Anfragen an den Worker (führt die lauf-
// zugehörige Tab-Menge je Führungs-Port). Antwort kommt als Port-Nachricht „run-tabs".
let guideRunTabsSeq = 0;
const guideRunTabsPending = new Map();

function guidePortOpen(tabId) {
  guidePortClose();
  if (tabId == null) return;
  try {
    guidePort = chrome.runtime.connect({ name: "steply-guide" });
    guidePort.postMessage({ type: "bind", tabId });
    guidePort.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "run-tabs") return;
      const done = guideRunTabsPending.get(msg.reqId);
      if (done) done(Array.isArray(msg.tabs) ? msg.tabs : []);
    });
    guidePort.onDisconnect.addListener(() => {
      guidePort = null;
      // Worker evtl. neu gestartet: solange die Führung sichtbar läuft, Port neu aufbauen.
      if (!els.guideRun.hidden && guide.tabId != null) {
        setTimeout(() => {
          if (!guidePort && !els.guideRun.hidden && guide.tabId != null) guidePortOpen(guide.tabId);
        }, 0);
      }
    });
  } catch (err) {
    guidePort = null;
  }
}

function guidePortClose() {
  if (guidePort) {
    try {
      guidePort.disconnect();
    } catch (err) {
      /* egal */
    }
    guidePort = null;
  }
}

function guidePingStart() {
  guidePingStop();
  guidePingTimer = setInterval(() => {
    if (guide.tabId != null) sendGuideToTab({ type: "steply-guide-ping" });
  }, 20000);
}

function guidePingStop() {
  if (guidePingTimer) {
    clearInterval(guidePingTimer);
    guidePingTimer = null;
  }
}

// Beim Start/Fortsetzen einer Führung Port + Ping öffnen; beim Beenden schließen.
function guideLinkStart(tabId) {
  guidePortOpen(tabId);
  guidePingStart();
}
function guideLinkStop() {
  guidePingStop();
  guidePortClose();
}

// Telemetrie (fire-and-forget, fail-silent): started | completed | selector_miss.
// Der Endpoint braucht einen Token. Ohne Pairing (z. B. Doku-Tour eines frischen Nutzers)
// wird still NICHTS gesendet — die Doku-Führung läuft auch ohne Konto.
function sendGuideEvent(kind, stepTitle) {
  if (!cfg.token) return;
  try {
    const base = appBase();
    const body = { token: cfg.token, kind: kind };
    if (guide.tutorial && guide.tutorial.slug) body.tutorialSlug = guide.tutorial.slug;
    if (stepTitle) body.stepTitle = stepTitle;
    fetch(base + "/api/recorder/guide-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch (err) {
    /* Telemetrie darf die Führung nie stören */
  }
}

// Lade-Schlüssel je Quelle: Konto-Touren laden per id, Doku-Touren per slug.
function guideLoadKey() {
  if (!guide.tutorial) return null;
  return guide.source === "steply" ? guide.tutorial.slug || null : guide.tutorial.id || null;
}

async function guideSaveSession() {
  try {
    await chrome.storage.session.set({
      guideState: {
        key: guideLoadKey(),
        source: guide.source,
        curId: guide.curId,
        history: guide.history.slice(),
        tabId: guide.tabId,
      },
    });
  } catch (err) {
    /* Session-Storage optional - Führung läuft auch ohne */
  }
}

async function guideClearSession() {
  try {
    await chrome.storage.session.remove("guideState");
  } catch (err) {
    /* egal */
  }
}

// Detail eines Tutorials laden und die Graph-Strukturen aufbauen. true bei Erfolg.
// Quelle „steply": öffentliche Doku-Route (kein Token, per slug). Sonst: Konto-Route (Token,
// per id). Beide liefern DIESELBE Payload-Form (lib/guide-payload.ts) -> Rest identisch.
async function guideLoad(idOrSlug, source) {
  const base = appBase();
  const isDoc = source === "steply";
  const url = isDoc
    ? base + "/api/guide/steply/" + encodeURIComponent(idOrSlug)
    : base + "/api/recorder/tutorials/" + encodeURIComponent(idOrSlug);
  const opts = isDoc ? {} : { headers: { Authorization: "Bearer " + cfg.token } };
  let det;
  try {
    const res = await fetch(url, opts);
    if (!res.ok) return false;
    det = await res.json().catch(() => null);
  } catch (err) {
    return false;
  }
  if (!det || !det.tutorial || !Array.isArray(det.steps)) return false;
  guide.tutorial = det.tutorial;
  guide.steps = det.steps;
  guide.branches = Array.isArray(det.branches) ? det.branches : [];
  guide.stepById = new Map(guide.steps.map((s) => [s.id, s]));
  guide.branchesByStep = new Map();
  for (const b of guide.branches) {
    const list = guide.branchesByStep.get(b.step_id) || [];
    list.push(b);
    guide.branchesByStep.set(b.step_id, list);
  }
  for (const list of guide.branchesByStep.values()) {
    list.sort((a, b) => (a.position || 0) - (b.position || 0));
  }
  return true;
}

// Gesamtschrittzahl für den Fortschritt: nur bei LINEAREN Tutorials ehrlich (kein
// Entscheidungsschritt, jeder Schritt max. EIN Ausgang) - dann Pfadlänge ab root; sonst
// die reine Schrittzahl als grobe Orientierung. Spiegelt wizard.tsx.
// Ist das Tutorial LINEAR (kein Entscheidungsschritt, jeder Schritt max. EIN Ausgang)? Nur dann
// ist Vorspulen semantisch sauber (bei Verzweigungen = Graph wäre Skippen heikel). Spiegelt die
// Linearitäts-Prüfung im Viewer/Automations-Konverter.
function guideIsLinear() {
  return (
    !guide.steps.some((s) => s.is_decision) &&
    [...guide.branchesByStep.values()].every((b) => b.length <= 1)
  );
}

function guideTotal() {
  const linear = guideIsLinear();
  if (!linear) return guide.steps.length;
  let count = 0;
  let id = guide.tutorial ? guide.tutorial.root_step_id : null;
  const seen = new Set();
  while (id != null && guide.stepById.has(id) && !seen.has(id)) {
    seen.add(id);
    count++;
    const first = (guide.branchesByStep.get(id) || [])[0];
    id = first ? first.target_step_id : null;
  }
  return count > 0 ? count : guide.steps.length;
}

// Ziel des Standard-Ausgangs eines (linearen) Schritts (branches[0]); null = Ende.
function guideLinearNext(step) {
  const list = guide.branchesByStep.get(step.id) || [];
  if (!list.length) return null;
  return list[0].target_step_id || null;
}

// Screenshot + Highlight-Rechtecke (normalisiert 0..1) zeichnen. Blur-Highlights werden
// beim Veröffentlichen in die Pixel gebrannt -> hier nicht nachgezeichnet.
function guideRenderImage(step) {
  // Markierungen liegen jetzt im .run-image-frame (Welle 33, Fix 1) — dort aufraeumen.
  const frame = els.runImageFrame || els.runImageWrap;
  frame.querySelectorAll(".run-hl").forEach((n) => n.remove());
  if (!step.imageUrl) {
    els.runImageWrap.hidden = true;
    els.runImage.removeAttribute("src");
    return;
  }
  els.runImageWrap.hidden = false;
  // Seitenverhaeltnis aus der API (imageWidth/imageHeight): der Rahmen bekommt GENAU das
  // Bild-Verhaeltnis -> die Markierungen (in % dieses Rahmens) sitzen pixelgenau und liegen
  // schon VOR dem Bild-Load richtig. Ohne verlaessliche Masse: Default-Verhaeltnis (--run-ar
  // faellt in der CSS auf 1.6 zurueck) + object-fit:contain als Sicherheitsnetz.
  if (els.runImageFrame) {
    const iw = Number(step.imageWidth);
    const ih = Number(step.imageHeight);
    if (iw > 0 && ih > 0) {
      els.runImageFrame.style.setProperty("--run-ar", String(iw / ih));
    } else {
      els.runImageFrame.style.removeProperty("--run-ar");
    }
  }
  els.runImage.src = step.imageUrl;
  (Array.isArray(step.highlights) ? step.highlights : []).forEach((h) => {
    if (!h || typeof h !== "object" || h.type === "blur") return;
    const box = document.createElement("div");
    box.className = "run-hl";
    const s = box.style;
    s.left = clamp01(h.x) * 100 + "%";
    s.top = clamp01(h.y) * 100 + "%";
    s.width = clamp01(h.w) * 100 + "%";
    s.height = clamp01(h.h) * 100 + "%";
    if (h.type === "ellipse") s.borderRadius = "50%";
    if (h.color) s.borderColor = h.color;
    frame.appendChild(box);
  });
}

// Fallback-Darstellung ein/aus: Screenshot groß + Hinweis (kein Overlay möglich).
function guideSetFallback(on, hintText) {
  if (on) {
    els.runImageWrap.classList.add("run-image-large");
    els.runFallbackHint.textContent = hintText || "";
    els.runFallbackHint.hidden = !hintText;
  } else {
    els.runImageWrap.classList.remove("run-image-large");
    els.runFallbackHint.hidden = true;
    els.runFallbackHint.textContent = "";
  }
}

function guideRenderDecision(step) {
  els.runNav.hidden = true; // Entscheidungen gehen über die Antwort-Buttons weiter
  els.runDecision.hidden = false;
  els.runDecision.textContent = "";
  const list = guide.branchesByStep.get(step.id) || [];
  list.forEach((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-primary run-answer";
    btn.textContent = b.label || "Weiter";
    btn.addEventListener("click", () => guideAnswer(b.target_step_id));
    els.runDecision.appendChild(btn);
  });
  if (guide.history.length) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn run-back-inline";
    back.textContent = "Zurück";
    back.addEventListener("click", guideGoBack);
    els.runDecision.appendChild(back);
  }
}

function guideRenderStep() {
  const step = guide.curId != null ? guide.stepById.get(guide.curId) : null;
  if (!step) {
    guideRenderDone();
    return;
  }
  els.runDone.hidden = true;
  guideSetFallback(false, "");
  // Zustands-Intelligenz (Welle 40): einen Schritt zu rendern heißt, wir warten nicht (mehr).
  guide.waitingLogin = false;
  if (els.runSkipNote) {
    if (guide.skipNote) {
      els.runSkipNote.textContent = guideSkipNoteText(guide.skipNote);
      els.runSkipNote.hidden = false;
    } else {
      els.runSkipNote.hidden = true;
    }
  }

  const idx = guide.history.length + 1;
  const total = guideTotal();
  els.runProgress.textContent = "Schritt " + idx + (total ? " von " + total : "");
  const pct = total ? Math.round((idx / total) * 100) : 0;
  if (els.runBar.firstElementChild) els.runBar.firstElementChild.style.width = pct + "%";

  els.runTitle.textContent = step.is_decision
    ? step.question || step.title || "Bitte wählen"
    : step.title || "";
  renderSafeHtml(els.runBody, step.body);
  guideRenderImage(step);

  if (step.is_decision) {
    // KEIN Overlay bei Entscheidungen (es gibt kein einzelnes Ziel).
    sendGuideToTab({ type: "steply-guide-hide" });
    guideRenderDecision(step);
  } else {
    els.runDecision.hidden = true;
    els.runNav.hidden = false;
    els.runBack.disabled = guide.history.length === 0;
    els.runBack.style.visibility = guide.history.length === 0 ? "hidden" : "visible";
    els.runNext.textContent = guideLinearNext(step) ? "Weiter" : "Fertig 🎉";
    const sel = step.selector;
    if (sel && typeof sel === "object" && (sel.css || sel.text || sel.role)) {
      // Overlay auf der Seite anfordern; found:false -> Fallback (siehe Message-Listener).
      sendGuideToTab({
        type: "steply-guide-show",
        step: { selector: sel, title: step.title, index: idx, total: total },
      });
    } else {
      // Ohne Selektor gleich Fallback (großer Screenshot + Hinweis).
      sendGuideToTab({ type: "steply-guide-hide" });
      guideSetFallback(
        true,
        "Für diesen Schritt gibt es keine Bildschirm-Markierung - orientieren Sie sich am Screenshot.",
      );
    }
  }
  guideSaveSession();
}

function guideRenderDone() {
  sendGuideToTab({ type: "steply-guide-hide" });
  sendGuideEvent("completed", null);
  guide.curId = null;
  els.runDecision.hidden = true;
  els.runNav.hidden = true;
  els.runImageWrap.hidden = true;
  els.runFallbackHint.hidden = true;
  els.runTitle.textContent = "";
  els.runBody.textContent = "";
  els.runProgress.textContent = "";
  if (els.runBar.firstElementChild) els.runBar.firstElementChild.style.width = "100%";
  els.runDone.hidden = false;
  guideSaveSession();
}

function guideGoNext() {
  const step = guide.curId != null ? guide.stepById.get(guide.curId) : null;
  if (!step) {
    guideRenderDone();
    return;
  }
  if (step.is_decision) return; // Entscheidungen nur über Antwort-Buttons
  guide.skipNote = null; // manueller Schritt → Vorspul-Notiz ist erledigt
  const target = guideLinearNext(step);
  guide.history.push(guide.curId);
  guide.curId = target;
  if (guide.curId == null) {
    guideRenderDone();
    return;
  }
  guideRenderStep();
}

function guideGoBack() {
  if (!guide.history.length) return;
  guide.skipNote = null;
  guide.curId = guide.history.pop();
  els.runDone.hidden = true;
  guideRenderStep();
}

function guideAnswer(targetId) {
  guide.skipNote = null;
  guide.history.push(guide.curId);
  guide.curId = targetId || null;
  if (guide.curId == null) {
    guideRenderDone();
    return;
  }
  guideRenderStep();
}

async function guideExit() {
  guideLinkStop(); // Port + Ping schließen (background blendet auf Disconnect ohnehin aus)
  sendGuideToTab({ type: "steply-guide-hide" });
  await guideClearSession();
  guide.curId = null;
  guide.tutorial = null;
  guide.source = "account";
  guide.waitingLogin = false;
  guide.skipNote = null;
  showStart();
}

// ── „Bring mich hin" (Welle 32, Punkt F) ─────────────────────────────────────────────────
// Registrierbare Basis-Domain (letzte zwei Labels) eines vollen Hostnamens — für den
// Vergleich Live-Tab ↔ Startseite von Schritt 1.
function baseDomain(host) {
  if (typeof host !== "string" || !host) return "";
  const labels = host.split(".");
  return labels.length <= 2 ? host : labels.slice(-2).join(".");
}

// site_domains eines Tutorials aus den bereits geladenen Listen (Führen/„Für diese Seite"/Doku).
function cachedSiteDomains(id) {
  if (!id) return null;
  const find = (list) => (Array.isArray(list) ? list.find((t) => t && t.id === id) : null);
  const t = find(fuehrenTutorials) || find(siteTutorials) || find(steplyDocs);
  return t && Array.isArray(t.site_domains) ? t.site_domains : null;
}

async function tabUrlById(tabId) {
  if (tabId == null) return "";
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab && typeof tab.url === "string" ? tab.url : "";
  } catch (err) {
    return "";
  }
}

// Zustands-Intelligenz (Welle 40): Passwortfeld-Probe im Tab (Absicherung der Anmelde-Wache).
// Promise<bool>: true NUR bei bestätigtem input[type=password]; bei fehlender Antwort/Fehler
// false (dann greift die Wache NICHT — lieber ehrliche Pause / normaler Fallback als falsches
// Warten). Isolated World reicht (reines DOM-Merkmal). SICHERHEIT: wir LESEN nur die Existenz —
// nie einen Wert; die Wache tippt NIEMALS selbst Zugangsdaten.
function probePasswordField(tabId) {
  return new Promise((resolve) => {
    if (tabId == null) {
      resolve(false);
      return;
    }
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v === true);
    };
    const timer = setTimeout(() => done(false), 2500);
    try {
      const p = chrome.tabs.sendMessage(tabId, { type: "steply-exec-has-password" });
      if (p && p.then) {
        p.then(
          (res) => done(!!(res && res.hasPassword)),
          () => done(false),
        );
      } else {
        done(false);
      }
    } catch (err) {
      done(false);
    }
  });
}

// Bedingte Schritte (Welle 42): Element-Bedingung im Ziel-Tab prüfen (Muster probePasswordField).
// Fragt content.js (steply-eval-condition) und liefert das ROHE „gefunden+sichtbar" (met) —
// negate wendet der Aufrufer via SteplyExecPlan.shouldRunStep an. content.js baut selbst eine
// ~300 ms Gnadenfrist ein → hier großzügiger Timeout (2,5 s). Kein Tab / Fehler → false.
function execEvalElementCondition(tabId, cond) {
  return new Promise((resolve) => {
    if (tabId == null || !cond) {
      resolve(false);
      return;
    }
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v === true);
    };
    const timer = setTimeout(() => done(false), 2500);
    try {
      const p = chrome.tabs.sendMessage(tabId, { type: "steply-eval-condition", cond: cond });
      if (p && p.then) {
        p.then((res) => done(!!(res && res.met)), () => done(false));
      } else {
        done(false);
      }
    } catch (err) {
      done(false);
    }
  });
}

// Bedingte Schritte (Welle 42): SOLL der aktuelle Plan-Schritt jetzt ausgeführt werden? URL-
// Bedingung lokal (Tab-URL) prüfen, Element-Bedingung via content.js; negate + Entscheidung
// trägt die pure SteplyExecPlan.shouldRunStep (EINE Stelle). Ohne condition → true (heutiges
// Verhalten). Wird VOR dem Schritt-Senden aufgerufen, NACH Navigation/Settle + Zustandsprüfung.
async function execStepConditionMet(planStep) {
  const cond = planStep && planStep.condition;
  if (typeof SteplyExecPlan === "undefined" || !cond) return true;
  let urlMatch = false;
  let elementFound = false;
  if (cond.kind === "url") {
    const curUrl = await tabUrlById(exec.tabId);
    urlMatch = SteplyExecPlan.evalUrlCondition(curUrl, cond);
  } else if (cond.kind === "element") {
    elementFound = await execEvalElementCondition(exec.tabId, cond);
  }
  return SteplyExecPlan.shouldRunStep(cond, { urlMatch: urlMatch, elementFound: elementFound });
}

// Tab-/Fenster-Folgen (Welle 43): die lauf-zugehörige Tab-Menge der Führung vom Worker erfragen.
// Kurzer Timeout; ohne Port → null (dann folgt die Führung wie bisher nur guide.tabId).
function guideRequestRunTabs() {
  return new Promise((resolve) => {
    if (!guidePort) {
      resolve(null);
      return;
    }
    const reqId = ++guideRunTabsSeq;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      guideRunTabsPending.delete(reqId);
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 1500);
    guideRunTabsPending.set(reqId, done);
    try {
      guidePort.postMessage({ type: "get-tabs", reqId });
    } catch (e) {
      done(null);
    }
  });
}

// Tab-/Fenster-Folgen (Welle 43) in der Führung: passt ein LAUF-ZUGEHÖRIGER Tab (neues Fenster /
// OAuth-Popup) zur page_url des aktuellen Schritts, die Führung dorthin umbinden + aktivieren, so
// dass Overlay/Maus im richtigen Fenster erscheinen. Rückgabe true, wenn umgebunden wurde.
async function guideSelectTab(step) {
  if (typeof SteplyExecPlan === "undefined" || typeof SteplyExecPlan.pickTabForStep !== "function") return false;
  if (!step) return false;
  const tabs = await guideRequestRunTabs();
  if (!Array.isArray(tabs) || tabs.length === 0) return false;
  const pick = SteplyExecPlan.pickTabForStep(step, tabs);
  if (pick == null || pick === guide.tabId) return false;
  const info = tabs.find((t) => t.tabId === pick) || null;
  guide.tabId = pick;
  if (guidePort) {
    try {
      guidePort.postMessage({ type: "rebind", tabId: guide.tabId });
    } catch (e) {
      /* egal */
    }
  }
  try {
    chrome.runtime.sendMessage({ type: "steply-ensure-content" });
  } catch (e) {
    /* egal */
  }
  try {
    await chrome.tabs.update(pick, { active: true });
  } catch (e) {
    /* egal */
  }
  if (info && info.windowId != null) {
    try {
      await chrome.windows.update(info.windowId, { focused: true });
    } catch (e) {
      /* egal */
    }
  }
  guideSaveSession();
  return true;
}

// Passt der aktive Tab NICHT zum Tutorial (site_domains bzw. Domain von Schritt 1), einen
// neuen Tab auf der Startseite (Schritt 1 page_url) öffnen und die Führung an DIESEN Tab
// binden. Ohne page_url an Schritt 1: Verhalten wie bisher (aktueller Tab). chrome://-Tabs
// u. ä. → ebenfalls neuer Tab, sofern eine page_url existiert.
// DATENSCHUTZ: Die aktuelle Tab-URL wird NUR lokal für den Domain-Vergleich gelesen.
async function guideBringToStartIfNeeded() {
  if (typeof SteplySiteMatch === "undefined") return;
  const startStep = guide.curId != null ? guide.stepById.get(guide.curId) : guide.steps[0] || null;
  const pageUrl = startStep && typeof startStep.page_url === "string" ? startStep.page_url : "";
  const targetHost = SteplySiteMatch.hostnameOf(pageUrl);
  if (!pageUrl || !targetHost) return; // Schritt 1 ohne (normale) URL -> aktueller Tab

  const curUrl = await tabUrlById(guide.tabId);
  const curHost = SteplySiteMatch.hostnameOf(curUrl);

  // Passt der aktive Host zur Startseiten-Domain ODER zu einem site_domain? Dann bleiben.
  let matches = false;
  if (curHost) {
    if (baseDomain(curHost) === baseDomain(targetHost)) {
      matches = true;
    } else {
      const domains = cachedSiteDomains(guide.tutorial ? guide.tutorial.id : null);
      if (Array.isArray(domains)) {
        for (const d of domains) {
          if (SteplySiteMatch.matchesDomain(curHost, d)) {
            matches = true;
            break;
          }
        }
      }
    }
  }
  if (matches) return; // schon auf der richtigen Seite -> aktueller Tab

  // Sonst: neuen Tab auf der Startseite öffnen + Führung daran binden.
  try {
    const tab = await chrome.tabs.create({ url: pageUrl, active: true });
    if (tab && tab.id != null) guide.tabId = tab.id;
    setStatus("Sie werden zur Startseite gebracht …", "");
  } catch (err) {
    /* Tab ließ sich nicht öffnen -> aktueller Tab (Fallback) */
  }
}

// EINSTIEG (auch window.SteplyGuide.start): Tutorial laden und Führung starten.
// source: „steply" = öffentliche Doku-Tour (per slug, KEIN Token nötig); sonst Konto-Tour
// (per id, Token nötig). So erreichbar auch für frisch installierte, unverbundene Nutzer.
async function guideStart(idOrSlug, source) {
  const src = source === "steply" ? "steply" : "account";
  const isDoc = src === "steply";
  if (!idOrSlug) return;
  if (!isDoc && !hasToken) return; // Konto-Touren brauchen eine Verbindung; Doku nicht
  guide.source = src;
  setStatus("");
  // Content-Scripts (guide-resolve.js + content.js) sicher in alle offenen Tabs impfen -
  // deckt altoffene Tabs ab, die vor dem Extension-Laden geöffnet wurden. Die Injektion
  // läuft parallel zum Detail-Laden (Netz) -> beim ersten „steply-guide-show" sind sie da.
  try {
    chrome.runtime.sendMessage({ type: "steply-ensure-content" });
  } catch (err) {
    /* deklarative Injektion deckt frisch geladene Seiten ab */
  }
  guide.tabId = await guideActiveTabId();
  const okLoad = await guideLoad(idOrSlug, src);
  if (!okLoad) {
    setStatus("Die Anleitung konnte nicht geladen werden.", "error");
    return;
  }
  guide.curId = (guide.tutorial && guide.tutorial.root_step_id) || (guide.steps[0] && guide.steps[0].id) || null;
  guide.history = [];
  guide.waitingLogin = false;
  guide.skipNote = null;
  if (!guide.curId) {
    setStatus("Diese Anleitung hat noch keine Schritte.", "error");
    return;
  }
  // „Bring mich hin" (Punkt F): passt der Tab nicht, in einem neuen Tab auf der Startseite
  // führen (bindet guide.tabId ggf. um) — VOR dem ersten Overlay-Senden. Gilt seit v2.9.1
  // AUCH für Doku-Touren (Richard, 06.07.): Wer „Steply lernen" startet, will in die App
  // gebracht werden — ohne Navigation liefe die Tour nur im Screenshot-Fallback. Schritte
  // ohne page_url (z. B. Hub-Tour) bleiben wie gehabt im aktuellen Tab.
  await guideBringToStartIfNeeded();
  // Port + Ping an den (final gebundenen) Tab (Welle 33, Fix 2).
  guideLinkStart(guide.tabId);
  sendGuideEvent("started", null);
  show("guideRun");
  guideRenderStep();
}

// ── „Führen"-Liste mit Filtern + Kategorien-Gruppierung (Welle 32, Punkt C) ──────────────
// Default-Filter: „Diese Seite" + „Live" — nur veröffentlichte Tutorials, deren site_domains
// zur aktuellen Tab-URL passen (Matching REIN LOKAL via site-match.js; die besuchte URL
// verlässt NIE den Browser). Zwei Chip-Paare (Diese Seite|Alle, Live|Auch Entwürfe); die
// Auswahl bleibt in chrome.storage.session. Die Liste wird nach Kategorie gruppiert
// („Ohne Kategorie" zuletzt).
let fuehrenTutorials = null; // volle Liste vom Server (oder null)
const FUEHREN_FILTER_DEFAULT = { site: "page", live: "live" };
let fuehrenFilter = { ...FUEHREN_FILTER_DEFAULT };
let fuehrenFilterLoaded = false;

async function loadFuehrenFilter() {
  try {
    const r = await chrome.storage.session.get("fuehrenFilter");
    const f = r && r.fuehrenFilter;
    if (f && (f.site === "page" || f.site === "all") && (f.live === "live" || f.live === "drafts")) {
      fuehrenFilter = { site: f.site, live: f.live };
    }
  } catch (err) {
    /* Session-Storage optional -> Defaults */
  }
  fuehrenFilterLoaded = true;
}

function saveFuehrenFilter() {
  try {
    chrome.storage.session.set({ fuehrenFilter });
  } catch (err) {
    /* egal */
  }
}

function renderFuehrenChips() {
  if (!els.chipSite) return;
  els.chipSite.classList.toggle("chip-active", fuehrenFilter.site === "page");
  els.chipAll.classList.toggle("chip-active", fuehrenFilter.site === "all");
  els.chipLive.classList.toggle("chip-active", fuehrenFilter.live === "live");
  els.chipDrafts.classList.toggle("chip-active", fuehrenFilter.live === "drafts");
}

function setFuehrenFilter(patch) {
  fuehrenFilter = { ...fuehrenFilter, ...patch };
  renderFuehrenChips();
  saveFuehrenFilter();
  applyFuehrenFilters();
}

// Sortierung innerhalb einer Kategorie-Gruppe: veröffentlicht vor Entwurf, dann Titel A→Z.
function fuehrenSort(a, b) {
  const ap = a.status === "published" ? 0 : 1;
  const bp = b.status === "published" ? 0 : 1;
  if (ap !== bp) return ap - bp;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

// Nach Kategorie gruppieren: benannte Gruppen alphabetisch, „Ohne Kategorie" ganz zuletzt.
function groupByCategory(list) {
  const groups = new Map(); // key -> { name|null, items[] }
  for (const t of list) {
    const cat = t.category && typeof t.category === "object" ? t.category : null;
    const key = cat && cat.id ? cat.id : "__none__";
    if (!groups.has(key)) groups.set(key, { name: cat ? cat.name || "Ohne Namen" : null, items: [] });
    groups.get(key).items.push(t);
  }
  const named = [...groups.entries()].filter(([k]) => k !== "__none__");
  named.sort((a, b) => String(a[1].name || "").localeCompare(String(b[1].name || "")));
  const result = named.map(([, v]) => v);
  const none = groups.get("__none__");
  if (none) result.push({ name: null, items: none.items });
  return result;
}

// „Führen"-Liste zeigen + Tutorials laden.
async function showFuehren() {
  if (!hasToken) return;
  if (!fuehrenFilterLoaded) await loadFuehrenFilter();
  show("fuehren");
  setStatus("");
  els.fuehrenHint.hidden = true;
  if (els.fuehrenFilters) els.fuehrenFilters.hidden = false;
  renderFuehrenChips();
  els.fuehrenList.textContent = "";
  const loading = document.createElement("p");
  loading.className = "note";
  loading.textContent = "Anleitungen werden geladen …";
  els.fuehrenList.appendChild(loading);

  const base = appBase();
  let body;
  try {
    const res = await fetch(base + "/api/recorder/tutorials", {
      headers: { Authorization: "Bearer " + cfg.token },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    body = await res.json().catch(() => null);
  } catch (err) {
    fuehrenTutorials = null;
    els.fuehrenList.textContent = "";
    els.fuehrenHint.textContent = "Die Anleitungen konnten nicht geladen werden.";
    els.fuehrenHint.hidden = false;
    return;
  }
  fuehrenTutorials = body && Array.isArray(body.tutorials) ? body.tutorials : [];
  await applyFuehrenFilters();
}

// Filter anwenden (Live-Status + Diese-Seite) und die gefilterte, gruppierte Liste rendern.
async function applyFuehrenFilters() {
  if (!Array.isArray(fuehrenTutorials)) return;
  let list = fuehrenTutorials.slice();

  // „Live": nur veröffentlichte; „Auch Entwürfe": beides.
  if (fuehrenFilter.live === "live") list = list.filter((t) => t.status === "published");

  // „Diese Seite": nur Tutorials, deren site_domains zur aktuellen Tab-URL passen. Matching
  // REIN LOKAL (site-match.js) — die besuchte URL verlässt NIE den Browser.
  const siteRestricted = fuehrenFilter.site === "page";
  const url = siteRestricted ? await currentActiveUrl() : "";
  const host =
    siteRestricted && typeof SteplySiteMatch !== "undefined" ? SteplySiteMatch.hostnameOf(url) : null;
  if (siteRestricted) list = host ? SteplySiteMatch.matchTutorials(url, list) : [];

  // 🎓 Steply lernen: Doku-Touren als EIGENE Gruppe (unterhalb der Konto-Tutorials). Dedupe per
  // id (falls mit dem Steply-Konto gepairt). „Diese Seite" filtert auch die Doku lokal; der
  // „Live"-Filter ist für Doku belanglos (sie ist immer veröffentlicht).
  let docs = (await loadSteplyDocs()) || [];
  const accIds = new Set(list.map((t) => t.id));
  docs = docs.filter((d) => !accIds.has(d.id));
  if (siteRestricted) docs = host ? SteplySiteMatch.matchTutorials(url, docs) : [];

  renderFuehrenList(list, siteRestricted, docs);
}

function renderFuehrenList(list, siteRestricted, docs) {
  els.fuehrenList.textContent = "";
  docs = Array.isArray(docs) ? docs : [];
  if (!list.length && !docs.length) {
    els.fuehrenHint.textContent = siteRestricted
      ? "Für diese Seite gibt es keine passende Anleitung — „Alle“ zeigt alle."
      : fuehrenFilter.live === "live"
        ? "Keine veröffentlichten Anleitungen — „Auch Entwürfe“ zeigt mehr."
        : "Noch keine Anleitungen vorhanden.";
    els.fuehrenHint.hidden = false;
    return;
  }
  els.fuehrenHint.hidden = true;

  if (list.length) {
    const groups = groupByCategory(list);
    // Überschriften zeigen bei mehreren Gruppen, echter Kategorie ODER wenn die Doku-Gruppe folgt.
    const showHeadings =
      groups.length > 1 || (groups.length === 1 && !!groups[0].name) || docs.length > 0;
    for (const g of groups) {
      if (showHeadings) {
        const h = document.createElement("p");
        h.className = "fuehren-group";
        h.textContent = g.name || "Ohne Kategorie";
        els.fuehrenList.appendChild(h);
      }
      g.items.slice().sort(fuehrenSort).forEach((t) => {
        els.fuehrenList.appendChild(buildTutorialCard(t, (tut) => guideStart(tut.id, "account")));
      });
    }
  }

  // 🎓 Steply lernen: Doku-Touren als eigene Gruppe UNTERHALB der Konto-Tutorials.
  if (docs.length) {
    const h = document.createElement("p");
    h.className = "fuehren-group";
    h.textContent = "🎓 Steply lernen";
    els.fuehrenList.appendChild(h);
    for (const t of docs) {
      els.fuehrenList.appendChild(buildTutorialCard(t, (tut) => guideStart(tut.slug, "steply")));
    }
  }
}

// Eine laufende Führung nach Panel-Schließen/Öffnen fortsetzen (chrome.storage.session).
async function guideMaybeResume() {
  let st = null;
  try {
    const r = await chrome.storage.session.get("guideState");
    st = r && r.guideState;
  } catch (err) {
    st = null;
  }
  if (!st || !st.curId) return false;
  const source = st.source === "steply" ? "steply" : "account";
  const key = st.key || st.tutorialId; // Abwärtskompat: alte Sessions speicherten tutorialId
  if (!key) return false;
  // Konto-Touren brauchen einen Token; Doku-Touren nicht.
  if (source !== "steply" && !hasToken) {
    await guideClearSession();
    return false;
  }
  guide.source = source;
  const okLoad = await guideLoad(key, source);
  if (!okLoad || !guide.stepById.has(st.curId)) {
    await guideClearSession();
    return false;
  }
  guide.curId = st.curId;
  guide.history = Array.isArray(st.history) ? st.history.filter((h) => guide.stepById.has(h)) : [];
  guide.tabId = typeof st.tabId === "number" ? st.tabId : null;
  guide.waitingLogin = false;
  guide.skipNote = null;
  // Wieder aufgenommene Führung: Port + Ping erneut aufbauen (Welle 33, Fix 2).
  guideLinkStart(guide.tabId);
  show("guideRun");
  guideRenderStep();
  return true;
}

// content.js -> Panel: „weiter" (pointerdown auf dem markierten Element).
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-guide-advance") return;
  if (els.guideRun.hidden) return;
  // Nur vom gebundenen Tab akzeptieren.
  if (guide.tabId != null && sender && sender.tab && sender.tab.id !== guide.tabId) return;
  guideGoNext();
});

// content.js -> Panel: Selektor-Status. found:false -> Fallback + Drift-Telemetrie.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-guide-status") return;
  if (els.guideRun.hidden) return;
  if (guide.tabId != null && sender && sender.tab && sender.tab.id !== guide.tabId) return;
  // Erholung (Hotfix 06.07.): Findet die stille Wiederaufnahme das Element doch noch
  // (SPA/PPR hat es nur kurz versteckt/ersetzt), verlaesst das Panel den Fallback wieder.
  if (msg.found === true) {
    guideSetFallback(false);
    return;
  }
  if (msg.found === false) {
    const step = guide.curId != null ? guide.stepById.get(guide.curId) : null;
    // Grund dezent in Klammern (Welle 33, Fix 3): hilft beim Debuggen künftiger Fälle.
    const reason = typeof msg.reason === "string" ? msg.reason.trim() : "";
    const suffix = reason ? " (" + reason + ")" : "";
    guideSetFallback(
      true,
      "Diese Stelle ist auf der Seite gerade nicht zu finden" +
        suffix +
        " - orientieren Sie sich am Screenshot.",
    );
    sendGuideEvent("selector_miss", step ? step.title : null);
  }
});

// ── Zustands-Intelligenz in der Führung (Welle 40) ─────────────────────────────────────────
// Kleinerer Scope als im Automations-Lauf: Die Führung folgt der MANUELLEN Navigation des
// Nutzers. Landet der gebundene Tab auf einer Seite,
//   • die zu einem SPÄTEREN linearen Schritt passt → VORSPULEN (nur lineare Tutorials; bei
//     Verzweigungen wäre Skippen semantisch heikel → nur Anmelde-Wache),
//   • die eine fremde Login-Seite ist (Passwortfeld bestätigt) → ANMELDE-WACHE (höflich warten
//     statt Screenshot-Fallback-Verwirrung); erreicht die nächste Navigation eine passende
//     Seite, geht es automatisch weiter,
//   • sonst → bisheriges Verhalten (Overlay des aktuellen Schritts neu senden).

// Lineare Schrittkette ab dem aktuellen Schritt (curId) als plan-artige Liste {id, page_url} —
// so trägt die getestete pure SteplyExecPlan.resyncTarget die Vorspul-Entscheidung.
function guideLinearChain() {
  const chain = [];
  let id = guide.curId;
  const seen = new Set();
  while (id != null && guide.stepById.has(id) && !seen.has(id)) {
    seen.add(id);
    const st = guide.stepById.get(id);
    chain.push({ id: id, page_url: st && typeof st.page_url === "string" ? st.page_url : "" });
    id = guideLinearNext(st);
  }
  return chain;
}

// Overlay des aktuellen Schritts neu senden (exakt das bisherige Navigation-Überleben-Verhalten).
function guideResendOverlay(step) {
  const sel = step && step.selector;
  if (sel && typeof sel === "object" && (sel.css || sel.text || sel.role)) {
    sendGuideToTab({
      type: "steply-guide-show",
      step: { selector: sel, title: step.title, index: guide.history.length + 1, total: guideTotal() },
    });
  }
}

// Vorspul-Notiz-Text (Richards Verzweigungs-Metapher, identisch zum Automations-Lauf).
function guideSkipNoteText(note) {
  if (!note) return "";
  const range = note.a >= note.b ? "Schritt " + note.a : "Schritte " + note.a + "–" + note.b;
  return note.login
    ? "Angemeldet? → Ja ✓ — " + range + " übersprungen."
    : "Bereits erledigt ✓ — " + range + " übersprungen (Seite schon erreicht).";
}

// VORSPULEN in der Führung: chain[0..t-1] als erledigt in die History legen, auf chain[t] setzen.
function guideFastForwardChain(chain, t, login) {
  const a = guide.history.length + 1;
  const b = guide.history.length + t; // t übersprungene Schritte (chain[0..t-1])
  for (let i = 0; i < t; i++) guide.history.push(chain[i].id);
  guide.curId = chain[t].id;
  guide.waitingLogin = false;
  guide.skipNote = { a: a, b: b, login: !!login };
  guideRenderStep();
}

// ANMELDE-WACHE in der Führung: kein Overlay, keinen (verwirrenden) Ziel-Screenshot, sondern die
// klare Warte-Meldung. Erreicht die nächste Navigation eine passende Seite, setzt guideHandleNav
// automatisch fort.
function guideEnterWaitLogin() {
  guide.waitingLogin = true;
  sendGuideToTab({ type: "steply-guide-hide" });
  els.runImageWrap.hidden = true;
  guideSetFallback(false, "");
  els.runFallbackHint.textContent =
    "🔐 Bitte kurz anmelden — die Führung wartet und macht automatisch weiter.";
  els.runFallbackHint.hidden = false;
  if (els.runSkipNote) els.runSkipNote.hidden = true;
  guideSaveSession();
}

async function guideHandleNav() {
  if (guide.navBusy) return; // Re-Entrance-Schutz (rasche Doppel-„complete" → kein Doppel-Vorspulen)
  const step = guide.curId != null ? guide.stepById.get(guide.curId) : null;
  if (!step || step.is_decision) return; // Entscheidungen: kein Vorspulen; Wache greift hier nicht
  guide.navBusy = true;
  try {
    await guideHandleNavInner(step);
  } finally {
    guide.navBusy = false;
  }
}

async function guideHandleNavInner(step) {
  // Tab-/Fenster-Folgen (Welle 43): folgt die manuelle Navigation in ein neues Fenster / OAuth-
  // Popup, das zum aktuellen Schritt passt, die Führung dorthin umbinden (curUrl bezieht sich
  // danach auf den neuen Tab) — so überstehen auch geführte Touren „Über Google anmelden".
  await guideSelectTab(step);
  const curUrl = await tabUrlById(guide.tabId);
  if (typeof SteplyExecPlan !== "undefined" && curUrl) {
    // a) Vorspulen NUR bei linearen Tutorials.
    if (guideIsLinear()) {
      const chain = guideLinearChain();
      const t = SteplyExecPlan.resyncTarget(curUrl, chain, 0);
      if (t != null && t > 0) {
        const login = SteplyExecPlan.skipCrossesLogin(chain, 0, t, {});
        guideFastForwardChain(chain, t, login);
        return;
      }
      if (t === 0) {
        // Aktuelle Seite passt zum aktuellen Schritt.
        if (guide.waitingLogin) {
          guide.waitingLogin = false;
          guideRenderStep();
        } else {
          guideResendOverlay(step);
        }
        return;
      }
    }
    // b) Fremde Login-Seite (zu keinem Schritt passend) → Anmelde-Wache (auch bei Verzweigungen).
    if (SteplyExecPlan.looksLikeLoginUrl(curUrl) && SteplyExecPlan.needsNavigation(curUrl, step)) {
      const hasPw = await probePasswordField(guide.tabId);
      if (hasPw) {
        guideEnterWaitLogin();
        return;
      }
    }
  }
  // c) Noch am Warten → geduldig bleiben; sonst Overlay des aktuellen Schritts neu senden.
  if (guide.waitingLogin) return;
  guideResendOverlay(step);
}

// Navigation überleben + Zustands-Intelligenz: lädt ein Tab fertig, den Zustand einordnen.
// Welle 43: nicht nur der gebundene Tab — auch ein in einem ANDEREN Fenster fertig geladenes
// OAuth-Popup / ein neuer Tab; guideSelectTab (in guideHandleNav) entscheidet, ob ein lauf-
// zugehöriger Tab zum aktuellen Schritt passt und die Führung dorthin folgt. Fremde Ladevorgänge
// laufen dort ins Leere (kein Rebind, kein Vorspulen).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (els.guideRun.hidden) return;
  if (changeInfo.status !== "complete") return;
  guideHandleNav();
});

// Welle 31c ruft dies aus ihrer Sektion „Für diese Seite" auf.
window.SteplyGuide = { start: guideStart };

// ============================================================================
// AUTOMATIONEN (Welle 36b): aufgezeichnete Abläufe von der Extension AUSFÜHREN.
//
// Eigenständiger Modus neben der Führung — nutzt dieselbe Selektor-Auflösung
// (guide-resolve.js) und dieselbe Overlay-Denkweise, aber das Content-Script
// FÜHRT die Aktionen aus (click/fill/select/toggle) mit einer animierten Maus.
//
// SICHERHEIT (nicht verhandelbar):
//   1) NIE raten und klicken — Selektor-Miss/mehrdeutig ⇒ Lauf PAUSIERT sofort.
//   2) Parameter-Werte leben NUR in chrome.storage.local (nur nach „Im Browser
//      merken"); Werte gehen NIE in Logs oder Server-Payloads.
//   3) Vor dem Start Domain-Anzeige + Start-Bestätigung (die Vorbereitungs-Ansicht).
//   4) Vollautomatik ist Opt-in pro Lauf — Standard ist Halbautomatik.
//
// Der Lauf ist an EINEN Tab gebunden (wie die Führung). Port „steply-exec" +
// Ping halten Overlay/Cursor im Tab am Leben; Panel zu ⇒ background räumt ab.
// API-Routen baut PARALLEL Welle 36a; fehlen sie (404/Fehler), endet die
// Sektion/der Lauf sauber mit einer Meldung.
// ============================================================================

const exec = {
  automation: null, // { id, title, site_domains, params:[{key,label,type,required}] }
  steps: [], // Detail-Schritte vom Server
  plan: [], // buildRunPlan-Ausgabe (geordnet, mit aufgelösten Werten — bleibt LOKAL)
  values: {}, // Parameter-Werte (LOKAL; NIE geloggt/gesendet)
  mode: "semi", // „semi" (Halbautomatik, Default) | „auto" (Vollautomatik)
  autoMode: false,
  runId: null, // Server-Lauf-ID (best effort)
  tabId: null, // gebundener Tab
  index: 0, // aktueller Schritt (0-basiert) im plan
  running: false,
  paused: false,
  phase: "idle", // idle | ready | executing | miss | paused | waiting-login | done | aborted
  lastMissReason: "",
  lastMissDetail: "", // z. B. Dateiname bei „download-manual" (nur Anzeige, nie Server)
  // Zustands-Intelligenz (Welle 40): Vorspul-Notiz {from,to,login} + Wächter-Flags. verifying =
  // Welle-38-Submit-Kontrolle läuft gerade (die Zustandsprüfung darf ihr Fenster NICHT kapern);
  // stateBusy = eine (asynchrone) Zustandsprüfung ist schon unterwegs (Re-Entrance-Schutz).
  skipNote: null,
  // Bedingte Schritte (Welle 42): letzter übersprungener Schritt {index,title} für die dezente
  // Protokoll-Notiz „⏭ Schritt X übersprungen (Bedingung nicht erfüllt)". null = nichts skippt.
  condSkip: null,
  skipFileTarget: null, // Vorspul-Ziel, das wegen eines gebrauchten Downloads pausiert wurde
  verifying: false,
  stateBusy: false,
  // Datei-Brücke (Welle 39): getragene Dateien { [key]: { name, mime, size, b64 } }. SICHERHEIT:
  // NUR im Panel-Speicher, NIE an den Server/in Logs; bei JEDEM Lauf-Ende geleert (execFinish).
  files: {},
  finished: false, // Doppel-finish-Schutz
};

// ms: 5s Selektor-Suche + Animation + bis zu 8s Hydration-Warten vor Submits
// (Kaltstart-Sonde, 06.07. abends) + Puffer. Vorher 9000 — die Sonde haette sonst
// als falscher Miss geendet, waehrend das Content-Script noch korrekt wartete.
const EXEC_STEP_TIMEOUT = 20000;
const EXEC_AUTO_GAP = 700; // ms Pause zwischen Schritten in der Vollautomatik
const EXEC_NAV_TIMEOUT = 15000; // ms auf „complete" nach einer Navigation warten
// Beruhigungspause NACH „complete" (Hotfix 06.07., Richards Login-Lauf): „complete" heißt
// nur „Dokument geladen" — React braucht danach noch einen Moment zum Hydratisieren.
// Feuert ein Submit VORHER, greift die NATIVE Formular-Submission (Voll-Reload) statt der
// React-Form-Action — genau der „Login-Seite reloaded einfach"-Hänger. Ein Mensch ist nie
// so schnell nach dem Seitenladen; unsere Maus war es. 2000 statt 1500 (06.07. abends):
// Richards erster Lauf schlug weiterhin fehl, die folgenden nicht — Vercel-KALTSTART
// macht die Hydration beim allerersten Aufruf spürbar langsamer.
const EXEC_NAV_SETTLE_MS = 2000;
// Submit-Ergebnis-Kontrolle (Welle 38, Ehrlichkeits-Netz). EIGENES Budget: läuft im Panel
// NACH dem content-Ergebnis, ist also NICHT Teil des content-seitigen EXEC_STEP_TIMEOUT
// (der deckt Sonde+Aktion ab). 10s reichen für Reload-Zyklus / React-Client-Navigation.
const EXEC_VERIFY_TIMEOUT = 10000;
const EXEC_VERIFY_POLL = 500;
// Datei-Brücke (Welle 39): Warte-/Transport-Grenzen.
const EXEC_DL_TIMEOUT = 20000; // auf den durch den Klick ausgelösten Download warten
const EXEC_DL_COMPLETE_TIMEOUT = 60000; // (Weg 2) auf „complete" der Disk-Datei warten
const EXEC_FILE_CAP = 50 * 1024 * 1024; // 50 MB Deckel für den Speicher-Weg
const EXEC_FILE_SINGLE_MAX = 8 * 1024 * 1024; // base64-Länge: darüber wird gechunkt
const EXEC_FILE_CHUNK = 4 * 1024 * 1024; // base64-Zeichen je Chunk
let execFileSeq = 0; // eindeutige fileId je Transport
// Tab-/Fenster-Folgen (Welle 43): so lange auf ein durch den Vorschritt geöffnetes Fenster/Popup
// warten (onCreated → onUpdated complete), bevor der nächste Schritt bewertet wird — analog
// EXEC_NAV_TIMEOUT, aber nur wenn wirklich ein neuer Tab lädt (execTabWaitWarranted).
const EXEC_TAB_WAIT_MS = 8000;

// ── Werte-Handling (lokal) ────────────────────────────────────────────────────
// chrome.storage.local.autoValues = { [automationId]: { [paramKey]: value } }.
// NUR wenn „merken" aktiv. Secrets ebenso (nur mit Häkchen). Werte verlassen den
// Browser NIE. Fail-silent — ohne gespeicherte Werte startet man eben mit leerem Feld.
async function loadAutoValues(automationId) {
  if (!automationId) return {};
  try {
    const r = await chrome.storage.local.get("autoValues");
    const all = r && r.autoValues && typeof r.autoValues === "object" ? r.autoValues : {};
    const one = all[automationId];
    return one && typeof one === "object" ? one : {};
  } catch (err) {
    return {};
  }
}

async function saveAutoValues(automationId, values) {
  if (!automationId) return;
  try {
    const r = await chrome.storage.local.get("autoValues");
    const all = r && r.autoValues && typeof r.autoValues === "object" ? r.autoValues : {};
    if (values && Object.keys(values).length) all[automationId] = values;
    else delete all[automationId];
    await chrome.storage.local.set({ autoValues: all });
  } catch (err) {
    /* Speichern optional — der Lauf funktioniert auch ohne Merken */
  }
}

async function clearAutoValues(automationId) {
  if (!automationId) return;
  try {
    const r = await chrome.storage.local.get("autoValues");
    const all = r && r.autoValues && typeof r.autoValues === "object" ? r.autoValues : {};
    delete all[automationId];
    await chrome.storage.local.set({ autoValues: all });
  } catch (err) {
    /* egal */
  }
}

// ── Liste ─────────────────────────────────────────────────────────────────────
async function showAutomations() {
  if (!hasToken) return; // Karte ist ohnehin nur mit Token sichtbar
  show("automations");
  setStatus("");
  els.autoListHint.hidden = true;
  els.autoList.textContent = "";
  const loading = document.createElement("p");
  loading.className = "note";
  loading.textContent = "Automationen werden geladen …";
  els.autoList.appendChild(loading);

  let body = null;
  try {
    const res = await fetch(appBase() + "/api/recorder/automations", {
      headers: { Authorization: "Bearer " + cfg.token },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    body = await res.json().catch(() => null);
  } catch (err) {
    els.autoList.textContent = "";
    els.autoListHint.textContent = "Die Automationen konnten nicht geladen werden.";
    els.autoListHint.hidden = false;
    return;
  }
  const list = body && Array.isArray(body.automations) ? body.automations : [];
  els.autoList.textContent = "";
  if (!list.length) {
    els.autoListHint.textContent =
      "Noch keine Automationen. In der Steply-Bibliothek ein Tutorial öffnen → „Als Automation nutzen“.";
    els.autoListHint.hidden = false;
    return;
  }
  for (const a of list) els.autoList.appendChild(buildAutomationCard(a));
}

function buildAutomationCard(a) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "auto-card";

  const emoji = document.createElement("span");
  emoji.className = "auto-card-emoji";
  emoji.setAttribute("aria-hidden", "true");
  emoji.textContent = "⚙️";
  row.appendChild(emoji);

  const main = document.createElement("span");
  main.className = "auto-card-main";
  const title = document.createElement("span");
  title.className = "auto-card-title";
  title.textContent = a.title || "Ohne Titel";
  main.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "auto-card-meta";
  const sc = Number(a.stepCount) || 0;
  const pc = Number(a.paramCount) || 0;
  const stepsTxt = sc === 1 ? "1 Schritt" : sc + " Schritte";
  const paramsTxt = pc === 1 ? "1 Parameter" : pc + " Parameter";
  meta.textContent = stepsTxt + " · " + paramsTxt;
  main.appendChild(meta);
  row.appendChild(main);

  row.addEventListener("click", () => showAutoPrep(a.id));
  return row;
}

// ── Vorbereitung ───────────────────────────────────────────────────────────────
async function showAutoPrep(automationId) {
  show("autoPrep");
  setStatus("");
  els.autoPrepHint.textContent = "";
  els.autoPrepHint.className = "status";
  els.autoPrepTitle.textContent = "Automation wird geladen …";
  els.autoDomainHint.textContent = "";
  els.autoParamForm.textContent = "";
  els.autoClearValues.hidden = true;

  // Detail laden (404 fremd / Fehler → zurück zur Liste mit Hinweis).
  let det = null;
  try {
    const res = await fetch(appBase() + "/api/recorder/automations/" + encodeURIComponent(automationId), {
      headers: { Authorization: "Bearer " + cfg.token },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    det = await res.json().catch(() => null);
  } catch (err) {
    els.autoPrepTitle.textContent = "";
    els.autoPrepHint.textContent = "Diese Automation konnte nicht geladen werden.";
    els.autoPrepHint.className = "status status-error";
    return;
  }
  if (!det || !det.automation || !Array.isArray(det.steps)) {
    els.autoPrepTitle.textContent = "";
    els.autoPrepHint.textContent = "Diese Automation ist unvollständig.";
    els.autoPrepHint.className = "status status-error";
    return;
  }

  exec.automation = det.automation;
  exec.steps = det.steps;
  exec.plan = [];
  exec.values = {};

  els.autoPrepTitle.textContent = exec.automation.title || "Automation";

  // (a) Domain-Hinweis (Sicherheit: WO wird gearbeitet).
  const domains = Array.isArray(exec.automation.site_domains) ? exec.automation.site_domains.filter(Boolean) : [];
  els.autoDomainHint.textContent = "";
  const dlead = document.createTextNode("Diese Automation arbeitet auf: ");
  els.autoDomainHint.appendChild(dlead);
  const dstrong = document.createElement("strong");
  dstrong.textContent = domains.length ? domains.join(", ") : "der aufgezeichneten Website";
  els.autoDomainHint.appendChild(dstrong);

  // (b) Parameter-Formular aus params (+ gespeicherte Werte vorbefüllen).
  const params = Array.isArray(exec.automation.params) ? exec.automation.params : [];
  const saved = await loadAutoValues(exec.automation.id);
  await buildParamForm(params, saved);
  els.autoClearValues.hidden = !(saved && Object.keys(saved).length);

  // (c) Modus: Halbautomatik ist Default.
  els.autoModeSemi.checked = true;
  els.autoModeAuto.checked = false;
}

// Parameter-Formular bauen: je Feld Label (required-Markierung), Input (secret → password)
// und eine Checkbox „Im Browser merken" (aktiv, wenn ein Wert gespeichert war).
async function buildParamForm(params, saved) {
  els.autoParamForm.textContent = "";
  saved = saved || {};
  if (!params.length) {
    const none = document.createElement("p");
    none.className = "note";
    none.textContent = "Diese Automation braucht keine Eingaben.";
    els.autoParamForm.appendChild(none);
    return;
  }
  for (const p of params) {
    if (!p || typeof p.key !== "string") continue;
    const wrap = document.createElement("div");
    wrap.className = "auto-param";
    wrap.dataset.key = p.key;

    const label = document.createElement("label");
    label.className = "auto-param-label";
    label.textContent = p.label || p.key;
    if (p.required) {
      const req = document.createElement("span");
      req.className = "auto-param-req";
      req.textContent = "*";
      req.title = "Pflichtfeld";
      label.appendChild(req);
    }

    const input = document.createElement("input");
    input.className = "auto-param-input";
    // Secrets als password-Input (maskiert). autocomplete aus, damit nichts vorschlägt.
    input.type = p.type === "secret" ? "password" : "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    const savedVal = Object.prototype.hasOwnProperty.call(saved, p.key) ? saved[p.key] : "";
    input.value = savedVal != null ? String(savedVal) : "";
    const inputId = "autoParam__" + p.key;
    input.id = inputId;
    label.setAttribute("for", inputId);

    const rememberWrap = document.createElement("label");
    rememberWrap.className = "auto-param-remember";
    const remember = document.createElement("input");
    remember.type = "checkbox";
    remember.className = "auto-param-remember-box";
    // War ein Wert gespeichert, ist „merken" vorab aktiv.
    remember.checked = Object.prototype.hasOwnProperty.call(saved, p.key);
    const rememberTxt = document.createElement("span");
    rememberTxt.textContent = "Im Browser merken";
    rememberWrap.appendChild(remember);
    rememberWrap.appendChild(rememberTxt);

    wrap.appendChild(label);
    wrap.appendChild(input);
    wrap.appendChild(rememberWrap);
    els.autoParamForm.appendChild(wrap);
  }
}

// Werte + „merken"-Häkchen aus dem Formular lesen. LIEFERT { values, toRemember }.
// values = alle aktuellen Feldwerte (für den Lauf, lokal); toRemember = nur die mit Häkchen.
function readParamForm() {
  const values = {};
  const toRemember = {};
  const rows = els.autoParamForm.querySelectorAll(".auto-param");
  rows.forEach((row) => {
    const key = row.dataset ? row.dataset.key : "";
    if (!key) return;
    const input = row.querySelector(".auto-param-input");
    const box = row.querySelector(".auto-param-remember-box");
    const val = input ? input.value : "";
    values[key] = val;
    if (box && box.checked) toRemember[key] = val;
  });
  return { values, toRemember };
}

async function onAutoClearValues() {
  if (!exec.automation) return;
  await clearAutoValues(exec.automation.id);
  // Felder leeren + Häkchen entfernen (nichts bleibt gespeichert).
  const rows = els.autoParamForm.querySelectorAll(".auto-param");
  rows.forEach((row) => {
    const input = row.querySelector(".auto-param-input");
    const box = row.querySelector(".auto-param-remember-box");
    if (input) input.value = "";
    if (box) box.checked = false;
  });
  els.autoClearValues.hidden = true;
  els.autoPrepHint.textContent = "Gespeicherte Werte gelöscht.";
  els.autoPrepHint.className = "status status-ok";
}

// ── Lauf: Port + Ping (Lebensader, Muster Welle 33) ────────────────────────────
let execPort = null;
let execPingTimer = null;
// Tab-/Fenster-Folgen (Welle 43): offene „get-tabs"-Anfragen an den background-Worker (er führt
// die lauf-zugehörige Tab-Menge je Port). Antwort kommt als Port-Nachricht „run-tabs".
let execRunTabsSeq = 0;
const execRunTabsPending = new Map();

function execPortOpen(tabId) {
  execPortClose();
  if (tabId == null) return;
  try {
    execPort = chrome.runtime.connect({ name: "steply-exec" });
    execPort.postMessage({ type: "bind", tabId });
    // Antworten des Workers auf get-tabs (Welle 43) den wartenden Anfragen zuordnen.
    execPort.onMessage.addListener((msg) => {
      if (!msg || msg.type !== "run-tabs") return;
      const done = execRunTabsPending.get(msg.reqId);
      if (done) done(Array.isArray(msg.tabs) ? msg.tabs : []);
    });
    execPort.onDisconnect.addListener(() => {
      execPort = null;
      if (!els.autoRun.hidden && exec.tabId != null && exec.running) {
        setTimeout(() => {
          if (!execPort && !els.autoRun.hidden && exec.tabId != null && exec.running) execPortOpen(exec.tabId);
        }, 0);
      }
    });
  } catch (err) {
    execPort = null;
  }
}

// Die lauf-zugehörige Tab-Menge vom Worker erfragen (Welle 43). Kurzer Timeout; scheitert der
// Port, liefert execRunTabs den Fallback „nur der gebundene Tab" (bestehendes Verhalten).
function execRequestRunTabs() {
  return new Promise((resolve) => {
    if (!execPort) {
      resolve(null);
      return;
    }
    const reqId = ++execRunTabsSeq;
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      execRunTabsPending.delete(reqId);
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 1500);
    execRunTabsPending.set(reqId, done);
    try {
      execPort.postMessage({ type: "get-tabs", reqId });
    } catch (e) {
      done(null);
    }
  });
}

function execPortClose() {
  if (execPort) {
    try {
      execPort.disconnect();
    } catch (err) {
      /* egal */
    }
    execPort = null;
  }
}

function execPingStart() {
  execPingStop();
  execPingTimer = setInterval(() => {
    if (exec.tabId != null) sendExecToTab({ type: "steply-exec-ping" });
  }, 20000);
}

function execPingStop() {
  if (execPingTimer) {
    clearInterval(execPingTimer);
    execPingTimer = null;
  }
}

function execLinkStart(tabId) {
  execPortOpen(tabId);
  execPingStart();
}

function execLinkStop() {
  execPingStop();
  execPortClose();
}

function sendExecToTab(msg) {
  if (exec.tabId == null) return;
  try {
    const p = chrome.tabs.sendMessage(exec.tabId, msg);
    if (p && p.catch) p.catch(() => {});
  } catch (err) {
    /* Tab evtl. ohne Content-Script — egal */
  }
}

// ── Lauf: Download-Hinweis ─────────────────────────────────────────────────────
let execDownloadHandler = null;
let execDownloadNoteTimer = null;

function execAddDownloadWatch() {
  if (!chrome.downloads || !chrome.downloads.onCreated) return;
  execDownloadHandler = () => showExecDownloadNote();
  try {
    chrome.downloads.onCreated.addListener(execDownloadHandler);
  } catch (err) {
    execDownloadHandler = null;
  }
}

function execRemoveDownloadWatch() {
  if (execDownloadHandler && chrome.downloads && chrome.downloads.onCreated) {
    try {
      chrome.downloads.onCreated.removeListener(execDownloadHandler);
    } catch (err) {
      /* egal */
    }
  }
  execDownloadHandler = null;
  if (execDownloadNoteTimer) {
    clearTimeout(execDownloadNoteTimer);
    execDownloadNoteTimer = null;
  }
}

function showExecDownloadNote() {
  if (els.autoRun.hidden || !els.autoDownloadNote) return;
  els.autoDownloadNote.hidden = false;
  if (execDownloadNoteTimer) clearTimeout(execDownloadNoteTimer);
  execDownloadNoteTimer = setTimeout(() => {
    if (els.autoDownloadNote) els.autoDownloadNote.hidden = true;
  }, 6000);
}

// ── Lauf: Ergebnis-Warteschlange (content.js meldet steply-exec-result zurück) ──
let execResultSeq = 0;
let execPending = null; // { token, resolve, timer }

function execSendStep(planStep, extra) {
  return new Promise((resolve) => {
    const token = ++execResultSeq;
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      if (execPending && execPending.token === token) execPending = null;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, reason: "timeout" }), EXEC_STEP_TIMEOUT);
    execPending = { token, resolve: done, timer };
    // Nachricht an den gebundenen Tab. value bleibt lokal — NIE geloggt.
    sendExecToTab({
      type: "steply-exec-step",
      token,
      step: {
        selector: planStep.selector,
        action: planStep.action,
        value: planStep.value,
        index: planStep.index,
        total: planStep.total,
        // Datei-Brücke (Welle 39): für Upload-Schritte die zuvor übertragene fileId.
        fileId: extra && extra.fileId != null ? extra.fileId : undefined,
      },
    });
  });
}

// ============================================================================
// DATEI-BRÜCKE (Welle 39): eine Datei von Website A herunterladen und auf Website B
// hochladen — komplett LOKAL durch den Browser gereicht. SICHERHEIT (nicht verhandelbar):
// Datei-Bytes leben NUR im Panel-Speicher (exec.files) + transient im Content-Script,
// gehen NIE an den Steply-Server oder in Logs, und werden bei jedem Lauf-Ende gelöscht.
// ============================================================================

// base64 aus einem ArrayBuffer (Panel-Kontext; für den file://-Fallback Weg 2).
function execAbToBase64(ab) {
  let bin = "";
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function execBasename(p) {
  const s = String(p || "").replace(/\\/g, "/");
  const i = s.lastIndexOf("/");
  return (i >= 0 ? s.slice(i + 1) : s).trim();
}

function execNameFromUrl(url) {
  try {
    const u = new URL(url);
    const base = execBasename(u.pathname);
    return base || "download";
  } catch (e) {
    return "download";
  }
}

// Lesbarer Datei-Name aus einem DownloadItem (Basisname des Pfads bzw. aus der URL).
function execDownloadName(item) {
  const fromFile = item && item.filename ? execBasename(item.filename) : "";
  if (fromFile) return fromFile;
  return execNameFromUrl((item && (item.finalUrl || item.url)) || "");
}

// Kompakte Größenanzeige für den Datei-Chip.
function fmtBytes(n) {
  const b = typeof n === "number" && isFinite(n) && n >= 0 ? n : 0;
  if (b < 1024) return b + " B";
  if (b < 1024 * 1024) return (b / 1024).toFixed(b < 10 * 1024 ? 1 : 0) + " KB";
  return (b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0) + " MB";
}

// ── Datei-Chip: transparent anzeigen, welche Datei(en) gerade getragen werden ──────────────
function execRenderFileChip() {
  if (!els.autoFileChip) return;
  const keys = Object.keys(exec.files || {});
  if (!keys.length) {
    els.autoFileChip.hidden = true;
    els.autoFileChip.textContent = "";
    return;
  }
  els.autoFileChip.textContent = keys
    .map((k) => {
      const f = exec.files[k];
      return "📄 " + (f.name || "Datei") + " (" + fmtBytes(f.size) + ") ✓";
    })
    .join("   ");
  els.autoFileChip.hidden = false;
}

// ── Weg 1: Refetch im Content-Script der Quellseite (credentials) ──────────────────────────
function execRefetchInTab(url) {
  if (exec.tabId == null) return Promise.resolve({ ok: false });
  return new Promise((resolve) => {
    try {
      const p = chrome.tabs.sendMessage(exec.tabId, { type: "steply-exec-refetch", url });
      if (p && p.then) p.then((r) => resolve(r || { ok: false }), () => resolve({ ok: false }));
      else resolve({ ok: false });
    } catch (e) {
      resolve({ ok: false });
    }
  });
}

// ── Weg 2: file://-Refetch aus dem Panel (nur mit erlaubtem Datei-Zugriff) ──────────────────
function execFileSchemeAllowed() {
  return new Promise((resolve) => {
    try {
      if (chrome.extension && typeof chrome.extension.isAllowedFileSchemeAccess === "function") {
        chrome.extension.isAllowedFileSchemeAccess((allowed) => resolve(!!allowed));
      } else {
        resolve(false);
      }
    } catch (e) {
      resolve(false);
    }
  });
}

async function execRefetchFileUrl(diskPath) {
  try {
    let p = String(diskPath || "").replace(/\\/g, "/");
    if (!/^file:/i.test(p)) p = "file:///" + p.replace(/^\/+/, "");
    const resp = await fetch(p);
    if (!resp.ok) return { ok: false };
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > EXEC_FILE_CAP) return { ok: false, reason: "too-large" };
    return {
      ok: true,
      b64: execAbToBase64(buf),
      size: buf.byteLength,
      mime: resp.headers.get("content-type") || "",
    };
  } catch (e) {
    return { ok: false };
  }
}

function execWaitDownloadComplete(id) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(r);
    };
    const onChanged = (delta) => {
      if (!delta || delta.id !== id) return;
      if (delta.state && delta.state.current === "complete") {
        try {
          chrome.downloads.search({ id }, (items) => finish(items && items[0] ? items[0] : null));
        } catch (e) {
          finish(null);
        }
      } else if (delta.state && delta.state.current === "interrupted") {
        finish(null);
      }
    };
    const cleanup = () => {
      try {
        chrome.downloads.onChanged.removeListener(onChanged);
      } catch (e) {
        /* egal */
      }
      clearTimeout(t);
    };
    try {
      chrome.downloads.onChanged.addListener(onChanged);
    } catch (e) {
      resolve(null);
      return;
    }
    const t = setTimeout(() => finish(null), EXEC_DL_COMPLETE_TIMEOUT);
    // Falls schon fertig, bevor der Listener stand.
    try {
      chrome.downloads.search({ id }, (items) => {
        const it = items && items[0];
        if (it && it.state === "complete") finish(it);
      });
    } catch (e) {
      /* egal */
    }
  });
}

// Einen ausgelösten Download einfangen: Weg 1 (Speicher-Refetch) → Weg 2 (Disk) → Weg 3 (Mensch).
async function execCaptureDownloadItem(item) {
  const name = execDownloadName(item);
  const url = (item && (item.finalUrl || item.url)) || "";

  // Weg 1: Refetch der Quell-URL im Content-Script (credentials). Erfolg → Download abbrechen
  // + aus der Historie tilgen (kein Disk-Müll).
  if (url && !/^blob:/i.test(url)) {
    const r = await execRefetchInTab(url);
    if (r && r.ok) {
      try {
        await chrome.downloads.cancel(item.id);
      } catch (e) {
        /* evtl. schon fertig — dann räumt erase auf */
      }
      try {
        await chrome.downloads.erase({ id: item.id });
      } catch (e) {
        /* egal */
      }
      return {
        ok: true,
        file: {
          name: r.name || name,
          mime: r.mime || item.mime || "application/octet-stream",
          size: typeof r.size === "number" ? r.size : 0,
          b64: r.b64,
        },
      };
    }
  }

  // Weg 2: Refetch scheitert → Download zu Ende laufen lassen und NUR mit Datei-Zugriff die
  // fertige Datei von der Platte lesen.
  const allowed = await execFileSchemeAllowed();
  if (allowed) {
    const done = await execWaitDownloadComplete(item.id);
    if (done && done.filename) {
      const r2 = await execRefetchFileUrl(done.filename);
      if (r2 && r2.ok) {
        return {
          ok: true,
          file: {
            name: name || execBasename(done.filename),
            mime: r2.mime || item.mime || "application/octet-stream",
            size: typeof r2.size === "number" ? r2.size : 0,
            b64: r2.b64,
          },
        };
      }
    }
  }

  // Weg 3: Mensch — die Datei liegt im Downloads-Ordner. Ehrliche Pause.
  return { ok: false, reason: "download-manual", name };
}

// Vor dem Download-Klick scharf schalten: den ERSTEN während dieses Schritts erzeugten
// Download einfangen. Timeout → „Download wurde nicht erkannt".
let execDownloadArm = null;
function execArmDownload() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(r);
    };
    const onCreated = (item) => {
      try {
        chrome.downloads.onCreated.removeListener(onCreated);
      } catch (e) {
        /* egal */
      }
      execCaptureDownloadItem(item).then(finish, () =>
        finish({ ok: false, reason: "download-capture-error" }),
      );
    };
    const cleanup = () => {
      try {
        chrome.downloads.onCreated.removeListener(onCreated);
      } catch (e) {
        /* egal */
      }
      clearTimeout(timer);
      execDownloadArm = null;
    };
    if (!chrome.downloads || !chrome.downloads.onCreated) {
      resolve({ ok: false, reason: "downloads-unavailable" });
      return;
    }
    try {
      chrome.downloads.onCreated.addListener(onCreated);
    } catch (e) {
      resolve({ ok: false, reason: "downloads-unavailable" });
      return;
    }
    const timer = setTimeout(() => finish({ ok: false, reason: "download-timeout" }), EXEC_DL_TIMEOUT);
    execDownloadArm = { finish };
  });
}

function execDisarmDownload() {
  if (execDownloadArm) execDownloadArm.finish({ ok: false, reason: "aborted" });
}

// Eine getragene Datei ans Content-Script übertragen (einteilig oder gechunkt bei >8 MB base64).
// Gibt die fileId zurück (der Upload-Schritt referenziert sie) oder null bei Fehler.
async function execTransferFileToTab(file) {
  if (exec.tabId == null || !file || !file.b64) return null;
  const fileId = "f" + ++execFileSeq;
  const b64 = file.b64;
  const plan =
    typeof SteplyExecPlan !== "undefined" && SteplyExecPlan.planFileChunks
      ? SteplyExecPlan.planFileChunks(b64.length, EXEC_FILE_SINGLE_MAX, EXEC_FILE_CHUNK)
      : { mode: b64.length > EXEC_FILE_SINGLE_MAX ? "chunked" : "single", chunks: 1, chunkSize: EXEC_FILE_CHUNK };
  try {
    if (plan.mode === "single") {
      const r = await chrome.tabs.sendMessage(exec.tabId, {
        type: "steply-exec-file",
        fileId,
        name: file.name,
        mime: file.mime,
        b64,
      });
      if (!r || !r.ok) return null;
    } else {
      const begin = await chrome.tabs.sendMessage(exec.tabId, {
        type: "steply-exec-file-begin",
        fileId,
        name: file.name,
        mime: file.mime,
        total: plan.chunks,
      });
      if (!begin || !begin.ok) return null;
      const cs = plan.chunkSize;
      for (let seq = 0; seq < plan.chunks; seq++) {
        const part = b64.slice(seq * cs, (seq + 1) * cs);
        const ack = await chrome.tabs.sendMessage(exec.tabId, {
          type: "steply-exec-file-chunk",
          fileId,
          seq,
          b64: part,
        });
        if (!ack || !ack.ok) return null;
      }
    }
    return fileId;
  } catch (e) {
    return null;
  }
}

// ── Lauf: Navigation zwischen Schritten ────────────────────────────────────────
function execWaitTabComplete(tabId) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        chrome.tabs.onUpdated.removeListener(onUpd);
      } catch (err) {
        /* egal */
      }
      clearTimeout(timer);
      // NICHT sofort weitermachen: erst die Hydration-Beruhigungspause (s. Konstante).
      setTimeout(resolve, EXEC_NAV_SETTLE_MS);
    };
    const onUpd = (id, changeInfo) => {
      if (id === tabId && changeInfo && changeInfo.status === "complete") finish();
    };
    try {
      chrome.tabs.onUpdated.addListener(onUpd);
    } catch (err) {
      finish();
      return;
    }
    const timer = setTimeout(finish, EXEC_NAV_TIMEOUT);
    // KEIN „Tab ist doch schon complete"-Frühstart mehr (Hotfix 06.07. abends, Richards
    // Timeout bei Schritt 1): Direkt nach tabs.update/create meldet chrome.tabs.get für
    // einen Wimpernschlag noch den complete-Status der ALTEN Seite — der Lauf schickte
    // den Schritt dann auf die sterbende Seite, die Navigation riss das Content-Script
    // weg und die Antwort kam nie (9s-Timeout-Miss). Beide Aufrufer rufen diese Funktion
    // NUR nach einer echten Navigation auf — ein onUpdated-complete kommt also immer;
    // EXEC_NAV_TIMEOUT bleibt als Sicherheitsnetz.
  });
}

// ── Lauf: Submit-Ergebnis-Kontrolle (Welle 38, Ehrlichkeits-Netz) ──────────────
// Nach einem Formular-Submit (content meldet submitted:true) prüfen, ob die Übermittlung
// wirklich durchkam — statt blind „ok" weiterzuschalten, während die Anmeldung real nicht
// durchkam (Richards Kaltstart-Login: die Seite lädt voll neu, landet wieder auf /login).
// EIGENES Budget (EXEC_VERIFY_TIMEOUT), läuft NACH dem content-Ergebnis.
//   • Tab verlässt den Formular-Pfad (Pfadwechsel, z. B. → /app) → "ok".
//   • Voll-Reload (loading→complete) zurück auf DENSELBEN Pfad → "bounced" (fehlgeschlagen).
// KEIN Auto-Retry (Sicherheit: kein Doppel-Submit von Logins) — der Nutzer entscheidet.
// Reine Klassifikation via SteplyExecPlan.submitOutcome (getestet in test-exec-plan).
function execVerifySubmit(prevUrl) {
  return new Promise((resolve) => {
    if (typeof SteplyExecPlan === "undefined" || exec.tabId == null) {
      resolve("ok");
      return;
    }
    const tabId = exec.tabId;
    const events = [];
    let done = false;
    const finish = (outcome) => {
      if (done) return;
      done = true;
      try {
        chrome.tabs.onUpdated.removeListener(onUpd);
      } catch (err) {
        /* egal */
      }
      clearInterval(poll);
      clearTimeout(timer);
      resolve(outcome);
    };
    const classify = () => {
      const o = SteplyExecPlan.submitOutcome(prevUrl, events);
      if (o === "left") finish("ok");
      else if (o === "bounced") finish("bounced");
      // "pending" → weiter beobachten
    };
    const onUpd = (id, changeInfo) => {
      if (id !== tabId || !changeInfo) return;
      if (changeInfo.status) events.push({ status: changeInfo.status });
      if (changeInfo.url) events.push({ url: changeInfo.url });
      classify();
    };
    let poll;
    try {
      chrome.tabs.onUpdated.addListener(onUpd);
    } catch (err) {
      resolve("ok");
      return;
    }
    poll = setInterval(async () => {
      const u = await tabUrlById(tabId);
      if (u) {
        events.push({ url: u });
        classify();
      }
    }, EXEC_VERIFY_POLL);
    const timer = setTimeout(() => {
      // Fenster aus: nur bei bewiesenem Voll-Reload-auf-selben-Pfad blockieren, sonst
      // NICHT (advance) — das Netz fängt gezielt den Reload-Bounce, keine Fehlalarme.
      finish(SteplyExecPlan.submitOutcome(prevUrl, events) === "bounced" ? "bounced" : "ok");
    }, EXEC_VERIFY_TIMEOUT);
  });
}

// ============================================================================
// ZUSTANDS-INTELLIGENZ (Welle 40): Der Lauf kommt mit dem Anmelde-Zustand klar.
// Richards Aufnahme-Konvention: Abläufe starten auf der Basis-Seite und ENTHALTEN die Login-
// Schritte. Beim Abspielen gilt VOR dem Schritt-Senden (nach jeder Navigation):
//   • Landet wie erwartet (needsNavigation false)          → normal weiter.
//   • Passt zu einem SPÄTEREN Schritt (resyncTarget)       → VORSPULEN (schon angemeldet).
//   • Fremde Login-Seite (looksLikeLoginUrl + Passwortfeld) → ANMELDE-WACHE (höflich warten).
//   • Passt zu gar nichts, keine Login-Seite               → ehrliche Pause „unexpected-page".
// SICHERHEIT: Die Wache tippt NIEMALS selbst Zugangsdaten — sie wartet nur und macht nach der
// (menschlichen) Anmeldung automatisch weiter. Werte fließen nie in Logs/Server.
// ============================================================================

// Secret-Parameter-Schlüssel der aktuellen Automation (für die Vorspul-Formulierung). Map
// {paramKey:true}. Führungen haben keine Parameter → leere Map.
function execSecretKeys() {
  const out = {};
  const params = exec.automation && Array.isArray(exec.automation.params) ? exec.automation.params : [];
  for (const p of params) if (p && p.type === "secret" && p.key) out[p.key] = true;
  return out;
}

// Den Anmelde-/Seitenzustand VOR dem aktuellen Schritt bewerten (rein lesend). Rückgabe:
//   { action: "proceed" }                     → aktuelle Seite passt zum aktuellen Schritt.
//   { action: "fast-forward", to }            → aktuelle Seite passt zu einem späteren Schritt.
//   { action: "pause-file", to }              → Vorspulen überspränge einen gebrauchten Download.
//   { action: "wait-login" }                  → fremde Login-Seite (Passwortfeld bestätigt).
//   { action: "unexpected" }                  → passt zu nichts und ist keine Login-Seite.
async function execEvaluateState() {
  if (typeof SteplyExecPlan === "undefined") return { action: "proceed" };
  const planStep = exec.plan[exec.index];
  if (!planStep) return { action: "proceed" };
  const curUrl = await tabUrlById(exec.tabId);
  // Auf der erwarteten Seite (oder Schritt ohne page_url)? → normal weiter.
  if (!SteplyExecPlan.needsNavigation(curUrl, planStep)) return { action: "proceed" };
  // Passt die aktuelle Seite zu einem SPÄTEREN Schritt? → Vorspulen (schon erreicht/angemeldet).
  const target = SteplyExecPlan.resyncTarget(curUrl, exec.plan, exec.index);
  if (target != null && target > exec.index) {
    if (SteplyExecPlan.skipCrossesNeededDownload(exec.plan, exec.index, target)) {
      return { action: "pause-file", to: target };
    }
    return { action: "fast-forward", to: target };
  }
  // Fremde Login-Seite (zu keinem Schritt passend)? Zusätzlich per Passwortfeld-Probe absichern.
  if (SteplyExecPlan.looksLikeLoginUrl(curUrl)) {
    const hasPw = await probePasswordField(exec.tabId);
    if (hasPw) return { action: "wait-login" };
  }
  return { action: "unexpected" };
}

// Entscheidung anwenden. Rückgabe „proceed", wenn execExecuteCurrent den aktuellen Schritt jetzt
// AUSFÜHREN soll; sonst ein anderes Token (die Entscheidung hat den Lauf bereits umgeleitet).
async function execApplyState() {
  const d = await execEvaluateState();
  if (!exec.running) return "aborted";
  switch (d.action) {
    case "fast-forward":
      execFastForwardTo(d.to);
      return "fast-forward";
    case "pause-file":
      exec.skipFileTarget = d.to;
      execEnterMiss("skip-needs-file");
      return "pause-file";
    case "wait-login":
      execEnterWaitLogin();
      return "wait-login";
    case "unexpected":
      execEnterMiss("unexpected-page");
      return "unexpected";
    default:
      return "proceed";
  }
}

// VORSPULEN: den Index auf einen späteren Schritt setzen (die dazwischen liegende Strecke ist
// bereits erledigt, z. B. weil der Nutzer schon angemeldet ist) und das im Lauf sichtbar machen.
function execFastForwardTo(to) {
  const from = exec.index;
  const login = SteplyExecPlan.skipCrossesLogin(exec.plan, from, to, execSecretKeys());
  exec.index = to;
  exec.skipNote = { from: from, to: to, login: login };
  if (exec.autoMode && !exec.paused) {
    exec.phase = "running";
    execRenderRun();
    setTimeout(() => {
      if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent();
    }, EXEC_AUTO_GAP);
  } else {
    exec.phase = "ready";
    execRenderRun();
  }
}

// Text der Vorspul-Notiz (Richards Verzweigungs-Metapher): enthielt die übersprungene Strecke
// Login-Schritte → „Angemeldet? → Ja ✓", sonst generisch „Bereits erledigt ✓". X–Y sind die
// 1-basierten übersprungenen Schrittnummern (from+1 … to). Für einen BEDINGTEN SPRUNG (Welle 47,
// note.jump) eine eigene „↪"-Formulierung mit der 1-basierten Zielschrittnummer (to+1).
function execSkipNoteText(note) {
  if (!note) return "";
  if (note.jump) {
    const target = note.to + 1; // 1-basierte Zielschrittnummer
    return note.login
      ? "↪ Login übersprungen — weiter bei Schritt " + target + " (bereits angemeldet)."
      : "↪ Block übersprungen — weiter bei Schritt " + target + ".";
  }
  const a = note.from + 1;
  const b = note.to;
  const range = a >= b ? "Schritt " + a : "Schritte " + a + "–" + b;
  return note.login
    ? "Angemeldet? → Ja ✓ — " + range + " übersprungen."
    : "Bereits erledigt ✓ — " + range + " übersprungen (Seite schon erreicht).";
}

// ============================================================================
// BEDINGTER SPRUNG / BLOCK-ÜBERSPRINGEN (Welle 47). Richards Kernbedarf: eine Automation soll
// ein- UND ausgeloggt laufen. Ein Schritt trägt einen jump {when, to_position}; erfüllt when auf
// der AKTUELLEN Seite (z. B. „Anmelden-Knopf NICHT da" = schon eingeloggt), springt der Lauf
// VORWÄRTS zu to_position und überspringt den ganzen (Login-)Block — GANZ VOR der Navigation,
// sodass die Login-/Google-page_urls der übersprungenen Schritte nie angefahren werden.
// ============================================================================

// when des Sprungs auf dem AKTUELLEN Tab prüfen und ggf. springen. Rückgabe true, wenn der Sprung
// den Lauf umgeleitet ODER (bei Datei-Konflikt) ehrlich pausiert hat — dann führt execExecuteCurrent
// den tragenden Schritt NICHT aus. false → normal weitermachen (Tab/Navigation/W40/W42).
// WICHTIG: NICHT zur page_url des tragenden Schritts navigieren — die Prüfung läuft auf dem Tab,
// auf dem der Lauf gerade steht (Vorgängerseite), genau wie im echten Login-Fall gefordert.
async function execTryJump(planStep) {
  const jump = planStep && planStep.jump;
  if (!jump || !jump.when) return false;
  let urlMatch = false;
  let elementFound = false;
  if (jump.when.kind === "url") {
    const curUrl = await tabUrlById(exec.tabId);
    urlMatch = SteplyExecPlan.evalUrlCondition(curUrl, jump.when);
  } else if (jump.when.kind === "element") {
    elementFound = await execEvalElementCondition(exec.tabId, jump.when);
  }
  if (!exec.running) return false;
  // „when erfüllt?" via der GETEILTEN negate-Autorität (W42). Erfüllt → springen.
  if (!SteplyExecPlan.shouldRunStep(jump.when, { urlMatch: urlMatch, elementFound: elementFound })) {
    return false;
  }
  const target = SteplyExecPlan.jumpTargetIndex(exec.plan, exec.index, jump.to_position);
  if (target == null || target <= exec.index) return false; // kein Vorwärts-Ziel → normal weiter
  // Datei-Kohärenz: enthält die übersprungene Strecke einen Download, den ein SPÄTERER (nicht
  // übersprungener) Upload braucht? Dann NICHT stumm überspringen → ehrliche Pause (wie W40).
  if (SteplyExecPlan.skipCrossesNeededDownload(exec.plan, exec.index, target)) {
    exec.skipFileTarget = target;
    execEnterMiss("skip-needs-file");
    return true;
  }
  execJumpTo(target);
  return true;
}

// SPRINGEN: den Index auf das (spätere) Ziel setzen und den übersprungenen Block sichtbar machen.
// „↪ Login übersprungen …" wenn die Strecke nach Login riecht (skipCrossesLogin), sonst generisch.
// Endlos-/Doppelsprung-Schutz: NUR VORWÄRTS (target > exec.index, garantiert durch jumpTargetIndex)
// → der Index wächst strikt, ein Ziel-Schritt darf selbst wieder springen (immer weiter nach vorn).
function execJumpTo(to) {
  const from = exec.index;
  const login = SteplyExecPlan.skipCrossesLogin(exec.plan, from, to, execSecretKeys());
  exec.index = to;
  exec.skipNote = { from: from, to: to, login: login, jump: true };
  if (to >= exec.plan.length) {
    // Sprung ans Ende → Lauf ist fertig (nichts mehr auszuführen).
    execFinish("success");
    return;
  }
  if (exec.autoMode && !exec.paused) {
    exec.phase = "running";
    execRenderRun();
    setTimeout(() => {
      if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent();
    }, EXEC_AUTO_GAP);
  } else {
    exec.phase = "ready";
    execRenderRun();
  }
}

// ANMELDE-WACHE: höflich warten, bis der Mensch sich angemeldet hat. KEIN Timeout (er darf
// trödeln). Kein Overlay ist aktiv (wir haben noch keinen Schritt gesendet) → nichts zu räumen;
// zur Sicherheit trotzdem ein exec-hide, damit der Tab während der Anmeldung sauber ist.
function execEnterWaitLogin() {
  exec.paused = true; // Vollautomatik anhalten, bis die Anmeldung durch ist
  exec.phase = "waiting-login";
  sendExecToTab({ type: "steply-exec-hide" });
  execRenderRun();
}

// Nach erreichter (erwarteter) Seite aus der Anmelde-Wache heraus fortsetzen — im jeweiligen Modus.
function execResumeAfterLogin() {
  if (exec.autoMode) {
    exec.paused = false;
    exec.phase = "running";
    execRenderRun();
    setTimeout(() => {
      if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent();
    }, EXEC_AUTO_GAP);
  } else {
    exec.phase = "ready";
    execRenderRun();
  }
}

// UNERWARTETE Navigation während des Laufs (Tab landet woanders): nur ZWISCHEN den Schritten
// (ready) oder im Warten (waiting-login) auswerten — NIE mitten in einer Aktion (executing) oder
// während die Welle-38-Submit-Kontrolle ihr Fenster hat (verifying). Re-Entrance-geschützt.
async function execHandleUnexpectedNav() {
  if (!exec.running || exec.stateBusy || exec.verifying) return;
  if (exec.phase !== "waiting-login" && exec.phase !== "ready") return;
  exec.stateBusy = true;
  try {
    // Tab-/Fenster-Folgen (Welle 43): auch zwischen den Schritten / im Warten einem neu
    // geöffneten Fenster (OAuth-Popup) folgen bzw. nach dessen Schließen zum Opener zurück,
    // BEVOR wir den Zustand bewerten (der Zustand gilt für den dann gebundenen Tab).
    const planStep = exec.plan[exec.index];
    if (planStep) await execSelectTabForStep(planStep);
    if (!exec.running) return;
    const d = await execEvaluateState();
    if (!exec.running) return;
    switch (d.action) {
      case "proceed":
        // Erwartete Seite (wieder) erreicht: aus dem Warten heraus fortsetzen; im Ready-Idle bleiben.
        if (exec.phase === "waiting-login") execResumeAfterLogin();
        break;
      case "fast-forward":
        if (exec.phase === "waiting-login" && exec.autoMode) exec.paused = false;
        execFastForwardTo(d.to);
        break;
      case "pause-file":
        exec.skipFileTarget = d.to;
        execEnterMiss("skip-needs-file");
        break;
      case "wait-login":
        if (exec.phase !== "waiting-login") execEnterWaitLogin();
        // schon im Warten → geduldig weiter warten (kein Timeout)
        break;
      case "unexpected":
        // Im Warten geduldig bleiben (Mensch trödelt evtl. auf einer Zwischenseite); im
        // Ready-Idle ehrliche Pause.
        if (exec.phase === "ready") execEnterMiss("unexpected-page");
        break;
    }
  } finally {
    exec.stateBusy = false;
  }
}

// ============================================================================
// TAB-/FENSTER-FOLGEN (Welle 43): der Lauf folgt automatisch in während des Laufs geöffnete
// Tabs, Fenster und OAuth-Popups. Statt starr an exec.tabId zu kleben, wählen wir VOR jedem
// Schritt den Tab, dessen URL zur page_url passt (aus der lauf-zugehörigen Menge des Workers) —
// und binden den Lauf dorthin um + AKTIVIEREN ihn (Tab in den Vordergrund, Fenster fokussieren).
// So überstehen Läufe „Über Google anmelden"-Popups (separates Fenster) und neu geöffnete Tabs,
// die die Engine sonst nicht durchsucht (Richards erster echter Test: WeTransfer + Google-Popup).
// ============================================================================

// Die lauf-zugehörige Tab-Menge (mit URL/Fenster/Fokus/Status) besorgen. Fallback ohne Worker/
// Port: nur der aktuell gebundene Tab — dann verhält sich der Lauf wie vor Welle 43.
async function execRunTabs() {
  const viaPort = await execRequestRunTabs();
  if (Array.isArray(viaPort) && viaPort.length) return viaPort;
  const url = await tabUrlById(exec.tabId);
  let windowId = null;
  try {
    const t = exec.tabId != null ? await chrome.tabs.get(exec.tabId) : null;
    if (t && t.windowId != null) windowId = t.windowId;
  } catch (e) {
    /* egal */
  }
  return exec.tabId != null
    ? [{ tabId: exec.tabId, url, windowId, lastFocusedMs: 0, active: true, status: "complete" }]
    : [];
}

// Einen Tab in den Vordergrund holen: Tab aktivieren + sein Fenster fokussieren (Bug 1 aus
// Richards Test — der neue Tab öffnete zwar, wurde aber nicht aktiviert; der Lauf hing).
async function execActivateTab(tabId, windowId) {
  if (tabId == null) return;
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch (e) {
    /* Tab evtl. weg — egal */
  }
  if (windowId != null) {
    try {
      await chrome.windows.update(windowId, { focused: true });
    } catch (e) {
      /* Fenster evtl. weg — egal */
    }
  }
}

// Lohnt es, auf einen (noch ladenden) neuen Tab/ein Popup zu warten? Ja, wenn der gebundene Tab
// nicht mehr in der Menge ist (Popup schloss sich → Opener lädt gerade nach) ODER ein ZUSÄTZLICHER
// lauf-zugehöriger Tab gerade lädt / noch keine URL hat (frisch geöffnetes Fenster/Popup). Ein
// gewöhnlicher Lauf (nur der gebundene Tab in der Menge) wartet NIE — keine Verzögerung.
function execTabWaitWarranted(tabs) {
  if (!Array.isArray(tabs) || tabs.length === 0) return false;
  const boundPresent = tabs.some((t) => t.tabId === exec.tabId);
  if (!boundPresent) return true;
  return tabs.some((t) => t.tabId !== exec.tabId && (t.status === "loading" || !t.url));
}

// VOR jedem Schritt: den Tab wählen, dessen URL zur page_url passt, und den Lauf dorthin umbinden
// + aktivieren. Öffnete der Vorschritt ein neues Fenster/Popup, folgt der Lauf dorthin; schloss
// sich ein Popup, kehrt er zum Opener zurück. Rückgabe true, wenn umgebunden wurde (informativ).
// Wechselwirkung: läuft VOR execNavigateIfNeeded/execEvaluateState, damit Navigation, Zustands-
// prüfung (W40) und Bedingung (W42) garantiert im RICHTIGEN Fenster stattfinden.
async function execSelectTabForStep(planStep) {
  if (typeof SteplyExecPlan === "undefined" || typeof SteplyExecPlan.pickTabForStep !== "function") return false;
  if (!planStep) return false;
  let tabs = await execRunTabs();
  // preferTabId = der aktuell gebundene Tab (Welle 46): ein reiner In-Page-Schritt (Dropdown/Menü
  // öffnen, keine Navigation, kein neuer Tab) bleibt am gebundenen Tab, wenn dieser selbst zum
  // Schritt passt — statt fälschlich an eine zweite, gleich-URL-Kopie umzubinden (dort läuft der
  // Klick sonst im falschen Tab / hängt). Bei einer ECHTEN Tab-Folge passt der gebundene Tab nicht
  // mehr → preferTabId ist kein Kandidat, die Welle-43-Wahl greift unverändert.
  let pick = SteplyExecPlan.pickTabForStep(planStep, tabs, exec.tabId);
  // Reaktives Popup/Neuer Tab: passt (noch) nichts, aber ein Fenster wird gerade geöffnet →
  // kurz warten und erneut prüfen (onCreated → onUpdated complete), analog execWaitTabComplete.
  if (pick == null && execTabWaitWarranted(tabs)) {
    const t0 = Date.now();
    while (Date.now() - t0 < EXEC_TAB_WAIT_MS && exec.running) {
      await new Promise((r) => setTimeout(r, 200));
      tabs = await execRunTabs();
      pick = SteplyExecPlan.pickTabForStep(planStep, tabs, exec.tabId);
      if (pick != null) break;
      if (!execTabWaitWarranted(tabs)) break;
    }
  }
  if (pick == null) return false; // kein passender Lauf-Tab → beim aktuellen bleiben (navigateIfNeeded trägt)
  const info = tabs.find((t) => t.tabId === pick) || null;
  const windowId = info ? info.windowId : null;
  if (pick !== exec.tabId) {
    // Umbinden: Overlay auf dem ALTEN Tab abräumen, dann exec.tabId umsetzen. Den bestehenden
    // Port NICHT neu öffnen (das würde die Worker-Session mitsamt Tab-Menge verwerfen) — dem
    // Worker nur die neue Bindung nennen (rebind), damit sein Overlay-Abräumen den richtigen
    // Tab trifft. Content-Script im neuen Tab sicherstellen.
    sendExecToTab({ type: "steply-exec-hide" });
    exec.tabId = pick;
    if (execPort) {
      try {
        execPort.postMessage({ type: "rebind", tabId: exec.tabId });
      } catch (e) {
        /* egal */
      }
    }
    try {
      chrome.runtime.sendMessage({ type: "steply-ensure-content" });
    } catch (e) {
      /* egal */
    }
    await execActivateTab(pick, windowId);
    return true;
  }
  // Schon gebunden — sicherstellen, dass er im Vordergrund ist (Overlay/Maus im richtigen Fenster).
  await execActivateTab(pick, windowId);
  return false;
}

async function execNavigateIfNeeded(planStep) {
  const curUrl = await tabUrlById(exec.tabId);
  if (typeof SteplyExecPlan === "undefined") return;
  if (!SteplyExecPlan.needsNavigation(curUrl, planStep)) return;
  if (!planStep.page_url) return;
  try {
    await chrome.tabs.update(exec.tabId, { url: planStep.page_url });
    await execWaitTabComplete(exec.tabId);
    // Content-Scripts nach der Navigation sicher da (deklarativ ohnehin; Nachimpfung schadet nicht).
    try {
      chrome.runtime.sendMessage({ type: "steply-ensure-content" });
    } catch (err) {
      /* egal */
    }
  } catch (err) {
    /* Navigation fehlgeschlagen — der Schritt läuft dann mit Miss/Pause auf */
  }
}

// „Bring mich hin" (Welle 37, Fix 2): bringt den Nutzer wirklich an die STARTSEITE von
// Schritt 1 — nicht nur auf die richtige Domain. Vergleich jetzt Host + PFAD via
// SteplyExecPlan.needsNavigation:
//   • Schritt 1 braucht KEINE Navigation (gleiche Seite) → hier bleiben.
//   • gleiche Basis-Domain, anderer Pfad → im GEBUNDENEN Tab navigieren (kein neuer Tab).
//   • andere Domain (oder curUrl unlesbar/chrome://) → NEUER Tab + Lauf umbinden (wie bisher).
//   • Schritt 1 ohne page_url → hier bleiben (wie bisher).
async function execEnsureStartTab(firstStep) {
  if (typeof SteplyExecPlan === "undefined") return;
  const pageUrl = firstStep && typeof firstStep.page_url === "string" ? firstStep.page_url : "";
  if (!pageUrl) return; // keine Startseite → aktueller Tab (wie bisher)

  const curUrl = await tabUrlById(exec.tabId);
  // Ist Schritt 1 (Host ODER Pfad) schon erreicht? Dann NICHT umziehen.
  if (!SteplyExecPlan.needsNavigation(curUrl, firstStep)) return;

  // Navigation nötig. Sind wir auf DERSELBEN Website (Basis-Domain bzw. site_domains) und ist
  // die aktuelle URL lesbar? → im gebundenen Tab navigieren. Sonst → neuer Tab + umbinden.
  let sameSite = false;
  if (typeof SteplySiteMatch !== "undefined") {
    const curHost = SteplySiteMatch.hostnameOf(curUrl);
    const targetHost = SteplySiteMatch.hostnameOf(pageUrl);
    if (curHost && targetHost) {
      if (baseDomain(curHost) === baseDomain(targetHost)) {
        sameSite = true;
      } else {
        const domains = Array.isArray(exec.automation.site_domains) ? exec.automation.site_domains : null;
        if (domains) {
          for (const d of domains) {
            if (SteplySiteMatch.matchesDomain(curHost, d)) {
              sameSite = true;
              break;
            }
          }
        }
      }
    }
  }

  if (sameSite) {
    // Gleiche Website, anderer Pfad → im GEBUNDENEN Tab zur Startseite navigieren.
    try {
      await chrome.tabs.update(exec.tabId, { url: pageUrl });
      await execWaitTabComplete(exec.tabId);
      try {
        chrome.runtime.sendMessage({ type: "steply-ensure-content" });
      } catch (err) {
        /* egal */
      }
    } catch (err) {
      /* Navigation fehlgeschlagen — der Lauf läuft dann mit Miss/Pause auf */
    }
    return;
  }

  // Andere Domain (oder curUrl unlesbar/chrome://) → NEUER Tab auf der Startseite + umbinden.
  try {
    const tab = await chrome.tabs.create({ url: pageUrl, active: true });
    if (tab && tab.id != null) {
      exec.tabId = tab.id;
      await execWaitTabComplete(exec.tabId);
    }
  } catch (err) {
    /* Tab ließ sich nicht öffnen → aktueller Tab (Fallback) */
  }
}

// ── Lauf: Server-Events (best effort; NIE mit Parameter-Werten) ─────────────────
async function execPostStart() {
  if (!cfg.token || !exec.automation) return null;
  try {
    const res = await fetch(appBase() + "/api/recorder/automation-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: cfg.token,
        automationId: exec.automation.id,
        event: "start",
        mode: exec.mode,
      }),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body && body.runId ? body.runId : null;
  } catch (err) {
    return null;
  }
}

async function execPostFinish(status, detail) {
  if (!cfg.token || !exec.runId) return;
  const body = { token: cfg.token, runId: exec.runId, event: "finish", status: status };
  body.currentStep = exec.index + 1;
  // detail NIE mit Parameter-Werten — zusätzlich durch redactDetail als Sicherheitsnetz.
  if (detail && typeof SteplyExecPlan !== "undefined") {
    const red = SteplyExecPlan.redactDetail(detail);
    if (red) body.detail = red;
  }
  try {
    await fetch(appBase() + "/api/recorder/automation-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    /* Fehler still — der Lauf ist für den Nutzer trotzdem beendet */
  }
}

// ── Lauf: Start ─────────────────────────────────────────────────────────────────
async function startAutoRun() {
  if (!exec.automation) return;
  els.autoPrepHint.textContent = "";
  els.autoPrepHint.className = "status";
  if (typeof SteplyExecPlan === "undefined") {
    els.autoPrepHint.textContent = "Ausführ-Modul nicht geladen — Extension bitte neu laden.";
    els.autoPrepHint.className = "status status-error";
    return;
  }

  // Werte lesen + (nur mit Häkchen) merken.
  const { values, toRemember } = readParamForm();
  exec.values = values;
  exec.mode = els.autoModeAuto && els.autoModeAuto.checked ? "auto" : "semi";
  exec.autoMode = exec.mode === "auto";

  // Plan bauen — wirft bei fehlendem Pflicht-Parameter (VOR jedem Tab-Zugriff).
  try {
    exec.plan = SteplyExecPlan.buildRunPlan(exec.automation, exec.steps, exec.values);
  } catch (err) {
    els.autoPrepHint.textContent = err && err.message ? err.message : "Eingaben unvollständig.";
    els.autoPrepHint.className = "status status-error";
    return;
  }
  if (!exec.plan.length) {
    els.autoPrepHint.textContent = "Diese Automation hat keine Schritte.";
    els.autoPrepHint.className = "status status-error";
    return;
  }

  // Merken (lokal, nur Häkchen-Felder). Werte verlassen den Browser nie.
  await saveAutoValues(exec.automation.id, toRemember);

  // Tab binden + ggf. zur Startseite bringen.
  exec.tabId = await guideActiveTabId();
  try {
    chrome.runtime.sendMessage({ type: "steply-ensure-content" });
  } catch (err) {
    /* egal */
  }
  await execEnsureStartTab(exec.plan[0]);

  // Server-Lauf registrieren (best effort).
  exec.runId = await execPostStart();

  exec.index = 0;
  exec.running = true;
  exec.paused = false;
  exec.finished = false;
  exec.lastMissReason = "";
  exec.lastMissDetail = "";
  exec.skipNote = null; // Zustands-Intelligenz (Welle 40): frischer Lauf, keine Vorspul-Notiz
  exec.condSkip = null; // Bedingte Schritte (Welle 42): frischer Lauf, kein übersprungener Schritt
  exec.verifying = false;
  exec.stateBusy = false;
  exec.files = {}; // Datei-Brücke (Welle 39): frischer Lauf trägt keine Alt-Datei
  execLinkStart(exec.tabId);
  execAddDownloadWatch();

  show("autoRun");
  if (els.autoDownloadNote) els.autoDownloadNote.hidden = true;
  execRenderFileChip();

  if (exec.autoMode) {
    exec.phase = "running";
    execRenderRun();
    // execExecuteCurrent führt selbst die Zustandsprüfung durch (nach execNavigateIfNeeded).
    setTimeout(() => {
      if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent();
    }, EXEC_AUTO_GAP);
  } else {
    // Halbautomatik: proaktive Zustandsprüfung, damit Anmelde-Wache/Vorspulen/Pause sofort
    // sichtbar sind (statt erst beim ersten „Ausführen"). „proceed" ⇒ bereit für Schritt 1.
    const decided = await execApplyState();
    if (exec.running && decided === "proceed") {
      exec.phase = "ready";
      execRenderRun();
    }
  }
}

// ── Lauf: einen Schritt ausführen ────────────────────────────────────────────────
async function execExecuteCurrent() {
  if (!exec.running || exec.phase === "executing") return;
  const planStep = exec.plan[exec.index];
  if (!planStep) {
    execFinish("success");
    return;
  }
  exec.phase = "executing";
  execRenderRun();

  // Bedingter Sprung / Block-Überspringen (Welle 47): GANZ AM ANFANG — VOR Tab-Auswahl UND
  // Navigation (kritisch!). Trägt der Schritt einen jump, werten wir seine when-Bedingung auf dem
  // AKTUELLEN Tab aus (NICHT erst zur — evtl. Login-/Google- — page_url navigieren; das ist der
  // ganze Punkt). Erfüllt → den ganzen Block überspringen, sodass der Lauf gar nicht erst zu
  // Login/Google navigiert. Nicht erfüllt → normal weiter (Tab-Auswahl, Navigation, W40, W42).
  if (planStep.jump && typeof SteplyExecPlan !== "undefined") {
    const jumped = await execTryJump(planStep);
    if (!exec.running) return;
    if (jumped) return; // der Sprung hat den Lauf umgeleitet (oder ehrlich pausiert)
  }

  // Tab-/Fenster-Folgen (Welle 43): ZUERST in den Tab wechseln, dessen URL zum Schritt passt
  // (neuer Tab / OAuth-Popup / Rückkehr nach Popup-Schluss) — VOR Navigation, Zustandsprüfung
  // und Bedingung, damit alles Weitere im richtigen Fenster geschieht.
  await execSelectTabForStep(planStep);
  if (!exec.running) return;

  await execNavigateIfNeeded(planStep);
  if (!exec.running) return; // mitten in der Navigation abgebrochen

  // Zustands-Intelligenz (Welle 40): VOR dem Schritt-Senden den Anmelde-/Seitenzustand prüfen.
  // Nicht „proceed" ⇒ die Entscheidung (Vorspulen/Anmelde-Wache/Pause) hat den Lauf umgeleitet.
  const decided = await execApplyState();
  if (!exec.running) return;
  if (decided !== "proceed") return;

  // Bedingte Schritte (Welle 42): NACH Navigation/Settle + Zustandsprüfung die condition des NUN
  // aktuellen Schritts auswerten. Nicht erfüllt ⇒ Schritt nahtlos überspringen (keine Pause).
  if (planStep.condition) {
    const runIt = await execStepConditionMet(planStep);
    if (!exec.running) return;
    if (!runIt) {
      execSkipConditional(planStep);
      return;
    }
  }

  const fm = planStep.file_meta || null;

  // ── Datei-Brücke (Welle 39): UPLOAD ──────────────────────────────────────────
  // Die getragene Datei ins Feld/die Drop-Zone legen. Fehlt sie (Weg-3-Fall beim Download),
  // ehrliche Pause statt blindem Weiterlaufen.
  if (planStep.action === "upload") {
    const file = fm && fm.source ? exec.files[fm.source] : null;
    if (!file) {
      execEnterMiss("file-missing");
      return;
    }
    const fileId = await execTransferFileToTab(file);
    if (!exec.running) return;
    if (!fileId) {
      execEnterMiss("file-transfer");
      return;
    }
    const res = await execSendStep(planStep, { fileId });
    if (!exec.running) return;
    if (res && res.ok) execAdvance();
    else execEnterMiss(res ? res.reason : "unbekannt");
    return;
  }

  // ── Datei-Brücke (Welle 39): DOWNLOAD ────────────────────────────────────────
  // VOR dem Klick scharf schalten, dann klicken; die dabei ausgelöste Datei einfangen.
  let dlPromise = null;
  if (fm && fm.role === "download") dlPromise = execArmDownload();

  // Tab-URL VOR dem Submit merken — Grundlage der Ergebnis-Kontrolle (Welle 38).
  const preSubmitUrl = await tabUrlById(exec.tabId);
  const res = await execSendStep(planStep);
  if (!exec.running) {
    if (dlPromise) execDisarmDownload();
    return; // während des Wartens abgebrochen
  }

  if (res && res.ok) {
    // Download-Schritt: auf den ausgelösten Download warten und ihn tragen (oder ehrliche Pause).
    if (dlPromise) {
      const cap = await dlPromise;
      if (!exec.running) return;
      if (!cap.ok) {
        execEnterMiss(cap.reason || "download-missing", cap.name || "");
        return;
      }
      exec.files[fm.key] = cap.file;
      execRenderFileChip();
    }
    // War die Aktion ein Formular-Submit? Dann VOR dem Weiterschalten verifizieren, dass die
    // Übermittlung wirklich durchkam (nicht nur ein Voll-Reload auf denselben Pfad).
    if (res.submitted) {
      // Welle-38-Submit-Kontrolle hat VORRANG vor der Welle-40-Zustandsprüfung: verifying sperrt
      // den unerwartete-Navigation-Wächter, damit er dieses Fenster nicht kapert.
      exec.verifying = true;
      const outcome = await execVerifySubmit(preSubmitUrl);
      exec.verifying = false;
      if (!exec.running) return; // während der Verifikation abgebrochen
      if (outcome === "bounced") {
        execEnterMiss("submit-bounced");
        return;
      }
    }
    execAdvance();
  } else {
    if (dlPromise) execDisarmDownload();
    execEnterMiss(res ? res.reason : "unbekannt");
  }
}

function execAdvance() {
  exec.index++;
  if (exec.index >= exec.plan.length) {
    execFinish("success");
    return;
  }
  if (exec.autoMode && !exec.paused) {
    exec.phase = "running";
    execRenderRun();
    setTimeout(() => {
      if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent();
    }, EXEC_AUTO_GAP);
  } else {
    exec.phase = "ready";
    execRenderRun();
  }
}

// Bedingte Schritte (Welle 42): der aktuelle Schritt wird ÜBERSPRUNGEN, weil seine condition
// nicht erfüllt ist (Cookie-Banner nicht da / URL passt nicht). Nahtlos weiter (KEINE Pause),
// dezente Protokoll-Notiz „⏭ Schritt X übersprungen (Bedingung nicht erfüllt)".
// DATEI-KOHÄRENZ: Trägt der übersprungene Schritt einen DOWNLOAD, dessen Datei ein SPÄTERER
// (nicht übersprungener) Upload braucht (skipCrossesNeededDownload über die Ein-Schritt-Strecke
// [i, i+1)), dann NICHT stumm überspringen — sonst hätte der Upload keine Datei. Ehrliche Pause
// (Muster Welle-40 „skip-needs-file"): der Mensch startet neu oder wählt die Datei beim Upload.
function execSkipConditional(planStep) {
  if (
    typeof SteplyExecPlan !== "undefined" &&
    SteplyExecPlan.skipCrossesNeededDownload(exec.plan, exec.index, exec.index + 1)
  ) {
    execEnterMiss("cond-skip-needs-file");
    return;
  }
  exec.condSkip = { index: exec.index, title: planStep ? planStep.title || "" : "" };
  execAdvance();
}

// Selektor-Miss/mehrdeutig → PAUSE (kein Fallback-Klick, Sicherheitsregel 1).
// detail: optionaler Zusatz (z. B. Dateiname bei „download-manual") — nur Anzeige, nie Server.
function execEnterMiss(reason, detail) {
  exec.lastMissReason = typeof reason === "string" ? reason : "";
  exec.lastMissDetail = typeof detail === "string" ? detail : "";
  exec.paused = true; // Vollautomatik anhalten
  exec.phase = "miss";
  execRenderRun();
}

// „Weiter" nach einem Miss: der Nutzer hat den Schritt selbst erledigt → als erledigt
// überspringen und weiterlaufen (in der Vollautomatik automatisch fortsetzen). Ausnahmen der
// Zustands-Intelligenz (Welle 40):
//   • „unexpected-page": den AKTUELLEN Schritt erneut versuchen (Navigation + Suche), KEIN Skip.
//   • „skip-needs-file": trotzdem zum Vorspul-Ziel gehen (der spätere Upload pausiert dann selbst,
//     dort wählt der Nutzer die Datei von Hand — Welle-39-Mechanik).
function execContinueAfterMiss() {
  if (exec.autoMode) exec.paused = false;
  if (exec.lastMissReason === "unexpected-page") {
    exec.phase = "running";
    execRenderRun();
    setTimeout(() => {
      if (exec.running) execExecuteCurrent();
    }, 0);
    return;
  }
  if (exec.lastMissReason === "skip-needs-file" && exec.skipFileTarget != null) {
    const to = exec.skipFileTarget;
    exec.skipFileTarget = null;
    execFastForwardTo(to);
    return;
  }
  execAdvance();
}

// „Überspringen" (Halbautomatik): aktuellen Schritt ohne Ausführung weitergehen.
function execSkip() {
  if (!exec.running || exec.phase === "executing") return;
  execAdvance();
}

function execPauseAuto() {
  exec.paused = true;
  exec.phase = "paused";
  execRenderRun();
}

function execResumeAuto() {
  if (!exec.running) return;
  exec.paused = false;
  exec.phase = "running";
  execRenderRun();
  setTimeout(() => {
    if (exec.running && exec.autoMode && !exec.paused) execExecuteCurrent();
  }, 0);
}

function execAbort() {
  execFinish("aborted");
}

async function execFinish(status, detail) {
  if (exec.finished) return;
  exec.finished = true;
  exec.running = false;
  exec.paused = false;
  execLinkStop();
  execRemoveDownloadWatch();
  execDisarmDownload();
  // Datei-Brücke (Welle 39): getragene Datei-Bytes bei JEDEM Lauf-Ende (Erfolg/Abbruch)
  // aus Panel- UND Content-Speicher löschen — sie dürfen nie länger als der Lauf leben.
  exec.files = {};
  execRenderFileChip();
  sendExecToTab({ type: "steply-exec-file-clear" });
  sendExecToTab({ type: "steply-exec-hide" });
  // Server-Event (best effort; detail geht durch redactDetail, nie Werte).
  execPostFinish(status, detail || "");
  exec.phase = status === "success" ? "done" : "aborted";
  execRenderDone(status);
}

// ── Lauf: Rendering ──────────────────────────────────────────────────────────────
function execActionLabel(action) {
  if (action === "fill") return "Eingabe";
  if (action === "select") return "Auswahl";
  if (action === "toggle") return "Umschalten";
  return "Klick";
}

function execShowCtl(which) {
  els.autoCtlSemi.hidden = which !== "semi";
  els.autoCtlAuto.hidden = which !== "auto";
  els.autoCtlPaused.hidden = which !== "paused";
  els.autoCtlMiss.hidden = which !== "miss";
}

// Miss-Referenzbild + Markierungen (Welle 37, Fix 4). Gleiche aspect-ratio-Frame-Technik wie
// die Führung (guideRenderImage): der Rahmen erhält das ECHTE Bild-Verhältnis (aus den
// natürlichen Bildmaßen — die Automation-API liefert keine Maße), damit die Prozent-Boxen
// pixelgenau am gerenderten Bild hängen statt am Container (kein object-fit-Letterbox-Versatz).
// Blur-Markierungen als dunkle Box (decken den sensiblen Bereich ab), Rest als Koralle-Rahmen.
// Bestands-Automationen ohne Markierungen (highlights=[]) → einfach nur das Bild, kein Fehler.
function execRenderMissImage(planStep) {
  const img = els.autoMissImage;
  const frame = els.autoMissImageFrame || (img && img.parentNode);
  if (!img || !frame) return;
  const clearHl = () => frame.querySelectorAll(".run-hl, .run-hl-blur").forEach((n) => n.remove());
  clearHl();
  const imgUrl = planStep && planStep.imageUrl ? planStep.imageUrl : "";
  if (!imgUrl) {
    img.onload = null;
    img.onerror = null;
    img.removeAttribute("src");
    frame.style.removeProperty("--run-ar");
    els.autoMissImageWrap.hidden = true;
    return;
  }
  const highlights =
    planStep && Array.isArray(planStep.highlights) ? planStep.highlights : [];
  const paint = () => {
    const nw = img.naturalWidth || 0;
    const nh = img.naturalHeight || 0;
    if (nw > 0 && nh > 0) frame.style.setProperty("--run-ar", String(nw / nh));
    else frame.style.removeProperty("--run-ar");
    clearHl();
    highlights.forEach((h) => {
      if (!h || typeof h !== "object") return;
      const box = document.createElement("div");
      const s = box.style;
      s.left = clamp01(h.x) * 100 + "%";
      s.top = clamp01(h.y) * 100 + "%";
      s.width = clamp01(h.w) * 100 + "%";
      s.height = clamp01(h.h) * 100 + "%";
      if (h.type === "blur") {
        box.className = "run-hl-blur";
      } else {
        box.className = "run-hl";
        if (h.type === "ellipse") s.borderRadius = "50%";
        if (h.color) s.borderColor = h.color;
      }
      frame.appendChild(box);
    });
  };
  img.onload = paint;
  img.onerror = () => {
    frame.style.removeProperty("--run-ar");
    clearHl();
  };
  img.src = imgUrl;
  els.autoMissImageWrap.hidden = false;
  // Aus dem Cache geladene Bilder feuern onload evtl. nicht erneut → sofort zeichnen.
  if (img.complete && img.naturalWidth > 0) paint();
}

function execRenderRun() {
  els.autoDone.hidden = true;
  const planStep = exec.plan[exec.index] || null;
  const total = exec.plan.length;
  const num = Math.min(exec.index + 1, total);
  els.autoProgress.textContent = "Schritt " + num + " von " + total;
  const pct = total ? Math.round((num / total) * 100) : 0;
  if (els.autoBar.firstElementChild) els.autoBar.firstElementChild.style.width = pct + "%";

  els.autoStepTitle.textContent = planStep ? planStep.title || execActionLabel(planStep.action) : "";
  els.autoStepAction.textContent = planStep ? execActionLabel(planStep.action) : "";

  // Miss-Box nur im Miss-Zustand.
  if (exec.phase === "miss") {
    const r = exec.lastMissReason;
    if (r === "submit-bounced") {
      // Ehrlichkeits-Netz (Welle 38): die Übermittlung kam nicht durch, die Seite lud neu.
      els.autoMissText.textContent =
        "Schritt " + num + ": Die Anmeldung/Übermittlung kam nicht durch — die Seite hat neu" +
        " geladen. Bitte selbst prüfen und „Weiter“ drücken oder abbrechen.";
    } else if (r === "download-manual") {
      // Datei-Brücke (Welle 39, Weg 3): Datei liegt im Downloads-Ordner, aber nicht im Speicher.
      const name = exec.lastMissDetail ? " (" + exec.lastMissDetail + ")" : "";
      els.autoMissText.textContent =
        "Schritt " + num + ": Datei liegt im Downloads-Ordner" + name +
        " — beim Upload-Schritt bitte selbst wählen. „Weiter“ drücken oder abbrechen.";
    } else if (r === "download-timeout" || r === "download-missing") {
      els.autoMissText.textContent =
        "Schritt " + num + ": Download wurde nicht erkannt — bitte selbst herunterladen und" +
        " „Weiter“ drücken oder abbrechen.";
    } else if (r === "file-missing") {
      els.autoMissText.textContent =
        "Schritt " + num + ": Bitte die Datei von Hand wählen (sie liegt im Downloads-Ordner)." +
        " Danach „Weiter“ drücken oder abbrechen.";
    } else if (r === "file-transfer") {
      els.autoMissText.textContent =
        "Schritt " + num + ": Die Datei konnte nicht übertragen werden — bitte selbst hochladen" +
        " und „Weiter“ drücken oder abbrechen.";
    } else if (r === "unexpected-page") {
      // Zustands-Intelligenz (Welle 40): Seite passt zu keinem Schritt und ist keine Login-Seite.
      els.autoMissText.textContent =
        "Schritt " + num + ": Unerwartete Seite — bitte selbst dorthin navigieren oder „Weiter“" +
        " für einen erneuten Versuch.";
    } else if (r === "skip-needs-file") {
      // Zustands-Intelligenz (Welle 40): Vorspulen überspränge einen später gebrauchten Download.
      els.autoMissText.textContent =
        "Schritt " + num + ": Übersprungene Schritte enthalten den Datei-Download — bitte den" +
        " Ablauf von vorn starten oder die Datei beim Upload selbst wählen.";
    } else if (r === "cond-skip-needs-file") {
      // Bedingte Schritte (Welle 42): der bedingte Schritt (ein Download) sollte übersprungen
      // werden, aber ein späterer Upload braucht dessen Datei → ehrliche Pause statt stumm.
      els.autoMissText.textContent =
        "Schritt " + num + ": Dieser (bedingte) Schritt lädt eine Datei, die später gebraucht" +
        " wird — bitte selbst herunterladen und „Weiter“ drücken oder abbrechen.";
    } else {
      const reason = r ? " (" + r + ")" : "";
      els.autoMissText.textContent =
        "Schritt " + num + ": Stelle nicht gefunden" + reason +
        " — bitte selbst erledigen und „Weiter“ drücken oder abbrechen.";
    }
    execRenderMissImage(planStep);
    els.autoMissBox.hidden = false;
  } else {
    els.autoMissBox.hidden = true;
  }

  // Vorspul-Notiz (Welle 40): sichtbar machen, dass Schritte übersprungen wurden.
  if (els.autoSkipNote) {
    if (exec.skipNote) {
      els.autoSkipNote.textContent = execSkipNoteText(exec.skipNote);
      els.autoSkipNote.hidden = false;
    } else {
      els.autoSkipNote.hidden = true;
    }
  }

  // Bedingte Schritte (Welle 42): dezente Notiz zum zuletzt übersprungenen Schritt.
  if (els.autoCondSkipNote) {
    if (exec.condSkip) {
      els.autoCondSkipNote.textContent =
        "⏭ Schritt " + (exec.condSkip.index + 1) + " übersprungen (Bedingung nicht erfüllt).";
      els.autoCondSkipNote.hidden = false;
    } else {
      els.autoCondSkipNote.hidden = true;
    }
  }

  // Anmelde-Wache (Welle 40): höfliche Warte-Meldung, während der Mensch sich anmeldet.
  if (els.autoWaitLogin) {
    if (exec.phase === "waiting-login") {
      els.autoWaitLogin.textContent =
        "🔐 Bitte kurz anmelden — der Lauf wartet und macht automatisch weiter.";
      els.autoWaitLogin.hidden = false;
    } else {
      els.autoWaitLogin.hidden = true;
    }
  }

  // Live-Status.
  if (exec.phase === "executing") {
    els.autoLiveStatus.textContent = "Schritt wird ausgeführt …";
    els.autoLiveStatus.hidden = false;
  } else if (exec.phase === "running" && exec.autoMode) {
    els.autoLiveStatus.textContent = "Läuft automatisch …";
    els.autoLiveStatus.hidden = false;
  } else if (exec.phase === "paused") {
    els.autoLiveStatus.textContent = "Pausiert.";
    els.autoLiveStatus.hidden = false;
  } else {
    els.autoLiveStatus.hidden = true;
  }

  // Abbrechen ist während des ganzen Laufs verfügbar (nur auf dem Ende-Screen weg).
  if (els.autoCancel) els.autoCancel.hidden = false;

  // Steuer-Knöpfe je Zustand.
  if (exec.phase === "miss") {
    execShowCtl("miss");
  } else if (exec.phase === "waiting-login") {
    // Anmelde-Wache: nur Abbrechen (kein Ausführen/Überspringen/Pause) — der Lauf wartet.
    execShowCtl("none");
  } else if (exec.phase === "paused") {
    execShowCtl("paused");
  } else if (exec.autoMode) {
    execShowCtl("auto");
    els.autoPause.disabled = exec.phase !== "running" && exec.phase !== "executing";
  } else {
    execShowCtl("semi");
    const busy = exec.phase === "executing";
    els.autoExec.disabled = busy;
    els.autoSkip.disabled = busy;
  }
}

function execRenderDone(status) {
  execShowCtl("none");
  if (els.autoCancel) els.autoCancel.hidden = true;
  els.autoMissBox.hidden = true;
  els.autoLiveStatus.hidden = true;
  els.autoDownloadNote.hidden = true;
  if (els.autoSkipNote) els.autoSkipNote.hidden = true;
  if (els.autoCondSkipNote) els.autoCondSkipNote.hidden = true;
  if (els.autoWaitLogin) els.autoWaitLogin.hidden = true;
  els.autoStepTitle.textContent = "";
  els.autoStepAction.textContent = "";
  if (els.autoBar.firstElementChild) {
    els.autoBar.firstElementChild.style.width = status === "success" ? "100%" : els.autoBar.firstElementChild.style.width;
  }
  if (status === "success") {
    els.autoDoneTitle.textContent = "Fertig 🎉";
    els.autoDoneText.textContent = "Die Automation ist durchgelaufen.";
    els.autoProgress.textContent = "Fertig";
  } else {
    els.autoDoneTitle.textContent = "Abgebrochen";
    els.autoDoneText.textContent = "Der Lauf wurde beendet.";
    els.autoProgress.textContent = "Abgebrochen";
  }
  els.autoDone.hidden = false;
}

// content.js → Panel: Schritt-Ergebnis (ok / Miss mit Grund). NIE bei ok:false klicken —
// der Lauf pausiert; die Entscheidung trifft der Nutzer.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-exec-result") return;
  if (els.autoRun.hidden) return;
  if (!execPending) return;
  // Zuordnung über den TOKEN (Welle 46, BUGFIX In-Page-Klick): Der Token ist eindeutig pro Schritt
  // (execResultSeq zählt hoch; nur das Content-Script, das GENAU diesen Token bekam, antwortet
  // damit) — er ist die AUTORITATIVE Zuordnung. Der frühere Tab-ID-Vergleich war ein fragiler
  // ZUSATZfilter: bei Tab-/Fenster-Folgen (Welle 43) kann der antwortende Tab legitim vom zuletzt
  // gebundenen exec.tabId abweichen; eine token-passende Antwort darf NIE verworfen werden, sonst
  // löst execPending nie auf → der Lauf hängt bis zum Timeout und meldet fälschlich einen Miss.
  // Nur wenn KEIN Token mitkommt (Alt-Fall, sollte nicht vorkommen), bleibt der Tab-Vergleich als
  // Sicherheitsnetz. Der Token trägt die Eindeutigkeit auch über einen echten Tab-Wechsel hinweg.
  if (msg.token != null) {
    if (execPending.token !== msg.token) return;
  } else if (exec.tabId != null && sender && sender.tab && sender.tab.id !== exec.tabId) {
    return;
  }
  execPending.resolve({
    ok: !!msg.ok,
    reason: typeof msg.reason === "string" ? msg.reason : "",
    submitted: !!msg.submitted,
  });
});

// Zustands-Intelligenz (Welle 40): UNERWARTETE Navigation während des Laufs. Lädt der gebundene
// Tab fertig, während wir ZWISCHEN Schritten (ready) oder im Warten (waiting-login) sind, den
// Zustand neu einordnen — v. a. um nach dem (menschlichen) Anmelden AUTOMATISCH fortzusetzen.
// SICHERHEIT/Wechselwirkung: execHandleUnexpectedNav greift NIE während „executing" (die Aktion
// läuft) oder „verifying" (Welle-38-Submit-Kontrolle hat Vorrang).
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (els.autoRun.hidden || !exec.running) return;
  if (changeInfo.status !== "complete") return;
  // Tab-/Fenster-Folgen (Welle 43): nicht nur der gebundene Tab, sondern JEDES „complete"
  // während wir zwischen den Schritten (ready) oder im Warten (waiting-login) sind — so fangen
  // wir ein in einem ANDEREN Fenster fertig geladenes OAuth-Popup / einen neuen Tab. Welche
  // Tabs zum Lauf gehören, entscheidet execSelectTabForStep (lauf-zugehörige Menge); fremde
  // Tab-Ladevorgänge laufen dort ins Leere (kein Rebind).
  if (tabId === exec.tabId || exec.phase === "ready" || exec.phase === "waiting-login") {
    execHandleUnexpectedNav();
  }
});

// ============================================================================
// EVENTS
// ============================================================================

// „Ziel verwerfen" GANZ FRÜH verdrahten (Welle 33, Fix 4): der Knopf muss selbst dann noch
// funktionieren, wenn eine spätere Zeile hier oder die Init wirft — deshalb vor allen
// ungeschützten addEventListener-Aufrufen (els.saveCfg u. a. könnten theoretisch werfen).
if (els.targetClear) els.targetClear.addEventListener("click", discardTarget);

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
// Titel + Kategorie (Welle 31d): Feldwerte in die Session spiegeln; „＋ Neue Kategorie …"
// blendet das Namensfeld ein.
if (els.guideTitle) els.guideTitle.addEventListener("input", guideMetaSave);
if (els.guideCategory) els.guideCategory.addEventListener("change", onGuideCategoryChange);
if (els.guideCategoryNew) els.guideCategoryNew.addEventListener("input", guideMetaSave);
els.again.addEventListener("click", newRecording);
els.guideAgain.addEventListener("click", newRecording);
// (targetClear-Listener ist bereits ganz oben in diesem Block verdrahtet.)
// Live-Führung (Welle 31).
els.cardGuideRun.addEventListener("click", () => {
  if (hasToken) showFuehren();
});
els.fuehrenBack.addEventListener("click", () => showStart());
// Filter-Chips (Welle 32, Punkt C): segmentierte Umschalter, Auswahl in der Session.
if (els.chipSite) els.chipSite.addEventListener("click", () => setFuehrenFilter({ site: "page" }));
if (els.chipAll) els.chipAll.addEventListener("click", () => setFuehrenFilter({ site: "all" }));
if (els.chipLive) els.chipLive.addEventListener("click", () => setFuehrenFilter({ live: "live" }));
if (els.chipDrafts) els.chipDrafts.addEventListener("click", () => setFuehrenFilter({ live: "drafts" }));
els.runExit.addEventListener("click", guideExit);
els.runBack.addEventListener("click", guideGoBack);
els.runNext.addEventListener("click", guideGoNext);
els.runDoneList.addEventListener("click", () => showFuehren());
// „Steply lernen" (Welle 35): Karte im Start-Screen (IMMER, auch unverbunden) + Zurück.
if (els.cardSteplyLearn) els.cardSteplyLearn.addEventListener("click", () => showSteplyLearn());
if (els.steplyLearnBack) els.steplyLearnBack.addEventListener("click", () => showStart());

// Automationen (Welle 36b): Karte (nur mit Token) → Liste → Vorbereitung → Lauf.
if (els.cardAutomations)
  els.cardAutomations.addEventListener("click", () => {
    if (hasToken) showAutomations();
  });
if (els.autoListBack) els.autoListBack.addEventListener("click", () => showStart());
if (els.autoPrepBack) els.autoPrepBack.addEventListener("click", () => showAutomations());
if (els.autoClearValues) els.autoClearValues.addEventListener("click", onAutoClearValues);
if (els.autoStart) els.autoStart.addEventListener("click", startAutoRun);
// Lauf-Ansicht: Steuer-Knöpfe.
if (els.autoExec) els.autoExec.addEventListener("click", () => execExecuteCurrent());
if (els.autoSkip) els.autoSkip.addEventListener("click", () => execSkip());
if (els.autoPause) els.autoPause.addEventListener("click", () => execPauseAuto());
if (els.autoResume) els.autoResume.addEventListener("click", () => execResumeAuto());
if (els.autoContinue) els.autoContinue.addEventListener("click", () => execContinueAfterMiss());
if (els.autoCancel) els.autoCancel.addEventListener("click", () => execAbort());
if (els.autoExit)
  els.autoExit.addEventListener("click", () => {
    if (exec.running) execAbort();
    else showAutomations();
  });
if (els.autoDoneList) els.autoDoneList.addEventListener("click", () => showAutomations());
// Halbautomatik: Enter löst „Ausführen" aus (nur im wartenden Zustand).
document.addEventListener("keydown", (e) => {
  if (els.autoRun.hidden) return;
  if (e.key !== "Enter") return;
  if (!exec.autoMode && exec.phase === "ready") {
    e.preventDefault();
    execExecuteCurrent();
  } else if (exec.phase === "miss") {
    e.preventDefault();
    execContinueAfterMiss();
  }
});

// Panel wird geschlossen (Seitenleiste zu / Fenster zu): laufende Streams sauber
// stoppen (sonst bleibt der Mikro-/Freigabe-Indikator haengen) und Zustand raeumen,
// damit die NAECHSTE Oeffnung garantiert sauber startet. pagehide feuert beim Abbau
// des Panel-Dokuments; wir blockieren das Schliessen bewusst NICHT (kein Nag-Dialog).
window.addEventListener("pagehide", () => {
  cleanupStreams();
  guideActive = false;
  guideRemoveDownloadWatch();
  // Ping stoppen (Welle 33, Fix 2). Der Port bricht beim Dokument-Abbau ohnehin ab ->
  // background blendet das Overlay auf dem gebundenen Tab zuverlässig aus (das ist der
  // robuste Weg; das direkte hide unten kann während des Teardowns verpuffen).
  guidePingStop();
  try {
    chrome.storage.local.remove("rec");
  } catch (err) {
    /* best effort - die Versoehnung beim naechsten Oeffnen faengt es sowieso ab */
  }
  // Live-Führung (Welle 31): Overlay auf der Seite best-effort ausblenden (der Zustand
  // bleibt in chrome.storage.session -> beim Wiederöffnen wird resümiert + neu markiert).
  if (!els.guideRun.hidden) sendGuideToTab({ type: "steply-guide-hide" });
  // Automationen (Welle 36b): laufenden Lauf stoppen + Cursor/Overlay im Tab abräumen.
  // Der Port bricht beim Dokument-Abbau ohnehin ab → background sendet exec-hide (robust);
  // das direkte hide hier ist nur Best-effort. KEIN Resume — ein Ausführ-Lauf startet nie
  // ungefragt von selbst weiter (Sicherheit).
  exec.running = false;
  execPingStop();
  execDisarmDownload();
  // Datei-Brücke (Welle 39): getragene Datei-Bytes beim Panel-Schließen vergessen.
  exec.files = {};
  if (!els.autoRun.hidden) {
    sendExecToTab({ type: "steply-exec-file-clear" });
    sendExecToTab({ type: "steply-exec-hide" });
  }
});

// ============================================================================
// INIT
// ============================================================================
(async () => {
  // Härtung (Welle 33, Fix 4): die gesamte Init in try/catch. Wirft ein Schritt (Storage/
  // Netz/DOM), landen wir nicht bei still kaputten Knöpfen, sondern zeigen einen Hinweis.
  try {
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
    // Live-Führung (Welle 31): eine laufende Führung nach Panel-Schließen fortsetzen.
    const resumedGuide = await guideMaybeResume();
    if (!resumedGuide) {
      if (hasToken) {
        showStart();
      } else {
        showConnect();
      }
    }
    // Nebenlaeufig, nicht blockierend: Kontoname anzeigen + auf neue Version pruefen.
    fetchAccountName();
    checkForUpdate();
  } catch (err) {
    try {
      setStatus(
        "Die Seitenleiste konnte nicht vollständig starten — Extension bitte neu laden.",
        "error",
      );
    } catch (e) {
      /* selbst setStatus scheiterte (DOM kaputt) - dann bleibt nur die Konsole */
      console.warn("Steply: Panel-Init fehlgeschlagen:", err);
    }
  }
})();

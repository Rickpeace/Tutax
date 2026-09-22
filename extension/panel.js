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
//   guideLive  (c) Sofort-Anleitung: Phasen Bereit / Nimmt auf / Pausiert / Gestoppt
//                  (guidePhase + renderGuidePhase, Welle 48a) + Schrittliste mit Thumbnails.
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
  helpBtn: document.getElementById("helpBtn"),
  avatarBtn: document.getElementById("avatarBtn"),
  avatarLetter: document.getElementById("avatarLetter"),
  avatarDot: document.getElementById("avatarDot"),
  tabs: document.getElementById("tabs"),
  tabRecord: document.getElementById("tabRecord"),
  tabGuides: document.getElementById("tabGuides"),
  tabGuidesCount: document.getElementById("tabGuidesCount"),
  tabAutos: document.getElementById("tabAutos"),
  menuDim: document.getElementById("menuDim"),
  menuHelp: document.getElementById("menuHelp"),
  mLearn: document.getElementById("mLearn"),
  mVideo: document.getElementById("mVideo"),
  mRecHelp: document.getElementById("mRecHelp"),
  menuAccount: document.getElementById("menuAccount"),
  mAccountName: document.getElementById("mAccountName"),
  mOpenApp: document.getElementById("mOpenApp"),
  mUpdate: document.getElementById("mUpdate"),
  helpDot: document.getElementById("helpDot"),
  mHelpUpdate: document.getElementById("mHelpUpdate"),
  mHelpUpdateVer: document.getElementById("mHelpUpdateVer"),
  mUpdateVer: document.getElementById("mUpdateVer"),
  mChange: document.getElementById("mChange"),
  mDisconnect: document.getElementById("mDisconnect"),
  mVersion: document.getElementById("mVersion"),
  targetBanner: document.getElementById("targetBanner"),
  targetPrefix: document.getElementById("targetPrefix"),
  targetLabel: document.getElementById("targetLabel"),
  targetClear: document.getElementById("targetClear"),
  connect: document.getElementById("connect"),
  connectBack: document.getElementById("connectBack"),
  connectTitle: document.getElementById("connectTitle"),
  connectLead: document.getElementById("connectLead"),
  connectAccount: document.getElementById("connectAccount"),
  connectApp: document.getElementById("connectApp"),
  manualToggle: document.getElementById("manualToggle"),
  manualBox: document.getElementById("manualBox"),
  token: document.getElementById("token"),
  appUrl: document.getElementById("appUrl"),
  saveCfg: document.getElementById("saveCfg"),
  cfgStatus: document.getElementById("cfgStatus"),
  connectVideoLine: document.getElementById("connectVideoLine"),
  connectVideo: document.getElementById("connectVideo"),
  start: document.getElementById("start"),
  interruptedHint: document.getElementById("interruptedHint"),
  recStart: document.getElementById("recStart"),
  siteRow: document.getElementById("siteRow"),
  siteRowCount: document.getElementById("siteRowCount"),
  guides: document.getElementById("guides"),
  guideSearch: document.getElementById("guideSearch"),
  chipSite: document.getElementById("chipSite"),
  chipAll: document.getElementById("chipAll"),
  chipDrafts: document.getElementById("chipDrafts"),
  guidesList: document.getElementById("guidesList"),
  guidesEmpty: document.getElementById("guidesEmpty"),
  guidesEmptyText: document.getElementById("guidesEmptyText"),
  guidesEmptyAction: document.getElementById("guidesEmptyAction"),
  automations: document.getElementById("automations"),
  autoList: document.getElementById("autoList"),
  autoListEmpty: document.getElementById("autoListEmpty"),
  autoListHint: document.getElementById("autoListHint"),
  autoListRetry: document.getElementById("autoListRetry"),
  autoPrep: document.getElementById("autoPrep"),
  autoPrepBack: document.getElementById("autoPrepBack"),
  autoPrepTitle: document.getElementById("autoPrepTitle"),
  autoDomainHint: document.getElementById("autoDomainHint"),
  autoFileHint: document.getElementById("autoFileHint"),
  autoParamForm: document.getElementById("autoParamForm"),
  autoClearValues: document.getElementById("autoClearValues"),
  autoModeSemi: document.getElementById("autoModeSemi"),
  autoModeAuto: document.getElementById("autoModeAuto"),
  autoPrepHint: document.getElementById("autoPrepHint"),
  autoStart: document.getElementById("autoStart"),
  autoRun: document.getElementById("autoRun"),
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
  autoDone: document.getElementById("autoDone"),
  autoDoneIcon: document.getElementById("autoDoneIcon"),
  autoDoneTitle: document.getElementById("autoDoneTitle"),
  autoDoneText: document.getElementById("autoDoneText"),
  autoDoneList: document.getElementById("autoDoneList"),
  autoControls: document.getElementById("autoControls"),
  autoCtlSemi: document.getElementById("autoCtlSemi"),
  autoExec: document.getElementById("autoExec"),
  autoSkip: document.getElementById("autoSkip"),
  autoCtlAuto: document.getElementById("autoCtlAuto"),
  autoPause: document.getElementById("autoPause"),
  autoCtlPaused: document.getElementById("autoCtlPaused"),
  autoResume: document.getElementById("autoResume"),
  autoCtlMiss: document.getElementById("autoCtlMiss"),
  autoContinue: document.getElementById("autoContinue"),
  autoCancel: document.getElementById("autoCancel"),
  guideLive: document.getElementById("guideLive"),
  guideRecBar: document.getElementById("guideRecBar"),
  guidePulse: document.getElementById("guidePulse"),
  guidePauseDot: document.getElementById("guidePauseDot"),
  guideBadgeText: document.getElementById("guideBadgeText"),
  guideTimer: document.getElementById("guideTimer"),
  guideCountInline: document.getElementById("guideCountInline"),
  guidePause: document.getElementById("guidePause"),
  guideResume: document.getElementById("guideResume"),
  guideStop: document.getElementById("guideStop"),
  guideReviewHead: document.getElementById("guideReviewHead"),
  guideCountLine: document.getElementById("guideCountLine"),
  guideCount: document.getElementById("guideCount"),
  guideCountText: document.getElementById("guideCountText"),
  guideCaptureHint: document.getElementById("guideCaptureHint"),
  guideMeta: document.getElementById("guideMeta"),
  guideTitle: document.getElementById("guideTitle"),
  guideCatWrap: document.getElementById("guideCatWrap"),
  guideCategory: document.getElementById("guideCategory"),
  guideCategoryNew: document.getElementById("guideCategoryNew"),
  guideList: document.getElementById("guideList"),
  guideNote: document.getElementById("guideNote"),
  guideFooter: document.getElementById("guideFooter"),
  guideCreate: document.getElementById("guideCreate"),
  guideCtlStopped: document.getElementById("guideCtlStopped"),
  guideContinue: document.getElementById("guideContinue"),
  guideDiscard: document.getElementById("guideDiscard"),
  guideDone: document.getElementById("guideDone"),
  guideUploading: document.getElementById("guideUploading"),
  guideProgress: document.getElementById("guideProgress"),
  guideProgressBar: document.getElementById("guideProgressBar"),
  guideUploadDone: document.getElementById("guideUploadDone"),
  guideDoneTitle: document.getElementById("guideDoneTitle"),
  guideDoneText: document.getElementById("guideDoneText"),
  guideOpenApp: document.getElementById("guideOpenApp"),
  guideAgain: document.getElementById("guideAgain"),
  guideUploadError: document.getElementById("guideUploadError"),
  guideErrorText: document.getElementById("guideErrorText"),
  guideRetry: document.getElementById("guideRetry"),
  guideBackReview: document.getElementById("guideBackReview"),
  videoSetup: document.getElementById("videoSetup"),
  videoBack: document.getElementById("videoBack"),
  micStatus: document.getElementById("micStatus"),
  micRetry: document.getElementById("micRetry"),
  noAudio: document.getElementById("noAudio"),
  clicksTabInfo: document.getElementById("clicksTabInfo"),
  begin: document.getElementById("begin"),
  videoLive: document.getElementById("videoLive"),
  timer: document.getElementById("timer"),
  clickCount: document.getElementById("clickCount"),
  stop: document.getElementById("stop"),
  micLive: document.getElementById("micLive"),
  videoDone: document.getElementById("videoDone"),
  uploadBox: document.getElementById("uploadBox"),
  uploadProgress: document.getElementById("uploadProgress"),
  uploadDone: document.getElementById("uploadDone"),
  uploadDoneText: document.getElementById("uploadDoneText"),
  videoDoneTitle: document.getElementById("videoDoneTitle"),
  videoRetry: document.getElementById("videoRetry"),
  openApp: document.getElementById("openApp"),
  downloadBox: document.getElementById("downloadBox"),
  fileVideo: document.getElementById("fileVideo"),
  fileClicks: document.getElementById("fileClicks"),
  again: document.getElementById("again"),
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
  steplyLearn: document.getElementById("steplyLearn"),
  steplyLearnBack: document.getElementById("steplyLearnBack"),
  steplyLearnEmpty: document.getElementById("steplyLearnEmpty"),
  steplyLearnHint: document.getElementById("steplyLearnHint"),
  steplyLearnRetry: document.getElementById("steplyLearnRetry"),
  steplyLearnList: document.getElementById("steplyLearnList"),
  recHelp: document.getElementById("recHelp"),
  recHelpBack: document.getElementById("recHelpBack"),
  status: document.getElementById("status"),
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
let recHelpReturn = ""; // Bildschirm, von dem aus „Hilfe bei Aufnahme-Problemen" geöffnet wurde

// Konfiguration (Token + App-URL) aus chrome.storage.local.
let cfg = { token: "", appUrl: "" };
let hasToken = false;

// Kontoname des verbundenen Tokens (via /api/recorder/me; fail-silent). Steht im Avatar-Menü
// („Organisation · Verbunden") und als Anfangsbuchstabe im Avatar — so fällt eine Fehlbindung
// sofort auf. Welle 50a: pro Token in chrome.storage.local gemerkt (steplyAccountCache), damit der
// Avatar beim Öffnen SOFORT stimmt; /me wird pro Panel-Öffnung höchstens EINMAL geholt.
let accountName = "";
let accountFetch = null; // laufende /me-Anfrage (Dedupe)

// Aktueller Bildschirm (show) + Reiter (Aufnehmen | Anleitungen | Automationen).
let currentSection = "";
let currentTab = "record";

// Neuere Version auf dem Server (Update-Check) — Punkt am Avatar + Menüeintrag. "" = keine.
let updateVersion = "";

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

// Ziel-Hinweis (Welle 32 D1, Welle 50a kompakt/violett): erscheint NUR im Aufnahme-Anker-Modus
// (pendingTarget aktiv) als „Wird eingefügt in: <Ziel-Label>" + „Aufheben" — und nur auf den
// Bildschirmen, auf denen er etwas bedeutet (Aufnehmen, Aufnahme/Prüfen; s. applyTargetBanner).
let targetBannerOn = false;

function renderTargetBanner() {
  if (!els.targetBanner) return;
  // Defensiv (Welle 33, Fix 4): Banner NUR bei echtem Ziel (pendingTarget && .target). Die
  // Entscheidung liegt in der puren, testbaren target-banner.js; fehlt das Modul, greift die
  // Inline-Logik als Fallback.
  const state =
    (typeof SteplyTargetBanner !== "undefined" && SteplyTargetBanner.targetBannerState(pendingTarget)) || {
      show: !!(pendingTarget && pendingTarget.target),
      label: "die gewählte Stelle der Anleitung",
      broken: !!(pendingTarget && !pendingTarget.target),
    };
  if (state.show) {
    if (els.targetPrefix) els.targetPrefix.textContent = "Wird eingefügt in: ";
    els.targetLabel.textContent = state.label;
    if (els.targetClear) els.targetClear.hidden = false;
    targetBannerOn = true;
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
    targetBannerOn = false;
  }
  applyTargetBanner();
}

// Sichtbarkeit des Ziel-Hinweises je Bildschirm (Start + Aufnahme/Prüfen).
function applyTargetBanner() {
  if (!els.targetBanner) return;
  const onScreen = currentSection === "start" || currentSection === "guideLive";
  els.targetBanner.hidden = !(targetBannerOn && onScreen);
}

// Ziel vergessen: aus dem Storage räumen + Hinweis weg. (Aufheben-Knopf & nach Abschluss.)
// Härtung (Welle 33, Fix 4): jeder Schritt in try/catch; der Hinweis wird als LETZTE Zeile
// notfalls hart versteckt — egal, was Storage/Render vorher werfen.
async function clearPendingTarget() {
  pendingTarget = null;
  targetBannerOn = false;
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

// „Aufheben"-Knopf: Ziel räumen; die nächste Aufnahme wird eine neue Anleitung.
async function discardTarget() {
  try {
    await clearPendingTarget();
    setStatus("Aufgehoben – die Aufnahme wird als neue Anleitung gespeichert.", "");
    // Beim Prüfen gehören Titel/Kategorie jetzt wieder der neuen Anleitung.
    if (guidePhase === "stopped") guideMetaPrepare();
  } catch (err) {
    // Selbst bei einem Fehler muss der Knopf sichtbar wirken: Hinweis hart verstecken.
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

// Kurzer, nicht umkehrbarer Fingerabdruck des Tokens (FNV-1a). Damit gehören lokal gemerkte
// Listen/Kontonamen nachweislich zum AKTUELLEN Token — nach einem Kontowechsel wird nichts
// Fremdes angezeigt. Der Token selbst wird dafür nirgends zusätzlich gespeichert.
function tokenFp(token) {
  let h = 0x811c9dc5;
  const s = String(token || "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// Kontoname des aktuellen Tokens holen (GET /api/recorder/me). FAIL-SILENT; kurzer Timeout.
// Dedupe: parallele Aufrufe teilen sich EINE Anfrage (vorher kam /me beim Öffnen doppelt).
function fetchAccountName() {
  if (!cfg.token) {
    accountName = "";
    return Promise.resolve();
  }
  if (accountFetch) return accountFetch;
  const token = cfg.token;
  const base = appBase();
  accountFetch = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(base + "/api/recorder/me", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) return; // neutraler Text bleibt
      const body = await res.json().catch(() => ({}));
      if (body && body.account && token === cfg.token) {
        accountName = String(body.account).slice(0, 80);
        try {
          chrome.storage.local.set({ steplyAccountCache: { fp: tokenFp(token), name: accountName } });
        } catch (err) {
          /* reiner Komfort */
        }
        renderHeader();
        if (currentSection === "connect") updateConnectAccount();
      }
    } catch (err) {
      /* fail-silent */
    }
  })();
  return accountFetch;
}

// Gemerkten Kontonamen (passend zum Token) sofort übernehmen — vor dem ersten Rendern.
async function loadAccountCache() {
  if (!cfg.token) return;
  try {
    const r = await chrome.storage.local.get("steplyAccountCache");
    const c = r && r.steplyAccountCache;
    if (c && c.fp === tokenFp(cfg.token) && typeof c.name === "string") accountName = c.name.slice(0, 80);
  } catch (err) {
    /* egal */
  }
}

function updateConnectAccount() {
  if (!els.connectAccount) return;
  if (hasToken && accountName) {
    els.connectAccount.textContent = "Verbunden mit " + accountName + ".";
    els.connectAccount.hidden = false;
  } else if (hasToken) {
    els.connectAccount.textContent = "Mit Steply verbunden.";
    els.connectAccount.hidden = false;
  } else {
    els.connectAccount.textContent = "";
    els.connectAccount.hidden = true;
  }
}

// ── Kopf: Avatar (nur verbunden) + Menüs (Welle 50a) ─────────────────────────────────────
function extVersion() {
  try {
    return chrome.runtime.getManifest().version || "";
  } catch (err) {
    return "";
  }
}

function renderHeader() {
  if (els.avatarBtn) els.avatarBtn.hidden = !hasToken;
  if (els.avatarLetter) {
    const letter = (accountName || "").trim().charAt(0).toUpperCase();
    els.avatarLetter.textContent = letter || "S";
  }
  if (els.avatarBtn) {
    els.avatarBtn.title = accountName ? accountName + " – verbunden" : "Mit Steply verbunden";
  }
  if (els.avatarDot) els.avatarDot.hidden = !updateVersion;
  // Ohne Verbindung gibt es keinen Avatar — Update dann am „?" anbieten.
  if (els.helpDot) els.helpDot.hidden = !(updateVersion && !hasToken);
  if (els.mHelpUpdate) els.mHelpUpdate.hidden = !(updateVersion && !hasToken);
  if (els.mHelpUpdateVer) els.mHelpUpdateVer.textContent = updateVersion;
  if (els.mAccountName) els.mAccountName.textContent = accountName || "Ihr Steply-Konto";
  if (els.mUpdate) els.mUpdate.hidden = !updateVersion;
  if (els.mUpdateVer) els.mUpdateVer.textContent = updateVersion;
  if (els.mVersion) {
    const v = extVersion();
    els.mVersion.textContent = v ? "Version " + v : "Steply-Erweiterung";
  }
  if (els.tabAutos) els.tabAutos.hidden = !hasToken;
}

function closeMenus() {
  if (els.menuHelp) els.menuHelp.hidden = true;
  if (els.menuAccount) els.menuAccount.hidden = true;
  if (els.menuDim) els.menuDim.hidden = true;
  if (els.helpBtn) els.helpBtn.setAttribute("aria-expanded", "false");
  if (els.avatarBtn) els.avatarBtn.setAttribute("aria-expanded", "false");
}

function toggleMenu(which) {
  const menu = which === "help" ? els.menuHelp : els.menuAccount;
  const btn = which === "help" ? els.helpBtn : els.avatarBtn;
  if (!menu) return;
  const open = menu.hidden;
  closeMenus();
  if (!open) return;
  renderHeader();
  menu.hidden = false;
  if (els.menuDim) els.menuDim.hidden = false;
  if (btn) btn.setAttribute("aria-expanded", "true");
}

// Menü-Aktion: erst schließen, dann ausführen.
function menuAction(fn) {
  return () => {
    closeMenus();
    fn();
  };
}

function openAppTab(pathname) {
  try {
    chrome.tabs.create({ url: appBase() + pathname, active: true });
  } catch (err) {
    /* egal */
  }
}

// Läuft gerade eine Aufnahme, eine Führung oder eine Automation? Dann wechseln Menü-Einträge
// den Bildschirm nicht (nichts Laufendes wird aus Versehen „weggeklickt").
// Läuft eine Live-Führung? Nicht am sichtbaren Bildschirm festmachen — öffnet man während der
// Führung „Hilfe bei Aufnahme-Problemen", ist guideRun ausgeblendet, die Führung läuft aber weiter.
function guideRunActive() {
  return !els.guideRun.hidden || recHelpReturn === "guideRun";
}

function busyElsewhere() {
  const videoRec = mediaRecorder && mediaRecorder.state !== "inactive";
  return !!(videoRec || guidePhase !== "idle" || guideFinishing || exec.running || guideRunActive());
}

function busyNotice() {
  setStatus("Bitte beenden Sie zuerst die laufende Aufnahme, Anleitung oder Automation.", "error");
}

// „Trennen": Token entfernen (nach Rückfrage). Der storage-Listener zeigt danach den
// „Nicht verbunden"-Bildschirm.
async function disconnect() {
  const ok = confirm("Die Verbindung zu Steply in diesem Browser trennen?");
  if (!ok) return;
  try {
    await chrome.storage.local.remove(["badgeCache", "steplyAccountCache"]);
    await chrome.storage.local.set({ steplyToken: "" });
  } catch (err) {
    setStatus("Die Verbindung konnte nicht getrennt werden.", "error");
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

// Update-Hinweis (Welle 50a: Punkt am Avatar + Menüeintrag statt Banner): die auf dem Server
// hinterlegte Version lesen (public/downloads/steply-recorder.json). Ist sie neuer als diese
// Installation, erscheint „Update installieren" im Avatar-Menü. Fail-silent + kurzer Timeout.
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
    const current = extVersion();
    if (serverVer && current && isNewerVersion(serverVer, current)) {
      updateVersion = serverVer.slice(0, 20);
      renderHeader();
    }
  } catch (err) {
    /* fail-silent - der Update-Hinweis ist rein optional */
  }
}

// Kontext-Meldung. Sie steht im .status-slot des aktiven Bildschirms (nah an der Aktion),
// nicht mehr ganz unten in der Seitenleiste (Welle 50a). title = optionaler Technik-Code
// (nur als Tooltip, nie im sichtbaren Text).
function setStatus(text, kind, title) {
  els.status.textContent = text || "";
  els.status.className = "status" + (kind ? " status-" + kind : "");
  if (title) els.status.title = title;
  else els.status.removeAttribute("title");
}

// Welche Bildschirme zu welchem Reiter gehören (Reiterleiste nur dort sichtbar).
const TAB_SECTIONS = { start: "record", guides: "guides", automations: "autos" };
const ALL_SECTIONS = [
  "connect",
  "start",
  "guides",
  "automations",
  "autoPrep",
  "autoRun",
  "guideLive",
  "guideDone",
  "videoSetup",
  "videoLive",
  "videoDone",
  "guideRun",
  "steplyLearn",
  "recHelp",
];

// Genau EINEN Abschnitt zeigen (+ Reiterleiste, Ziel-Hinweis, Meldungsplatz nachziehen).
function show(section) {
  closeMenus();
  const changed = section !== currentSection;
  currentSection = section;
  for (const id of ALL_SECTIONS) {
    if (els[id]) els[id].hidden = id !== section;
  }
  const tab = TAB_SECTIONS[section] || null;
  if (els.tabs) els.tabs.hidden = !tab || !hasToken;
  if (tab) currentTab = tab;
  if (els.tabRecord) els.tabRecord.classList.toggle("on", tab === "record");
  if (els.tabGuides) els.tabGuides.classList.toggle("on", tab === "guides");
  if (els.tabAutos) els.tabAutos.classList.toggle("on", tab === "autos");
  for (const t of [els.tabRecord, els.tabGuides, els.tabAutos]) {
    if (t) t.setAttribute("aria-selected", t.classList.contains("on") ? "true" : "false");
  }
  renderHeader();
  applyTargetBanner();
  // Meldung in den Slot des aktiven Bildschirms umhängen; beim Bildschirmwechsel leeren.
  const sec = els[section];
  if (sec && els.status) {
    const slot = sec.querySelector(".status-slot") || sec.querySelector(".body") || sec;
    if (els.status.parentNode !== slot) slot.appendChild(els.status);
  }
  if (changed) setStatus("");
}

// Linien-Icon aus dem Symbol-Satz in panel.html (Welle 50a: Icons statt Emoji).
function icon(name, big) {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", big ? "i" : "i s");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(NS, "use");
  use.setAttribute("href", "#i-" + name);
  svg.appendChild(use);
  return svg;
}

// Text + Icon in ein Element setzen (ersetzt den Inhalt).
function setIconText(el, name, text) {
  if (!el) return;
  el.textContent = "";
  if (name) el.appendChild(icon(name));
  const span = document.createElement("span");
  span.textContent = text;
  el.appendChild(span);
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

// ---- Verbinden (Bildschirm 9) ----
// mode "first" = nicht verbunden (Startbildschirm ohne Konto); "change" = aus dem Avatar-Menü.
let connectMode = "first";

function showConnect(mode) {
  connectMode = mode === "change" && hasToken ? "change" : "first";
  els.token.value = cfg.token || "";
  els.appUrl.value = cfg.appUrl || "";
  els.appUrl.placeholder = DEFAULT_APP_URL;
  els.cfgStatus.textContent = "";
  els.cfgStatus.className = "status";
  const change = connectMode === "change";
  els.connectTitle.textContent = change ? "Verbindung ändern" : "Mit Ihrem Steply-Konto verbinden";
  els.connectLead.textContent = change
    ? "Verbinden Sie diese Steply-Erweiterung mit einem anderen Konto – am einfachsten direkt in Steply."
    : "Dann landen Aufnahmen direkt bei Ihren Anleitungen, und Sie können Anleitungen auf Websites zeigen.";
  els.connectBack.hidden = !change;
  els.connectVideoLine.hidden = change;
  setManualOpen(false);
  updateConnectAccount();
  show("connect");
  updateInterruptedHint();
  // Kontoname (nach-)laden, falls verbunden aber noch nicht ermittelt.
  if (hasToken && !accountName) fetchAccountName();
}

function setManualOpen(open) {
  els.manualBox.hidden = !open;
  els.manualToggle.setAttribute("aria-expanded", open ? "true" : "false");
  els.manualToggle.textContent = open ? "Code-Eingabe schließen" : "Code manuell eingeben";
}

async function saveCfg() {
  const token = (els.token.value || "").trim();
  const appUrl = (els.appUrl.value || "").trim().replace(/\/+$/, "");
  if (!token) {
    els.cfgStatus.textContent = "Bitte fügen Sie den Verbindungs-Code aus Steply ein.";
    els.cfgStatus.className = "status status-error";
    return;
  }
  try {
    await chrome.storage.local.set({ steplyToken: token, steplyAppUrl: appUrl });
    cfg.token = token;
    cfg.appUrl = appUrl;
    hasToken = true;
    els.cfgStatus.textContent = "Gespeichert – die Steply-Erweiterung ist verbunden.";
    els.cfgStatus.className = "status status-ok";
    setTimeout(() => {
      if (currentSection === "connect") showStart();
    }, 500);
  } catch (err) {
    els.cfgStatus.textContent = "Konnte nicht gespeichert werden.";
    els.cfgStatus.className = "status status-error";
  }
}

// Startbildschirm je nach Verbindung: verbunden → zuletzt genutzter Reiter bzw. „Aufnehmen",
// nicht verbunden → Bildschirm 9.
function showHome(tab) {
  if (!hasToken) {
    showConnect("first");
    return;
  }
  showTab(tab || currentTab || "record");
}

function showTab(tab) {
  if (!hasToken) {
    showConnect("first");
    return;
  }
  if (tab === "guides") showGuides();
  else if (tab === "autos") showAutomations();
  else showStart();
}

// ---- Reiter „Aufnehmen" (Bildschirm 1) ----
function showStart() {
  if (!hasToken) {
    showConnect("first");
    return;
  }
  renderTargetBanner();
  show("start");
  updateInterruptedHint();
  // Kontoname (nach-)laden, falls verbunden aber noch nicht ermittelt (dedupliziert).
  if (!accountName) fetchAccountName();
  // Kategorien (Welle 31d) schon jetzt warm laden (kurz gecacht), damit die Auswahl beim
  // Prüfen ohne Wartezeit steht. Fail-silent, nicht blockierend.
  loadRecCategories();
  // „Für diese Seite": sofort aus dem Speicher, im Hintergrund aktualisieren.
  renderSiteRow();
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
  els.micStatus.className = "info" + (kind === "ok" ? " ok" : kind === "err" ? " err" : "");
  els.micStatus.textContent = "";
  if (kind !== "pending") els.micStatus.appendChild(icon(kind === "ok" ? "mic" : "alert"));
  els.micStatus.appendChild(document.createTextNode(text));
}

function updateBeginEnabled() {
  // Start erst aktiv, wenn Mikro ok ODER Nutzer bewusst "ohne Ton" waehlt.
  els.begin.disabled = !(micReady || els.noAudio.checked);
}

async function micPreflight() {
  setMicStatus("pending", "Mikrofon wird geprüft …");
  els.micRetry.hidden = true;
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Sofort wieder freigeben - beim eigentlichen Start neu anfordern (Recht bleibt).
    s.getTracks().forEach((t) => t.stop());
    micReady = true;
    setMicStatus("ok", "Mikrofon bereit");
  } catch (err) {
    micReady = false;
    setMicStatus(
      "err",
      "Mikrofon nicht verfügbar. Bitte Zugriff erlauben – oder unten „Ohne Ton aufnehmen“ wählen."
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
  show("videoSetup");
  setStatus("");
  micPreflight();
}

async function begin() {
  if (started) return; // Doppelstart-Schutz
  started = true;
  els.begin.disabled = true;
  setStatus("Bitte wählen Sie im Dialog den Tab oder das Fenster …");

  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 },
      audio: false,
    });
  } catch (err) {
    // Nutzer hat abgebrochen oder Berechtigung verweigert.
    started = false;
    updateBeginEnabled();
    setStatus("Aufnahme abgebrochen. Sie können es erneut versuchen.", "error");
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
      setStatus("Mikrofon nicht verfügbar – die Aufnahme läuft ohne Ton.", "error");
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
    setStatus("Die Aufnahme konnte nicht gestartet werden.", "error", err && err.message ? err.message : "");
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
  els.micLive.textContent = "";
  els.micLive.appendChild(icon("mic"));
  els.micLive.appendChild(document.createTextNode(wantAudio && micStream ? "Mikrofon aktiv" : "Ohne Ton"));
  show("videoLive");
  setStatus("");
  startTimer(els.timer);
}

function stop() {
  if (stopping) return;
  stopping = true;
  els.stop.disabled = true;
  setStatus("Aufnahme wird abgeschlossen …");
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
  setVideoDoneState("recorded");

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
  setStatus("Zwei Dateien liegen in Ihrem Download-Ordner.", "ok");
}

function setUploadProgress(text) {
  if (els.uploadProgress) els.uploadProgress.textContent = text || "";
}

function showUploadError(message, videoBlob, clicksBlob) {
  setStatus(
    "Das Hochladen hat nicht geklappt – die Dateien wurden stattdessen heruntergeladen.",
    "error",
    message
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
        setUploadProgress("Video wird hochgeladen … " + pct + " %");
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
  setUploadProgress("Verbindung zu Steply wird hergestellt …");

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
  setUploadProgress("Wird verarbeitet …");
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
  setStatus("Hochgeladen" + orgHint + ".", "ok");
  notifyAppTabs();
  if (els.openApp) {
    els.openApp.onclick = () => {
      chrome.tabs.create({ url: base + "/app", active: true });
    };
  }
  // Welle 51: Stand des Auftrags verfolgen, solange das Panel offen ist — vorher endete
  // „wird erstellt“ still, auch wenn die Verarbeitung scheiterte.
  watchVideoJob(done.jobId, base);
}

// ── Auftrags-Status nach dem Upload (Welle 51) ─────────────────────────────
// Fragt GET /api/recorder/video-status?id= alle VIDEO_POLL_MS ab (max. VIDEO_POLL_MAX_MS).
// Fertig -> „Fertig – in Steply öffnen“ (direkt in die Anleitung), gescheitert -> Grund in
// Klartext + „Erneut aufnehmen“. Eine neue Aufnahme / ein Reset beendet die Abfrage
// (Generationszähler), 401/404 ebenfalls; Netzfehler werden bis zum Zeitlimit wiederholt.
const VIDEO_POLL_MS = 4000;
const VIDEO_POLL_MAX_MS = 15 * 60 * 1000;
let videoWatchGen = 0;
let videoWatchTimer = null;

function stopVideoWatch() {
  videoWatchGen++;
  if (videoWatchTimer) clearTimeout(videoWatchTimer);
  videoWatchTimer = null;
}

// Kopf/Icon/Texte des Fertig-Bildschirms je Zustand.
function setVideoDoneState(state, info) {
  const failed = state === "failed";
  if (els.videoDoneTitle) {
    els.videoDoneTitle.textContent =
      state === "done" ? "Anleitung erstellt" : failed ? "Verarbeitung fehlgeschlagen" : "Aufnahme fertig";
  }
  const iconBox = els.videoDone && els.videoDone.querySelector(".done > .ok, .done > .err");
  if (iconBox) {
    iconBox.className = failed ? "err" : "ok";
    iconBox.textContent = "";
    iconBox.appendChild(icon(failed ? "x" : "check", true));
  }
  if (els.videoRetry) els.videoRetry.hidden = !failed;
  if (els.openApp) els.openApp.hidden = failed;
  if (!els.uploadDoneText) return;
  if (state === "queued") {
    els.uploadDoneText.textContent = "Hochgeladen – Steply erstellt jetzt die Anleitung. In der Warteschlange …";
  } else if (state === "processing") {
    const p = info && info.progress ? String(info.progress).slice(0, 80) : "";
    els.uploadDoneText.textContent = "Die KI verarbeitet das Video" + (p ? " – " + p : "") + " …";
  } else if (state === "done") {
    els.uploadDoneText.textContent = "Fertig – die Anleitung liegt als Entwurf in Steply.";
  } else if (failed) {
    const reason = (info && info.reason) || "bei der Verarbeitung ist ein Fehler aufgetreten";
    els.uploadDoneText.textContent =
      "Das Video konnte nicht verarbeitet werden – " + reason + ". Bitte erneut aufnehmen.";
  } else {
    els.uploadDoneText.textContent = "Hochgeladen – Steply erstellt jetzt die Anleitung.";
  }
}

function watchVideoJob(jobId, base) {
  stopVideoWatch();
  if (!jobId || !cfg.token) return;
  const gen = videoWatchGen;
  const startedAt = Date.now();
  setVideoDoneState("queued");
  const next = () => {
    if (gen !== videoWatchGen) return;
    if (Date.now() - startedAt > VIDEO_POLL_MAX_MS) return; // Text bleibt „wird erstellt“
    videoWatchTimer = setTimeout(tick, VIDEO_POLL_MS);
  };
  const tick = async () => {
    if (gen !== videoWatchGen) return;
    let res;
    let data = {};
    try {
      res = await fetch(base + "/api/recorder/video-status?id=" + encodeURIComponent(jobId), {
        headers: { Authorization: "Bearer " + cfg.token },
        cache: "no-store",
      });
      data = await res.json().catch(() => ({}));
    } catch (err) {
      return next(); // Netz weg -> später erneut
    }
    if (gen !== videoWatchGen) return;
    if (res.status === 401 || res.status === 404) return; // Verbindung/Auftrag weg: still aufhören
    if (!res.ok) return next();
    if (data.status === "done") {
      setVideoDoneState("done");
      setStatus("");
      if (els.openApp) {
        els.openApp.onclick = () => {
          const path = data.tutorialId ? "/app/tutorials/" + encodeURIComponent(data.tutorialId) : "/app";
          chrome.tabs.create({ url: base + path, active: true });
        };
      }
      notifyAppTabs();
      return;
    }
    if (data.status === "failed") {
      setVideoDoneState("failed", { reason: data.reason });
      setStatus("");
      notifyAppTabs(); // offene Bibliothek zeigt den Fehler-Hinweis ohne F5
      return;
    }
    setVideoDoneState(data.status === "processing" ? "processing" : "queued", data);
    next();
  };
  videoWatchTimer = setTimeout(tick, VIDEO_POLL_MS);
}

function retryVideoRecording() {
  stopVideoWatch();
  cleanupStreams();
  stopTimer();
  resetVideo();
  goVideoSetup();
}

// ============================================================================
// SOFORT-ANLEITUNG (guide-Modus): pro Klick ein Screenshot + Element-Box -> fertiger
// Tutorial-Entwurf, ohne Video. Multi-Tab-faehig: captureVisibleTab erfasst immer den
// aktiven (sichtbaren) Tab des Fensters, in dem geklickt wurde - egal in welchem Tab.
// Der Aufruf laeuft ueber background.js (Chromium-Bug im Panel-Kontext, s. captureFor).
//
// RATENLIMIT (Welle 51 überarbeitet): Chromium erlaubt captureVisibleTab 2× je Zeitfenster von
// 1 s (MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND; das Fenster beginnt mit dem ersten Aufruf nach
// Ablauf des vorigen). Wir bilden das nach (guideCaptureSlotWait): zwei schnelle Klicks bekommen
// SOFORT je einen eigenen Screenshot — vorher erzwang ein fester Abstand von 550 ms, dass der
// zweite Klick (z. B. die Option im gerade geöffneten Filter-Menü) erst NACH seiner Wirkung
// fotografiert wurde. Meldet Chromium trotzdem „Kontingent erschöpft“, warten wir das Fenster ab.
//
// KEIN STILLER SCHRITT-VERLUST (Welle 51): Die Warteschlange ist nicht mehr gekappt (vorher
// flog bei >4 wartenden Schritten der älteste heraus). Staut es sich (sehr schnelle Klickfolge),
// teilen sich die schon verspäteten Schritte desselben Fensters EINEN Screenshot und werden als
// „Bild ggf. ungenau“ markiert (imprecise) — der Nutzer sieht beim Prüfen, was er kontrollieren
// sollte. Das Teilen im COALESCE_WINDOW gilt nur noch für Eingabe-Flush + Klick (Welle-24-
// Absicht: der Klick zeigt die fertige Eingabe), NICHT mehr für zwei echte Klicks.
// ============================================================================

const MAX_GUIDE_STEPS = 40;
const CAPTURE_WINDOW_MS = 1000 + 120; // Chromium-Zeitfenster + Sicherheitsabstand (Uhr/IPC)
const CAPTURES_PER_WINDOW = 2; // captureVisibleTab-Aufrufe je Zeitfenster
const COALESCE_WINDOW = 300; // ms: Eingabe-Flush + direkt folgender Klick teilen sich EINEN Screenshot
const GUIDE_LATE_MS = 600; // Screenshot später als so lange nach dem Klick -> „Bild ggf. ungenau“

let guideActive = false;
let guideSteps = []; // { rect, label, action, url, title, selector, sensitive, fileMeta, typedValue, ts, blob, width, height, thumbUrl, imprecise }
let guideQueue = []; // FIFO: [{ step, tabId, windowId, at }] - wartende Schritte (at = Eingang im Panel)
let guideCapturing = false;
let guideCapWinStart = 0; // Beginn des aktuellen captureVisibleTab-Zeitfensters (Panel-Uhr)
let guideCapWinCount = 0; // Aufrufe im aktuellen Zeitfenster
let guideLastImage = null; // letzter erfolgreicher Screenshot { blob, width, height, windowId }
let guideFinishing = false;

// Wie lange bis zum nächsten erlaubten captureVisibleTab-Aufruf (0 = sofort)?
function guideCaptureSlotWait(now) {
  if (now - guideCapWinStart >= CAPTURE_WINDOW_MS) return 0;
  if (guideCapWinCount < CAPTURES_PER_WINDOW) return 0;
  return guideCapWinStart + CAPTURE_WINDOW_MS - now;
}

// Einen Aufruf verbuchen (vor dem Senden — das Browser-Fenster beginnt eher später).
function guideNoteCapture(now) {
  if (now - guideCapWinStart >= CAPTURE_WINDOW_MS) {
    guideCapWinStart = now;
    guideCapWinCount = 1;
  } else {
    guideCapWinCount++;
  }
}

async function guideWaitCaptureSlot() {
  for (;;) {
    const w = guideCaptureSlotWait(Date.now());
    if (w <= 0) return;
    await new Promise((r) => setTimeout(r, w));
  }
}

// Chromium-Meldung „This request exceeds the MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND quota.“
function isCaptureQuotaError(err) {
  const m = err && err.message ? err.message : String(err || "");
  return /MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND|quota/i.test(m);
}

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
  setStatus("Screenshot wird erfasst …");
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

// ============================================================================
// AUFNAHME-PHASEN (Welle 48a, Welle 50a): Nimmt auf ⇄ Pausiert → Gestoppt (Prüfen).
//
//   idle       kein Sofort-Ablauf. Der Start-Screen („Aufnahme starten") IST der frühere
//              Bereit-Zustand: es wird NICHTS aufgenommen (kein rec im Storage, kein Timer),
//              bis der Nutzer dort klickt. Eine eigene Phase „ready" gibt es seit Welle 50a nicht mehr.
//   recording  rec gesetzt → content.js erfasst; Timer läuft; Downloads + Popups werden beobachtet
//   paused     rec entfernt → content.js passiv (Navigieren erzeugt keine Schritte); Timer steht
//   stopped    rec entfernt; Liste prüfen/bearbeiten → „Anleitung erstellen" | „Weiter aufnehmen"
//              | „Verwerfen"
// EINE Render-Funktion (renderGuidePhase) setzt Badge/Hinweise/Knöpfe passend zur Phase.
//
// guideActive bleibt die Annahme-Schranke für „steply-guide-step": true in „recording" und
// noch KURZ nach Pause/Stopp, bis bereits unterwegs befindliche Schritte (Queue/Screenshot)
// verarbeitet sind (max. GUIDE_HALT_MAX_MS) — so geht kein Klick kurz vor „Stopp" verloren.
// ============================================================================

let guidePhase = "idle"; // "idle" | "recording" | "paused" | "stopped"
let guideNonce = ""; // je Aufnahme-Sitzung (bleibt über Pause/Fortsetzen gleich)
function guideRecNonce() {
  if (!guideNonce) {
    try {
      guideNonce = crypto.randomUUID().replace(/-/g, "");
    } catch (err) {
      guideNonce = String(Math.random()).slice(2) + String(Date.now());
    }
  }
  return guideNonce;
}
let guidePausedMs = 0; // Summe der pausierten/gestoppten Zeit (zählt nicht zur Aufnahmedauer)
let guidePauseAt = 0; // Beginn der aktuellen Pause/des Stopps (0 = läuft)
let guideSeq = 0; // Übergangs-Token: ein späteres Fortsetzen macht ein laufendes Anhalten ungültig
let guideHaltPromise = null; // laufendes Anhalten (Queue leerlaufen lassen)
const GUIDE_HALT_MAX_MS = 3000; // höchstens so lange auf unterwegs befindliche Schritte warten
const GUIDE_HALT_GRACE_MS = 150; // Nachzügler-Nachrichten (schon gesendet, noch nicht da)

function guideSleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Aufnahmedauer ohne Pausen (steht, solange pausiert/gestoppt).
function guideElapsedMs() {
  if (!startEpoch) return 0;
  const now = guidePauseAt || Date.now();
  return Math.max(0, now - startEpoch - guidePausedMs);
}

function guideTimerTick() {
  els.guideTimer.textContent = fmtTime(guideElapsedMs() / 1000);
}

function guideTimerRun() {
  stopTimer();
  guideTimerTick();
  timerInterval = setInterval(guideTimerTick, 500);
}

// Altoffene Tabs nachimpfen (v2.2.2): ohne das fehlte content.js in Tabs, die vor dem
// (Neu-)Laden der Extension geoeffnet wurden - Klicks dort blieben stumm.
function guideEnsureContent() {
  try {
    const p = chrome.runtime.sendMessage({ type: "steply-ensure-content" });
    if (p && p.catch) p.catch(() => {});
  } catch (err) {
    /* egal - deklarative Injektion deckt neue Seiten ab */
  }
}

// „Aufnahme starten" auf dem Start-Screen (Welle 50a): startet DIREKT die Aufnahme. Vorher
// (auf dem Start-Screen) nimmt nichts auf — der Klick ist die bewusste Entscheidung des Nutzers.
async function startGuide() {
  if (!hasToken) return;
  if (guidePhase !== "idle" || guideFinishing) return; // Doppelklick-Schutz
  resetGuide();
  guideFinishing = false;
  interruptedDiscarded = false;
  els.interruptedHint.hidden = true;
  els.guideCount.textContent = "0";
  els.guideList.textContent = "";
  startEpoch = 0;
  guidePausedMs = 0;
  guidePauseAt = 0;
  stopTimer();
  els.guideTimer.textContent = "00:00";
  // Titel + Kategorie (Welle 31d) im Hintergrund vorbereiten — sichtbar erst beim Prüfen.
  guideMetaPrepare();
  await guideBeginCapture(true);
}

// „Fortsetzen" (aus Pausiert) bzw. „Weiter aufnehmen" (aus Gestoppt): Erfassung wieder an.
function guideStartRecording() {
  return guideBeginCapture(false);
}

// Erfassung (wieder) einschalten. fresh = neue Aufnahme vom Start-Screen (Phase idle).
// Die Schrittliste bleibt bei Fortsetzen/Weiter aufnehmen erhalten.
async function guideBeginCapture(fresh) {
  if (guideFinishing) return;
  if (fresh ? guidePhase !== "idle" : guidePhase !== "paused" && guidePhase !== "stopped") return;
  guideSeq++; // ein noch laufendes Anhalten (Queue-Drain) wird damit gegenstandslos
  if (fresh) {
    startEpoch = Date.now();
    guidePausedMs = 0;
  } else if (guidePauseAt) {
    guidePausedMs += Date.now() - guidePauseAt;
  }
  guidePauseAt = 0;
  guidePhase = "recording";
  guideActive = true;
  show("guideLive");
  setStatus("");
  // Datei-Brücke (Welle 39): Downloads NUR in „Nimmt auf" beobachten (Metadaten-Zuordnung).
  if (!guideDownloadHandler) guideAddDownloadWatch();
  guideTimerRun();
  renderGuidePhase();
  guideEnsureContent();
  try {
    // nonce (Welle 48): Geheimnis der Content-Scripts fuer den privaten iframe-Geometrie-Kanal
    // (Seiten-Skripte koennen chrome.storage nicht lesen, s. content.js „Geo-Kanal").
    await chrome.storage.local.set({
      rec: { startedAt: startEpoch, mode: "guide", nonce: guideRecNonce() },
    });
  } catch (err) {
    console.warn("Steply: Aufnahmezustand (guide) nicht gesetzt:", err);
  }
  // Nicht aufnehmbare Seite (chrome://, PDF, Web Store)? → dezenter Hinweis.
  guideCheckCapturable();
}

// Pause / Stopp: Erfassung aus. Reihenfolge ist wichtig: ERST rec entfernen (content.js wird
// passiv, es kommen keine neuen Schritte), DANN kurz warten, bis bereits unterwegs befindliche
// Schritte (Queue + laufender Screenshot) verarbeitet sind (max. GUIDE_HALT_MAX_MS), ERST DANN
// guideActive=false. Wird währenddessen fortgesetzt (guideSeq ändert sich), bleibt es aktiv.
function guideHalt(nextPhase) {
  if (guidePhase !== "recording" && guidePhase !== "paused") return guideHaltPromise;
  if (guidePhase === nextPhase) return guideHaltPromise;
  const seq = ++guideSeq;
  if (guidePhase === "recording") guidePauseAt = Date.now();
  guidePhase = nextPhase;
  stopTimer();
  guideTimerTick();
  guideSetCaptureHint(false);
  renderGuidePhase();
  const run = (async () => {
    try {
      await chrome.storage.local.remove("rec");
    } catch (err) {
      /* egal */
    }
    await guideSleep(GUIDE_HALT_GRACE_MS);
    const deadline = Date.now() + GUIDE_HALT_MAX_MS;
    while ((guideQueue.length || guideCapturing) && Date.now() < deadline) {
      if (seq !== guideSeq) return;
      await guideSleep(50);
    }
    if (seq !== guideSeq) return; // inzwischen fortgesetzt → Erfassung bleibt an
    guideActive = false;
    guideQueue = [];
    guideRemoveDownloadWatch();
    renderGuidePhase();
  })();
  const tracked = run.finally(() => {
    if (guideHaltPromise === tracked) guideHaltPromise = null;
  });
  guideHaltPromise = tracked;
  return tracked;
}

function guidePauseRecording() {
  if (guidePhase !== "recording") return;
  guideHalt("paused");
}

// „Fertig" in der Steuerleiste = Stopp → Prüfen-Bildschirm.
function guideStopRecording() {
  if (guidePhase !== "recording" && guidePhase !== "paused") return;
  guideHalt("stopped");
}

// „Verwerfen" (Prüfen): alles verwerfen, zurück zum Start-Screen. Mit Schritten nur nach
// Bestätigung. Titel/Kategorie werden mit verworfen; ein Aufnahme-Anker (Ziel im Builder)
// bleibt stehen — er hat seinen eigenen „Aufheben"-Knopf.
async function guideDiscardRecording() {
  if (guideFinishing) return;
  if (guideSteps.length > 0) {
    const n = guideSteps.length;
    const ok = confirm(
      (n === 1 ? "1 aufgenommener Schritt wird" : n + " aufgenommene Schritte werden") +
        " verworfen. Wirklich verwerfen?"
    );
    if (!ok) return;
  }
  guideSeq++;
  guidePhase = "idle";
  guideActive = false;
  try {
    await chrome.storage.local.remove("rec");
  } catch (err) {
    /* egal */
  }
  guideMetaReset();
  guideMetaClear();
  newRecording();
}

// EINE Render-Funktion für die Sektion guideLive: Steuerleiste (Aufnahme), Prüfen-Kopf,
// Titel/Kategorie, Hinweise und die feste Fußleiste (nur beim Prüfen).
function renderGuidePhase() {
  const p = guidePhase;
  const n = guideSteps.length;
  const busy = guideFinishing;
  const live = p === "recording" || p === "paused";
  const review = p === "stopped";

  if (els.guideRecBar) els.guideRecBar.hidden = !live;
  if (els.guideReviewHead) els.guideReviewHead.hidden = !review;
  if (els.guideFooter) els.guideFooter.hidden = !review;

  if (els.guideBadgeText) els.guideBadgeText.textContent = p === "paused" ? "Pausiert" : "Aufnahme läuft";
  if (els.guidePulse) els.guidePulse.hidden = p !== "recording";
  if (els.guidePauseDot) els.guidePauseDot.hidden = p !== "paused";
  if (els.guideCountInline) els.guideCountInline.textContent = n === 1 ? "1 Schritt" : n + " Schritte";
  if (p !== "recording") guideSetCaptureHint(false);

  if (els.guideCountText) {
    els.guideCountText.textContent = n === 1 ? "Schritt aufgenommen" : "Schritte aufgenommen";
  }

  // Knöpfe je Phase.
  if (els.guidePause) els.guidePause.hidden = p !== "recording";
  if (els.guideResume) els.guideResume.hidden = p !== "paused";
  els.guideStop.hidden = !live;
  els.guideStop.disabled = busy;
  if (els.guideCreate) els.guideCreate.disabled = busy || n === 0;
  if (els.guideContinue) els.guideContinue.disabled = busy;
  if (els.guideDiscard) els.guideDiscard.disabled = busy;

  // Titel + Kategorie erst beim Prüfen (und nie bei Aufnahme-Anker).
  if (els.guideMeta) els.guideMeta.hidden = !(review && guideMetaEnabled);

  // Hinweis unter der Liste.
  if (els.guideNote) {
    let note = "";
    if (p === "recording") {
      note =
        n === 0
          ? "Klicken Sie Ihren Ablauf im Browser durch – jeder Klick wird ein Schritt mit Screenshot und Markierung."
          : "Klicken Sie weiter im Browser – Tab-Wechsel und Anmelde-Fenster sind erlaubt.";
    } else if (p === "paused") {
      note =
        "Pausiert – Klicks werden gerade nicht erfasst. Wechseln Sie in Ruhe die Seite und setzen Sie dann fort.";
    } else if (p === "stopped") {
      note =
        n === 0
          ? "Noch keine Schritte – mit „Weiter aufnehmen“ im Browser klicken, dann erstellen."
          : "Einzelne Schritte mit ✕ entfernen. „?“ macht einen Schritt für Automationen optional.";
    }
    els.guideNote.textContent = note;
    els.guideNote.hidden = !note;
  }
}

// ── Popup-Fenster während der Aufnahme (Welle 48a) ─────────────────────────────────────────
// Schritte werden nur aus Tabs des Panel-Fensters angenommen (fromPanelWindow). Ein Popup
// („Mit Google anmelden", window.open) öffnet aber ein NEUES Fenster. Darum merken wir uns in
// „Nimmt auf" jeden Tab, dessen openerTabId aus einem akzeptierten Tab stammt (Panel-Fenster
// oder schon akzeptiertes Popup — Kette). DATENSCHUTZ: Fenster, die NICHT aus der Aufnahme
// heraus geöffnet wurden (z. B. private E-Mail im zweiten Fenster), bleiben ausgeschlossen.
// Die Menge gilt nur für den Sofort-Modus (Video-Modus unverändert) und wird geleert, wenn
// der Aufnahme-Vorgang endet (Verwerfen/Erstellen/Reset) — über Pause/Stopp→„Weiter aufnehmen"
// hinweg bleibt ein offenes Anmelde-Popup also weiter aufnehmbar.
const guideExtraTabs = new Set();

async function guideOnTabCreated(tab) {
  if (guidePhase !== "recording") return;
  if (!tab || tab.id == null || tab.openerTabId == null) return;
  // Im Panel-Fenster ist der Tab ohnehin akzeptiert.
  if (panelWindowId != null && tab.windowId === panelWindowId) return;
  if (guideExtraTabs.has(tab.openerTabId)) {
    guideExtraTabs.add(tab.id);
    return;
  }
  if (panelWindowId == null) return; // Fenster unbekannt → fromPanelWindow nimmt eh alles
  try {
    const opener = await chrome.tabs.get(tab.openerTabId);
    if (opener && opener.windowId === panelWindowId) guideExtraTabs.add(tab.id);
  } catch (err) {
    /* Opener schon weg → nicht zuordenbar → bleibt ausgeschlossen */
  }
}

function guideOnTabRemoved(tabId) {
  guideExtraTabs.delete(tabId);
}

// Annahme-Regel NUR für Sofort-Schritte: Panel-Fenster ODER aus der Aufnahme geöffnetes Popup.
function guideAcceptsSender(sender) {
  if (fromPanelWindow(sender)) return true;
  return !!(sender && sender.tab && guideExtraTabs.has(sender.tab.id));
}

// ── Hinweis „hier kann nicht aufgenommen werden" (Welle 48a) ──────────────────────────────
// In „Nimmt auf" bei Tab-Wechsel und fertig geladenem aktiven Tab prüfen, ob im aktiven Tab
// des Panel-Fensters ein Content-Script antwortet (steply-rec-ping, nur Hauptframe). Keine
// Antwort / keine http(s)-URL → dezenter Hinweis; verschwindet bei aufnehmbarem Tab wieder.
let guideCheckSeq = 0;
const GUIDE_PING_TIMEOUT_MS = 1200;
const GUIDE_PING_RETRY_MS = 500;

function guideSetCaptureHint(on) {
  if (els.guideCaptureHint) els.guideCaptureHint.hidden = !on;
}

function guidePingTab(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => finish(false), GUIDE_PING_TIMEOUT_MS);
    try {
      const p = chrome.tabs.sendMessage(tabId, { type: "steply-rec-ping" }, { frameId: 0 });
      if (p && p.then) {
        p.then((resp) => finish(!!(resp && resp.ok)), () => finish(false));
      } else {
        finish(false);
      }
    } catch (err) {
      finish(false);
    }
  });
}

async function guideCheckCapturable() {
  if (guidePhase !== "recording") {
    guideSetCaptureHint(false);
    return;
  }
  const seq = ++guideCheckSeq;
  let tab = null;
  try {
    const q =
      panelWindowId == null
        ? { active: true, currentWindow: true }
        : { active: true, windowId: panelWindowId };
    const tabs = await chrome.tabs.query(q);
    tab = tabs && tabs[0];
  } catch (err) {
    return; // tabs-API gestört → lieber kein (falscher) Hinweis
  }
  if (!tab || tab.id == null) return;
  let ok = false;
  const url = typeof tab.url === "string" ? tab.url : "";
  if (/^https?:\/\//i.test(url)) {
    ok = await guidePingTab(tab.id);
    if (!ok) {
      // Tab war evtl. vor dem Laden der Extension offen → erst nachimpfen, dann erneut pingen.
      guideEnsureContent();
      await guideSleep(GUIDE_PING_RETRY_MS);
      if (seq !== guideCheckSeq) return;
      ok = await guidePingTab(tab.id);
    }
  }
  if (seq !== guideCheckSeq || guidePhase !== "recording") return;
  guideSetCaptureHint(!ok);
}

try {
  chrome.tabs.onCreated.addListener(guideOnTabCreated);
  chrome.tabs.onRemoved.addListener(guideOnTabRemoved);
  chrome.tabs.onActivated.addListener((info) => {
    if (guidePhase !== "recording") return;
    if (info && panelWindowId != null && info.windowId !== panelWindowId) return;
    guideCheckCapturable();
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (guidePhase !== "recording") return;
    if (!changeInfo || changeInfo.status !== "complete") return;
    if (!tab || !tab.active) return;
    if (panelWindowId != null && tab.windowId !== panelWindowId) return;
    guideCheckCapturable();
  });
} catch (err) {
  /* tabs-API nicht verfügbar → keine Popup-Erfassung / kein Hinweis */
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
  // Fokuswechsel ab), danach ein letzter Direktversuch aus dem Panel. Jeder Versuch wartet auf
  // einen freien Platz im Kontingent; „Kontingent erschöpft“ zählt nicht als Fehlversuch
  // (höchstens 3× — danach wie ein echter Fehler).
  let dataUrl = null;
  let lastErr = null;
  let quotaRetries = 0;
  for (let attempt = 0; attempt < 2 && !dataUrl; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 350));
    await guideWaitCaptureSlot();
    guideNoteCapture(Date.now());
    try {
      dataUrl = await captureViaBackground(targetWindowId);
    } catch (err) {
      lastErr = err;
      if (isCaptureQuotaError(err) && quotaRetries < 3) {
        quotaRetries++;
        guideCapWinCount = CAPTURES_PER_WINDOW; // Fenster als voll betrachten, Ablauf abwarten
        attempt--;
      }
    }
  }
  if (!dataUrl) {
    await guideWaitCaptureSlot();
    guideNoteCapture(Date.now());
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
      "Der Screenshot hat nicht geklappt. Passiert das bei jedem Klick: ?-Menü → „Hilfe bei Aufnahme-Problemen“.",
      "error",
      why
    );
    return null;
  }

  // Klick-Puls im ausloesenden Tab - ERST NACH dem Screenshot, damit er nie mit im Bild
  // landet. Multi-Tab: gezielt an sender.tab.id des Schritts (nicht an einen fixen Tab).
  pulseTab(pending.tabId);

  try {
    const img = await pngDataUrlToWebp(dataUrl);
    if (img) guideLastImage = { blob: img.blob, width: img.width, height: img.height, windowId: targetWindowId };
    return img;
  } catch (err) {
    console.warn("Steply: WebP-Konvertierung fehlgeschlagen:", err && err.message);
    return null;
  }
}

// Einen erfassten Schritt (Rohdaten + fertiges Bild) in die Liste aufnehmen. Bei geteiltem
// Screenshot (Coalesce) bekommt jeder Schritt einen EIGENEN Objekt-URL (sauberes Revoke).
function addGuideStep(src, img, tabId, imprecise) {
  if (guideSteps.length >= MAX_GUIDE_STEPS) return;
  // Nachtraege (Welle 48b), die eintrafen, WAEHREND dieser Schritt fotografiert wurde:
  // zurueckgenommen -> gar nicht aufnehmen; patch/frame-geo -> jetzt einmischen.
  if (!guideTakePending(src, tabId, guideAmendPending, Date.now())) return;
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
    // interaction (Welle 48): Enter/Rechtsklick/Doppelklick/Ziehen/Kuerzel/Hover/iframe —
    // Vertrag s. content.js. Nur ein Objekt durchreichen; der Server validiert streng.
    interaction:
      src.interaction && typeof src.interaction === "object" ? src.interaction : null,
    // typed_value (Welle 54): der eingetippte Wert eines Eingabe-Schritts (content.js lässt ihn
    // bei sensiblen Feldern weg). Wird in der Liste angezeigt und kann vor dem Hochladen
    // weggelassen werden; der Server validiert ihn erneut.
    typedValue:
      src.action === "type" && typeof src.typed_value === "string" ? src.typed_value.slice(0, 80) : "",
    ts: src.ts || Date.now(),
    // Panel-intern (NICHT hochgeladen): Absender-Tab (patch/retract adressieren tab+ts) und
    // frameKey eines iframe-Schritts (steply-frame-geo reicht die echte Lage nach).
    tabId: tabId == null ? null : tabId,
    frameKey: typeof src.frameKey === "string" ? src.frameKey.slice(0, 40) : null,
    blob: img.blob,
    width: img.width,
    height: img.height,
    thumbUrl: null,
    // Welle 51: Screenshot kam verspätet/geteilt (Rückstau) oder ersatzweise vom vorigen Bild.
    // Nur Panel-Hinweis beim Prüfen — wird nicht hochgeladen.
    imprecise: !!imprecise,
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

// Darf `next` den Screenshot der Gruppe mitbenutzen? (Welle 51)
//  (a) Eingabe-Flush + Klick (Welle 24): einer der beiden ist eine Eingabe, Abstand ≤ COALESCE_WINDOW
//      — der Klick-Screenshot zeigt die fertige Eingabe, die Folgeseite ist noch nicht da.
//  (b) Rückstau: `next` wartet schon länger als GUIDE_LATE_MS (sein Moment ist ohnehin vorbei).
// Beides nur im selben Fenster. Zwei echte Klicks kurz nacheinander teilen sich KEIN Bild mehr.
function guideIsFlushPair(prev, next, first) {
  if (next.windowId !== first.windowId) return false;
  const typeInvolved = prev.step.action === "type" || next.step.action === "type";
  return typeInvolved && Math.abs((next.step.ts || 0) - (prev.step.ts || 0)) <= COALESCE_WINDOW;
}
function guideCanShare(prev, next, first, now) {
  if (guideIsFlushPair(prev, next, first)) return true;
  return next.windowId === first.windowId && now - (next.at || now) > GUIDE_LATE_MS;
}

// FIFO-Queue abarbeiten (Serialisierung + Kontingent). Jeder Schritt landet in der Liste —
// mit eigenem, geteiltem (Eingabe+Klick / Rückstau) oder notfalls dem letzten Bild.
async function drainGuideQueue() {
  if (guideCapturing) return;
  guideCapturing = true;
  try {
    while (guideQueue.length && guideActive) {
      if (guideSteps.length >= MAX_GUIDE_STEPS) {
        setStatus("Maximale Schrittzahl (" + MAX_GUIDE_STEPS + ") erreicht.", "error");
        guideQueue = [];
        break;
      }
      // Erst auf einen freien Screenshot-Platz warten, DANN die Gruppe bilden: Was in der
      // Wartezeit „zu spät“ geworden ist, fährt im selben Screenshot mit.
      await guideWaitCaptureSlot();
      if (!guideQueue.length || !guideActive) break; // evtl. inzwischen zurückgenommen
      const now = Date.now();
      const first = guideQueue.shift();
      const group = [first];
      while (
        guideQueue.length &&
        guideSteps.length + group.length < MAX_GUIDE_STEPS &&
        guideCanShare(group[group.length - 1], guideQueue[0], first, now)
      ) {
        group.push(guideQueue.shift());
      }
      let img = await captureImage(first);
      const capturedAt = Date.now();
      // Der Klick zu einer Eingabe (Flush) trifft als eigene Nachricht meist erst WÄHREND des
      // Screenshots ein — wie bisher (Welle 24) noch in dieses Bild aufnehmen.
      while (
        guideQueue.length &&
        guideSteps.length + group.length < MAX_GUIDE_STEPS &&
        guideIsFlushPair(group[group.length - 1], guideQueue[0], first)
      ) {
        group.push(guideQueue.shift());
      }
      let fallback = false;
      const firstWin = first.windowId != null ? first.windowId : panelWindowId;
      if (!img && guideLastImage && guideLastImage.windowId === firstWin) {
        // Screenshot gescheitert: Schritt NICHT verwerfen, sondern mit dem letzten Bild
        // desselben Fensters behalten (als ungenau markiert). Der Status nennt den Fehler.
        img = guideLastImage;
        fallback = true;
      }
      if (!img) continue; // noch gar kein Bild (erster Schritt) -> Fehlermeldung steht im Status
      group.forEach((e, k) => {
        if (k > 0) pulseTab(e.tabId);
        const late = fallback || capturedAt - (e.at || capturedAt) > GUIDE_LATE_MS;
        addGuideStep(e.step, img, e.tabId, late);
      });
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

// Hostname einer Schritt-URL für die kleine Zweitzeile (rein lokal, nur Anzeige).
function stepHost(url) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, "") : "";
  } catch (err) {
    return "";
  }
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
    lbl.textContent = guideStepLabel(s, i);
    lbl.title = lbl.textContent;
    const host = stepHost(s.url);
    if (host || s.imprecise) {
      const small = document.createElement("small");
      small.textContent = host || "";
      if (s.imprecise) {
        // Welle 51: Bild kam verspätet (sehr schnelle Klickfolge) — bitte prüfen.
        const warn = document.createElement("span");
        warn.className = "img-warn";
        warn.textContent = (host ? " · " : "") + "Bild ggf. ungenau";
        warn.title =
          "Der Screenshot entstand erst nach weiteren Klicks. Bitte prüfen – oder den Schritt entfernen und langsamer erneut aufnehmen.";
        small.appendChild(warn);
      }
      lbl.appendChild(small);
    }
    // Eingetippter Wert (Welle 54): vor dem Hochladen sichtbar — und mit einem Klick weglassbar
    // (der Schritt bleibt, der Titel lautet dann „Feld „…“ ausfüllen“).
    if (s.action === "type" && s.typedValue) {
      const typed = document.createElement("small");
      typed.className = "typed";
      // Wert in eigenem Span (kürzbar), „weglassen“ daneben schrumpft nie — sonst schnitt die
      // schmale Seitenleiste den Knopf bei längeren Werten ab.
      const val = document.createElement("span");
      val.className = "typed-val";
      val.textContent = "Eingabe: „" + s.typedValue + "“";
      typed.appendChild(val);
      typed.title = "Dieser Wert erscheint im Schritt-Titel. Sensible Felder (z. B. Passwörter) werden nie übernommen.";
      const drop = document.createElement("button");
      drop.type = "button";
      drop.className = "typed-drop";
      drop.textContent = "weglassen";
      drop.title = "Wert nicht übernehmen (der Schritt bleibt)";
      drop.setAttribute("aria-label", "Eingetippten Wert von Schritt " + (i + 1) + " weglassen");
      drop.addEventListener("click", () => {
        s.typedValue = "";
        renderGuideSteps();
      });
      typed.appendChild(drop);
      lbl.appendChild(typed);
    }

    const rm = document.createElement("button");
    rm.className = "rm";
    rm.type = "button";
    rm.title = "Schritt entfernen";
    rm.setAttribute("aria-label", "Schritt " + (i + 1) + " entfernen");
    rm.appendChild(icon("x"));
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
  // Neuen Schritt in Sicht scrollen (während der Aufnahme; die Steuerleiste klebt oben).
  if (guidePhase === "recording" && els.guideList.lastElementChild) {
    try {
      els.guideList.lastElementChild.scrollIntoView({ block: "nearest" });
    } catch (err) {
      /* egal */
    }
  }
  // Zähler + „Anleitung erstellen" (aktiv nur mit ≥1 Schritt) nachziehen (Welle 48a).
  if (guidePhase !== "idle") renderGuidePhase();
}

// Upload-Zustand des Fertig-Bildschirms (Welle 50a): Fortschritt → Fertig (erst nach
// erfolgreichem Upload) bzw. Fehler inline mit „Erneut versuchen".
function setGuideUploadState(state) {
  els.guideUploading.hidden = state !== "uploading";
  els.guideUploadDone.hidden = state !== "done";
  els.guideUploadError.hidden = state !== "error";
}

function setGuideProgress(text, frac) {
  els.guideProgress.textContent = text || "";
  if (els.guideProgressBar) {
    const pct = Math.max(0, Math.min(1, typeof frac === "number" ? frac : 0)) * 100;
    els.guideProgressBar.style.width = pct + "%";
  }
}

// „Anleitung erstellen" (Phase „Gestoppt", Welle 48a) -> hochladen.
async function finishGuide() {
  if (guideFinishing) return;
  if (guidePhase !== "stopped") return;
  guideFinishing = true;
  renderGuidePhase();
  // Ein noch laufendes Anhalten (unterwegs befindliche Schritte) erst abschließen lassen.
  if (guideHaltPromise) {
    try {
      await guideHaltPromise;
    } catch (err) {
      /* egal */
    }
  }
  guideActive = false;
  guideRemoveDownloadWatch();
  stopTimer();
  // Content-Scripts sind seit dem Stopp passiv; zur Sicherheit rec nochmals räumen.
  try {
    await chrome.storage.local.remove("rec");
  } catch (err) {
    /* egal */
  }

  if (guideSteps.length === 0) {
    setStatus("Es wurden keine Schritte aufgenommen.", "error");
    guideFinishing = false;
    renderGuidePhase();
    return;
  }
  await runGuideUpload();
}

// Hochladen (auch „Erneut versuchen"): die Schritte bleiben bis zum ERFOLG erhalten.
async function runGuideUpload() {
  guideFinishing = true;
  show("guideDone");
  setGuideUploadState("uploading");
  setGuideProgress("Verbindung zu Steply wird hergestellt …", 0.05);
  let result = null;
  try {
    result = await uploadGuide();
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    els.guideErrorText.textContent = guideUploadErrorText(msg);
    els.guideErrorText.title = msg; // Technik-Detail nur als Tooltip
    setGuideUploadState("error");
    return;
  }
  // Erfolg: jetzt erst ist die Aufnahme abgeschlossen.
  guidePhase = "idle";
  guideFinishing = false;
  guideExtraTabs.clear();
  showGuideDone(result);
  // Aufnahme-Anker (Welle 27): nach ERFOLG räumen, damit die nächste Aufnahme nicht versehentlich
  // am alten Ziel landet. (Bei Fehler bleibt er — „Erneut versuchen" soll dasselbe Ziel treffen.)
  await clearPendingTarget();
}

// Menschliche Fehlermeldung (der technische Grund steht nur im title).
function guideUploadErrorText(msg) {
  const m = String(msg || "");
  if (/Failed to fetch|NetworkError|Netzwerk/i.test(m)) {
    return "Steply ist gerade nicht erreichbar. Prüfen Sie die Internetverbindung und versuchen Sie es erneut. Ihre Schritte bleiben erhalten.";
  }
  if (/\b401\b|Token/i.test(m)) {
    return "Die Verbindung zu Steply ist nicht mehr gültig (z. B. weil sie in den Einstellungen getrennt wurde). Öffnen Sie in Steply „Einstellungen → Steply-Erweiterung“ und verbinden Sie neu – danach hier „Erneut versuchen“. Ihre Schritte bleiben erhalten.";
  }
  return "Beim Hochladen ist etwas schiefgelaufen. Ihre Schritte bleiben erhalten – versuchen Sie es gleich noch einmal.";
}

// Fertig-Bildschirm (Bildschirm 4) füllen.
function showGuideDone(r) {
  const title = r && r.title ? r.title : "";
  if (r && r.fallback) {
    els.guideDoneTitle.textContent = "Als neue Anleitung gespeichert";
    els.guideDoneText.textContent =
      "An der gewählten Stelle ging es nicht – die Aufnahme liegt deshalb als eigener Entwurf bei Ihren Anleitungen in Steply." +
      (r.fallbackReason ? " " + r.fallbackReason : "");
  } else if (r && r.inserted) {
    els.guideDoneTitle.textContent = "Schritte eingefügt";
    els.guideDoneText.textContent =
      "Die Aufnahme steht jetzt an der gewählten Stelle" + (r.label ? " in „" + r.label + "“" : "") + ".";
  } else {
    els.guideDoneTitle.textContent = "Anleitung ist fertig";
    els.guideDoneText.textContent = title
      ? "„" + title + "“ liegt als Entwurf bei Ihren Anleitungen in Steply."
      : "Ihre Anleitung liegt als Entwurf bei Ihren Anleitungen in Steply.";
  }
  setGuideUploadState("done");
}

// „Zurück zur Prüfung" nach einem Fehler: Liste + Titel wieder bearbeitbar.
function guideBackToReview() {
  guideFinishing = false;
  guidePhase = "stopped";
  show("guideLive");
  renderGuideSteps();
  renderGuidePhase();
}

async function uploadGuide() {
  const base = appBase();
  setGuideProgress("Verbindung zu Steply wird hergestellt …", 0.05);

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
    setGuideProgress("Screenshot " + (i + 1) + " von " + count + " wird hochgeladen …", 0.1 + (0.75 * i) / count);
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
  setGuideProgress("Anleitung wird angelegt …", 0.9);
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
    // interaction (Welle 48): additiv, alte Server ignorieren es.
    if (s.interaction && typeof s.interaction === "object") step.interaction = s.interaction;
    // typed_value (Welle 54): nur, wenn vorhanden und nicht in der Liste weggelassen.
    if (s.action === "type" && s.typedValue) step.typed_value = s.typedValue;
    return step;
  });
  // Aufnahme-Anker (Welle 27): Ziel nur mitschicken, wenn die Herkunft zur App-URL passt.
  const uploadTarget = targetForUpload();
  const completeBody = { token: cfg.token, steps };
  if (uploadTarget) completeBody.target = uploadTarget;
  // Titel + Kategorie (Welle 31d): NUR im Neu-Anleitungs-Modus. guideTitleValue/
  // guideCategoryPayload liefern nur etwas ohne Aufnahme-Anker — beim Einfügen ins Ziel
  // werden beide bewusst weggelassen.
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
  setGuideProgress("", 1);
  const targetLabel = pendingTarget && pendingTarget.label ? String(pendingTarget.label) : "";
  // Titel + Kategorie (Welle 31d): nach erfolgreichem Upload Felder + Session zurücksetzen,
  // damit die nächste Aufnahme frisch startet. (Bei Fehler bleiben die Werte erhalten.)
  guideMetaReset();
  guideMetaClear();
  notifyAppTabs();
  // „In Steply öffnen" führt zum ZIEL (bei Einfügen) bzw. zur neuen Anleitung (Fallback/Standard).
  const openUrl = base + "/app/tutorials/" + comp.tutorialId;
  if (els.guideOpenApp) {
    els.guideOpenApp.onclick = () => chrome.tabs.create({ url: openUrl, active: true });
  }
  return {
    title: metaTitle || (typeof comp.title === "string" ? comp.title : ""),
    fallback: !!comp.fallback,
    fallbackReason: comp.fallbackReason ? String(comp.fallbackReason) : "",
    inserted: !!uploadTarget && !comp.fallback,
    label: targetLabel,
  };
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
// Titel/Kategorie gehören dieser Aufnahme (false bei Aufnahme-Anker: das Ziel hat beides schon).
// Sichtbar ist der Block erst beim Prüfen (renderGuidePhase, Welle 50a).
let guideMetaEnabled = false;

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
  // Aufnahme-Anker aktiv -> ganzer Block aus (Titel/Kategorie gehören der Ziel-Anleitung).
  guideMetaEnabled = !(pendingTarget && pendingTarget.target);
  if (guidePhase !== "idle") renderGuidePhase();
  if (!guideMetaEnabled) return;

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
  if (!guideMetaEnabled || !els.guideTitle) return "";
  return (els.guideTitle.value || "").trim();
}

// Kategorie-Nutzlast für den complete-Request: { id } | { name } | null.
function guideCategoryPayload() {
  if (!guideMetaEnabled) return null;
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
// ANLEITUNGS-LISTEN + „FÜR DIESE SEITE" (Welle 31c/32, Welle 50a: sofort aus dem Speicher).
//
// DATENSCHUTZ (PFLICHT): Die besuchte URL verlässt NIEMALS den Browser. Vom Server kommt nur die
// Anleitungs-LISTE (inkl. site_domains); das Abgleichen der aktuellen Tab-URL passiert REIN LOKAL
// (site-match.js). Tab-Wechsel lösen KEINEN Request aus — sie matchen nur gegen die Liste.
//
// 5-SEKUNDEN-FIX (Welle 50a): Das Panel-Dokument wird beim Schließen zerstört, der Speicher im
// Dokument ist beim Öffnen also IMMER leer. Darum:
//   1) Beim Öffnen die zuletzt bekannten Listen aus chrome.storage.local lesen (badgeCache =
//      Konto-Anleitungen, steplyDocCache = Steply-lernen-Anleitungen; beide teilt sich das Panel
//      mit dem Icon-Badge im Service-Worker) und SOFORT rendern.
//   2) Im Hintergrund BEIDE Listen PARALLEL (Promise.all) neu holen und an Ort und Stelle ersetzen.
//   3) siteSeq verwirft veraltete Render-Durchläufe (Tab-Wechsel während eines Abrufs).
//   4) Nichts verschiebt beim Laden das Layout: „Für diese Seite" ist eine FESTE Zeile, nur die
//      Zahl darin wechselt.
// ============================================================================

let siteTutorials = null; // Konto-Anleitungen (Liste) oder null = noch unbekannt
let siteTutorialsError = false; // letzter Abruf gescheitert: true (Netz) | "auth" (Code ungültig) | false
let siteMatchFetchedAt = 0; // Zeitpunkt des letzten Abruf-VERSUCHS (0 = frisch holen)
const SITE_MATCH_TTL = 5 * 60 * 1000; // Liste ~5 min als aktuell betrachten
let accountListFetch = null; // laufender Abruf (Dedupe)
let siteSeq = 0; // Sequenz-Zähler gegen veraltete Antworten/Render-Durchläufe
let activeUrl = ""; // URL des aktiven Tabs (NUR lokal)
let siteMatches = null; // Treffer für die aktive Seite oder null (noch unbekannt)

// Beim Öffnen: zuletzt bekannte Listen aus dem Speicher übernehmen (vor dem ersten Rendern).
// badgeCache.fp (Panel UND Service-Worker schreiben ihn) muss zum aktuellen Token passen — so
// wird nach einem Kontowechsel nie die Liste des alten Kontos gezeigt. Einträge ohne fp (ältere
// Versionen) werden ignoriert; dann füllt erst die Netzantwort die Liste.
async function loadListCaches() {
  try {
    const r = await chrome.storage.local.get(["badgeCache", "steplyDocCache"]);
    const b = r && r.badgeCache;
    if (hasToken && b && Array.isArray(b.tutorials) && b.fp && b.fp === tokenFp(cfg.token)) {
      siteTutorials = b.tutorials;
    }
    const d = r && r.steplyDocCache;
    if (d && Array.isArray(d.tutorials)) steplyDocs = normalizeDocs(d.tutorials);
  } catch (err) {
    /* ohne Speicher: erst die Netzantwort füllt die Listen */
  }
}

// Konto-Anleitungen holen (Bearer-Token). Erfolg ersetzt die Liste an Ort und Stelle; ein
// Fehler lässt die zuletzt bekannte Liste stehen (siteTutorialsError = Hinweis im Reiter).
function fetchAccountTutorials() {
  if (!cfg.token) return Promise.resolve(null);
  if (accountListFetch) return accountListFetch;
  const token = cfg.token;
  siteMatchFetchedAt = Date.now();
  let self = null;
  self = accountListFetch = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(appBase() + "/api/recorder/tutorials", {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (token !== cfg.token) return null; // Token wechselte unterwegs → verwerfen (neuer Abruf folgt)
      if (res.status === 401) {
        // Code ungültig (in Steply erneuert/widerrufen): KEIN Netzproblem — alte Liste verwerfen
        // und klar zum Neu-Verbinden auffordern.
        siteTutorials = null;
        siteTutorialsError = "auth";
        try {
          chrome.storage.local.remove("badgeCache");
        } catch (err) {
          /* egal */
        }
        return null;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      const body = await res.json().catch(() => ({}));
      siteTutorials = Array.isArray(body.tutorials) ? body.tutorials : [];
      siteTutorialsError = false;
      // Icon-Badge (Welle 32, Punkt E) + Sofort-Anzeige beim nächsten Öffnen. DATENSCHUTZ: NUR die
      // Liste (inkl. site_domains) — die besuchte URL wird NIE gespeichert/gesendet.
      try {
        chrome.storage.local.set({
          badgeCache: { tutorials: siteTutorials, at: Date.now(), fp: tokenFp(token) },
        });
      } catch (err) {
        /* reiner Komfort */
      }
      return siteTutorials;
    } catch (err) {
      siteTutorialsError = true;
      return siteTutorials;
    } finally {
      // Nur den EIGENEN Abruf austragen — nach einem Kontowechsel läuft evtl. schon der neue.
      if (accountListFetch === self) accountListFetch = null;
      if (token === cfg.token) onListsChanged();
    }
  })();
  return accountListFetch;
}

// Liste mit TTL: frisch genug → aus dem Speicher, sonst holen.
async function loadSiteTutorials() {
  if (!cfg.token) return null;
  if (siteTutorials && Date.now() - siteMatchFetchedAt < SITE_MATCH_TTL) return siteTutorials;
  return fetchAccountTutorials();
}

// Beide Listen parallel aktualisieren (nur was veraltet ist). Rendert nach JEDER Antwort neu.
function refreshLists(force) {
  const jobs = [];
  // Ungültiger Code: nicht bei jedem Tab-Wechsel erneut fragen (höchstens 1× pro Minute).
  const authBackoff =
    !force && siteTutorialsError === "auth" && Date.now() - siteMatchFetchedAt < 60 * 1000;
  if (hasToken && !authBackoff && (force || !siteTutorials || Date.now() - siteMatchFetchedAt >= SITE_MATCH_TTL)) {
    jobs.push(fetchAccountTutorials());
  }
  if (force) steplyDocsFetchedAt = 0;
  const docsAge = Date.now() - steplyDocsFetchedAt;
  // Ohne Liste (offline/Fehler) nicht bei JEDEM Tab-Wechsel neu fragen: kurze Pause nach dem Versuch.
  if (steplyDocs ? docsAge >= STEPLY_DOC_TTL : docsAge >= STEPLY_DOC_RETRY) {
    jobs.push(loadSteplyDocs().then(onListsChanged, onListsChanged));
  }
  return Promise.all(jobs);
}

// Eine Liste hat sich geändert: Treffer neu berechnen und sichtbare Stellen ersetzen.
function onListsChanged() {
  computeSiteMatches();
  renderSiteRow();
  if (currentSection === "guides") renderGuidesList();
  if (currentSection === "steplyLearn") renderSteplyLearn();
}

// Treffer für die aktive Seite (REIN LOKAL). null = Listen noch unbekannt.
function computeSiteMatches() {
  if (typeof SteplySiteMatch === "undefined") {
    siteMatches = [];
    return;
  }
  if (siteTutorials === null && steplyDocs === null) {
    siteMatches = null;
    return;
  }
  const host = SteplySiteMatch.hostnameOf(activeUrl);
  if (!host) {
    siteMatches = [];
    return;
  }
  const merged = mergeTutorialsById(siteTutorials || [], steplyDocs || []);
  siteMatches = SteplySiteMatch.matchTutorials(activeUrl, merged);
}

// Feste Zeile „Für diese Seite (n) ›" + Zähler am Reiter „Anleitungen". Ändert nur Text/Zahl —
// Höhe und Lage bleiben gleich (kein Layout-Sprung).
function renderSiteRow() {
  const badge = els.siteRowCount;
  const isSite = typeof SteplySiteMatch !== "undefined" && !!SteplySiteMatch.hostnameOf(activeUrl);
  let text = "…";
  let cls = "badge is-loading";
  let n = 0;
  if (!isSite) {
    text = "–";
    cls = "badge is-zero";
  } else if (siteMatches) {
    n = siteMatches.length;
    text = String(n);
    cls = n ? "badge" : "badge is-zero";
  } else if (siteTutorialsError) {
    text = "–";
    cls = "badge is-zero";
  }
  if (badge) {
    badge.textContent = text;
    badge.className = cls;
  }
  if (els.siteRow) {
    els.siteRow.title = !isSite
      ? "Auf dieser Seite gibt es keine Anleitungen (keine normale Website)."
      : siteMatches
        ? n === 1
          ? "1 Anleitung für diese Seite"
          : n + " Anleitungen für diese Seite"
        : "Anleitungen werden geladen …";
  }
  if (els.tabGuidesCount) {
    els.tabGuidesCount.textContent = n ? String(n) : "";
    els.tabGuidesCount.hidden = !n;
  }
}

// Aktive Seite neu bewerten (Tab-Wechsel, Öffnen). Rendert SOFORT gegen die bekannten Listen;
// ein Netzabruf läuft nur, wenn die Liste veraltet ist, und ersetzt die Anzeige dann an Ort und
// Stelle. siteSeq verwirft Ergebnisse, die von einem neueren Aufruf überholt wurden.
async function refreshSiteMatch() {
  const seq = ++siteSeq;
  const url = await currentActiveUrl();
  if (seq !== siteSeq) return; // überholt
  activeUrl = url;
  onListsChanged();
  refreshLists(false);
}

// ============================================================================
// „STEPLY LERNEN" (Welle 35): die ÖFFENTLICHEN Steply-Anleitungen erscheinen für JEDEN
// Kunden — auch OHNE Verbindung (Onboarding). Sie kommen von GET /api/guide/steply (kein
// Token!). App-URL = appBase() (gespeicherte steplyAppUrl bzw. DEFAULT_APP_URL als Fallback).
// ~15 min Cache: in-memory + chrome.storage.local (mit dem Icon-Badge im Service-Worker
// geteilt). Jeder Eintrag wird auf { ..., status:"published", source:"steply" } normalisiert,
// damit site-match/Badge (published-Filter) und der Führungs-Flow (Quelle) ihn erkennen.
// ============================================================================
const STEPLY_DOC_TTL = 15 * 60 * 1000; // 15 min
let steplyDocs = null; // normalisierte Liste oder null (nicht verfügbar)
let steplyDocsFetchedAt = 0; // Zeitpunkt des letzten Fetch-VERSUCHS
const STEPLY_DOC_RETRY = 60 * 1000; // ohne Liste: frühestens nach 1 min erneut versuchen
let steplyDocsError = false;
let steplyDocsFetch = null; // laufender Abruf (Dedupe)

// Rohliste -> normalisiert (published + Quelle „steply"); nur brauchbare Einträge.
function normalizeDocs(list) {
  return (Array.isArray(list) ? list : [])
    .filter((t) => t && t.id && t.slug)
    .map((t) => ({ ...t, status: "published", source: "steply" }));
}

// Doku-Liste holen (kein Token), ~15 min gecacht. Bei Fehler/Offline: zuletzt bekannte Liste
// (in-memory oder chrome.storage.local); erst danach null. Fail-silent.
function loadSteplyDocs() {
  const now = Date.now();
  if (steplyDocs && now - steplyDocsFetchedAt < STEPLY_DOC_TTL) return Promise.resolve(steplyDocs);
  if (!steplyDocs && steplyDocsFetchedAt && now - steplyDocsFetchedAt < STEPLY_DOC_RETRY) {
    return Promise.resolve(null);
  }
  if (steplyDocsFetch) return steplyDocsFetch;
  steplyDocsFetchedAt = now;
  steplyDocsFetch = (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(appBase() + "/api/guide/steply", { method: "GET", signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        steplyDocs = normalizeDocs(body.tutorials);
        steplyDocsError = false;
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
    steplyDocsError = true;
    if (steplyDocs) return steplyDocs;
    try {
      const c = (await chrome.storage.local.get("steplyDocCache")).steplyDocCache;
      if (c && Array.isArray(c.tutorials)) {
        steplyDocs = normalizeDocs(c.tutorials);
        return steplyDocs;
      }
    } catch (e) {
      /* egal */
    }
    return null;
  })().finally(() => {
    steplyDocsFetch = null;
  });
  return steplyDocsFetch;
}

// Zwei Anleitungs-Listen per id zusammenführen: `primary` gewinnt bei Duplikaten (so erscheinen
// Steply-Anleitungen NICHT doppelt, wenn der Nutzer mit dem Steply-Konto verbunden ist).
function mergeTutorialsById(primary, secondary) {
  const seen = new Set((primary || []).map((t) => t && t.id).filter(Boolean));
  const out = (primary || []).slice();
  for (const t of secondary || []) if (t && t.id && !seen.has(t.id)) out.push(t);
  return out;
}

// Eigene Ansicht „Steply lernen" (?-Menü; auch UNVERBUNDEN erreichbar).
let learnSelectedId = null;

function showSteplyLearn() {
  learnSelectedId = null;
  show("steplyLearn");
  // Erst den Abruf anstoßen (setzt steplyDocsFetch), dann rendern → Platzhalter statt Fehler.
  const p = loadSteplyDocs();
  renderSteplyLearn();
  p.then(onListsChanged, onListsChanged);
}

function renderSteplyLearn() {
  const list = els.steplyLearnList;
  list.textContent = "";
  els.steplyLearnEmpty.hidden = true;
  if (!steplyDocs || !steplyDocs.length) {
    if (steplyDocsFetch) {
      appendSkeletons(list, 3);
      return;
    }
    els.steplyLearnHint.textContent = "Die Steply-Anleitungen konnten gerade nicht geladen werden.";
    els.steplyLearnEmpty.hidden = false;
    return;
  }
  // Reihenfolge des Servers (= Hub-Reihenfolge) beibehalten; Überschrift je Kategorie-Wechsel.
  let lastKey = null;
  for (const t of steplyDocs) {
    const cat = t.category && typeof t.category === "object" ? t.category : null;
    const key = cat && cat.id ? cat.id : "__none__";
    if (key !== lastKey) {
      lastKey = key;
      list.appendChild(sectHeading(cat && cat.name ? cat.name : "Weitere"));
    }
    list.appendChild(
      buildTutorialItem(t, {
        selected: learnSelectedId === t.id,
        onSelect: () => {
          learnSelectedId = learnSelectedId === t.id ? null : t.id;
          renderSteplyLearn();
        },
      })
    );
  }
}

function appendSkeletons(container, n) {
  for (let i = 0; i < n; i++) {
    const s = document.createElement("div");
    s.className = "skeleton";
    s.setAttribute("aria-hidden", "true");
    container.appendChild(s);
  }
}

function sectHeading(text) {
  const h = document.createElement("div");
  h.className = "sect";
  h.textContent = text;
  return h;
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

// Kategorie-Punktfarbe: stabil je Kategorie-id (die Liste liefert keine Farbe).
const CAT_COLORS = ["#ef6a4e", "#18a999", "#6d59d8", "#c07d16", "#3b82c4"];
function catColor(id) {
  let h = 0;
  const s = String(id || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
}

// ── EINE Listen-Karte für Anleitungen (Reiter „Anleitungen" + „Steply lernen") ──────────────
// Titel (zweizeilig), Meta (Kategorie-Punkt + Name · n Schritte · Status als WORT). Ausgewählt →
// Aktionen „Auf der Seite zeigen" (Live-Führung) und „Öffnen" (in der Steply-App; nur Konto).
function buildTutorialItem(t, opts) {
  const selected = !!(opts && opts.selected);
  const item = document.createElement("div");
  item.className = "item" + (selected ? " sel" : "");
  item.dataset.id = t.id;
  if (!selected) {
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    item.setAttribute("aria-expanded", "false");
  }

  const h = document.createElement("div");
  h.className = "h";
  const title = document.createElement("span");
  title.textContent = t.title || "Ohne Titel";
  h.appendChild(title);
  item.appendChild(h);

  const m = document.createElement("div");
  m.className = "m";
  const cat = t.category && typeof t.category === "object" ? t.category : null;
  if (cat && cat.name) {
    const c = document.createElement("span");
    c.className = "cat";
    const dot = document.createElement("i");
    dot.style.background = catColor(cat.id || cat.name);
    c.appendChild(dot);
    c.appendChild(document.createTextNode(cat.name));
    m.appendChild(c);
  }
  const n = Number(t.stepCount) || 0;
  const steps = document.createElement("span");
  steps.textContent = (cat && cat.name ? "· " : "") + (n === 1 ? "1 Schritt" : n + " Schritte");
  m.appendChild(steps);
  if (t.source !== "steply") {
    const published = t.status === "published";
    const st = document.createElement("span");
    st.className = "st " + (published ? "live" : "draft");
    st.textContent = published ? "Veröffentlicht" : "Entwurf";
    m.appendChild(st);
  }
  item.appendChild(m);

  if (selected) {
    const act = document.createElement("div");
    act.className = "act";
    const showBtn = document.createElement("button");
    showBtn.type = "button";
    showBtn.className = "btn primary";
    showBtn.appendChild(icon("play"));
    showBtn.appendChild(document.createTextNode("Auf der Seite zeigen"));
    showBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (t.source === "steply") guideStart(t.slug, "steply");
      else guideStart(t.id, "account");
    });
    act.appendChild(showBtn);
    if (t.source !== "steply") {
      const openBtn = document.createElement("button");
      openBtn.type = "button";
      openBtn.className = "btn ghost";
      openBtn.appendChild(icon("ext"));
      openBtn.appendChild(document.createTextNode("Öffnen"));
      openBtn.title = "In Steply öffnen";
      openBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openAppTab("/app/tutorials/" + encodeURIComponent(t.id));
      });
      act.appendChild(openBtn);
    }
    item.appendChild(act);
  } else if (opts && opts.onSelect) {
    item.addEventListener("click", opts.onSelect);
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        opts.onSelect();
      }
    });
  }
  return item;
}

// ============================================================================
// REITER „ANLEITUNGEN" (Welle 50a) — ersetzt „Für diese Seite", „Anleitung führen" und die
// Führen-Liste: EINE Liste mit Suche, Filter „Diese Seite | Alle" und Schalter „Entwürfe".
// Die Auswahl bleibt in chrome.storage.session. Matching REIN LOKAL (site-match.js).
// ============================================================================
const FUEHREN_FILTER_DEFAULT = { site: "page", live: "drafts" };
let fuehrenFilter = { ...FUEHREN_FILTER_DEFAULT };
let fuehrenFilterLoaded = false;
let guidesQuery = "";
let guidesSelectedId = null;

async function loadFuehrenFilter() {
  try {
    const r = await chrome.storage.session.get("fuehrenFilter");
    const f = r && r.fuehrenFilter;
    if (f && (f.site === "page" || f.site === "all") && (f.live === "live" || f.live === "drafts")) {
      fuehrenFilter = { site: f.site, live: f.live };
    }
  } catch (err) {
    /* Session-Storage optional -> Standard */
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
  els.chipSite.classList.toggle("on", fuehrenFilter.site === "page");
  els.chipAll.classList.toggle("on", fuehrenFilter.site === "all");
  els.chipSite.setAttribute("aria-pressed", fuehrenFilter.site === "page" ? "true" : "false");
  els.chipAll.setAttribute("aria-pressed", fuehrenFilter.site === "all" ? "true" : "false");
  const drafts = fuehrenFilter.live === "drafts";
  els.chipDrafts.classList.toggle("on", drafts);
  els.chipDrafts.setAttribute("aria-pressed", drafts ? "true" : "false");
  els.chipDrafts.title = drafts ? "Entwürfe werden angezeigt – zum Ausblenden klicken" : "Entwürfe einblenden";
}

function setFuehrenFilter(patch) {
  fuehrenFilter = { ...fuehrenFilter, ...patch };
  guidesSelectedId = null;
  renderFuehrenChips();
  saveFuehrenFilter();
  renderGuidesList();
}

// Sortierung für „Alle": veröffentlicht vor Entwurf, dann Titel A→Z.
function fuehrenSort(a, b) {
  const ap = a.status === "published" ? 0 : 1;
  const bp = b.status === "published" ? 0 : 1;
  if (ap !== bp) return ap - bp;
  return String(a.title || "").localeCompare(String(b.title || ""));
}

async function showGuides(opts) {
  if (!hasToken) return;
  if (!fuehrenFilterLoaded) await loadFuehrenFilter();
  if (opts && opts.site && opts.site !== fuehrenFilter.site) {
    fuehrenFilter = { ...fuehrenFilter, site: opts.site };
    saveFuehrenFilter();
  }
  show("guides");
  renderFuehrenChips();
  renderGuidesList();
  refreshSiteMatch();
}

function guidesMatchQuery(t) {
  if (!guidesQuery) return true;
  const hay = (String(t.title || "") + " " + String((t.category && t.category.name) || "")).toLowerCase();
  return hay.indexOf(guidesQuery) >= 0;
}

// Liste des Reiters rendern (gefiltert, durchsucht). Ersetzt die Anzeige an Ort und Stelle.
function renderGuidesList() {
  const listEl = els.guidesList;
  listEl.textContent = "";
  els.guidesEmpty.hidden = true;

  const siteRestricted = fuehrenFilter.site === "page";
  const hasSite = typeof SteplySiteMatch !== "undefined" && !!SteplySiteMatch.hostnameOf(activeUrl);

  // Noch nichts bekannt: Platzhalter (Abruf läuft) bzw. Fehler mit „Erneut versuchen".
  if (siteTutorials === null) {
    if (siteTutorialsError === "auth") {
      showGuidesEmpty(
        "Die Verbindung zu Steply ist nicht mehr gültig (z. B. weil sie in den Einstellungen getrennt wurde). Verbinden Sie die Steply-Erweiterung in Steply unter „Einstellungen → Steply-Erweiterung“ neu.",
        null
      );
      return;
    }
    if (accountListFetch || !siteTutorialsError) {
      appendSkeletons(listEl, 3);
      return;
    }
    showGuidesEmpty("Die Anleitungen konnten nicht geladen werden.", "retry");
    return;
  }

  let list = siteTutorials.slice();
  if (fuehrenFilter.live === "live") list = list.filter((t) => t.status === "published");
  let docs = (steplyDocs || []).filter((d) => !list.some((t) => t.id === d.id));
  if (siteRestricted) {
    list = hasSite ? SteplySiteMatch.matchTutorials(activeUrl, list) : [];
    docs = hasSite ? SteplySiteMatch.matchTutorials(activeUrl, docs) : [];
  } else {
    list.sort(fuehrenSort);
  }
  list = list.filter(guidesMatchQuery);
  docs = docs.filter(guidesMatchQuery);

  const renderItem = (t) =>
    buildTutorialItem(t, {
      selected: guidesSelectedId === t.id,
      onSelect: () => {
        guidesSelectedId = guidesSelectedId === t.id ? null : t.id;
        renderGuidesList();
      },
    });

  for (const t of list) listEl.appendChild(renderItem(t));
  if (docs.length) {
    listEl.appendChild(sectHeading("Steply lernen"));
    for (const t of docs) listEl.appendChild(renderItem(t));
  }

  if (!list.length && !docs.length) {
    if (guidesQuery) {
      showGuidesEmpty("Keine Anleitung passt zu „" + guidesQuery + "“.", null);
    } else if (siteRestricted && !hasSite) {
      showGuidesEmpty("Diese Seite ist keine normale Website. „Alle“ zeigt alle Anleitungen.", "all");
    } else if (siteRestricted) {
      showGuidesEmpty("Für diese Seite gibt es noch keine Anleitung.", "record");
    } else if (fuehrenFilter.live === "live" && siteTutorials.length) {
      showGuidesEmpty("Keine veröffentlichten Anleitungen. Schalten Sie „Entwürfe“ ein, um mehr zu sehen.", null);
    } else {
      showGuidesEmpty("Noch keine Anleitungen vorhanden.", "record");
    }
  }
  // Hinweis, wenn nur die zuletzt bekannte Liste gezeigt werden kann (und wieder weg, sobald frisch).
  if (siteTutorialsError && (list.length || docs.length)) setStatus(STALE_LIST_MSG, "");
  else if (els.status.textContent === STALE_LIST_MSG) setStatus("");
}

const STALE_LIST_MSG = "Die Liste ist evtl. nicht aktuell – Steply war gerade nicht erreichbar.";

// Leer-/Fehlerzustand mit passender Aktion: "retry" | "record" | "all" | null.
function showGuidesEmpty(text, action) {
  els.guidesEmptyText.textContent = text;
  const btn = els.guidesEmptyAction;
  btn.textContent = "";
  btn.hidden = !action;
  if (action === "retry") {
    btn.appendChild(icon("refresh"));
    btn.appendChild(document.createTextNode("Erneut versuchen"));
  } else if (action === "record") {
    btn.textContent = "Jetzt aufnehmen";
  } else if (action === "all") {
    btn.textContent = "Alle anzeigen";
  }
  btn.dataset.action = action || "";
  els.guidesEmpty.hidden = false;
}

function onGuidesEmptyAction() {
  const a = els.guidesEmptyAction.dataset.action;
  if (a === "retry") {
    siteTutorialsError = false;
    renderGuidesList();
    refreshLists(true);
  } else if (a === "record") {
    showStart();
  } else if (a === "all") {
    setFuehrenFilter({ site: "all" });
  }
}

// Aktiven Tab beobachten (Tab-Wechsel + URL-Änderung). KEIN Netz-Request pro Wechsel —
// refreshSiteMatch matcht gegen die bekannte Liste (Datenschutz, s. o.).
try {
  chrome.tabs.onActivated.addListener(() => {
    refreshSiteMatch();
  });
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo && changeInfo.url) refreshSiteMatch();
  });
} catch (err) {
  /* tabs-API nicht verfügbar -> Zeile bleibt still */
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
  // Panel-Fenster ODER aus der Aufnahme geöffnetes Popup (Welle 48a, guideExtraTabs).
  if (!guideAcceptsSender(sender)) return;
  if (guideSteps.length >= MAX_GUIDE_STEPS) return;
  // iframe-Schritt (Welle 48): content.js kennt dort nur die iframe-Adresse. Seite/Titel des
  // Schritts sind aber die des TABS (Seiten-Zuordnung, Führung, Automations-Navigation);
  // die iframe-Adresse steht in interaction.frame.url.
  const st = msg.step;
  if (st && st.interaction && st.interaction.frame && sender.tab.url) {
    st.url = String(sender.tab.url).slice(0, 500);
    if (sender.tab.title) st.title = String(sender.tab.title).slice(0, 200);
  }
  // Kleine FIFO-Queue statt Einzel-Slot: schnelle Folgen (Eingabe + Klick) gehen NICHT
  // verloren. windowId des Klick-Tabs merken: Screenshot gezielt aus DIESEM Fenster
  // (robuster als das beim Panel-Start ermittelte Fenster, z. B. bei mehreren Fenstern).
  // Welle 51: keine Kappe mehr — jeder Schritt bleibt erhalten (s. drainGuideQueue).
  guideQueue.push({ step: msg.step, tabId: sender.tab.id, windowId: sender.tab.windowId, at: Date.now() });
  if (guideCapturing) guideBusyHint();
  drainGuideQueue();
});

// ── Nachträge zu Schritten (Welle 48b) ──────────────────────────────────────────────────────
// content.js schickt nach einem Schritt ggf. noch:
//   steply-guide-patch   {ts, interaction}      Doppelklick / Ziehen -> in den Schritt mergen
//   steply-guide-retract {ts}                   Schritt entfernen (Rechtsklick ohne eigenes Menü,
//                                               Enter = Zeilenumbruch, Ziehen ohne Ablegen)
//   steply-frame-geo     {key, rect, sensitive} echte Markierungs-Lage eines iframe-Schritts
// Der Schritt kann dann in der Queue stecken, gerade fotografiert werden (weder Queue noch
// Liste) oder schon in der Liste sein — alle drei Fälle werden bedient; der mittlere über
// guideAmendPending, das addGuideStep beim Aufnehmen einlöst. Adressiert wird über
// Absender-Tab + ts (bzw. Tab + frameKey). SICHERHEIT: Nachträge ändern NUR interaction
// (bekannte Schlüssel) bzw. die Markierungs-Geometrie — nie Label/Bild/URL.
const GUIDE_AMEND_TTL = 15000; // ms: so lange warten Nachträge auf „ihren" Schritt
let guideAmendPending = { patch: new Map(), retract: new Map(), geo: new Map() };

function guideAmendKey(tabId, id) {
  return String(tabId) + ":" + String(id);
}

// PUR: eine 0..1-Box prüfen/klemmen (wie der Server). null bei ungültigen Zahlen.
function guideCleanRect(r) {
  if (!r || typeof r !== "object") return null;
  const out = {};
  for (const k of ["x", "y", "w", "h"]) {
    const n = r[k];
    if (typeof n !== "number" || !isFinite(n) || n < -0.001 || n > 1.001) return null;
    out[k] = Math.min(1, Math.max(0, n));
  }
  if (out.x + out.w > 1) out.w = Math.max(0, 1 - out.x);
  if (out.y + out.h > 1) out.h = Math.max(0, 1 - out.y);
  return out;
}

// PUR: Geo-Nachricht prüfen -> { rect, sensitive } oder null.
function guideCleanGeo(msg) {
  if (!msg || typeof msg.key !== "string" || !/^[a-z0-9]{8,40}$/.test(msg.key)) return null;
  const rect = guideCleanRect(msg.rect);
  if (!rect) return null;
  const sensitive = Array.isArray(msg.sensitive)
    ? msg.sensitive.slice(0, 10).map(guideCleanRect).filter((r) => r && r.w * r.h > 0)
    : [];
  return { rect, sensitive };
}

// PUR: interaction-Nachtrag in einen Schritt mergen — nur bekannte Schlüssel (der Server
// validiert ohnehin streng). frame kommt NIE per patch (nur mit dem Schritt selbst).
const GUIDE_PATCH_KEYS = ["enter", "variant", "key", "drop", "dropLabel", "hover", "hoverLabel"];
function guideMergeInteraction(step, patch) {
  if (!step || !patch || typeof patch !== "object" || Array.isArray(patch)) return false;
  let changed = false;
  const inter =
    step.interaction && typeof step.interaction === "object" ? Object.assign({}, step.interaction) : {};
  for (const k of GUIDE_PATCH_KEYS) {
    if (patch[k] === undefined) continue;
    inter[k] = patch[k];
    changed = true;
  }
  if (changed) step.interaction = inter;
  return changed;
}

// PUR: Geo in einen Schritt übernehmen (Roh-Schritt der Queue ODER Listen-Schritt).
function guideApplyGeo(step, geo) {
  step.rect = geo.rect;
  step.sensitive = geo.sensitive.length ? geo.sensitive : null;
}

// PUR (bis auf die übergebenen Container): einen Nachtrag anwenden.
//   steps   = Liste der aufgenommenen Schritte ({ ts, tabId, frameKey, interaction, rect, … })
//   queue   = wartende Einträge ({ step, tabId })
//   pending = { patch, retract, geo } (Maps) für Schritte, die gerade fotografiert werden
// Rückgabe: { removed: <Listen-Schritt>|null, changed: bool } (removed/changed -> neu zeichnen).
function guideApplyAmend(steps, queue, pending, msg, tabId, now) {
  const res = { removed: null, changed: false };
  if (!msg || typeof msg !== "object") return res;
  for (const m of [pending.patch, pending.retract, pending.geo]) {
    for (const [k, v] of m) if (now - v.at > GUIDE_AMEND_TTL) m.delete(k);
  }
  if (msg.type === "steply-frame-geo") {
    const geo = guideCleanGeo(msg);
    if (!geo) return res;
    const qi = queue.find((q) => q.tabId === tabId && q.step && q.step.frameKey === msg.key);
    if (qi) {
      guideApplyGeo(qi.step, geo);
      return res;
    }
    const s = steps.find((x) => x.tabId === tabId && x.frameKey === msg.key);
    if (s) {
      guideApplyGeo(s, geo);
      res.changed = true;
      return res;
    }
    pending.geo.set(guideAmendKey(tabId, msg.key), { geo, at: now });
    return res;
  }
  const ts = msg.ts;
  if (typeof ts !== "number" || !isFinite(ts)) return res;
  if (msg.type === "steply-guide-patch") {
    const qi = queue.find((q) => q.tabId === tabId && q.step && q.step.ts === ts);
    if (qi) {
      guideMergeInteraction(qi.step, msg.interaction);
      return res;
    }
    const s = steps.find((x) => x.tabId === tabId && x.ts === ts);
    if (s) {
      res.changed = guideMergeInteraction(s, msg.interaction);
      return res;
    }
    const key = guideAmendKey(tabId, ts);
    const prev = pending.patch.get(key);
    const merged = prev ? Object.assign({}, prev.interaction, msg.interaction) : msg.interaction;
    pending.patch.set(key, { interaction: merged, at: now });
    return res;
  }
  if (msg.type === "steply-guide-retract") {
    const qi = queue.findIndex((q) => q.tabId === tabId && q.step && q.step.ts === ts);
    if (qi >= 0) {
      queue.splice(qi, 1);
      return res;
    }
    const s = steps.find((x) => x.tabId === tabId && x.ts === ts);
    if (s) {
      res.removed = s;
      return res;
    }
    pending.retract.set(guideAmendKey(tabId, ts), { at: now });
  }
  return res;
}

// PUR: beim Aufnehmen eines (gerade fotografierten) Roh-Schritts wartende Nachträge
// einlösen. false = zurückgenommen (nicht aufnehmen).
function guideTakePending(src, tabId, pending, now) {
  if (!src) return false;
  const key = guideAmendKey(tabId, src.ts);
  const r = pending.retract.get(key);
  if (r) {
    pending.retract.delete(key);
    if (now - r.at <= GUIDE_AMEND_TTL) return false;
  }
  const p = pending.patch.get(key);
  if (p) {
    pending.patch.delete(key);
    guideMergeInteraction(src, p.interaction);
  }
  if (typeof src.frameKey === "string") {
    const gk = guideAmendKey(tabId, src.frameKey);
    const g = pending.geo.get(gk);
    if (g) {
      pending.geo.delete(gk);
      guideApplyGeo(src, g.geo);
    }
  }
  return true;
}

// PUR: Anzeige-Text eines Schritts in der Liste — zeigt, WAS es ist (Rechtsklick, Ziehen, …).
function guideStepLabel(s, i) {
  const base = s.label || (s.action === "type" ? "Eingabe" : "Schritt " + (i + 1));
  const it = s.interaction && typeof s.interaction === "object" ? s.interaction : null;
  if (!it) return base;
  let text = base;
  if (it.variant === "key") {
    const key = typeof it.key === "string" ? it.key : "";
    text = "Taste: " + key + (s.label && s.label !== key ? " · " + s.label : "");
  } else if (it.variant === "right") {
    text = "Rechtsklick: " + base;
  } else if (it.variant === "double") {
    text = "Doppelklick: " + base;
  } else if (it.variant === "drag") {
    text = "Ziehen: " + base + " → " + (it.dropLabel || "Ziel");
  } else if (it.enter) {
    text = base + " ↵";
  }
  if (it.hoverLabel && it.variant !== "key") text = it.hoverLabel + " › " + text;
  return text;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (
    !msg ||
    (msg.type !== "steply-guide-patch" &&
      msg.type !== "steply-guide-retract" &&
      msg.type !== "steply-frame-geo")
  ) {
    return;
  }
  // Nachträge ändern nur BESTEHENDE Schritte → auch kurz nach Pause/Stopp noch annehmen (der
  // Chat-Enter-Rückzug kommt z. B. erst 400 ms später). Popups wie bei den Schritten selbst.
  if (!guideActive && guidePhase !== "paused" && guidePhase !== "stopped") return;
  if (!guideAcceptsSender(sender)) return;
  const res = guideApplyAmend(
    guideSteps,
    guideQueue,
    guideAmendPending,
    msg,
    sender.tab.id,
    Date.now()
  );
  if (res.removed) removeGuideStep(res.removed);
  else if (res.changed) renderGuideSteps();
});

// Live-Pairing (Welle 25): Wird das Panel verbunden, WÄHREND es offen ist (Seite ->
// content.js -> background.js -> chrome.storage.local.set), aktualisiert sich die Anzeige
// SOFORT - ohne Neuöffnen. Wir reagieren NUR auf steplyToken/steplyAppUrl (nicht auf den
// rec-Zustand) und stören eine laufende Aufnahme NICHT (nur Verbinden/Reiter werden gewechselt).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (!changes.steplyToken && !changes.steplyAppUrl) return;
  const recording =
    (mediaRecorder && mediaRecorder.state !== "inactive") || guideActive || guidePhase !== "idle";
  // Kontowechsel an den GESPEICHERTEN Werten erkennen (saveCfg setzt cfg.token schon vorher).
  const tokenChanged =
    !!changes.steplyToken && changes.steplyToken.oldValue !== changes.steplyToken.newValue;
  loadConfig().then(() => {
    if (tokenChanged) {
      // Anderes Konto (oder getrennt): nichts vom alten Konto weiter anzeigen.
      accountName = "";
      accountFetch = null;
      accountListFetch = null; // laufenden Abruf des alten Kontos nicht wiederverwenden
      siteTutorials = null;
      siteTutorialsError = false;
      // Gespeicherte Liste des alten Kontos verwerfen (der Service-Worker schreibt sie ohne fp).
      try {
        chrome.storage.local.remove("badgeCache");
      } catch (err) {
        /* egal */
      }
      autoListData = null;
      autoListFetch = null; // laufenden Abruf des alten Kontos nicht wiederverwenden
      computeSiteMatches();
    }
    fetchAccountName();
    siteMatchFetchedAt = 0; // Liste neu holen (Token wechselte evtl. Konto)
    recCategoriesFetchedAt = 0; // Kategorie-Cache (Welle 31d) verwerfen (Token evtl. anderes Konto)
    renderHeader();
    if (recording) return; // laufende Aufnahme nie unterbrechen
    // Nur auf Verbinden- bzw. Reiter-Bildschirmen neu einsteigen.
    const home = ["connect", "start", "guides", "automations", "autoPrep"];
    if (home.indexOf(currentSection) >= 0) {
      if (hasToken && (currentSection === "connect" || tokenChanged)) showStart();
      else if (!hasToken) showConnect("first");
      else if (currentSection === "start") showStart();
    }
  });
});

// Aufnahme-Anker (Welle 27): Wird das Panel WAEHREND es offen ist aus einem Einfuegepunkt
// angestossen (Builder -> content.js -> background.js -> pendingTarget), aktualisiert sich
// das Banner SOFORT. (background.js oeffnet die Seitenleiste zwar synchron, aber ein bereits
// offenes Panel bekommt kein „open" -> darum hier auf die storage-Aenderung reagieren.)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.pendingTarget) return;
  loadPendingTarget().then(() => {
    // Kommt das Ziel während einer laufenden Aufnahme, den Titel/Kategorie-Block passend
    // ein-/ausblenden (bei Aufnahme-Anker gehören sie der Ziel-Anleitung).
    if (guidePhase !== "idle") guideMetaPrepare();
  });
});

// ============================================================================
// RESET / NEUE AUFNAHME
// ============================================================================

function resetGuide() {
  guideNonce = ""; // neue Sitzung → neues Kanal-Geheimnis
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
  guideLastImage = null;
  guideCapturing = false;
  guideFinishing = false;
  guideActive = false;
  guideRemoveDownloadWatch();
  // Aufnahme-Phasen (Welle 48a): Vorgang beendet → Phase, Popups, Hinweise zurücksetzen.
  guideSeq++;
  guidePhase = "idle";
  guidePausedMs = 0;
  guidePauseAt = 0;
  guideHaltPromise = null;
  guideExtraTabs.clear();
  guideSetCaptureHint(false);
}

function resetVideo() {
  stopVideoWatch();
  setVideoDoneState("recorded");
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
      if (guideRunActive() && guide.tabId != null) {
        setTimeout(() => {
          if (!guidePort && guideRunActive() && guide.tabId != null) guidePortOpen(guide.tabId);
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
  els.runFallbackHint.removeAttribute("title");
}

function guideRenderDecision(step) {
  els.runNav.hidden = true; // Entscheidungen gehen über die Antwort-Buttons weiter
  els.runDecision.hidden = false;
  els.runDecision.textContent = "";
  const list = guide.branchesByStep.get(step.id) || [];
  list.forEach((b) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn primary";
    btn.textContent = b.label || "Weiter";
    btn.addEventListener("click", () => guideAnswer(b.target_step_id));
    els.runDecision.appendChild(btn);
  });
  if (guide.history.length) {
    const back = document.createElement("button");
    back.type = "button";
    back.className = "btn ghost";
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
    els.runNext.textContent = guideLinearNext(step) ? "Weiter" : "Fertig";
    const sel = step.selector;
    if (sel && typeof sel === "object" && (sel.css || sel.text || sel.role)) {
      // Overlay auf der Seite anfordern; found:false -> Fallback (siehe Message-Listener).
      sendGuideToTab({
        type: "steply-guide-show",
        // interaction (Welle 48): Hover-Menü/Rechtsklick/…/iframe — content.js passt Hinweis,
        // „weiter"-Erkennung und den zuständigen Frame daran an.
        step: { selector: sel, title: step.title, index: idx, total: total, interaction: guideInteraction(step) },
      });
    } else {
      // Ohne Selektor gleich Fallback (großer Screenshot + Hinweis).
      sendGuideToTab({ type: "steply-guide-hide" });
      guideSetFallback(
        true,
        "Für diesen Schritt gibt es keine Markierung auf der Seite – orientieren Sie sich am Screenshot.",
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
  guideBackToOrigin();
}

// Zurück dorthin, wo die Anleitung gestartet wurde (Reiter „Anleitungen" bzw. „Steply lernen").
function guideBackToOrigin() {
  if (guideOrigin === "steplyLearn" || !hasToken) showSteplyLearn();
  else showGuides();
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
  const t = find(siteTutorials) || find(steplyDocs);
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
// frame (Welle 48): Bedingung eines iframe-Schritts im passenden Frame prüfen (nicht oben).
function execEvalElementCondition(tabId, cond, frame) {
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
      const p = chrome.tabs.sendMessage(tabId, { type: "steply-eval-condition", cond: cond, frame: frame || null });
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
    elementFound = await execEvalElementCondition(exec.tabId, cond, (planStep && planStep.interaction && planStep.interaction.frame) || null);
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
let guideOrigin = "guides"; // Bildschirm, von dem aus die Anleitung gestartet wurde

async function guideStart(idOrSlug, source) {
  const src = source === "steply" ? "steply" : "account";
  const isDoc = src === "steply";
  if (!idOrSlug) return;
  if (!isDoc && !hasToken) return; // Konto-Anleitungen brauchen eine Verbindung; Steply lernen nicht
  if (guideStarting) return; // Doppelklick-Schutz
  guideStarting = true;
  try {
    await guideStartInner(idOrSlug, src);
  } finally {
    guideStarting = false;
  }
}
let guideStarting = false;

async function guideStartInner(idOrSlug, src) {
  const isDoc = src === "steply";
  guideOrigin = currentSection === "steplyLearn" ? "steplyLearn" : "guides";
  guide.source = src;
  setStatus("Anleitung wird geladen …", "");
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
    setStatus("Die Anleitung konnte nicht geladen werden. Bitte versuchen Sie es erneut.", "error");
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
  if (!guideRunActive()) return;
  // Nur vom gebundenen Tab akzeptieren.
  if (guide.tabId != null && sender && sender.tab && sender.tab.id !== guide.tabId) return;
  guideGoNext();
});

// content.js -> Panel: Selektor-Status. found:false -> Fallback + Drift-Telemetrie.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-guide-status") return;
  if (!guideRunActive()) return;
  if (guide.tabId != null && sender && sender.tab && sender.tab.id !== guide.tabId) return;
  // Erholung (Hotfix 06.07.): Findet die stille Wiederaufnahme das Element doch noch
  // (SPA/PPR hat es nur kurz versteckt/ersetzt), verlaesst das Panel den Fallback wieder.
  if (msg.found === true) {
    guideSetFallback(false);
    return;
  }
  if (msg.found === false) {
    const step = guide.curId != null ? guide.stepById.get(guide.curId) : null;
    // Technischer Grund (Welle 33, Fix 3) nur noch als Tooltip — nie im sichtbaren Text (Welle 50a).
    const reason = typeof msg.reason === "string" ? msg.reason.trim().slice(0, 60) : "";
    guideSetFallback(
      true,
      "Diese Stelle ist auf der Seite gerade nicht zu finden – orientieren Sie sich am Screenshot.",
    );
    if (reason) els.runFallbackHint.title = "Grund: " + reason;
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

// Erweiterte Interaktion (Welle 48) eines Führungs-Schritts: nur ein echtes Objekt durchreichen
// (content.js prüft die Felder selbst tolerant). Fehlt es → null = normaler Klick/normale Eingabe.
function guideInteraction(step) {
  const it = step && step.interaction;
  return it && typeof it === "object" && !Array.isArray(it) ? it : null;
}

// Overlay des aktuellen Schritts neu senden (exakt das bisherige Navigation-Überleben-Verhalten).
function guideResendOverlay(step) {
  const sel = step && step.selector;
  if (sel && typeof sel === "object" && (sel.css || sel.text || sel.role)) {
    sendGuideToTab({
      type: "steply-guide-show",
      step: {
        selector: sel,
        title: step.title,
        index: guide.history.length + 1,
        total: guideTotal(),
        interaction: guideInteraction(step),
      },
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
  setIconText(els.runFallbackHint, "lock", "Bitte kurz anmelden – Steply wartet und macht danach automatisch weiter.");
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
  if (!guideRunActive()) return;
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

// ── Liste (Reiter „Automationen", Bildschirm 6) ───────────────────────────────
// Solange das Panel offen ist, bleibt die zuletzt geladene Liste im Speicher: der Reiter zeigt sie
// sofort und ersetzt sie nach dem Neuladen an Ort und Stelle.
let autoListData = null; // [{ id, title, stepCount, paramCount, schedule }] oder null
let autoListFetch = null;
let autoListError = false;

function showAutomations() {
  if (!hasToken) return; // Reiter ist ohnehin nur mit Verbindung sichtbar
  show("automations");
  renderAutoList();
  loadAutomations();
}

function loadAutomations() {
  if (autoListFetch) return autoListFetch;
  const token = cfg.token;
  let self = null;
  self = autoListFetch = (async () => {
    try {
      const res = await fetch(appBase() + "/api/recorder/automations", {
        headers: { Authorization: "Bearer " + token },
      });
      if (token !== cfg.token) return; // Konto wechselte unterwegs → Ergebnis verwerfen
      if (!res.ok) throw new Error("HTTP " + res.status);
      const body = await res.json().catch(() => null);
      if (token !== cfg.token) return;
      autoListData = body && Array.isArray(body.automations) ? body.automations : [];
      autoListError = false;
    } catch (err) {
      if (token === cfg.token) autoListError = true;
    } finally {
      if (autoListFetch === self) autoListFetch = null;
      if (currentSection === "automations") renderAutoList();
    }
  })();
  return autoListFetch;
}

function renderAutoList() {
  const listEl = els.autoList;
  listEl.textContent = "";
  els.autoListEmpty.hidden = true;
  els.autoListRetry.hidden = true;
  if (autoListData === null) {
    if (autoListError && !autoListFetch) {
      els.autoListHint.textContent = "Die Automationen konnten nicht geladen werden.";
      els.autoListRetry.hidden = false;
      els.autoListEmpty.hidden = false;
    } else {
      appendSkeletons(listEl, 3);
    }
    return;
  }
  if (!autoListData.length) {
    els.autoListHint.textContent = "Noch keine Automationen.";
    els.autoListEmpty.hidden = false;
    return;
  }
  for (const a of autoListData) listEl.appendChild(buildAutomationCard(a));
}

// „Nächster Lauf: Mo, 08:00" aus dem Zeitplan (dieselbe pure Rechnung wie der Wecker im
// Service-Worker: SteplyExecPlan.nextFireTime). Ohne (aktiven) Zeitplan: "".
const WEEKDAYS_SHORT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
function nextRunLabel(schedule) {
  if (!schedule || typeof SteplyExecPlan === "undefined" || typeof SteplyExecPlan.nextFireTime !== "function") {
    return "";
  }
  let when = null;
  try {
    when = SteplyExecPlan.nextFireTime(schedule, Date.now(), new Date().getTimezoneOffset());
  } catch (err) {
    when = null;
  }
  if (when == null || !isFinite(when)) return "";
  const d = new Date(when);
  const pad = (n) => String(n).padStart(2, "0");
  const time = pad(d.getHours()) + ":" + pad(d.getMinutes());
  const now = new Date();
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) /
      86400000
  );
  if (days === 0) return "heute, " + time;
  if (days === 1) return "morgen, " + time;
  if (days < 7) return WEEKDAYS_SHORT[d.getDay()] + ", " + time;
  return WEEKDAYS_SHORT[d.getDay()] + ", " + pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "., " + time;
}

function buildAutomationCard(a) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "item auto";

  const h = document.createElement("span");
  h.className = "h";
  const title = document.createElement("span");
  title.textContent = a.title || "Ohne Titel";
  h.appendChild(title);
  h.appendChild(icon("chev"));
  row.appendChild(h);

  const next = nextRunLabel(a.schedule);
  if (next) {
    const m1 = document.createElement("span");
    m1.className = "m";
    const n = document.createElement("span");
    n.className = "next";
    n.appendChild(icon("clock"));
    n.appendChild(document.createTextNode("Nächster Lauf: " + next));
    m1.appendChild(n);
    row.appendChild(m1);
  }

  const meta = document.createElement("span");
  meta.className = "m";
  const sc = Number(a.stepCount) || 0;
  const pc = Number(a.paramCount) || 0;
  const stepsTxt = sc === 1 ? "1 Schritt" : sc + " Schritte";
  const paramsTxt = pc === 0 ? "keine Angaben nötig" : pc === 1 ? "braucht 1 Angabe" : "braucht " + pc + " Angaben";
  meta.textContent = stepsTxt + " · " + paramsTxt;
  row.appendChild(meta);

  row.addEventListener("click", () => showAutoPrep(a.id));
  return row;
}

// ── Vorbereitung (Bildschirm 7) ──────────────────────────────────────────────────
async function showAutoPrep(automationId) {
  show("autoPrep");
  setStatus("");
  els.autoPrepHint.textContent = "";
  els.autoPrepHint.className = "status";
  els.autoPrepTitle.textContent = "Automation wird geladen …";
  els.autoDomainHint.textContent = "";
  els.autoDomainHint.hidden = true;
  els.autoFileHint.hidden = true;
  els.autoParamForm.textContent = "";
  els.autoClearValues.hidden = true;
  els.autoStart.disabled = true;

  // Detail laden (404 fremd / Fehler → Hinweis mit „Erneut versuchen").
  let det = null;
  try {
    const res = await fetch(appBase() + "/api/recorder/automations/" + encodeURIComponent(automationId), {
      headers: { Authorization: "Bearer " + cfg.token },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    det = await res.json().catch(() => null);
  } catch (err) {
    showAutoPrepError("Diese Automation konnte nicht geladen werden.", automationId);
    return;
  }
  if (!det || !det.automation || !Array.isArray(det.steps)) {
    showAutoPrepError("Diese Automation ist unvollständig.", null);
    return;
  }
  if (currentSection !== "autoPrep") return; // inzwischen weggeklickt

  exec.automation = det.automation;
  exec.steps = det.steps;
  exec.plan = [];
  exec.values = {};

  els.autoPrepTitle.textContent = exec.automation.title || "Automation";

  // (a) Website-Hinweis (Sicherheit: WO wird gearbeitet) — neutral statt Warnkasten.
  const domains = Array.isArray(exec.automation.site_domains) ? exec.automation.site_domains.filter(Boolean) : [];
  els.autoDomainHint.textContent = "";
  els.autoDomainHint.appendChild(icon("globe"));
  const span = document.createElement("span");
  span.appendChild(document.createTextNode("Läuft auf "));
  const b = document.createElement("b");
  b.textContent = domains.length ? domains.join(", ") : "der aufgezeichneten Website";
  span.appendChild(b);
  els.autoDomainHint.appendChild(span);
  els.autoDomainHint.hidden = false;

  // Datei-Brücke (Welle 39): offen sagen, dass eine Datei getragen wird.
  els.autoFileHint.hidden = !exec.steps.some((s) => s && s.file_meta && typeof s.file_meta === "object");

  // (b) Angaben-Formular aus params (+ gespeicherte Werte vorbefüllen).
  const params = Array.isArray(exec.automation.params) ? exec.automation.params : [];
  const saved = await loadAutoValues(exec.automation.id);
  await buildParamForm(params, saved);
  els.autoClearValues.hidden = !(saved && Object.keys(saved).length);

  // (c) Modus: Halbautomatik ist Standard.
  els.autoModeSemi.checked = true;
  els.autoModeAuto.checked = false;
  els.autoStart.disabled = false;
}

function showAutoPrepError(text, retryId) {
  els.autoPrepTitle.textContent = "";
  els.autoPrepHint.textContent = "";
  els.autoPrepHint.className = "status status-error";
  els.autoPrepHint.appendChild(document.createTextNode(text + " "));
  if (retryId) {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "linkbtn";
    retry.textContent = "Erneut versuchen";
    retry.addEventListener("click", () => showAutoPrep(retryId));
    els.autoPrepHint.appendChild(retry);
  }
}

// Angaben-Formular bauen: je Feld Label (Pflicht-Markierung), Eingabe (secret → password)
// und ein Häkchen „Im Browser merken" (aktiv, wenn ein Wert gespeichert war).
async function buildParamForm(params, saved) {
  els.autoParamForm.textContent = "";
  saved = saved || {};
  if (!params.length) {
    const none = document.createElement("p");
    none.className = "muted";
    none.textContent = "Diese Automation braucht keine Angaben.";
    els.autoParamForm.appendChild(none);
    return;
  }
  for (const p of params) {
    if (!p || typeof p.key !== "string") continue;
    const wrap = document.createElement("div");
    wrap.className = "auto-param field";
    wrap.dataset.key = p.key;

    const label = document.createElement("label");
    label.className = "auto-param-label";
    const labelText = document.createElement("span");
    labelText.textContent = p.label || p.key;
    label.appendChild(labelText);
    if (p.required) {
      const req = document.createElement("span");
      req.className = "auto-param-req";
      req.textContent = "*";
      req.title = "Pflichtfeld";
      label.appendChild(req);
    }

    const input = document.createElement("input");
    input.className = "auto-param-input input";
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
        // Erweiterte Interaktion (Welle 48): Enter/Rechtsklick/Doppelklick/Ziehen/Kürzel/Hover/
        // iframe — aus dem Plan (SteplyExecPlan.parseInteraction). Bestimmt auch den Frame.
        interaction: planStep.interaction || undefined,
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
  els.autoFileChip.textContent = "";
  els.autoFileChip.appendChild(icon("file"));
  const names = document.createElement("span");
  names.textContent = keys
    .map((k) => {
      const f = exec.files[k];
      return (f.name || "Datei") + " (" + fmtBytes(f.size) + ")";
    })
    .join(" · ");
  els.autoFileChip.appendChild(names);
  els.autoFileChip.appendChild(icon("check"));
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
    elementFound = await execEvalElementCondition(exec.tabId, jump.when, (planStep && planStep.interaction && planStep.interaction.frame) || null);
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
    els.autoPrepHint.textContent = "Die Steply-Erweiterung ist nicht vollständig geladen – bitte neu laden.";
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
    els.autoPrepHint.textContent = err && err.message ? err.message : "Angaben unvollständig.";
    els.autoPrepHint.className = "status status-error";
    return;
  }
  if (!exec.plan.length) {
    els.autoPrepHint.textContent = "Diese Automation hat keine Schritte.";
    els.autoPrepHint.className = "status status-error";
    return;
  }

  // Doppelstart-Schutz VOR dem ersten await (sonst startet ein schneller Doppelklick zwei Läufe).
  if (els.autoStart.disabled) return;
  els.autoStart.disabled = true;
  try {
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
  } catch (err) {
    // Start scheiterte (Tab weg o. ä.) → Knopf wieder freigeben, ehrlich melden.
    els.autoStart.disabled = false;
    els.autoPrepHint.textContent = "Die Automation konnte nicht starten. Bitte versuchen Sie es erneut.";
    els.autoPrepHint.className = "status status-error";
    return;
  }

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

  els.autoStart.disabled = false;
  show("autoRun");
  if (els.autoControls) els.autoControls.hidden = false;
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
  if (action === "upload") return "Datei hochladen";
  return "Klick";
}

// Menschliche Pausen-Meldung je Grund (Welle 50a: keine Codes im sichtbaren Text — der Code
// steht nur noch im title der Meldung). detail = z. B. Dateiname (nur Anzeige, nie Server).
function execMissText(r, num, detail) {
  const pre = "Schritt " + num + ": ";
  const tail = " Danach „Weiter“ drücken oder abbrechen.";
  switch (r) {
    case "submit-bounced":
      // Ehrlichkeits-Netz (Welle 38): die Übermittlung kam nicht durch, die Seite lud neu.
      return pre + "Die Anmeldung bzw. Übermittlung kam nicht durch – die Seite hat neu geladen. Bitte selbst prüfen." + tail;
    case "download-manual":
      // Datei-Brücke (Welle 39, Weg 3): Datei liegt im Downloads-Ordner, aber nicht im Speicher.
      return (
        pre +
        "Die Datei" + (detail ? " „" + detail + "“" : "") +
        " liegt in Ihrem Download-Ordner. Wählen Sie sie beim Hochladen bitte selbst aus." +
        tail
      );
    case "download-timeout":
    case "download-missing":
      return pre + "Der Download wurde nicht erkannt. Bitte laden Sie die Datei selbst herunter." + tail;
    case "file-missing":
      return pre + "Bitte wählen Sie die Datei selbst aus (sie liegt in Ihrem Download-Ordner)." + tail;
    case "file-transfer":
      return pre + "Die Datei ließ sich nicht übertragen. Bitte laden Sie sie selbst hoch." + tail;
    case "unexpected-page":
      // Zustands-Intelligenz (Welle 40): Seite passt zu keinem Schritt und ist keine Login-Seite.
      return pre + "Unerwartete Seite – bitte selbst dorthin wechseln oder „Weiter“ für einen neuen Versuch.";
    case "skip-needs-file":
      // Zustands-Intelligenz (Welle 40): Vorspulen überspränge einen später gebrauchten Download.
      return (
        pre +
        "Die übersprungenen Schritte enthalten den Datei-Download. Starten Sie die Automation neu " +
        "oder wählen Sie die Datei beim Hochladen selbst."
      );
    case "cond-skip-needs-file":
      // Bedingte Schritte (Welle 42): Download-Schritt sollte übersprungen werden, wird aber gebraucht.
      return pre + "Dieser optionale Schritt lädt eine Datei, die später gebraucht wird. Bitte selbst herunterladen." + tail;
    case "timeout":
      return pre + "Die Seite hat nicht rechtzeitig reagiert. Bitte erledigen Sie den Schritt selbst." + tail;
    case "ambiguous":
      return pre + "Die Stelle ist auf der Seite nicht eindeutig. Bitte erledigen Sie den Schritt selbst." + tail;
    case "not-fillable":
      return pre + "In dieses Feld lässt sich nichts eintragen. Bitte erledigen Sie den Schritt selbst." + tail;
    case "option-not-found":
    case "not-a-select":
      return pre + "Die gewünschte Auswahl gibt es hier nicht. Bitte wählen Sie selbst aus." + tail;
    default:
      if (/-error$|unsupported|readonly|invalid/.test(String(r || ""))) {
        return pre + "Die Aktion ließ sich hier nicht ausführen. Bitte erledigen Sie den Schritt selbst." + tail;
      }
      return pre + "Steply findet diese Stelle gerade nicht auf der Seite. Bitte erledigen Sie den Schritt selbst." + tail;
  }
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
  if (els.autoControls) els.autoControls.hidden = false;
  const planStep = exec.plan[exec.index] || null;
  const total = exec.plan.length;
  const num = Math.min(exec.index + 1, total);
  els.autoProgress.textContent = "Schritt " + num + " von " + total;
  const pct = total ? Math.round((num / total) * 100) : 0;
  if (els.autoBar.firstElementChild) els.autoBar.firstElementChild.style.width = pct + "%";

  els.autoStepTitle.textContent = planStep ? planStep.title || execActionLabel(planStep.action) : "";
  els.autoStepAction.textContent = planStep ? execActionLabel(planStep.action) : "";

  // Miss-Box nur im Miss-Zustand. Menschlicher Text; der Technik-Code steht höchstens im title.
  if (exec.phase === "miss") {
    els.autoMissText.textContent = execMissText(exec.lastMissReason, num, exec.lastMissDetail);
    if (exec.lastMissReason) els.autoMissText.title = "Grund: " + exec.lastMissReason;
    else els.autoMissText.removeAttribute("title");
    execRenderMissImage(planStep);
    els.autoMissBox.hidden = false;
  } else {
    els.autoMissBox.hidden = true;
  }

  // Vorspul-Notiz (Welle 40): sichtbar machen, dass Schritte übersprungen wurden.
  if (els.autoSkipNote) {
    if (exec.skipNote) {
      setIconText(els.autoSkipNote, "skip", execSkipNoteText(exec.skipNote));
      els.autoSkipNote.hidden = false;
    } else {
      els.autoSkipNote.hidden = true;
    }
  }

  // Bedingte Schritte (Welle 42): dezente Notiz zum zuletzt übersprungenen Schritt.
  if (els.autoCondSkipNote) {
    if (exec.condSkip) {
      setIconText(
        els.autoCondSkipNote,
        "skip",
        "Schritt " + (exec.condSkip.index + 1) + " übersprungen (Bedingung nicht erfüllt)."
      );
      els.autoCondSkipNote.hidden = false;
    } else {
      els.autoCondSkipNote.hidden = true;
    }
  }

  // Anmelde-Wache (Welle 40): höfliche Warte-Meldung, während der Mensch sich anmeldet.
  if (els.autoWaitLogin) {
    if (exec.phase === "waiting-login") {
      setIconText(
        els.autoWaitLogin,
        "lock",
        "Bitte kurz anmelden – die Automation wartet und macht danach automatisch weiter."
      );
      els.autoWaitLogin.hidden = false;
    } else {
      els.autoWaitLogin.hidden = true;
    }
  }

  // Live-Status.
  if (exec.phase === "executing") {
    setIconText(els.autoLiveStatus, "play", "Schritt wird ausgeführt …");
    els.autoLiveStatus.hidden = false;
  } else if (exec.phase === "running" && exec.autoMode) {
    setIconText(els.autoLiveStatus, "play", "Läuft selbstständig …");
    els.autoLiveStatus.hidden = false;
  } else if (exec.phase === "paused") {
    setIconText(els.autoLiveStatus, "pause", "Pausiert.");
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
  if (els.autoControls) els.autoControls.hidden = true;
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
  const okRun = status === "success";
  if (els.autoDoneIcon) {
    els.autoDoneIcon.className = okRun ? "ok" : "err";
    els.autoDoneIcon.textContent = "";
    els.autoDoneIcon.appendChild(icon(okRun ? "check" : "x", true));
  }
  if (okRun) {
    els.autoDoneTitle.textContent = "Fertig";
    els.autoDoneText.textContent = "Die Automation ist vollständig durchgelaufen.";
    els.autoProgress.textContent = "Fertig";
  } else {
    els.autoDoneTitle.textContent = "Abgebrochen";
    els.autoDoneText.textContent = "Die Automation wurde beendet.";
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

// „Aufheben" (Aufnahme-Anker) GANZ FRÜH verdrahten (Welle 33, Fix 4): der Knopf muss selbst dann
// noch funktionieren, wenn eine spätere Zeile hier oder die Init wirft — deshalb vor allen
// ungeschützten addEventListener-Aufrufen.
if (els.targetClear) els.targetClear.addEventListener("click", discardTarget);

// ── Kopf + Menüs (Welle 50a) ──
els.helpBtn.addEventListener("click", () => toggleMenu("help"));
els.avatarBtn.addEventListener("click", () => toggleMenu("account"));
els.menuDim.addEventListener("click", closeMenus);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && (!els.menuHelp.hidden || !els.menuAccount.hidden)) closeMenus();
});
els.mLearn.addEventListener(
  "click",
  menuAction(() => (busyElsewhere() ? busyNotice() : showSteplyLearn()))
);
els.mVideo.addEventListener(
  "click",
  menuAction(() => (busyElsewhere() ? busyNotice() : goVideoSetup()))
);
els.mRecHelp.addEventListener(
  "click",
  menuAction(() => {
    recHelpReturn = currentSection;
    show("recHelp");
  })
);
els.mOpenApp.addEventListener("click", menuAction(() => openAppTab("/app")));
els.mUpdate.addEventListener("click", menuAction(() => openAppTab("/extension")));
if (els.mHelpUpdate) els.mHelpUpdate.addEventListener("click", menuAction(() => openAppTab("/extension")));
els.mChange.addEventListener(
  "click",
  menuAction(() => (busyElsewhere() ? busyNotice() : showConnect("change")))
);
els.mDisconnect.addEventListener(
  "click",
  menuAction(() => (busyElsewhere() ? busyNotice() : disconnect()))
);
els.recHelpBack.addEventListener("click", () => {
  // Zurück dorthin, wo die Hilfe geöffnet wurde (auch mitten in einer Aufnahme).
  const back = recHelpReturn;
  recHelpReturn = "";
  if (back && back !== "recHelp" && els[back]) show(back);
  else showHome();
});

// ── Reiter ──
els.tabRecord.addEventListener("click", () => showTab("record"));
els.tabGuides.addEventListener("click", () => showTab("guides"));
els.tabAutos.addEventListener("click", () => showTab("autos"));

// ── Verbinden (Bildschirm 9) ──
els.connectApp.addEventListener("click", () => openAppTab("/app/settings/erweiterung"));
els.manualToggle.addEventListener("click", () => setManualOpen(els.manualBox.hidden));
els.saveCfg.addEventListener("click", saveCfg);
els.token.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveCfg();
});
els.connectVideo.addEventListener("click", () => goVideoSetup());
els.connectBack.addEventListener("click", () => showHome());

// ── Aufnehmen ──
els.recStart.addEventListener("click", () => {
  if (!hasToken) return;
  startGuide();
});
els.siteRow.addEventListener("click", () => showGuides({ site: "page" }));

// ── Video mit Ton ──
els.videoBack.addEventListener("click", () => showHome());
els.noAudio.addEventListener("change", updateBeginEnabled);
els.micRetry.addEventListener("click", micPreflight);
els.begin.addEventListener("click", begin);
els.stop.addEventListener("click", stop);

// ── Sofort-Anleitung: Nimmt auf ⇄ Pausiert → Prüfen (Welle 48a/50a) ──
els.guidePause.addEventListener("click", guidePauseRecording);
els.guideResume.addEventListener("click", guideStartRecording);
els.guideStop.addEventListener("click", guideStopRecording);
els.guideCreate.addEventListener("click", finishGuide);
els.guideContinue.addEventListener("click", guideStartRecording);
els.guideDiscard.addEventListener("click", guideDiscardRecording);
// Titel + Kategorie (Welle 31d): Feldwerte in die Session spiegeln; „＋ Neue Kategorie …"
// blendet das Namensfeld ein.
els.guideTitle.addEventListener("input", guideMetaSave);
els.guideCategory.addEventListener("change", onGuideCategoryChange);
els.guideCategoryNew.addEventListener("input", guideMetaSave);
els.again.addEventListener("click", newRecording);
if (els.videoRetry) els.videoRetry.addEventListener("click", retryVideoRecording);
els.guideAgain.addEventListener("click", newRecording);
els.guideRetry.addEventListener("click", () => runGuideUpload());
els.guideBackReview.addEventListener("click", guideBackToReview);

// ── Reiter „Anleitungen" + Live-Führung (Welle 31/50a) ──
els.chipSite.addEventListener("click", () => setFuehrenFilter({ site: "page" }));
els.chipAll.addEventListener("click", () => setFuehrenFilter({ site: "all" }));
els.chipDrafts.addEventListener("click", () =>
  setFuehrenFilter({ live: fuehrenFilter.live === "drafts" ? "live" : "drafts" })
);
els.guideSearch.addEventListener("input", () => {
  guidesQuery = (els.guideSearch.value || "").trim().toLowerCase();
  guidesSelectedId = null;
  renderGuidesList();
});
els.guidesEmptyAction.addEventListener("click", onGuidesEmptyAction);
els.runExit.addEventListener("click", guideExit);
els.runBack.addEventListener("click", guideGoBack);
els.runNext.addEventListener("click", guideGoNext);
els.runDoneList.addEventListener("click", () => guideExit());
// „Steply lernen" (Welle 35): ?-Menü (IMMER, auch unverbunden) + Zurück.
els.steplyLearnBack.addEventListener("click", () => showHome());
els.steplyLearnRetry.addEventListener("click", () => {
  steplyDocsFetchedAt = 0;
  const p = loadSteplyDocs();
  renderSteplyLearn();
  p.then(onListsChanged, onListsChanged);
});

// ── Automationen (Welle 36b): Reiter → Vorbereitung → Lauf ──
els.autoListRetry.addEventListener("click", () => {
  autoListError = false;
  loadAutomations();
  renderAutoList();
});
els.autoPrepBack.addEventListener("click", () => showAutomations());
els.autoClearValues.addEventListener("click", onAutoClearValues);
els.autoStart.addEventListener("click", startAutoRun);
// Lauf-Ansicht: Steuer-Knöpfe (genau EIN „Abbrechen").
els.autoExec.addEventListener("click", () => execExecuteCurrent());
els.autoSkip.addEventListener("click", () => execSkip());
els.autoPause.addEventListener("click", () => execPauseAuto());
els.autoResume.addEventListener("click", () => execResumeAuto());
els.autoContinue.addEventListener("click", () => execContinueAfterMiss());
els.autoCancel.addEventListener("click", () => execAbort());
els.autoDoneList.addEventListener("click", () => showAutomations());
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
  if (guideRunActive()) sendGuideToTab({ type: "steply-guide-hide" });
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
    // Alles, was der erste Bildschirm braucht, LOKAL und parallel lesen (Welle 50a): gemerkter
    // Kontoname, zuletzt bekannte Anleitungs-Listen, Aufnahme-Anker (abgelaufene >30 min werden
    // verworfen) und die URL des aktiven Tabs. Kein Netz — der Start-Screen steht sofort.
    await Promise.all([
      loadAccountCache(),
      loadListCaches(),
      loadPendingTarget(),
      currentActiveUrl().then((u) => {
        activeUrl = u;
      }),
    ]);
    computeSiteMatches();
    renderHeader();
    // Live-Führung (Welle 31): eine laufende Führung nach Panel-Schließen fortsetzen.
    const resumedGuide = await guideMaybeResume();
    if (!resumedGuide) showHome("record");
    // Nebenläufig, nicht blockierend: Kontoname (EINMAL) + Update-Prüfung.
    if (hasToken) fetchAccountName();
    checkForUpdate();
  } catch (err) {
    try {
      setStatus(
        "Die Seitenleiste konnte nicht vollständig starten – bitte die Steply-Erweiterung neu laden.",
        "error",
      );
    } catch (e) {
      /* selbst setStatus scheiterte (DOM kaputt) - dann bleibt nur die Konsole */
      console.warn("Steply: Panel-Init fehlgeschlagen:", err);
    }
  }
})();

"use strict";

// Steply — RUNNER (Welle 41, ZEITPLAN): führt EINEN geplanten Ablauf autonom aus.
//
// background.js öffnet diese Seite als INAKTIVEN Tab (chrome.tabs.create runner.html?automation=<id>),
// wenn ein chrome.alarms-Wecker fällig wird. Der Runner:
//   1) lädt Konfig (Token/App-URL) + die Automation (Detail-API) + die LOKAL gemerkten Werte,
//   2) prüft VOR dem Lauf, ob alle Pflicht-Werte da sind (buildRunPlan wirft sonst) → sonst
//      Benachrichtigung „Werte fehlen" + failed-Lauf (trigger:scheduled, detail:werte-fehlen),
//   3) öffnet den ECHTEN Ziel-Tab (Startseite Schritt 1), meldet „start" (trigger:scheduled),
//   4) treibt den DOM-freien Motor SteplyExecRun (dieselbe Zustands-Intelligenz wie das Panel;
//      die visuelle Maus/Overlay laufen im Ziel-Tab über content.js — dasselbe steply-exec-Protokoll),
//   5) meldet „finish" + zeigt eine Fertig-Benachrichtigung, gibt die Lauf-Sperre frei, schließt sich.
//
// SICHERHEIT: Werte bleiben lokal (chrome.storage.local.autoValues) — sie gehen NUR an den
// Ziel-Tab, NIE an den Server/in Logs (detail zusätzlich durch redactDetail geschwärzt).
// Ein autonomer Lauf RÄT NIE: Miss/fremde Anmeldung/unerwartete Seite ⇒ ehrlicher Abbruch.

const DEFAULT_APP_URL = "https://tutax-ivory.vercel.app";

// Zeit-/Transport-Grenzen (aus dem Panel-Lauf übernommen, gleiche Semantik).
const EXEC_STEP_TIMEOUT = 20000;
const EXEC_NAV_TIMEOUT = 15000;
const EXEC_NAV_SETTLE_MS = 2000;
const EXEC_VERIFY_TIMEOUT = 10000;
const EXEC_VERIFY_POLL = 500;
const EXEC_DL_TIMEOUT = 20000;
const EXEC_DL_COMPLETE_TIMEOUT = 60000;
const EXEC_FILE_CAP = 50 * 1024 * 1024;
const EXEC_FILE_SINGLE_MAX = 8 * 1024 * 1024;
const EXEC_FILE_CHUNK = 4 * 1024 * 1024;

let cfg = { token: "", appUrl: "" };
let targetTabId = null;
let execPort = null;
let execPingTimer = null;
let execFileSeq = 0;

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function appBase() {
  const raw = (cfg.appUrl || DEFAULT_APP_URL).trim().replace(/\/+$/, "");
  return raw || DEFAULT_APP_URL;
}

async function loadConfig() {
  try {
    const res = await chrome.storage.local.get(["steplyToken", "steplyAppUrl"]);
    cfg.token = res && res.steplyToken ? String(res.steplyToken) : "";
    cfg.appUrl = res && res.steplyAppUrl ? String(res.steplyAppUrl) : "";
  } catch (err) {
    cfg = { token: "", appUrl: "" };
  }
}

// ── Benachrichtigungen (Fertig-Meldung / Werte-fehlen) ─────────────────────────
// Zusätzlich ein Test-/Beleg-Marker in chrome.storage.local (Benachrichtigungen sind in
// automatisierten Umgebungen nicht immer sichtbar; der Marker macht sie prüfbar).
function notify(kind, title, message) {
  try {
    chrome.storage.local.set({ steplyLastNotify: { kind, title, message, at: Date.now() } });
  } catch (e) {
    /* egal */
  }
  try {
    if (chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create("steply-run-" + Date.now(), {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon48.png"),
        title: title,
        message: message,
      });
    }
  } catch (e) {
    /* Benachrichtigungen optional */
  }
}

// ── Lauf-Sperre freigeben (background hält sie, damit nie zwei geplante Läufe gleichzeitig laufen) ──
async function releaseRunLock(automationId) {
  try {
    const r = await chrome.storage.local.get("steplyRunState");
    const state = r && r.steplyRunState && typeof r.steplyRunState === "object" ? r.steplyRunState : {};
    if (state.lock && state.lock.id === automationId) state.lock = null;
    await chrome.storage.local.set({ steplyRunState: state });
  } catch (e) {
    /* egal — die Sperre läuft ohnehin per TTL ab */
  }
}

// ── Werte (LOKAL) ──────────────────────────────────────────────────────────────
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

// ── Server-Events (best effort; NIE mit Werten) ─────────────────────────────────
async function postStart(automationId) {
  if (!cfg.token || !automationId) return null;
  try {
    const res = await fetch(appBase() + "/api/recorder/automation-runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: cfg.token,
        automationId: automationId,
        event: "start",
        mode: "auto",
        trigger: "scheduled",
      }),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return body && body.runId ? body.runId : null;
  } catch (err) {
    return null;
  }
}

async function postFinish(runId, status, currentStep, detail) {
  if (!cfg.token || !runId) return;
  const body = { token: cfg.token, runId: runId, event: "finish", status: status };
  if (typeof currentStep === "number") body.currentStep = currentStep;
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
    /* still */
  }
}

// ── Tab-Helfer ───────────────────────────────────────────────────────────────
async function tabUrlById(tabId) {
  if (tabId == null) return "";
  try {
    const tab = await chrome.tabs.get(tabId);
    return tab && typeof tab.url === "string" ? tab.url : "";
  } catch (err) {
    return "";
  }
}

function waitTabComplete(tabId) {
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
  });
}

async function navigateIfNeeded(tabId, planStep) {
  if (typeof SteplyExecPlan === "undefined") return;
  const curUrl = await tabUrlById(tabId);
  if (!SteplyExecPlan.needsNavigation(curUrl, planStep)) return;
  if (!planStep.page_url) return;
  try {
    await chrome.tabs.update(tabId, { url: planStep.page_url });
    await waitTabComplete(tabId);
    try {
      chrome.runtime.sendMessage({ type: "steply-ensure-content" });
    } catch (err) {
      /* egal */
    }
  } catch (err) {
    /* Navigation fehlgeschlagen — der Schritt läuft dann mit Miss auf */
  }
}

// ── Content-Script-Lebensader (Port + Ping, Muster Welle 33) ───────────────────
function execPortOpen(tabId) {
  try {
    execPort = chrome.runtime.connect({ name: "steply-exec" });
    execPort.postMessage({ type: "bind", tabId });
    execPort.onDisconnect.addListener(() => {
      execPort = null;
    });
  } catch (err) {
    execPort = null;
  }
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
function execPingStart(tabId) {
  execPingStop();
  execPingTimer = setInterval(() => {
    if (tabId != null) {
      try {
        const p = chrome.tabs.sendMessage(tabId, { type: "steply-exec-ping" });
        if (p && p.catch) p.catch(() => {});
      } catch (e) {
        /* egal */
      }
    }
  }, 20000);
}
function execPingStop() {
  if (execPingTimer) {
    clearInterval(execPingTimer);
    execPingTimer = null;
  }
}
function sendToTab(tabId, msg) {
  if (tabId == null) return;
  try {
    const p = chrome.tabs.sendMessage(tabId, msg);
    if (p && p.catch) p.catch(() => {});
  } catch (err) {
    /* egal */
  }
}

// ── Schritt senden + Ergebnis (steply-exec-result) ─────────────────────────────
let execResultSeq = 0;
let execPending = null;

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-exec-result") return;
  if (targetTabId != null && sender && sender.tab && sender.tab.id !== targetTabId) return;
  if (!execPending) return;
  if (msg.token != null && execPending.token !== msg.token) return;
  execPending.resolve({
    ok: !!msg.ok,
    reason: typeof msg.reason === "string" ? msg.reason : "",
    submitted: !!msg.submitted,
  });
});

function sendStep(tabId, planStep, extra) {
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
    sendToTab(tabId, {
      type: "steply-exec-step",
      token,
      step: {
        selector: planStep.selector,
        action: planStep.action,
        value: planStep.value,
        index: planStep.index,
        total: planStep.total,
        fileId: extra && extra.fileId != null ? extra.fileId : undefined,
      },
    });
  });
}

function probePassword(tabId) {
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
      if (p && p.then) p.then((res) => done(!!(res && res.hasPassword)), () => done(false));
      else done(false);
    } catch (err) {
      done(false);
    }
  });
}

// Submit-Kontrolle (Welle 38): kam die Übermittlung durch? (Klassifikation via SteplyExecPlan.)
function verifySubmit(tabId, prevUrl) {
  return new Promise((resolve) => {
    if (typeof SteplyExecPlan === "undefined" || tabId == null) {
      resolve("ok");
      return;
    }
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
      finish(SteplyExecPlan.submitOutcome(prevUrl, events) === "bounced" ? "bounced" : "ok");
    }, EXEC_VERIFY_TIMEOUT);
  });
}

// ── Datei-Brücke (Welle 39): Download einfangen + Datei ans Content-Script übertragen ──────────
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
    return execBasename(new URL(url).pathname) || "download";
  } catch (e) {
    return "download";
  }
}
function execDownloadName(item) {
  const fromFile = item && item.filename ? execBasename(item.filename) : "";
  if (fromFile) return fromFile;
  return execNameFromUrl((item && (item.finalUrl || item.url)) || "");
}
function refetchInTab(tabId, url) {
  if (tabId == null) return Promise.resolve({ ok: false });
  return new Promise((resolve) => {
    try {
      const p = chrome.tabs.sendMessage(tabId, { type: "steply-exec-refetch", url });
      if (p && p.then) p.then((r) => resolve(r || { ok: false }), () => resolve({ ok: false }));
      else resolve({ ok: false });
    } catch (e) {
      resolve({ ok: false });
    }
  });
}
async function captureDownloadItem(tabId, item) {
  const name = execDownloadName(item);
  const url = (item && (item.finalUrl || item.url)) || "";
  // Weg 1: Refetch im Content-Script der Quellseite (credentials). Erfolg → Download tilgen.
  if (url && !/^blob:/i.test(url)) {
    const r = await refetchInTab(tabId, url);
    if (r && r.ok) {
      try {
        await chrome.downloads.cancel(item.id);
      } catch (e) {
        /* evtl. schon fertig */
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
  // Weg 2/3 (Disk/Mensch) sind im geplanten Lauf nicht bedienbar → ehrlicher Abbruch.
  return { ok: false, reason: "download-manual", name };
}
let execDownloadArm = null;
function armDownload(tabId) {
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
      captureDownloadItem(tabId, item).then(finish, () =>
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
function disarmDownload() {
  if (execDownloadArm) execDownloadArm.finish({ ok: false, reason: "aborted" });
}
async function transferFile(tabId, file) {
  if (tabId == null || !file || !file.b64) return null;
  const fileId = "f" + ++execFileSeq;
  const b64 = file.b64;
  const plan =
    typeof SteplyExecPlan !== "undefined" && SteplyExecPlan.planFileChunks
      ? SteplyExecPlan.planFileChunks(b64.length, EXEC_FILE_SINGLE_MAX, EXEC_FILE_CHUNK)
      : { mode: b64.length > EXEC_FILE_SINGLE_MAX ? "chunked" : "single", chunks: 1, chunkSize: EXEC_FILE_CHUNK };
  try {
    if (plan.mode === "single") {
      const r = await chrome.tabs.sendMessage(tabId, {
        type: "steply-exec-file",
        fileId,
        name: file.name,
        mime: file.mime,
        b64,
      });
      if (!r || !r.ok) return null;
    } else {
      const begin = await chrome.tabs.sendMessage(tabId, {
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
        const ack = await chrome.tabs.sendMessage(tabId, {
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

function hideTab(tabId) {
  sendToTab(tabId, { type: "steply-exec-file-clear" });
  sendToTab(tabId, { type: "steply-exec-hide" });
}

// ── Detail laden ────────────────────────────────────────────────────────────────
async function fetchDetail(automationId) {
  try {
    const res = await fetch(appBase() + "/api/recorder/automations/" + encodeURIComponent(automationId), {
      headers: { Authorization: "Bearer " + cfg.token },
    });
    if (!res.ok) return null;
    const det = await res.json().catch(() => null);
    if (!det || !det.automation || !Array.isArray(det.steps)) return null;
    return det;
  } catch (err) {
    return null;
  }
}

// Grund-Code → freundlicher Text für die Benachrichtigung.
function reasonText(detail) {
  const map = {
    "fremde-anmeldung": "eine Anmeldung war nötig",
    "unerwartete-seite": "eine unerwartete Seite erschien",
    "datei-vorspulen": "ein benötigter Datei-Download würde übersprungen",
    "datei-fehlt": "eine hochzuladende Datei fehlte",
    "datei-transfer": "eine Datei ließ sich nicht übertragen",
    "download-manual": "ein Download ließ sich nicht automatisch übernehmen",
    "download-timeout": "ein Download kam nicht an",
    "submit-bounced": "eine Übermittlung kam nicht durch",
    timeout: "eine Stelle wurde nicht gefunden",
  };
  return map[detail] || "die Stelle wurde nicht gefunden";
}

// ── Hauptablauf ─────────────────────────────────────────────────────────────────
async function runAutomation(automationId) {
  await loadConfig();
  if (!cfg.token) {
    setStatus("Nicht mit Steply verbunden.");
    notify("no-token", "Geplanter Lauf nicht möglich", "Die Steply-Erweiterung ist nicht mit einem Konto verbunden.");
    await releaseRunLock(automationId);
    return;
  }
  if (typeof SteplyExecPlan === "undefined" || typeof SteplyExecRun === "undefined") {
    setStatus("Ausführ-Module fehlen.");
    await releaseRunLock(automationId);
    return;
  }

  setStatus("Ablauf wird geladen …");
  const det = await fetchDetail(automationId);
  if (!det) {
    setStatus("Ablauf konnte nicht geladen werden.");
    notify("load-failed", "Geplanter Lauf übersprungen", "Der Ablauf konnte nicht geladen werden (Konto/Netz prüfen).");
    await releaseRunLock(automationId);
    return;
  }
  const automation = det.automation;
  const steps = det.steps;
  const title = automation.title || "Ablauf";

  // Werte lesen + Plan bauen (wirft bei fehlendem Pflicht-Wert VOR jedem Tab-Zugriff).
  const values = await loadAutoValues(automationId);
  let plan = null;
  let planErr = "";
  try {
    plan = SteplyExecPlan.buildRunPlan(automation, steps, values);
  } catch (e) {
    planErr = e && e.message ? e.message : "Eingaben unvollständig.";
  }

  if (!plan) {
    // Pflicht-Wert fehlt (häufigster Fall) → eigener detail-Code + spezifische Benachrichtigung.
    const isMissing = /Pflichtfeld fehlt/i.test(planErr);
    const detailCode = isMissing ? "werte-fehlen" : "ablauf-fehler";
    setStatus(isMissing ? "Werte fehlen — übersprungen." : "Ablauf nicht ausführbar.");
    const runId = await postStart(automationId);
    if (runId) await postFinish(runId, "failed", 1, detailCode);
    notify(
      "werte-fehlen",
      "Geplanter Lauf übersprungen",
      isMissing
        ? "„" + title + "“ übersprungen: Werte fehlen. Bitte einmal in der Erweiterung eintragen und „merken“."
        : "„" + title + "“ konnte nicht ausgeführt werden: " + planErr,
    );
    await releaseRunLock(automationId);
    return;
  }

  const first = plan[0];
  if (!first || !first.page_url) {
    setStatus("Keine Startseite hinterlegt.");
    const runId = await postStart(automationId);
    if (runId) await postFinish(runId, "failed", 1, "keine-startseite");
    notify("no-start", "Geplanter Lauf übersprungen", "„" + title + "“ hat keine Startseite — bitte einmal manuell starten.");
    await releaseRunLock(automationId);
    return;
  }

  // Ziel-Tab öffnen (inaktiv) auf der Startseite von Schritt 1.
  setStatus("Ziel-Seite wird geöffnet …");
  try {
    const tab = await chrome.tabs.create({ url: first.page_url, active: false });
    targetTabId = tab && tab.id != null ? tab.id : null;
  } catch (e) {
    targetTabId = null;
  }
  if (targetTabId == null) {
    const runId = await postStart(automationId);
    if (runId) await postFinish(runId, "failed", 1, "kein-ziel-tab");
    notify("no-tab", "Geplanter Lauf fehlgeschlagen", "„" + title + "“: das Ziel-Fenster ließ sich nicht öffnen.");
    await releaseRunLock(automationId);
    return;
  }
  await waitTabComplete(targetTabId);
  try {
    chrome.runtime.sendMessage({ type: "steply-ensure-content" });
  } catch (e) {
    /* egal */
  }

  // Lauf registrieren + Lebensader.
  const runId = await postStart(automationId);
  execPortOpen(targetTabId);
  execPingStart(targetTabId);
  setStatus("Ablauf läuft …");

  const runner = SteplyExecRun.createRunner({
    automation,
    plan,
    tabId: targetTabId,
    execPlan: SteplyExecPlan,
    deps: {
      getTabUrl: (t) => tabUrlById(t),
      navigateIfNeeded: (t, s) => navigateIfNeeded(t, s),
      sendStep: (t, s, extra) => sendStep(t, s, extra),
      probePassword: (t) => probePassword(t),
      verifySubmit: (t, prev) => verifySubmit(t, prev),
      armDownload: (t) => armDownload(t),
      disarmDownload: () => disarmDownload(),
      transferFile: (t, f) => transferFile(t, f),
      hide: (t) => hideTab(t),
      onEvent: (evt) => {
        if (evt && evt.type === "step") setStatus("Schritt " + (evt.index + 1) + " von " + plan.length + " …");
      },
    },
  });

  const result = await runner.run();

  // Lebensader stoppen, Server informieren, Benachrichtigung, Sperre freigeben.
  execPingStop();
  execPortClose();
  if (runId) {
    await postFinish(runId, result.status, (result.index || 0) + 1, result.detail);
  }

  if (result.status === "success") {
    setStatus("Fertig 🎉");
    notify("success", "Steply: geplanter Lauf erfolgreich", "„" + title + "“ ist durchgelaufen.");
    // Bei Erfolg den Ziel-Tab schließen (aufgeräumt); bei Fehler offen lassen (zum Nachschauen).
    try {
      await chrome.tabs.remove(targetTabId);
    } catch (e) {
      /* egal */
    }
  } else {
    const stepNo = (result.index || 0) + 1;
    setStatus("Gestoppt bei Schritt " + stepNo + ".");
    notify(
      "failed",
      "Steply: geplanter Lauf gestoppt",
      "„" + title + "“ bei Schritt " + stepNo + " gestoppt: " + reasonText(result.detail) + ".",
    );
  }

  await releaseRunLock(automationId);

  // Runner-Tab schließen (dieses Fenster). Kurze Verzögerung, damit letzte Sends durch sind.
  setTimeout(() => {
    try {
      window.close();
    } catch (e) {
      /* egal */
    }
  }, 800);
}

// ── Start ────────────────────────────────────────────────────────────────────
(async () => {
  let automationId = "";
  try {
    automationId = new URL(location.href).searchParams.get("automation") || "";
  } catch (e) {
    automationId = "";
  }
  if (!automationId) {
    setStatus("Kein Ablauf angegeben.");
    return;
  }
  try {
    await runAutomation(automationId);
  } catch (e) {
    setStatus("Unerwarteter Fehler.");
    try {
      await releaseRunLock(automationId);
    } catch (err) {
      /* egal */
    }
  }
})();

"use strict";

// site-match.js (klassisches Script mit UMD-Huelle) -> stellt self.SteplySiteMatch fuer den
// Icon-Badge bereit (Welle 32, Punkt E). importScripts ist in MV3-Service-Workern NUR
// synchron im Top-Level erlaubt, daher ganz oben. Scheitert es, bleibt der Rest des Workers
// funktionsfaehig (updateBadgeForTab prueft self.SteplySiteMatch und macht sonst nichts).
try {
  importScripts("site-match.js");
} catch (err) {
  /* ohne Matching-Modul: kein Badge, aber Pairing/Capture/Panel laufen weiter */
}

// exec-plan.js (Welle 41): stellt self.SteplyExecPlan.nextFireTime für den Zeitplan-Wecker
// bereit. Scheitert der Import, bleibt der Rest des Workers funktionsfähig — der Scheduler
// prüft self.SteplyExecPlan vor jeder Nutzung.
try {
  importScripts("exec-plan.js");
} catch (err) {
  /* ohne Plan-Modul: kein Zeitplan-Wecker, aber alles andere läuft weiter */
}

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

// content.js in BEREITS OFFENE Tabs nachimpfen (v2.2.2). Chrome injiziert deklarative
// Content-Scripts nur in Seiten, die NACH dem (Neu-)Laden der Extension geladen wurden -
// in altoffenen Tabs fehlt das Script komplett, Klicks werden dort nicht erkannt, bis
// die Seite neu geladen wird (Richards "er erkennt nichts, erst wenn ich neu lade").
// Doppel-Injektion ist harmlos: content.js hat einen Installations-Guard und kehrt
// sofort zurueck. Nicht-injizierbare Tabs (chrome://, Web Store, PDF, discarded)
// schlagen einzeln fehl und werden still uebersprungen.
function injectIntoOpenTabs() {
  if (!chrome.scripting || !chrome.tabs || !chrome.tabs.query) return;
  chrome.tabs
    .query({ url: ["http://*/*", "https://*/*"] })
    .then((tabs) => {
      for (const tab of tabs || []) {
        if (tab.id == null || tab.discarded) continue;
        chrome.scripting
          .executeScript({ target: { tabId: tab.id }, files: ["guide-resolve.js", "content.js"] })
          .catch(() => {
            /* Tab nicht injizierbar - beim naechsten echten Laden greift das Manifest */
          });
      }
    })
    .catch(() => {
      /* tabs.query fehlgeschlagen - dann eben nur deklarativ */
    });
}
chrome.runtime.onInstalled.addListener(injectIntoOpenTabs);
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(injectIntoOpenTabs);
}

// Sicherheitsnetz: Auch beim Aufnahme-Start bittet das Panel um eine Nachimpfung
// (falls der Worker zwischendurch beendet war oder ein Tab durchgerutscht ist).
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "steply-ensure-content") return false;
  injectIntoOpenTabs();
  return false;
});

// Verwaiste Klick-/Schritt-Nachrichten absorbieren (siehe oben). Nichts zu tun.
chrome.runtime.onMessage.addListener(() => false);

// Zeitplan (Welle 41): Zähler aktiver Läufe/Führungen (offene steply-exec/steply-guide-Ports).
// >0 ⇒ ein Lauf ist aktiv ⇒ ein fälliger geplanter Lauf verschiebt sich (kein Doppel-Lauf).
let steplyActiveRunPorts = 0;

// Führungs-Port (Welle 33, Fix 2a): Das Panel hält während einer laufenden Führung einen
// Port offen und nennt uns EINMALIG den gebundenen Tab. Bricht der Port ab (Panel geschlossen,
// neu geladen oder abgestürzt), räumen wir das Overlay auf DIESEM Tab ab — sonst bleibt das
// Schritt-Badge („6/6") auf der Seite kleben, obwohl das Panel längst zu ist. Der Service-
// Worker bleibt für den onDisconnect am Leben; deshalb ist das zuverlässiger als ein hide,
// das das sterbende Panel-Dokument noch selbst zu senden versucht.
if (chrome.runtime.onConnect) {
  // Zwei gleichartige Lebensadern: „steply-guide" (Live-Führung) und „steply-exec"
  // (Automationen-Ausführung, Welle 36b). Bricht der Port ab (Panel geschlossen/abgestürzt),
  // räumen wir das jeweilige Overlay/den Cursor auf dem gebundenen Tab ab.
  const PORT_HIDE = {
    "steply-guide": "steply-guide-hide",
    "steply-exec": "steply-exec-hide",
  };
  chrome.runtime.onConnect.addListener((port) => {
    if (!port || !Object.prototype.hasOwnProperty.call(PORT_HIDE, port.name)) return;
    const hideType = PORT_HIDE[port.name];
    let boundTabId = null;
    // Zeitplan (Welle 41): Ein offener „steply-exec"/„steply-guide"-Port heißt „ein Lauf/eine
    // Führung ist aktiv" (Panel-Lauf ODER Runner-Lauf). Der Scheduler zählt mit, damit NIE zwei
    // Läufe gleichzeitig denselben Tab-Kontext durcheinanderbringen (geplanter Lauf verschiebt sich).
    steplyActiveRunPorts++;
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === "bind" && typeof msg.tabId === "number") {
        boundTabId = msg.tabId;
      }
    });
    port.onDisconnect.addListener(() => {
      steplyActiveRunPorts = Math.max(0, steplyActiveRunPorts - 1);
      if (boundTabId == null) return;
      try {
        const p = chrome.tabs.sendMessage(boundTabId, { type: hideType });
        if (p && p.catch) p.catch(() => {});
      } catch (err) {
        /* Tab evtl. weg / ohne Content-Script - egal */
      }
    });
  });
}

// Hydration-Sonde (Hotfix 06.07. abends, Vercel-Kaltstart): Das Content-Script (isolierte
// Welt) kann NICHT sehen, ob React die Seite schon hydratisiert hat — die __react*-Marker
// auf DOM-Knoten leben in der Hauptwelt. Es markiert deshalb das Ziel-Formular mit einem
// data-Attribut (Attribute teilen sich beide Welten) und bittet uns um eine MAIN-World-
// Sonde. Feuert ein Submit vor der Hydration, uebernimmt die NATIVE Formular-Submission
// (Voll-Reload) statt der React-Form-Action — der Login-Haenger. isReact unterscheidet
// „React-Seite, noch nicht bereit" (warten) von „gar kein React" (native Submission ist
// dort das korrekte Verhalten -> sofort weiter).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "steply-probe-hydration") return false;
  const tabId = sender && sender.tab && sender.tab.id;
  if (tabId == null || !chrome.scripting || !chrome.scripting.executeScript) {
    sendResponse({ ok: false });
    return true;
  }
  chrome.scripting
    .executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        const el = document.querySelector("[data-steply-hydration-probe]");
        const hydrated =
          !!el && Object.keys(el).some((k) => k.indexOf("__react") === 0);
        // isReact = „diese Seite wird von React/Next gefahren, warte auf die Hydration".
        // WICHTIG (Welle 38, Kaltstart-Restlücke): NIE eine Next-Seite als „kein React"
        // fehlklassifizieren, sonst feuert die Sonde einen nativen Submit VOR der Hydration
        // (Voll-Reload). `script[src*="/_next/"]` steht schon ~50 ms nach Dokumentstart im
        // (geteilten) DOM — weit vor `window.__next_f` (~1 s) und `window.next` (~2,5 s);
        // `[data-reactroot]` gibt es in React 19 gar nicht mehr. Das früheste, robusteste
        // Next-Signal deckt damit das gesamte Vor-Hydration-Fenster ab.
        const isReact =
          hydrated ||
          !!(
            window.__next_f ||
            window.next ||
            document.querySelector('script[src*="/_next/"]') ||
            document.querySelector("[data-reactroot]")
          );
        return { hydrated, isReact };
      },
    })
    .then(
      (results) => {
        const r = results && results[0] ? results[0].result : null;
        sendResponse({ ok: true, hydrated: !!(r && r.hydrated), isReact: !!(r && r.isReact) });
      },
      () => sendResponse({ ok: false })
    );
  return true; // Antwort kommt asynchron
});

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

// Ein-Klick-Pairing (Welle 25): content.js reicht {type:"steply-pair", token, appUrl}
// weiter, nachdem die App-Seite es per Klick angestossen hat (Origin-Bindung dort).
//
// SICHERHEIT — der Token wird ZUERST gegen die Ziel-App validiert (GET /api/recorder/me
// mit „Authorization: Bearer <token>"), BEVOR wir irgendetwas speichern:
//   * Nur bei HTTP 200 mit Kontoname -> chrome.storage.local.set({steplyToken,steplyAppUrl})
//     und Bestaetigung (inkl. Kontoname) zurueck an den Tab. Die Seite UND das Panel zeigen
//     den Kontonamen an -> eine Fehlbindung an das falsche Konto faellt sofort auf.
//   * Bei jedem Fehler (falscher Token, App nicht erreichbar, Timeout): NICHTS speichern,
//     Ablehnung zurueck. Der Token steht nie in einer URL (nur im Authorization-Header).
// appUrl muss http(s) sein und wird laengenbegrenzt; Timeout ~8s via AbortController.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "steply-pair") return false;
  const token = typeof msg.token === "string" ? msg.token.trim() : "";
  const appUrl =
    typeof msg.appUrl === "string" ? msg.appUrl.trim().replace(/\/+$/, "") : "";
  if (!token || token.length > 200 || !/^https?:\/\//i.test(appUrl) || appUrl.length > 300) {
    sendResponse({ ok: false, error: "Ungueltige Verbindungsdaten." });
    return true;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  fetch(appUrl + "/api/recorder/me", {
    method: "GET",
    headers: { Authorization: "Bearer " + token },
    signal: controller.signal,
  })
    .then((res) =>
      res
        .json()
        .catch(() => ({}))
        .then((body) => ({ status: res.status, body }))
    )
    .then(({ status, body }) => {
      if (status !== 200 || !body || !body.account) {
        sendResponse({
          ok: false,
          error:
            status === 401
              ? "Token wurde von Steply nicht akzeptiert."
              : "Steply antwortete unerwartet (" + status + ").",
        });
        return;
      }
      // ERST nach erfolgreicher Validierung speichern.
      return chrome.storage.local
        .set({ steplyToken: token, steplyAppUrl: appUrl })
        .then(() => sendResponse({ ok: true, account: String(body.account) }));
    })
    .catch((err) => {
      const aborted = err && err.name === "AbortError";
      sendResponse({
        ok: false,
        error: aborted ? "Zeitueberschreitung - Steply nicht erreichbar." : "Steply nicht erreichbar.",
      });
    })
    .finally(() => clearTimeout(timer));
  return true; // Antwort kommt asynchron
});

// Seitenleiste auf Klick der App-Seite oeffnen (v2.2.1): sidePanel.open() verlangt eine
// Nutzer-Geste. Die Klick-Aktivierung der Seite reicht ueber content.js + sendMessage bis
// hierher (Chrome >= 116) - aber NUR, wenn wir SYNCHRON im Handler oeffnen (kein await
// davor). Chrome < 116 hat kein open(): dann passiert schlicht nichts, die Karte nennt
// den manuellen Weg (Extension-Symbol) als Fallback.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-open-panel") return false;
  if (!sender || !sender.tab || sender.tab.id == null) return false;
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {
        /* z. B. Geste abgelaufen - Fallback bleibt der Symbol-Klick */
      });
    }
  } catch (err) {
    /* sidePanel.open nicht verfuegbar */
  }
  return false;
});

// Aufnahme-Anker: „Ab hier mit Extension aufnehmen" (Welle 27). Ein Einfügepunkt im
// Builder reicht {type:"steply-record-into", target, label} ueber content.js hierher.
// Zwei Dinge, SYNCHRON (die Klick-Geste der Seite muss durchreichen):
//   1) chrome.sidePanel.open({tabId}) - KEIN await davor, sonst geht die Geste verloren.
//   2) chrome.storage.local.set({ pendingTarget }) mit origin AUS DEM SENDER (nicht aus
//      dem Payload) + Zeitstempel. Das Panel liest pendingTarget beim Oeffnen/via
//      storage.onChanged, zeigt „Aufnahme fuer: <label>" und schickt das Ziel beim
//      Fertigstellen an guide-complete - aber NUR, wenn origin zur App-URL passt.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || msg.type !== "steply-record-into") return false;
  if (!sender || !sender.tab || sender.tab.id == null) return false;

  // Herkunft aus dem Sender bestimmen (vertrauenswuerdiger als ein Payload-Wert).
  let origin = "";
  try {
    origin = sender.origin || (sender.url ? new URL(sender.url).origin : "");
  } catch (err) {
    origin = "";
  }

  // (1) Seitenleiste SYNCHRON oeffnen (Geste!).
  try {
    if (chrome.sidePanel && typeof chrome.sidePanel.open === "function") {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {
        /* Geste abgelaufen - Fallback bleibt der Symbol-Klick */
      });
    }
  } catch (err) {
    /* sidePanel.open nicht verfuegbar */
  }

  // (2) Ziel merken (best effort). target/label kamen bereits gehygienet aus content.js.
  try {
    chrome.storage.local
      .set({
        pendingTarget: {
          target: msg.target || null,
          label: typeof msg.label === "string" ? msg.label : "",
          origin,
          ts: Date.now(),
        },
      })
      .catch(() => {});
  } catch (err) {
    /* storage nicht verfuegbar */
  }
  return false;
});

// ============================================================================
// ICON-BADGE beim Browsen (Welle 32, Punkt E)
//
// Beim Tab-Wechsel / Neuladen zeigen wir am Extension-Symbol die Zahl der Tutorials, die zur
// gerade offenen Website passen (Koralle-Badge). DATENSCHUTZ-PFLICHT: Das Matching laeuft
// REIN LOKAL — die besuchte Tab-URL wird NUR hier im Browser gegen die gecachten site_domains
// abgeglichen und verlaesst NIEMALS den Browser. Vom Server holen wir ausschliesslich die
// Tutorial-LISTE (inkl. site_domains), ~5 min in chrome.storage.local gecacht (die
// Seitenleiste frischt denselben Cache beim Laden mit auf). OHNE Token: kein Badge.
// ============================================================================
const BADGE_COLOR = "#ef6a4e"; // Koralle (--brand)
const BADGE_TTL = 5 * 60 * 1000; // 5 min
// Gleicher Fallback wie DEFAULT_APP_URL im Panel (app.steply.de ist noch nicht
// verdrahtet) — beim Domain-Umzug BEIDE Stellen umstellen.
const BADGE_DEFAULT_APP_URL = "https://tutax-ivory.vercel.app";

async function badgeAppBase() {
  try {
    const cfg = await chrome.storage.local.get("steplyAppUrl");
    const raw = String((cfg && cfg.steplyAppUrl) || BADGE_DEFAULT_APP_URL)
      .trim()
      .replace(/\/+$/, "");
    return raw || BADGE_DEFAULT_APP_URL;
  } catch (err) {
    return BADGE_DEFAULT_APP_URL;
  }
}

// Tutorial-Liste fuer den Badge: aus dem 5-min-Cache; ist er alt/leer, mit dem gespeicherten
// Token neu holen (NUR die Liste — es geht KEINE besuchte URL raus). Ohne Token: null.
async function getBadgeTutorials() {
  const now = Date.now();
  let cache = null;
  try {
    cache = (await chrome.storage.local.get("badgeCache")).badgeCache || null;
  } catch (err) {
    cache = null;
  }
  if (cache && Array.isArray(cache.tutorials) && now - (cache.at || 0) < BADGE_TTL) {
    return cache.tutorials;
  }
  let token = "";
  try {
    token = (await chrome.storage.local.get("steplyToken")).steplyToken || "";
  } catch (err) {
    token = "";
  }
  if (!token) {
    try {
      await chrome.storage.local.remove("badgeCache");
    } catch (err) {
      /* egal */
    }
    return null;
  }
  try {
    const base = await badgeAppBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(base + "/api/recorder/tutorials", {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return cache && Array.isArray(cache.tutorials) ? cache.tutorials : null;
    const body = await res.json().catch(() => ({}));
    const tutorials = Array.isArray(body.tutorials) ? body.tutorials : [];
    try {
      await chrome.storage.local.set({ badgeCache: { tutorials, at: now } });
    } catch (err) {
      /* egal */
    }
    return tutorials;
  } catch (err) {
    return cache && Array.isArray(cache.tutorials) ? cache.tutorials : null;
  }
}

const STEPLY_DOC_TTL = 15 * 60 * 1000; // 15 min (mit dem Panel geteilt)

// Steply-Doku-Touren für den Badge (Welle 35): erscheinen für JEDEN Kunden — auch OHNE Token.
// Aus dem 15-min-Cache (chrome.storage.local.steplyDocCache, den auch das Panel füllt); ist er
// alt/leer, von GET /api/guide/steply neu holen (KEIN Token; NUR die Liste — es geht KEINE
// besuchte URL raus). Normalisiert auf status:"published" (Doku ist immer veröffentlicht).
async function getSteplyDocs() {
  const now = Date.now();
  let cache = null;
  try {
    cache = (await chrome.storage.local.get("steplyDocCache")).steplyDocCache || null;
  } catch (err) {
    cache = null;
  }
  if (cache && Array.isArray(cache.tutorials) && now - (cache.at || 0) < STEPLY_DOC_TTL) {
    return cache.tutorials;
  }
  try {
    const base = await badgeAppBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(base + "/api/guide/steply", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return cache && Array.isArray(cache.tutorials) ? cache.tutorials : null;
    const body = await res.json().catch(() => ({}));
    const tutorials = (Array.isArray(body.tutorials) ? body.tutorials : [])
      .filter((t) => t && t.id && Array.isArray(t.site_domains))
      .map((t) => ({ ...t, status: "published", source: "steply" }));
    try {
      await chrome.storage.local.set({ steplyDocCache: { tutorials, at: now } });
    } catch (err) {
      /* egal */
    }
    return tutorials;
  } catch (err) {
    return cache && Array.isArray(cache.tutorials) ? cache.tutorials : null;
  }
}

function clearBadge(tabId) {
  try {
    chrome.action.setBadgeText({ text: "", tabId });
  } catch (err) {
    /* egal */
  }
}

async function updateBadgeForTab(tabId, url) {
  if (tabId == null) return;
  try {
    const SM = self.SteplySiteMatch;
    if (!SM) return; // Matching-Modul nicht geladen -> Badge einfach nicht anfassen
    // DATENSCHUTZ: `url` bleibt hier lokal; nur der site_domains-Abgleich nutzt sie.
    const host = SM.hostnameOf(url);
    if (!host) {
      clearBadge(tabId);
      return;
    }
    // Matching-Pool = Konto-Tutorials (NUR mit Token) + Steply-Doku-Touren (immer, auch OHNE
    // Token). Dedupe per id (Konto gewinnt, falls der Nutzer mit dem Steply-Konto gepairt ist).
    const account = await getBadgeTutorials();
    const docs = await getSteplyDocs();
    const merged = [];
    const seen = new Set();
    for (const t of account || []) if (t && t.id && !seen.has(t.id)) { seen.add(t.id); merged.push(t); }
    for (const t of docs || []) if (t && t.id && !seen.has(t.id)) { seen.add(t.id); merged.push(t); }
    if (!merged.length) {
      clearBadge(tabId);
      return;
    }
    // Nur VEROEFFENTLICHTE zaehlen — konsistent mit dem Default der Fuehren-Liste
    // („Diese Seite + Live"); Doku ist immer published. Sonst verspraeche das Badge zu viel.
    const n = SM.matchTutorials(url, merged).filter((t) => t.status === "published").length;
    if (n > 0) {
      try {
        chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR });
      } catch (err) {
        /* egal */
      }
      try {
        chrome.action.setBadgeText({ text: String(n), tabId });
      } catch (err) {
        /* egal */
      }
    } else {
      clearBadge(tabId);
    }
  } catch (err) {
    /* Badge ist reiner Komfort - nie stoeren */
  }
}

// Aktiven Tab beobachten. tab.url ist dank host_permissions <all_urls> auf http(s)-Seiten
// verfuegbar; chrome://-/leere Tabs liefern kein url -> hostnameOf=null -> Badge leer.
if (chrome.tabs && chrome.tabs.onActivated) {
  chrome.tabs.onActivated.addListener((info) => {
    const tabId = info && info.tabId;
    if (tabId == null) return;
    chrome.tabs
      .get(tabId)
      .then((tab) => updateBadgeForTab(tabId, tab && tab.url))
      .catch(() => {
        /* Tab weg / kein Zugriff */
      });
  });
}
if (chrome.tabs && chrome.tabs.onUpdated) {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!changeInfo) return;
    // Nur bei URL-Wechsel oder fertigem Laden neu bewerten (nicht bei jedem Zwischenstatus).
    if (changeInfo.url || changeInfo.status === "complete") {
      updateBadgeForTab(tabId, (tab && tab.url) || changeInfo.url || "");
    }
  });
}

// ============================================================================
// ZEITPLAN-WECKER (Welle 41): geplante Automationen von SELBST ausführen — via
// chrome.alarms IM BROWSER des Nutzers (kein Server-Cron). Rechner an + Chrome offen.
//
// Ablauf:
//   • syncSchedules() holt periodisch (~30 min) die Automationen-Liste (mit schedule) und
//     legt pro AKTIVEM Zeitplan einen Alarm „steply-run:<id>" auf die nächste Fälligkeit
//     (SteplyExecPlan.nextFireTime, PURE + getestet). Verwaiste/deaktivierte Alarme fallen weg.
//   • onAlarm „steply-run:<id>" ⇒ handleScheduledRun: Doppel-Fire-Schutz + Belegt-Prüfung
//     (kein zweiter Lauf gleichzeitig) + nächsten Wecker neu setzen + Runner-Tab öffnen.
//     Der Runner (runner.html) erledigt Werte-Check, Lauf, Server-Meldung, Benachrichtigung.
//
// DATENSCHUTZ: Es geht NUR die Automationen-Liste raus (mit Token) — nie eine besuchte URL,
// nie ein Parameter-Wert (die liegen lokal in chrome.storage.local.autoValues, der Runner
// reicht sie ausschließlich an den Ziel-Tab).
// ============================================================================
const STEPLY_SYNC_ALARM = "steply-sync";
const STEPLY_RUN_PREFIX = "steply-run:";
const STEPLY_SYNC_PERIOD_MIN = 30;
const STEPLY_LOCK_TTL = 10 * 60 * 1000; // 10 min: so lange gilt ein Lauf als „läuft noch"
const STEPLY_POSTPONE_MS = 5 * 60 * 1000; // belegt ⇒ Wecker um 5 min verschieben

function steplyEnsureSyncAlarm() {
  try {
    // periodInMinutes hält den Sync am Leben; when ~1 min gibt nach (Neu-)Start bald einen ersten.
    chrome.alarms.create(STEPLY_SYNC_ALARM, {
      periodInMinutes: STEPLY_SYNC_PERIOD_MIN,
      when: Date.now() + 60 * 1000,
    });
  } catch (err) {
    /* alarms-API nicht verfügbar → kein Zeitplan (Rest läuft weiter) */
  }
}

// Die Automationen-Liste holen und die run-Alarme daran ausrichten.
async function syncSchedules() {
  if (!self.SteplyExecPlan || typeof self.SteplyExecPlan.nextFireTime !== "function") return;
  if (!chrome.alarms) return;

  let token = "";
  try {
    token = (await chrome.storage.local.get("steplyToken")).steplyToken || "";
  } catch (err) {
    token = "";
  }

  let existing = [];
  try {
    existing = await chrome.alarms.getAll();
  } catch (err) {
    existing = [];
  }
  const runAlarms = (existing || []).filter(
    (a) => a && a.name && a.name.indexOf(STEPLY_RUN_PREFIX) === 0,
  );

  // Ohne Token: alle geplanten Läufe entfernen (nichts zu tun ohne Konto).
  if (!token) {
    for (const a of runAlarms) {
      try {
        await chrome.alarms.clear(a.name);
      } catch (err) {
        /* egal */
      }
    }
    return;
  }

  // Liste holen (NUR die Liste; keine besuchte URL). Netzfehler ⇒ Alarme unangetastet lassen.
  let list = null;
  try {
    const base = await badgeAppBase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(base + "/api/recorder/automations", {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return;
    const body = await res.json().catch(() => ({}));
    list = Array.isArray(body.automations) ? body.automations : [];
  } catch (err) {
    return;
  }

  const now = Date.now();
  const tz = new Date().getTimezoneOffset();
  const wanted = new Set();
  for (const a of list) {
    if (!a || !a.id || !a.schedule || a.schedule.enabled === false) continue;
    const when = self.SteplyExecPlan.nextFireTime(a.schedule, now, tz);
    if (when == null) continue;
    const name = STEPLY_RUN_PREFIX + a.id;
    wanted.add(name);
    try {
      chrome.alarms.create(name, { when });
    } catch (err) {
      /* egal */
    }
  }
  // Verwaiste Wecker (Automation weg/Zeitplan aus) entfernen.
  for (const a of runAlarms) {
    if (!wanted.has(a.name)) {
      try {
        await chrome.alarms.clear(a.name);
      } catch (err) {
        /* egal */
      }
    }
  }
}

async function steplyReadRunState() {
  try {
    const r = await chrome.storage.local.get("steplyRunState");
    const s = r && r.steplyRunState && typeof r.steplyRunState === "object" ? r.steplyRunState : {};
    if (!s.lastDue || typeof s.lastDue !== "object") s.lastDue = {};
    return s;
  } catch (err) {
    return { lastDue: {} };
  }
}

// Ein fälliger geplanter Lauf. scheduledTime = die Fälligkeit dieses Alarms (Doppel-Fire-Schlüssel).
async function handleScheduledRun(automationId, scheduledTime) {
  if (!automationId) return;
  const state = await steplyReadRunState();
  const due = typeof scheduledTime === "number" && isFinite(scheduledTime) ? scheduledTime : Date.now();

  // Doppel-Fire-Schutz: DIESE Fälligkeit schon behandelt (z. B. Worker war aus, Alarm feuert
  // verspätet, oder ein Postpone-Alarm überlappt)? Dann nur den nächsten Wecker sicherstellen.
  if (state.lastDue[automationId] === due) {
    await syncSchedules();
    return;
  }

  // Belegt? Ein manueller Lauf/Führung (offener Port) ODER ein anderer geplanter Lauf (frische
  // Sperre) läuft ⇒ NICHT zwei gleichzeitig. Kurz verschieben und später erneut versuchen.
  const lockFresh =
    state.lock && typeof state.lock.at === "number" && Date.now() - state.lock.at < STEPLY_LOCK_TTL;
  if (steplyActiveRunPorts > 0 || lockFresh) {
    try {
      chrome.alarms.create(STEPLY_RUN_PREFIX + automationId, { when: Date.now() + STEPLY_POSTPONE_MS });
    } catch (err) {
      /* egal */
    }
    return; // lastDue NICHT setzen → beim verschobenen Versuch erneut prüfen
  }

  // Fälligkeit als behandelt markieren + Sperre setzen (der Runner gibt sie am Ende frei).
  state.lastDue[automationId] = due;
  state.lock = { id: automationId, at: Date.now(), due };
  try {
    await chrome.storage.local.set({ steplyRunState: state });
  } catch (err) {
    /* egal */
  }

  // Nächste Fälligkeit NEU setzen (auch falls der Runner abstürzt, ist die nächste Periode gesetzt).
  await syncSchedules();

  // Runner-Tab (inaktiv) öffnen — er erledigt den Lauf autonom.
  try {
    chrome.tabs.create({
      url: chrome.runtime.getURL("runner.html") + "?automation=" + encodeURIComponent(automationId),
      active: false,
    });
  } catch (err) {
    // Konnte nicht öffnen → Sperre gleich wieder freigeben.
    try {
      const s = await steplyReadRunState();
      if (s.lock && s.lock.id === automationId) s.lock = null;
      await chrome.storage.local.set({ steplyRunState: s });
    } catch (e) {
      /* egal */
    }
  }
}

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || !alarm.name) return;
    if (alarm.name === STEPLY_SYNC_ALARM) {
      syncSchedules();
      return;
    }
    if (alarm.name.indexOf(STEPLY_RUN_PREFIX) === 0) {
      const id = alarm.name.slice(STEPLY_RUN_PREFIX.length);
      handleScheduledRun(id, alarm.scheduledTime);
    }
  });
}

// Sync-Wecker sicherstellen + einmal syncen: bei Installation, Browserstart und jedem Worker-
// Aufwachen (billig, idempotent; ohne Token/Zeitpläne passiert praktisch nichts).
chrome.runtime.onInstalled.addListener(() => {
  steplyEnsureSyncAlarm();
  syncSchedules();
});
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    steplyEnsureSyncAlarm();
    syncSchedules();
  });
}
steplyEnsureSyncAlarm();
syncSchedules();

// Test-Hook (nur für scripts/test-schedule-e2e.mjs): erlaubt, den REALEN Handler direkt
// aufzurufen (statt auf Alarm-Timing zu warten) und den Sync anzustoßen. Kein Produktivpfad.
self.__steplyScheduler = {
  syncSchedules,
  handleScheduledRun,
  ensureSyncAlarm: steplyEnsureSyncAlarm,
  activePorts: () => steplyActiveRunPorts,
};

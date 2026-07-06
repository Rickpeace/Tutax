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
const BADGE_DEFAULT_APP_URL = "https://app.steply.de";

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
    const tutorials = await getBadgeTutorials();
    if (!tutorials) {
      clearBadge(tabId);
      return;
    }
    // Nur VEROEFFENTLICHTE zaehlen — konsistent mit dem Default der Fuehren-Liste
    // („Diese Seite + Live"); sonst verspricht das Badge mehr, als die Liste zeigt.
    const n = SM.matchTutorials(url, tutorials).filter((t) => t.status === "published").length;
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

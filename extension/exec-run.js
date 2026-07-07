"use strict";

// Steply Automationen — AUTONOMER Lauf-Motor (Welle 41, ZEITPLAN).
//
// Die ORCHESTRIERUNG eines geplanten Laufs, DOM-frei und Chrome-frei gekapselt: die
// Schritt-Sequenz + die Zustands-Intelligenz (Welle 40, Vorspulen/Anmelde-Erkennung) +
// die Datei-Brücke-Sequenz (Welle 39) + die Submit-Kontrolle (Welle 38) — aber ALLE
// Umwelt-Zugriffe (Tabs, Content-Script-Nachrichten, Downloads, Server) laufen über einen
// injizierten `deps`-Adapter. Dadurch ist der Motor pur-testbar und wird von runner.js
// (geplanter Lauf im Runner-Tab) genutzt. Die REINEN Entscheidungen kommen aus dem
// geteilten SteplyExecPlan (buildRunPlan/needsNavigation/resyncTarget/… — dieselbe Datei
// wie im Panel), sodass Panel-Lauf und geplanter Lauf DIESELBE Logik teilen.
//
// WARUM ein eigener Motor statt panel.js direkt? Der Panel-Lauf ist tief mit der Seitenleisten-
// UI (els.*, Overlay-Rendering, Miss-Weiter-Knöpfe) verwoben und auf einen MENSCHEN am Panel
// ausgelegt (Halbautomatik, „Weiter"-Klicks). Ein geplanter Lauf hat KEINEN Menschen: jeder
// Miss / jede fremde Anmeldung / jede unerwartete Seite MUSS ehrlich abbrechen (statt zu
// pausieren und zu warten). Dieser Motor trägt genau diese autonome Semantik; die visuelle
// Maus/Overlay laufen unverändert im Ziel-Tab über content.js (dasselbe steply-exec-Protokoll).
//
// SICHERHEIT (nicht verhandelbar): NIE raten/klicken (Miss ⇒ Abbruch). Parameter-WERTE sind
// bereits im Plan aufgelöst (buildRunPlan, LOKAL) — dieser Motor gibt sie NUR an deps.sendStep
// (Ziel-Tab) und protokolliert sie nie. Datei-Bytes bleiben in `files` (Speicher), nie am Server.

(function (root) {
  // Motor bauen. Rückgabe: { run(): Promise<{status,detail,index,total}>, abort() }.
  //
  // opts:
  //   automation : { id, title, params:[{key,label,type,required}] }
  //   plan       : SteplyExecPlan.buildRunPlan-Ausgabe (geordnet, Werte aufgelöst)
  //   tabId      : gebundener ZIEL-Tab (der Runner hat ihn schon auf Schritt-1-Seite geöffnet)
  //   execPlan   : SteplyExecPlan (optional; sonst globales SteplyExecPlan)
  //   deps       : Umwelt-Adapter (siehe unten) — alle async, außer wo notiert
  //
  // deps:
  //   getTabUrl(tabId)                    -> Promise<string>
  //   navigateIfNeeded(tabId, planStep)   -> Promise<void>   (Host/Pfad-Wechsel + auf complete warten)
  //   sendStep(tabId, planStep, extra?)   -> Promise<{ok, reason?, submitted?}>
  //   probePassword(tabId)                -> Promise<bool>
  //   verifySubmit(tabId, prevUrl)        -> Promise<'ok'|'bounced'>
  //   armDownload(tabId)                  -> Promise<{ok, file?, reason?, name?}>   (optional)
  //   disarmDownload()                    -> void                                   (optional)
  //   transferFile(tabId, file)           -> Promise<fileId|null>                   (für upload)
  //   hide(tabId)                         -> void                                   (Overlay/Datei im Tab räumen)
  //   getRunTabs()                        -> Promise<[{tabId,url,windowId,lastFocusedMs,status}]> (Welle 43, optional)
  //   activateTab(tabId, windowId)        -> Promise<void>|void                     (Welle 43, optional)
  //   rebind(tabId)                       -> void                                   (Welle 43, optional; Port/Ping umhängen)
  //   ensureContent()                     -> void                                   (Welle 43, optional; Content-Script im neuen Tab)
  //   onEvent(evt)                        -> void  (optional; { type, index, to?, detail? } für Log/Test)
  function createRunner(opts) {
    var o = opts || {};
    var P = o.execPlan || root.SteplyExecPlan;
    var deps = o.deps || {};
    var automation = o.automation || {};
    var plan = Array.isArray(o.plan) ? o.plan : [];
    var tabId = o.tabId;
    // Tab-/Fenster-Folgen (Welle 43): so lange auf ein durch den Vorschritt geöffnetes Fenster/
    // Popup warten (onCreated → complete), bevor der nächste Schritt bewertet wird.
    var tabWaitMs = typeof o.tabWaitMs === "number" && o.tabWaitMs >= 0 ? o.tabWaitMs : 8000;

    var index = 0;
    var running = false;
    var finished = false;
    var files = {}; // getragene Dateien { [key]: { name, mime, size, b64 } }
    var resolveRun = null;
    // Beruhigungspause ZWISCHEN Schritten (wie EXEC_AUTO_GAP im Panel-Auto-Lauf): gibt einer
    // durch den Vorschritt (Klick/Submit → Voll-Reload) neu ladenden Seite Zeit, ihr Content-
    // Script zu registrieren, bevor der nächste Schritt gesendet wird. Ohne diese Pause trifft
    // eine Nachricht gelegentlich die gerade abgebaute Vorseite (Timeout-Miss). Erste Iteration
    // ohne Pause (der Runner hat die Startseite schon fertig geladen).
    var gapMs = typeof o.gapMs === "number" && o.gapMs >= 0 ? o.gapMs : 700;

    function delay(ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    }

    function emit(evt) {
      try {
        if (typeof deps.onEvent === "function") deps.onEvent(evt || {});
      } catch (e) {
        /* Beobachtung darf den Lauf nie stören */
      }
    }

    // Secret-Parameter-Schlüssel (nur für die Vorspul-Formulierung; hier informativ).
    function secretKeys() {
      var out = {};
      var params = automation && Array.isArray(automation.params) ? automation.params : [];
      for (var i = 0; i < params.length; i++) {
        var p = params[i];
        if (p && p.type === "secret" && p.key) out[p.key] = true;
      }
      return out;
    }

    // Tab-/Fenster-Folgen (Welle 43): VOR jedem Schritt den Tab wählen, dessen URL zur page_url
    // passt (aus der lauf-zugehörigen Menge; deps.getRunTabs) und den Lauf dorthin umbinden +
    // aktivieren. Öffnete der Vorschritt ein neues Fenster/Popup, folgt der Lauf dorthin; schloss
    // sich ein Popup, kehrt er zum Opener zurück. Ohne deps.getRunTabs → No-Op (altes Verhalten).
    function tabWaitWarranted(tabs) {
      if (!Array.isArray(tabs) || tabs.length === 0) return false;
      var boundPresent = false;
      for (var i = 0; i < tabs.length; i++) if (tabs[i] && tabs[i].tabId === tabId) boundPresent = true;
      if (!boundPresent) return true;
      for (var j = 0; j < tabs.length; j++) {
        var t = tabs[j];
        if (t && t.tabId !== tabId && (t.status === "loading" || !t.url)) return true;
      }
      return false;
    }
    async function selectTabForStep(planStep) {
      if (!P || typeof P.pickTabForStep !== "function" || typeof deps.getRunTabs !== "function") return;
      if (!planStep) return;
      var tabs = await deps.getRunTabs();
      // preferTabId = der gebundene Tab (Welle 46): ein reiner In-Page-Schritt bleibt am gebundenen
      // Tab, wenn dieser selbst passt — statt an eine zweite gleich-URL-Kopie umzubinden (identisch
      // zur Panel-Logik execSelectTabForStep). Echte Tab-Folgen bleiben unberührt (dann passt der
      // gebundene Tab nicht mehr und ist kein Kandidat).
      var pick = P.pickTabForStep(planStep, tabs, tabId);
      if (pick == null && tabWaitWarranted(tabs)) {
        var t0 = Date.now();
        while (Date.now() - t0 < tabWaitMs && running) {
          await delay(200);
          tabs = await deps.getRunTabs();
          pick = P.pickTabForStep(planStep, tabs, tabId);
          if (pick != null) break;
          if (!tabWaitWarranted(tabs)) break;
        }
      }
      if (pick == null) return;
      var info = null;
      for (var k = 0; k < tabs.length; k++) if (tabs[k] && tabs[k].tabId === pick) { info = tabs[k]; break; }
      var windowId = info ? info.windowId : null;
      if (pick !== tabId) {
        tabId = pick;
        if (typeof deps.rebind === "function") deps.rebind(tabId);
        if (typeof deps.ensureContent === "function") deps.ensureContent();
      }
      if (typeof deps.activateTab === "function") await deps.activateTab(pick, windowId);
    }

    // Zustand VOR dem aktuellen Schritt bewerten (Welle 40; rein lesend) — identisch zur
    // Panel-Logik execEvaluateState, nur über deps.
    async function evaluateState(i) {
      if (!P) return { action: "proceed" };
      var planStep = plan[i];
      if (!planStep) return { action: "proceed" };
      var curUrl = await deps.getTabUrl(tabId);
      if (!P.needsNavigation(curUrl, planStep)) return { action: "proceed" };
      var target = P.resyncTarget(curUrl, plan, i);
      if (target != null && target > i) {
        if (P.skipCrossesNeededDownload(plan, i, target)) return { action: "pause-file", to: target };
        return { action: "fast-forward", to: target };
      }
      if (P.looksLikeLoginUrl(curUrl)) {
        var hasPw = await deps.probePassword(tabId);
        if (hasPw) return { action: "wait-login" };
      }
      return { action: "unexpected" };
    }

    // Bedingte Schritte (Welle 42): SOLL der Schritt i jetzt ausgeführt werden? URL-Bedingung
    // lokal (Tab-URL), Element-Bedingung via deps.evalCondition (content.js steply-eval-condition);
    // negate + Entscheidung trägt die pure P.shouldRunStep (EINE Stelle). Ohne condition → true.
    async function conditionMet(i) {
      var planStep = plan[i];
      var cond = planStep && planStep.condition;
      if (!P || !cond) return true;
      var urlMatch = false;
      var elementFound = false;
      if (cond.kind === "url") {
        var curUrl = await deps.getTabUrl(tabId);
        urlMatch = P.evalUrlCondition(curUrl, cond);
      } else if (cond.kind === "element") {
        elementFound =
          typeof deps.evalCondition === "function" ? await deps.evalCondition(tabId, cond) : false;
      }
      return P.shouldRunStep(cond, { urlMatch: urlMatch, elementFound: elementFound });
    }

    // Einen Schritt ausführen. Rückgabe { ok:true } oder { ok:false, detail }.
    async function executeStep(planStep) {
      var fm = planStep.file_meta || null;

      // Datei-Brücke: UPLOAD — getragene Datei ins Feld legen. Fehlt sie → ehrlicher Abbruch
      // (ein geplanter Lauf kann keinen Menschen die Datei wählen lassen).
      if (planStep.action === "upload") {
        var file = fm && fm.source ? files[fm.source] : null;
        if (!file) return { ok: false, detail: "datei-fehlt" };
        var fileId = await deps.transferFile(tabId, file);
        if (!running) return { ok: false, detail: "abgebrochen" };
        if (!fileId) return { ok: false, detail: "datei-transfer" };
        var ru = await deps.sendStep(tabId, planStep, { fileId });
        if (ru && ru.ok) return { ok: true };
        return { ok: false, detail: ru ? ru.reason || "unbekannt" : "unbekannt" };
      }

      // Datei-Brücke: DOWNLOAD — vor dem Klick scharf schalten, danach die Datei einfangen.
      var dlPromise = null;
      if (fm && fm.role === "download" && typeof deps.armDownload === "function") {
        dlPromise = deps.armDownload(tabId);
      }

      var preUrl = await deps.getTabUrl(tabId);
      var res = await deps.sendStep(tabId, planStep);
      if (!running) {
        if (dlPromise && typeof deps.disarmDownload === "function") deps.disarmDownload();
        return { ok: false, detail: "abgebrochen" };
      }
      if (!res || !res.ok) {
        if (dlPromise && typeof deps.disarmDownload === "function") deps.disarmDownload();
        return { ok: false, detail: res ? res.reason || "unbekannt" : "unbekannt" };
      }

      if (dlPromise) {
        var cap = await dlPromise;
        if (!running) return { ok: false, detail: "abgebrochen" };
        if (!cap || !cap.ok) return { ok: false, detail: (cap && cap.reason) || "download" };
        files[fm.key] = cap.file;
        emit({ type: "file-carried", index: index, detail: cap.file && cap.file.name });
      }

      // Submit-Kontrolle (Welle 38): kam die Übermittlung durch (kein Voll-Reload auf denselben Pfad)?
      if (res.submitted && typeof deps.verifySubmit === "function") {
        var outcome = await deps.verifySubmit(tabId, preUrl);
        if (!running) return { ok: false, detail: "abgebrochen" };
        if (outcome === "bounced") return { ok: false, detail: "submit-bounced" };
      }
      return { ok: true };
    }

    function finish(status, detail) {
      if (finished) return;
      finished = true;
      running = false;
      files = {};
      try {
        if (typeof deps.hide === "function") deps.hide(tabId);
      } catch (e) {
        /* egal */
      }
      var result = { status: status, detail: detail || "", index: index, total: plan.length };
      emit({ type: "finish", detail: status, index: index });
      if (resolveRun) resolveRun(result);
    }

    async function loop() {
      var firstIter = true;
      while (running) {
        // Beruhigungspause vor jedem Schritt außer dem ersten (siehe gapMs).
        if (!firstIter) {
          await delay(gapMs);
          if (!running) return;
        }
        firstIter = false;

        var planStep = plan[index];
        if (!planStep) {
          finish("success");
          return;
        }
        emit({ type: "step", index: index });

        // Tab-/Fenster-Folgen (Welle 43): ZUERST in den richtigen Tab/das richtige Fenster
        // wechseln (neuer Tab / OAuth-Popup / Rückkehr nach Popup-Schluss) — VOR Navigation,
        // Zustandsprüfung und Bedingung.
        await selectTabForStep(planStep);
        if (!running) return;

        await deps.navigateIfNeeded(tabId, planStep);
        if (!running) return;

        var decision = await evaluateState(index);
        if (!running) return;

        if (decision.action === "fast-forward") {
          // Bereits erreicht/angemeldet → vorspulen (Welle 40). Autonom: kein Feedback nötig,
          // aber für die Historie/Beobachtung protokollieren.
          var login = P.skipCrossesLogin(plan, index, decision.to, secretKeys());
          emit({ type: "fast-forward", index: index, to: decision.to, detail: login ? "login" : "erledigt" });
          index = decision.to;
          continue;
        }
        if (decision.action === "wait-login") {
          // Fremde Anmelde-Seite, die zu keinem Schritt passt: ein geplanter Lauf kann sich NICHT
          // selbst anmelden (Zugangsdaten würden fehlen) und keinen Menschen bitten → ehrlicher Stopp.
          finish("failed", "fremde-anmeldung");
          return;
        }
        if (decision.action === "pause-file") {
          // Vorspulen überspränge einen später gebrauchten Download → nicht stumm überspringen.
          finish("failed", "datei-vorspulen");
          return;
        }
        if (decision.action === "unexpected") {
          finish("failed", "unerwartete-seite");
          return;
        }

        // proceed → Bedingte Schritte (Welle 42): erfüllt die condition? Sonst nahtlos überspringen.
        var condRun = await conditionMet(index);
        if (!running) return;
        if (!condRun) {
          // Datei-Kohärenz: übersprungener DOWNLOAD, dessen Datei ein späterer Upload braucht →
          // NICHT stumm überspringen (der Upload hätte keine Datei). Autonom = ehrlicher Stopp.
          if (P.skipCrossesNeededDownload(plan, index, index + 1)) {
            finish("failed", "bedingung-datei");
            return;
          }
          emit({ type: "cond-skip", index: index });
          index++;
          continue;
        }

        // Schritt ausführen.
        var r = await executeStep(planStep);
        if (!running) return;
        if (!r.ok) {
          finish("failed", r.detail);
          return;
        }
        index++;
      }
    }

    return {
      run: function () {
        return new Promise(function (resolve) {
          resolveRun = resolve;
          if (!P) {
            finish("failed", "kein-plan-modul");
            return;
          }
          if (!plan.length) {
            finish("failed", "keine-schritte");
            return;
          }
          if (tabId == null) {
            finish("failed", "kein-ziel-tab");
            return;
          }
          index = 0;
          running = true;
          finished = false;
          files = {};
          loop().catch(function (e) {
            finish("failed", "motor-fehler");
          });
        });
      },
      abort: function () {
        if (!running) return;
        finish("aborted", "abgebrochen");
      },
      // Nur für Beobachtung/Tests: aktueller Fortschritt.
      getState: function () {
        return { index: index, total: plan.length, running: running, finished: finished };
      },
    };
  }

  var api = { createRunner: createRunner };
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.SteplyExecRun = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

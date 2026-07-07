// Pure Node-Tests für extension/exec-plan.js (Welle 36b, Automationen-Ausführ-Engine).
// KEIN Browser, KEIN Netz, KEINE npm-Pakete — das Modul ist pur (UMD via module.exports).
// Deckt ab: buildRunPlan (Reihenfolge, Wert-Auflösung, Pflichtfeld-Fehler, Datenschutz der
// Fehlermeldung), needsNavigation (Host/Pfad), redactDetail (Token/Werte schwärzen).
//
// Nutzung:  node scripts/test-exec-plan.mjs
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildRunPlan, needsNavigation, redactDetail, submitOutcome, submitBounced, linkFileSteps, planFileChunks, fileCapDecision, resyncTarget, looksLikeLoginUrl, skipCrossesNeededDownload, skipCrossesLogin, nextFireTime, parseCondition, evalUrlCondition, shouldRunStep, pickTabForStep } = require("../extension/exec-plan.js");

let failed = false;
const ok = (c, m) => {
  console.log(`${c ? "✓" : "✗"} ${m}`);
  if (!c) failed = true;
};

// ══════════ buildRunPlan ══════════
{
  const automation = {
    id: "a1",
    title: "Belege laden",
    site_domains: ["datev.de"],
    params: [
      { key: "user", label: "Benutzer", type: "text", required: true },
      { key: "pass", label: "Passwort", type: "secret", required: true },
      { key: "note", label: "Notiz", type: "text", required: false },
    ],
  };
  // Absichtlich UNSORTIERT (position 2,0,1) — buildRunPlan muss ordnen.
  const steps = [
    { id: "s2", position: 2, title: "Absenden", action: "click", selector: { css: "#go" }, page_url: "https://datev.de/x" },
    { id: "s0", position: 0, title: "Benutzer", action: "fill", selector: { css: "#u" }, page_url: "https://datev.de/login", param_key: "user" },
    { id: "s1", position: 1, title: "Passwort", action: "fill", selector: { css: "#p" }, page_url: "https://datev.de/login", param_key: "pass", imageUrl: "x.webp" },
  ];
  const values = { user: "richard", pass: "geheim", note: "" };
  const plan = buildRunPlan(automation, steps, values);

  ok(plan.length === 3, "buildRunPlan: drei Aktionen");
  ok(plan[0].title === "Benutzer" && plan[1].title === "Passwort" && plan[2].title === "Absenden", "buildRunPlan: nach position sortiert");
  ok(plan[0].index === 0 && plan[2].index === 2, "buildRunPlan: index gesetzt");
  ok(plan[0].total === 3, "buildRunPlan: total gesetzt");
  ok(plan[0].value === "richard" && plan[1].value === "geheim", "buildRunPlan: Werte aufgelöst (aus values)");
  ok(!("value" in plan[2]), "buildRunPlan: Schritt ohne param_key hat keinen value");
  ok(plan[1].imageUrl === "x.webp" && plan[0].imageUrl === null, "buildRunPlan: imageUrl durchgereicht (sonst null)");
  ok(plan[0].param_key === "user" && plan[2].param_key === null, "buildRunPlan: param_key durchgereicht");
}

// Pflichtfeld fehlt → wirft; Meldung enthält den Schlüssel/Label, aber NIE einen Wert.
{
  const automation = { id: "a", params: [{ key: "pass", label: "Passwort", type: "secret", required: true }] };
  let threw = false;
  let msg = "";
  try {
    buildRunPlan(automation, [{ id: "s", position: 0, action: "fill", param_key: "pass" }], {});
  } catch (e) {
    threw = true;
    msg = e.message;
  }
  ok(threw, "buildRunPlan: fehlender Pflicht-Parameter wirft");
  ok(msg.includes("Passwort"), "buildRunPlan: Fehlermeldung nennt das Label");
  ok(!msg.toLowerCase().includes("geheim"), "buildRunPlan: Fehlermeldung enthält keinen Wert");
}

// Leerer String zählt als fehlend (required); optionaler leerer Wert ist ok.
{
  const automation = { id: "a", params: [{ key: "u", label: "U", required: true }, { key: "n", label: "N", required: false }] };
  let threw = false;
  try {
    buildRunPlan(automation, [], { u: "", n: "" });
  } catch (e) {
    threw = true;
  }
  ok(threw, "buildRunPlan: leerer Pflicht-Wert zählt als fehlend");
  ok(buildRunPlan(automation, [], { u: "x", n: "" }).length === 0, "buildRunPlan: gefülltes Pflichtfeld + leeres Optional → ok");
}

// Ohne Parameter/ohne Steps robust.
ok(buildRunPlan(null, null, null).length === 0, "buildRunPlan: alles null → leere Liste");
ok(buildRunPlan({ id: "a" }, [{ id: "s", position: 0, action: "click" }], {}).length === 1, "buildRunPlan: Automation ohne params → ok");

// ══════════ needsNavigation ══════════
{
  const step = (u) => ({ page_url: u });
  ok(needsNavigation("https://datev.de/login", step("https://datev.de/login")) === false, "needsNavigation: gleicher Host+Pfad → false");
  ok(needsNavigation("https://datev.de/login", step("https://datev.de/login?x=1#y")) === false, "needsNavigation: nur Query/Hash anders → false");
  ok(needsNavigation("https://datev.de/login/", step("https://datev.de/login")) === false, "needsNavigation: nachlaufender Slash egal → false");
  ok(needsNavigation("https://datev.de/login", step("https://datev.de/belege")) === true, "needsNavigation: anderer Pfad → true");
  ok(needsNavigation("https://datev.de/login", step("https://elster.de/login")) === true, "needsNavigation: anderer Host → true");
  ok(needsNavigation("https://datev.de/x", step("")) === false, "needsNavigation: kein page_url → false");
  ok(needsNavigation("https://datev.de/x", step("kein url")) === false, "needsNavigation: unparsebares Ziel → false");
  ok(needsNavigation("about:blank", step("https://datev.de/login")) === true, "needsNavigation: unbekannter aktueller Ort → true");
  ok(needsNavigation("https://DATEV.de/login", step("https://datev.de/login")) === false, "needsNavigation: Host case-insensitiv → false");
}

// ══════════ redactDetail ══════════
{
  ok(redactDetail(null) === "", "redactDetail: null → ''");
  ok(redactDetail("Schritt 4: Stelle nicht gefunden") === "Schritt 4: Stelle nicht gefunden", "redactDetail: harmloser Text bleibt (kurze Zahl bleibt)");
  ok(redactDetail("Kontakt richard@petrasch.com fehlt") === "Kontakt *** fehlt", "redactDetail: E-Mail geschwärzt");
  ok(redactDetail("Nummer 1234567890 abgelehnt") === "Nummer *** abgelehnt", "redactDetail: lange Ziffernkette geschwärzt");
  ok(redactDetail("Token sk-abc123XYZ890def eingesetzt") === "Token *** eingesetzt", "redactDetail: gemischtes Token geschwärzt");
  ok(redactDetail("IBAN DE44500105175407324931 falsch") === "IBAN *** falsch", "redactDetail: IBAN geschwärzt");
  ok(redactDetail("Hash deadbeefdeadbeefcafe stimmt nicht") === "Hash *** stimmt nicht", "redactDetail: langer Hex-Block geschwärzt");
  // Normale deutsche Wörter (auch längere) bleiben unangetastet.
  ok(redactDetail("Automatisierung abgeschlossen") === "Automatisierung abgeschlossen", "redactDetail: normale Wörter bleiben");
}

// ══════════ submitOutcome / submitBounced (Welle 38, Ehrlichkeits-Netz) ══════════
{
  const LOGIN = "https://app.steply.de/login";
  const ev = (...e) => e;

  // Richards Kaltstart-Bounce: Voll-Reload (loading→complete) zurück auf /login (mit ?next).
  const bounced = ev(
    { status: "loading" },
    { url: "https://app.steply.de/login?next=%2Fapp" },
    { status: "complete" },
  );
  ok(submitOutcome(LOGIN, bounced) === "bounced", "submitOutcome: Voll-Reload auf selben Pfad → bounced");
  ok(submitBounced(LOGIN, bounced) === true, "submitBounced: Bounce → true");

  // Erfolg per React-Client-Navigation: Pfad wechselt zu /app, KEIN Reload-Zyklus.
  const left = ev({ url: "https://app.steply.de/app" });
  ok(submitOutcome(LOGIN, left) === "left", "submitOutcome: Pfadwechsel (Client-Nav) → left");
  ok(submitBounced(LOGIN, left) === false, "submitBounced: Pfadwechsel → false");

  // Erfolg per Voll-Reload, der aber auf einen NEUEN Pfad landet (nativer POST → /app): left.
  const reloadAway = ev({ status: "loading" }, { url: "https://app.steply.de/app" }, { status: "complete" });
  ok(submitOutcome(LOGIN, reloadAway) === "left", "submitOutcome: Reload auf ANDEREN Pfad → left (Erfolg schlägt Bounce)");

  // Query/Hash-Wechsel allein ist KEIN Pfadwechsel (gleiche Seite) → kein „left".
  const sameQuery = ev({ status: "loading" }, { url: "https://app.steply.de/login?x=1" }, { status: "complete" });
  ok(submitOutcome(LOGIN, sameQuery) === "bounced", "submitOutcome: nur Query anders + Reload → bounced (selber Pfad)");

  // Flüchtige Zwischen-URL zählt nicht — maßgeblich ist die ZULETZT bekannte URL.
  const transient = ev(
    { status: "loading" },
    { url: "https://app.steply.de/app" },            // Zwischenschritt der Redirect-Kette
    { url: "https://app.steply.de/login?next=%2Fapp" }, // finaler Bounce zurück
    { status: "complete" },
  );
  ok(submitOutcome(LOGIN, transient) === "bounced", "submitOutcome: finale URL entscheidet (flüchtiges /app ignoriert) → bounced");

  // Kein Reload, kein Pfadwechsel (z. B. inline-Fehler auf gleicher Seite) → pending (nicht blockieren).
  ok(submitOutcome(LOGIN, ev()) === "pending", "submitOutcome: nichts passiert → pending");
  ok(submitOutcome(LOGIN, ev({ status: "loading" })) === "pending", "submitOutcome: nur loading, kein complete → pending");
  ok(submitBounced(LOGIN, ev()) === false, "submitBounced: pending → false (advance, kein Fehlalarm)");

  // Lone „complete" ohne vorangehendes „loading" ist KEIN Reload-Zyklus.
  ok(submitOutcome(LOGIN, ev({ status: "complete" })) === "pending", "submitOutcome: complete ohne loading → pending");

  // Unbekannter Ausgangs-Pfad (leere prevUrl) → nie bounced (nichts beweisbar).
  ok(submitOutcome("", bounced) === "pending", "submitOutcome: prevUrl unbekannt → pending (nie fälschlich bounced)");

  // Anderer Host + Reload = Pfadwechsel → left.
  const otherHost = ev({ status: "loading" }, { url: "https://elster.de/login" }, { status: "complete" });
  ok(submitOutcome(LOGIN, otherHost) === "left", "submitOutcome: anderer Host → left");

  // Robust gegen kaputte events.
  ok(submitOutcome(LOGIN, null) === "pending", "submitOutcome: events null → pending");
}

// ══════════ linkFileSteps (Welle 39, Datei-Brücke) ══════════
{
  const dl = () => ({ file_meta: { role: "download" } });
  const up = () => ({ file_meta: { role: "upload" } });
  const plain = () => ({});

  // 1 Download → 1 Upload: key file1, source file1.
  let r = linkFileSteps([dl(), plain(), up()]);
  ok(r.ok, "linkFileSteps: Download→Upload ok");
  ok(r.links[0] && r.links[0].role === "download" && r.links[0].key === "file1", "linkFileSteps: Download bekommt key file1");
  ok(r.links[1] === null, "linkFileSteps: Nicht-Datei-Schritt bleibt null");
  ok(r.links[2] && r.links[2].role === "upload" && r.links[2].source === "file1", "linkFileSteps: Upload verweist auf file1");

  // Zwei Paare in Reihenfolge (FIFO): 1. Upload←file1, 2. Upload←file2.
  r = linkFileSteps([dl(), dl(), up(), up()]);
  ok(r.ok && r.links[0].key === "file1" && r.links[1].key === "file2", "linkFileSteps: zwei Downloads → file1/file2");
  ok(r.links[2].source === "file1" && r.links[3].source === "file2", "linkFileSteps: FIFO (1.Upload←file1, 2.Upload←file2)");

  // Upload OHNE vorherigen Download → sprechender Fehler.
  r = linkFileSteps([up()]);
  ok(!r.ok && /lädt eine Datei hoch/.test(r.error) && r.index === 0, "linkFileSteps: Upload ohne Download → Fehler + index");

  // Upload NACH verbrauchtem Download (2 Uploads, 1 Download) → Fehler beim zweiten.
  r = linkFileSteps([dl(), up(), up()]);
  ok(!r.ok && r.index === 2, "linkFileSteps: mehr Uploads als Downloads → Fehler beim überzähligen Upload");

  // Ohne Datei-Schritte → alles null, ok.
  r = linkFileSteps([plain(), plain()]);
  ok(r.ok && r.links.every((l) => l === null), "linkFileSteps: keine Datei-Schritte → alle null");
  ok(linkFileSteps(null).ok, "linkFileSteps: null → ok (leer)");
}

// buildRunPlan reicht file_meta durch (Download-key / Upload-source in Reihenfolge).
{
  const automation = { id: "a", params: [] };
  const steps = [
    { id: "d", position: 0, action: "click", selector: { css: "#dl" }, file_meta: { role: "download", filename: "x.pdf" } },
    { id: "u", position: 1, action: "upload", selector: { css: "#up" }, file_meta: { role: "upload", filename: "x.pdf" } },
  ];
  const plan = buildRunPlan(automation, steps, {});
  ok(plan[0].file_meta && plan[0].file_meta.role === "download" && plan[0].file_meta.key === "file1", "buildRunPlan: Download-Schritt trägt file_meta key file1");
  ok(plan[1].file_meta && plan[1].file_meta.role === "upload" && plan[1].file_meta.source === "file1", "buildRunPlan: Upload-Schritt trägt file_meta source file1");
  ok(plan[1].action === "upload", "buildRunPlan: Upload behält action='upload'");

  // Upload ohne Download → buildRunPlan wirft (defensiv, konsistenter Plan).
  let threw = false;
  try { buildRunPlan(automation, [{ id: "u", position: 0, action: "upload", file_meta: { role: "upload" } }], {}); } catch (e) { threw = true; }
  ok(threw, "buildRunPlan: Upload ohne vorherigen Download wirft");
}

// ══════════ planFileChunks (Welle 39) ══════════
{
  ok(planFileChunks(0, 8, 4).mode === "single" && planFileChunks(0, 8, 4).chunks === 0, "planFileChunks: leer → single/0 chunks");
  ok(planFileChunks(8, 8, 4).mode === "single" && planFileChunks(8, 8, 4).chunks === 1, "planFileChunks: genau singleMax → single/1");
  const big = planFileChunks(9, 8, 4);
  ok(big.mode === "chunked" && big.chunks === 3, "planFileChunks: 9 über singleMax 8, chunkSize 4 → 3 chunks");
  ok(planFileChunks(1000, 500, 250).chunks === 4, "planFileChunks: 1000/250 → 4 chunks");
}

// ══════════ fileCapDecision (Welle 39, 50-MB-Deckel) ══════════
{
  const CAP = 50 * 1024 * 1024;
  ok(fileCapDecision(1024, CAP) === "memory", "fileCapDecision: kleine Datei → memory (Weg 1)");
  ok(fileCapDecision(CAP, CAP) === "memory", "fileCapDecision: genau 50 MB → memory (Grenze inklusiv)");
  ok(fileCapDecision(CAP + 1, CAP) === "disk-fallback", "fileCapDecision: >50 MB → disk-fallback (Weg 2/3)");
  ok(fileCapDecision(60 * 1024 * 1024) === "disk-fallback", "fileCapDecision: 60 MB mit Default-Cap → disk-fallback");
}

// ══════════ resyncTarget (Welle 40, Vorspulen) ══════════
{
  // Ein Login-Ablauf: Basis „/", dann /login (2 fill + submit), dann /app, dann /app/done.
  const plan = [
    { index: 0, page_url: "https://x.de/" },              // Basis
    { index: 1, page_url: "https://x.de/login", action: "fill", param_key: "user" },
    { index: 2, page_url: "https://x.de/login", action: "fill", param_key: "pass" },
    { index: 3, page_url: "https://x.de/login", action: "click" }, // submit
    { index: 4, page_url: "https://x.de/app" },
    { index: 5, page_url: "https://x.de/app/done" },
  ];
  // Schon eingeloggt: /login leitet zu /app um → erster passender Schritt ab 1 ist Index 4.
  ok(resyncTarget("https://x.de/app", plan, 1) === 4, "resyncTarget: /app passt zu Schritt 4 (Vorspulen)");
  // Query/Hash egal.
  ok(resyncTarget("https://x.de/app?x=1#y", plan, 1) === 4, "resyncTarget: Query/Hash ignoriert");
  // NUR VORWÄRTS: von Index 4 aus wird die frühere /login-Seite NIE gefunden.
  ok(resyncTarget("https://x.de/login", plan, 4) === null, "resyncTarget: rückwärts nie (fromIndex 4, /login liegt davor)");
  // Aktuelle Seite passt zu fromIndex selbst (inklusiv).
  ok(resyncTarget("https://x.de/login", plan, 1) === 1, "resyncTarget: fromIndex inklusiv (erster /login-Schritt)");
  // Mehrere Kandidaten (drei /login-Schritte) → ERSTER gewinnt.
  ok(resyncTarget("https://x.de/login", plan, 2) === 2, "resyncTarget: mehrere Kandidaten → erster ab fromIndex");
  // Zwischenschritte OHNE page_url gehören zur übersprungenen Strecke (werden nicht gematcht).
  const planGap = [
    { index: 0, page_url: "https://x.de/" },
    { index: 1, page_url: "" },                 // ohne page_url (bindet an Vorgängerseite)
    { index: 2 },                                // ganz ohne page_url
    { index: 3, page_url: "https://x.de/app" },
  ];
  ok(resyncTarget("https://x.de/app", planGap, 0) === 3, "resyncTarget: Schritte ohne page_url übersprungen, Treffer an Index 3");
  ok(resyncTarget("https://x.de/nirgends", plan, 0) === null, "resyncTarget: passt zu nichts → null");
  ok(resyncTarget("about:blank", plan, 0) === null, "resyncTarget: unlesbare currentUrl → null");
  ok(resyncTarget("https://x.de/app", [], 0) === null, "resyncTarget: leerer Plan → null");
  ok(resyncTarget("https://X.DE/app", plan, 1) === 4, "resyncTarget: Host case-insensitiv (Pfad exakt/casesensitiv)");
}

// ══════════ looksLikeLoginUrl (Welle 40, Anmelde-Wache) ══════════
{
  const T = (u) => looksLikeLoginUrl(u);
  ok(T("https://x.de/login") === true, "looksLikeLoginUrl: /login");
  ok(T("https://x.de/log-in") === true, "looksLikeLoginUrl: /log-in");
  ok(T("https://x.de/signin") === true, "looksLikeLoginUrl: /signin");
  ok(T("https://x.de/sign-in") === true, "looksLikeLoginUrl: /sign-in");
  ok(T("https://x.de/anmelden") === true, "looksLikeLoginUrl: /anmelden");
  ok(T("https://x.de/anmeldung") === true, "looksLikeLoginUrl: /anmeldung (anmeld*)");
  ok(T("https://x.de/auth/callback") === true, "looksLikeLoginUrl: /auth/*");
  ok(T("https://x.de/oauth/authorize") === true, "looksLikeLoginUrl: /authorize (Segmentanfang auth)");
  ok(T("https://x.de/sso") === true, "looksLikeLoginUrl: /sso");
  ok(T("https://x.de/account/login") === true, "looksLikeLoginUrl: account/login");
  ok(T("https://x.de/LOGIN") === true, "looksLikeLoginUrl: Groß/klein egal");
  // Query zählt NICHT.
  ok(T("https://x.de/app?redirect=/login") === false, "looksLikeLoginUrl: Login nur in Query → false");
  ok(T("https://x.de/dashboard") === false, "looksLikeLoginUrl: /dashboard → false");
  ok(T("https://x.de/belege") === false, "looksLikeLoginUrl: /belege → false");
  ok(T("https://x.de/") === false, "looksLikeLoginUrl: Wurzel → false");
  ok(T("kein-url") === false, "looksLikeLoginUrl: unparsebar → false");
}

// ══════════ skipCrossesNeededDownload (Welle 40, Datei-Kohärenz beim Vorspulen) ══════════
{
  const dl = (key) => ({ file_meta: { role: "download", key } });
  const up = (source) => ({ file_meta: { role: "upload", source } });
  const plain = () => ({});
  // Beweis 5: Vorspulen [1,3) überspränge einen Download (file1), den ein späterer Upload (Index 3) braucht.
  const plan = [plain(), dl("file1"), plain(), up("file1"), plain()];
  ok(skipCrossesNeededDownload(plan, 1, 3) === true, "skipCrossesNeededDownload: übersprungener Download wird später gebraucht → true (Pause)");
  // Der Upload liegt SELBST in der übersprungenen Strecke → kein Konflikt (beide weg).
  ok(skipCrossesNeededDownload(plan, 1, 4) === false, "skipCrossesNeededDownload: Download UND Upload übersprungen → false");
  // Kein Download in der Strecke → false.
  ok(skipCrossesNeededDownload([plain(), plain(), up("file1")], 0, 1) === false, "skipCrossesNeededDownload: kein Download übersprungen → false");
  // Download übersprungen, aber kein Upload braucht ihn → false.
  ok(skipCrossesNeededDownload([dl("file1"), plain(), plain()], 0, 2) === false, "skipCrossesNeededDownload: Download ohne späteren Upload → false");
  ok(skipCrossesNeededDownload(null, 0, 1) === false, "skipCrossesNeededDownload: null-Plan → false");
}

// ══════════ skipCrossesLogin (Welle 40, Vorspul-Formulierung: „Angemeldet? → Ja") ══════════
{
  const plan = [
    { page_url: "https://x.de/" },
    { page_url: "https://x.de/login", action: "fill", param_key: "user" },
    { page_url: "https://x.de/login", action: "fill", param_key: "pass" },
    { page_url: "https://x.de/login", action: "click" },
    { page_url: "https://x.de/app" },
  ];
  ok(skipCrossesLogin(plan, 1, 4, {}) === true, "skipCrossesLogin: übersprungene /login-Schritte → true (Login-Flavor)");
  ok(skipCrossesLogin(plan, 4, 5, {}) === false, "skipCrossesLogin: nur /app übersprungen → false");
  // Ohne Login-page_url, aber ein fill mit secret-Param → ebenfalls Login-Flavor.
  const planSecret = [{ page_url: "https://x.de/portal", action: "fill", param_key: "pw" }, { page_url: "https://x.de/app" }];
  ok(skipCrossesLogin(planSecret, 0, 1, { pw: true }) === true, "skipCrossesLogin: secret-fill-Schritt → true");
  ok(skipCrossesLogin(planSecret, 0, 1, {}) === false, "skipCrossesLogin: fill ohne secret-Markierung → false");
}

// ══════════ nextFireTime (Welle 41, ZEITPLAN) ══════════
{
  // Helfer: UTC-Zeit als Epoch-ms (deterministisch, kein lokaler TZ-Einfluss).
  const utc = (y, mo, d, h, mi) => Date.UTC(y, mo, d, h, mi, 0, 0);
  // Erwartete Fälligkeit lesbar prüfen: nextFireTime zurück in LOKALE Wanduhr rechnen.
  const localParts = (ms, tz) => {
    const d = new Date(ms - tz * 60000);
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() };
  };

  // ── weekly, tz = 0 (UTC) ──────────────────────────────────────────────────
  // 2026-07-06 ist ein MONTAG. Zeitplan „jeden Montag 08:00".
  const monday0800 = { enabled: true, freq: "weekly", weekday: 1, hour: 8, minute: 0 };
  // Jetzt: Montag 07:00 (vor 08:00) → HEUTE 08:00.
  {
    const now = utc(2026, 6, 6, 7, 0);
    const fire = nextFireTime(monday0800, now, 0);
    const p = localParts(fire, 0);
    ok(p.wd === 1 && p.h === 8 && p.mi === 0 && p.d === 6, `nextFireTime weekly: Mo 07:00 → heute Mo 08:00 (war ${new Date(fire).toISOString()})`);
    ok(fire > now, "nextFireTime weekly: Fälligkeit liegt in der Zukunft");
  }
  // Jetzt: Montag 08:00 EXAKT → nicht heute (>, nicht >=), sondern nächste Woche.
  {
    const now = utc(2026, 6, 6, 8, 0);
    const fire = nextFireTime(monday0800, now, 0);
    const p = localParts(fire, 0);
    ok(p.wd === 1 && p.d === 13, `nextFireTime weekly: Mo 08:00 exakt → nächster Montag (war ${new Date(fire).toISOString()})`);
  }
  // Jetzt: Montag 09:00 (nach 08:00) → nächster Montag (+7).
  {
    const now = utc(2026, 6, 6, 9, 0);
    const fire = nextFireTime(monday0800, now, 0);
    ok(fire === utc(2026, 6, 13, 8, 0), `nextFireTime weekly: Mo 09:00 → nächster Mo (war ${new Date(fire).toISOString()})`);
  }
  // Jetzt: Mittwoch → nächster Montag.
  {
    const now = utc(2026, 6, 8, 12, 0); // Mi
    const fire = nextFireTime(monday0800, now, 0);
    ok(fire === utc(2026, 6, 13, 8, 0), `nextFireTime weekly: Mi → kommender Mo (war ${new Date(fire).toISOString()})`);
  }
  // Sonntag (weekday 0) getestet: 2026-07-05 ist ein Sonntag.
  {
    const sunday = { enabled: true, freq: "weekly", weekday: 0, hour: 20, minute: 30 };
    const now = utc(2026, 6, 6, 9, 0); // Mo
    const fire = nextFireTime(sunday, now, 0);
    const p = localParts(fire, 0);
    ok(p.wd === 0 && p.d === 12 && p.h === 20 && p.mi === 30, `nextFireTime weekly: Sonntag(0) → 12.07. 20:30 (war ${new Date(fire).toISOString()})`);
  }

  // ── weekly mit Zeitzone (Berlin Sommer, UTC+2 → tzOffset -120) ──────────────
  {
    // Lokal Montag 08:00 Berlin = 06:00 UTC. Jetzt lokal Mo 07:00 (=05:00 UTC).
    const nowUtc = utc(2026, 6, 6, 5, 0); // 07:00 Berlin
    const fire = nextFireTime(monday0800, nowUtc, -120);
    ok(fire === utc(2026, 6, 6, 6, 0), `nextFireTime weekly tz: Mo 08:00 Berlin = 06:00 UTC (war ${new Date(fire).toISOString()})`);
    const p = localParts(fire, -120);
    ok(p.h === 8 && p.mi === 0 && p.wd === 1, "nextFireTime weekly tz: lokal 08:00 Montag");
  }
  {
    // Grenzfall: lokal kurz vor Mitternacht, Zeitplan früh morgens → nächster Tag/Woche korrekt.
    // Jetzt lokal So 23:30 Berlin (=21:30 UTC So). „Montag 00:30" → Mo 00:30 Berlin = 22:30 UTC So.
    const early = { enabled: true, freq: "weekly", weekday: 1, hour: 0, minute: 30 };
    const nowUtc = utc(2026, 6, 5, 21, 30); // So 23:30 Berlin
    const fire = nextFireTime(early, nowUtc, -120);
    const p = localParts(fire, -120);
    ok(p.wd === 1 && p.h === 0 && p.mi === 30 && p.d === 6, `nextFireTime weekly tz: So 23:30 → Mo 00:30 lokal (war Tag ${p.d} ${p.h}:${p.mi})`);
  }

  // ── monthly ────────────────────────────────────────────────────────────────
  // „am 3. um 09:00". Jetzt 1. Juli → 3. Juli.
  {
    const third = { enabled: true, freq: "monthly", day: 3, hour: 9, minute: 0 };
    const fire = nextFireTime(third, utc(2026, 6, 1, 10, 0), 0);
    ok(fire === utc(2026, 6, 3, 9, 0), `nextFireTime monthly: 1.7. → 3.7. 09:00 (war ${new Date(fire).toISOString()})`);
  }
  // Jetzt 3. Juli 10:00 (nach 09:00) → 3. August.
  {
    const third = { enabled: true, freq: "monthly", day: 3, hour: 9, minute: 0 };
    const fire = nextFireTime(third, utc(2026, 6, 3, 10, 0), 0);
    ok(fire === utc(2026, 7, 3, 9, 0), `nextFireTime monthly: 3.7. 10:00 → 3.8. (war ${new Date(fire).toISOString()})`);
  }
  // day=31 im Februar (Nicht-Schaltjahr 2027) → 28.02.
  {
    const d31 = { enabled: true, freq: "monthly", day: 31, hour: 12, minute: 0 };
    const fire = nextFireTime(d31, utc(2027, 1, 1, 0, 0), 0); // 1. Feb 2027
    ok(fire === utc(2027, 1, 28, 12, 0), `nextFireTime monthly: day=31 Feb 2027 → 28.02. (war ${new Date(fire).toISOString()})`);
  }
  // day=31 im Februar (Schaltjahr 2028) → 29.02.
  {
    const d31 = { enabled: true, freq: "monthly", day: 31, hour: 12, minute: 0 };
    const fire = nextFireTime(d31, utc(2028, 1, 1, 0, 0), 0); // 1. Feb 2028 (Schaltjahr)
    ok(fire === utc(2028, 1, 29, 12, 0), `nextFireTime monthly: day=31 Feb 2028 (Schaltjahr) → 29.02. (war ${new Date(fire).toISOString()})`);
  }
  // day=31 im April (30 Tage) → 30.04.
  {
    const d31 = { enabled: true, freq: "monthly", day: 31, hour: 6, minute: 15 };
    const fire = nextFireTime(d31, utc(2026, 3, 15, 0, 0), 0); // 15. April
    ok(fire === utc(2026, 3, 30, 6, 15), `nextFireTime monthly: day=31 April → 30.04. (war ${new Date(fire).toISOString()})`);
  }
  // Jahresübergang: „am 5." und jetzt 20. Dezember → 5. Januar Folgejahr.
  {
    const d5 = { enabled: true, freq: "monthly", day: 5, hour: 8, minute: 0 };
    const fire = nextFireTime(d5, utc(2026, 11, 20, 0, 0), 0); // 20. Dez
    ok(fire === utc(2027, 0, 5, 8, 0), `nextFireTime monthly: 20.12. → 5.1. Folgejahr (war ${new Date(fire).toISOString()})`);
  }
  // monthly mit tz: „am 1. 00:00" Berlin (UTC+2) = 31. des Vormonats 22:00 UTC.
  {
    const first = { enabled: true, freq: "monthly", day: 1, hour: 0, minute: 0 };
    const nowUtc = utc(2026, 6, 15, 12, 0); // 15. Juli
    const fire = nextFireTime(first, nowUtc, -120);
    ok(fire === utc(2026, 6, 31, 22, 0), `nextFireTime monthly tz: 1.8. 00:00 Berlin = 31.7. 22:00 UTC (war ${new Date(fire).toISOString()})`);
    const p = localParts(fire, -120);
    ok(p.d === 1 && p.mo === 7 && p.h === 0, "nextFireTime monthly tz: lokal 1. August 00:00");
  }

  // ── Robustheit / ungültige Eingaben → null ─────────────────────────────────
  ok(nextFireTime(null, 0, 0) === null, "nextFireTime: null-Schedule → null");
  ok(nextFireTime({ enabled: false, freq: "weekly", weekday: 1, hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: enabled=false → null");
  ok(nextFireTime({ enabled: true, freq: "daily", hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: unbekannte freq → null");
  ok(nextFireTime({ enabled: true, freq: "weekly", weekday: 9, hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: weekday außerhalb 0-6 → null");
  ok(nextFireTime({ enabled: true, freq: "weekly", hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: weekly ohne weekday → null");
  ok(nextFireTime({ enabled: true, freq: "monthly", hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: monthly ohne day → null");
  ok(nextFireTime({ enabled: true, freq: "monthly", day: 0, hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: day 0 → null");
  ok(nextFireTime({ enabled: true, freq: "monthly", day: 32, hour: 8, minute: 0 }, 0, 0) === null, "nextFireTime: day 32 → null");
  ok(nextFireTime({ enabled: true, freq: "weekly", weekday: 1, hour: 24, minute: 0 }, 0, 0) === null, "nextFireTime: hour 24 → null");
  ok(nextFireTime({ enabled: true, freq: "weekly", weekday: 1, hour: 8, minute: 60 }, 0, 0) === null, "nextFireTime: minute 60 → null");
  ok(nextFireTime({ enabled: true, freq: "weekly", weekday: 1, hour: 8, minute: 0 }, NaN, 0) === null, "nextFireTime: nowMs NaN → null");
  // tzOffset fehlt → als 0 behandelt (kein Absturz).
  ok(typeof nextFireTime(monday0800, utc(2026, 6, 6, 7, 0)) === "number", "nextFireTime: fehlender tzOffset → 0 angenommen (Zahl)");
}

// ══════════ Bedingte Schritte (Welle 42): parseCondition / evalUrlCondition / shouldRunStep ══════════
{
  // ── parseCondition: tolerant, wirft nie, unbekannt → null ──────────────────────
  ok(parseCondition(null) === null, "parseCondition: null → null");
  ok(parseCondition("x") === null, "parseCondition: String → null");
  ok(parseCondition({ kind: "was-anderes" }) === null, "parseCondition: fremde kind → null");
  ok(parseCondition({ kind: "element" }) === null, "parseCondition: element ohne selector → null");
  ok(parseCondition({ kind: "element", selector: {} }) === null, "parseCondition: element mit leerem selector → null");
  ok(parseCondition({ kind: "url", pattern: "   " }) === null, "parseCondition: url mit leerem pattern → null");

  const ce = parseCondition({ kind: "element", selector: { css: "#x", text: " Alle akzeptieren ", role: "Button" }, negate: 1 });
  ok(ce && ce.kind === "element" && ce.selector.css === "#x" && ce.selector.text === "Alle akzeptieren" && ce.selector.role === "button",
    `parseCondition: element normalisiert (text getrimmt, role lower) (war ${JSON.stringify(ce)})`);
  ok(ce && !("negate" in ce), "parseCondition: negate NUR bei echtem true (1 zählt nicht)");
  const cen = parseCondition({ kind: "element", selector: { css: "#x" }, negate: true });
  ok(cen && cen.negate === true, "parseCondition: negate:true übernommen");
  const cu = parseCondition({ kind: "url", pattern: "  /login  " });
  ok(cu && cu.kind === "url" && cu.pattern === "/login", "parseCondition: url pattern getrimmt");

  // ── evalUrlCondition: ROHER Treffer (OHNE negate), Host/Pfad/Glob ───────────────
  const uc = { kind: "url", pattern: "beispiel.de/app" };
  ok(evalUrlCondition("https://beispiel.de/app/x?y=1", uc) === true, "evalUrlCondition: Host+Pfad-Teilstring trifft");
  ok(evalUrlCondition("https://beispiel.de/anders", uc) === false, "evalUrlCondition: anderer Pfad → kein Treffer");
  ok(evalUrlCondition("https://andere.de/app", { kind: "url", pattern: "andere.de" }) === true, "evalUrlCondition: nur Host trifft");
  ok(evalUrlCondition("https://x.de/konto/login?next=1", { kind: "url", pattern: "/login" }) === true, "evalUrlCondition: Pfad-Teilstring trifft (Query egal)");
  ok(evalUrlCondition("https://x.de/a/b/c", { kind: "url", pattern: "x.de/*/c" }) === true, "evalUrlCondition: Glob * trifft");
  ok(evalUrlCondition("https://x.de/a/b/d", { kind: "url", pattern: "x.de/*/c" }) === false, "evalUrlCondition: Glob ohne Treffer → false");
  ok(evalUrlCondition("kaputt", uc) === false, "evalUrlCondition: unlesbare URL → false");
  ok(evalUrlCondition("https://x.de/", { kind: "element", selector: { css: "#x" } }) === false, "evalUrlCondition: nicht-url-cond → false");
  // ROH: negate wird von evalUrlCondition NICHT angewandt (das macht shouldRunStep).
  ok(evalUrlCondition("https://beispiel.de/app", { kind: "url", pattern: "beispiel.de/app", negate: true }) === true,
    "evalUrlCondition: liefert ROHEN Treffer — negate bleibt shouldRunStep überlassen");

  // ── shouldRunStep: EINZIGE negate-Autorität + Entscheidung ─────────────────────
  ok(shouldRunStep(null, {}) === true, "shouldRunStep: keine condition → immer ausführen");
  ok(shouldRunStep({ kind: "quatsch" }, {}) === true, "shouldRunStep: unbekannte kind → ausführen (tolerant)");
  // Element
  ok(shouldRunStep({ kind: "element", selector: { css: "#b" } }, { elementFound: true }) === true, "shouldRunStep: element vorhanden → ausführen");
  ok(shouldRunStep({ kind: "element", selector: { css: "#b" } }, { elementFound: false }) === false, "shouldRunStep: element fehlt → überspringen");
  ok(shouldRunStep({ kind: "element", selector: { css: "#b" }, negate: true }, { elementFound: false }) === true, "shouldRunStep: negate + element fehlt → ausführen");
  ok(shouldRunStep({ kind: "element", selector: { css: "#b" }, negate: true }, { elementFound: true }) === false, "shouldRunStep: negate + element vorhanden → überspringen");
  // URL
  ok(shouldRunStep({ kind: "url", pattern: "/x" }, { urlMatch: true }) === true, "shouldRunStep: url passt → ausführen");
  ok(shouldRunStep({ kind: "url", pattern: "/x" }, { urlMatch: false }) === false, "shouldRunStep: url passt nicht → überspringen");
  ok(shouldRunStep({ kind: "url", pattern: "/x", negate: true }, { urlMatch: false }) === true, "shouldRunStep: negate + url passt nicht → ausführen");
  // Fehlendes Signal → als false gewertet (kein Treffer).
  ok(shouldRunStep({ kind: "element", selector: { css: "#b" } }, {}) === false, "shouldRunStep: fehlendes Signal → überspringen (sicher)");

  // ── buildRunPlan: condition durchgereicht (parseCondition angewandt, kaputt → weg) ──
  const auto = { id: "a", params: [] };
  const stepsC = [
    { id: "s0", position: 0, action: "click", selector: { css: "#nav" }, page_url: "https://s.de/" },
    { id: "s1", position: 1, action: "click", selector: { css: "#ok" }, page_url: "https://s.de/", condition: { kind: "element", selector: { css: "#banner" } } },
    { id: "s2", position: 2, action: "click", selector: { css: "#go" }, page_url: "https://s.de/", condition: { kind: "kaputt" } },
  ];
  const planC = buildRunPlan(auto, stepsC, {});
  ok(!("condition" in planC[0]), "buildRunPlan: Schritt ohne condition → kein Feld (läuft immer)");
  ok(planC[1].condition && planC[1].condition.kind === "element" && planC[1].condition.selector.css === "#banner",
    "buildRunPlan: gültige condition durchgereicht + normalisiert");
  ok(!("condition" in planC[2]), "buildRunPlan: kaputte condition → verworfen (Schritt läuft immer)");
}

// ══════════ pickTabForStep (Welle 43, Tab-/Fenster-Folgen) ══════════
{
  // Grund-Menge: gebundener Tab (WeTransfer /start) + ein neuer Tab + ein OAuth-Popup.
  const tabs = [
    { tabId: 1, url: "https://wetransfer.com/start", windowId: 10, lastFocusedMs: 100 },
    { tabId: 2, url: "https://wetransfer.com/second", windowId: 10, lastFocusedMs: 200 },
    { tabId: 3, url: "https://accounts.google.com/oauth?x=1", windowId: 20, lastFocusedMs: 300 },
  ];

  // URL passt → der zugehörige Tab wird gewählt (Host+Pfad; Query egal).
  ok(pickTabForStep({ page_url: "https://wetransfer.com/second" }, tabs) === 2,
    "pickTabForStep: Tab mit passender URL gewählt (neuer Tab)");
  // Popup-Tab (separates Fenster) wird bevorzugt, wenn seine URL passt — NICHT der Ursprungs-Tab.
  ok(pickTabForStep({ page_url: "https://accounts.google.com/oauth" }, tabs) === 3,
    "pickTabForStep: Popup-Tab (anderes Fenster) gewählt, wenn URL passt (Query egal)");
  // Kein passender Tab → null (Aufrufer bleibt beim aktuellen Tab / navigiert ihn).
  ok(pickTabForStep({ page_url: "https://wetransfer.com/gibtsnicht" }, tabs) === null,
    "pickTabForStep: kein Treffer → null (aktueller Tab bleiben)");
  // Schritt ohne page_url → null (bindet sich an die Seite des Vorgängers, wie needsNavigation).
  ok(pickTabForStep({ page_url: "" }, tabs) === null,
    "pickTabForStep: kein page_url → null");
  ok(pickTabForStep({}, tabs) === null, "pickTabForStep: fehlendes page_url → null");

  // Mehrere Kandidaten mit gleichem Pfad → der ZULETZT FOKUSSIERTE (höchstes lastFocusedMs).
  const multi = [
    { tabId: 5, url: "https://app.de/x", windowId: 1, lastFocusedMs: 50 },
    { tabId: 6, url: "https://app.de/x?a=1", windowId: 1, lastFocusedMs: 900 },
    { tabId: 7, url: "https://app.de/x#h", windowId: 2, lastFocusedMs: 400 },
  ];
  ok(pickTabForStep({ page_url: "https://app.de/x" }, multi) === 6,
    "pickTabForStep: mehrere Kandidaten → zuletzt fokussiert gewinnt");

  // Leere/kaputte Eingaben tolerant.
  ok(pickTabForStep({ page_url: "https://app.de/x" }, []) === null, "pickTabForStep: leere Tab-Menge → null");
  ok(pickTabForStep({ page_url: "https://app.de/x" }, null) === null, "pickTabForStep: keine Tab-Menge → null");
  ok(pickTabForStep(null, tabs) === null, "pickTabForStep: kein Schritt → null");
  // Tab ohne/leere URL zählt nicht (frisch geöffnetes about:blank-Popup, noch nicht geladen).
  const loading = [
    { tabId: 8, url: "", windowId: 3, lastFocusedMs: 999 },
    { tabId: 9, url: "https://ziel.de/app", windowId: 3, lastFocusedMs: 1 },
  ];
  ok(pickTabForStep({ page_url: "https://ziel.de/app" }, loading) === 9,
    "pickTabForStep: Tab ohne URL (ladend) ignoriert, geladener Treffer gewählt");

  // ── preferTabId (Welle 46, BUGFIX In-Page-Klick) ──────────────────────────────
  // Der GEBUNDENE Tab gewinnt IMMER, wenn er selbst zum Schritt passt — auch wenn ein anderer
  // gleich-URL-Tab zuletzt fokussiert war (z. B. eine während des Laufs geöffnete zweite Kopie).
  // So bleibt ein reiner In-Page-Klick am gebundenen (sichtbaren) Tab, statt fälschlich umzubinden.
  ok(pickTabForStep({ page_url: "https://app.de/x" }, multi, 5) === 5,
    "pickTabForStep: gebundener Tab (preferTabId) passt → gewinnt trotz niedrigerem lastFocusedMs");
  ok(pickTabForStep({ page_url: "https://app.de/x" }, multi, 7) === 7,
    "pickTabForStep: preferTabId auf einen anderen passenden Tab wirkt ebenso (kein Wechsel weg)");
  // preferTabId zeigt auf einen Tab, der NICHT passt (echte Tab-Folge: gebundener Tab auf anderer
  // Seite) → normale Wahl (zuletzt fokussiert) greift, Welle 43 bleibt intakt.
  ok(pickTabForStep({ page_url: "https://app.de/x" }, multi, 999) === 6,
    "pickTabForStep: preferTabId kein Kandidat → normale Wahl (Tab-Folge unberührt)");
  // preferTabId gesetzt, aber es gibt gar keinen Treffer → null (wie ohne prefer).
  ok(pickTabForStep({ page_url: "https://app.de/gibtsnicht" }, multi, 5) === null,
    "pickTabForStep: preferTabId ohne passenden Tab → null");
  // Rückwärtskompatibel: ohne preferTabId unverändert (zuletzt fokussiert gewinnt).
  ok(pickTabForStep({ page_url: "https://app.de/x" }, multi) === 6,
    "pickTabForStep: ohne preferTabId unverändert (Rückwärtskompatibilität)");
}

console.log(failed ? "\n✗ exec-plan Tests fehlgeschlagen." : "\n✓ exec-plan: buildRunPlan/needsNavigation/redactDetail/submitOutcome/linkFileSteps/planFileChunks/fileCapDecision/resyncTarget/looksLikeLoginUrl/skipCrossesNeededDownload/skipCrossesLogin/nextFireTime/parseCondition/evalUrlCondition/shouldRunStep/pickTabForStep verifiziert.");
process.exitCode = failed ? 1 : 0;

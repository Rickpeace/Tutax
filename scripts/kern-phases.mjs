// Ablaeufe des Kern-Durchlaufs (siehe test-kern-durchlauf.mjs).
// Jede Phase kapselt ihre Fehler, damit ein Stolperstein den Rest nicht stoppt.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Test-Screenshot als PNG-Datei (unterschiedliche Farbe je Aufruf). */
async function makeImage(tag, w = 900, h = 600) {
  const sharp = require("sharp");
  const dir = mkdtempSync(path.join(os.tmpdir(), "steply-kern-"));
  const file = path.join(dir, `${tag}.png`);
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <rect width="100%" height="100%" fill="#e9eef7"/>
      <rect x="40" y="40" width="${w - 80}" height="90" fill="#ffffff" stroke="#c3cede" stroke-width="3"/>
      <text x="60" y="95" font-family="Arial" font-size="34" fill="#33291f">${tag}</text>
      <rect x="40" y="180" width="360" height="52" fill="#ffffff" stroke="#c3cede" stroke-width="3"/>
      <text x="58" y="215" font-family="Arial" font-size="22" fill="#555">Kundennummer 123456</text>
      <rect x="40" y="280" width="200" height="52" rx="10" fill="#ef6a4e"/>
      <text x="70" y="315" font-family="Arial" font-size="22" fill="#fff">Weiter</text>
    </svg>`,
  );
  await sharp(svg).png().toFile(file);
  return file;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wartet, bis ein Toast mit Text erscheint (oder gibt null zurueck). */
async function toastText(page, ms = 8000) {
  try {
    const t = page.locator("[data-sonner-toast]").first();
    await t.waitFor({ timeout: ms });
    return (await t.innerText()).replace(/\s+/g, " ").trim();
  } catch {
    return null;
  }
}

async function overflowPx(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

export async function run(c) {
  const { page, BASE, PW, email, stamp, admin, bug, ok, info, shot, setPhase, cleanup } = c;
  const state = {};

  // ═══════════════════════════════════════════════════════════════════════════
  setPhase("1 — Registrierung, Onboarding, erste Anleitung");
  try {
    await page.goto(`${BASE}/signup`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(PW);
    const orgField = page.locator("#account_name");
    if (await orgField.count()) await orgField.fill("Kern Test GmbH");
    await shot(page, "01-signup");
    await page.getByRole("button", { name: /Konto erstellen|Registrieren/i }).first().click();
    await page.waitForURL(/\/(app|onboarding)/, { timeout: 90_000 });
    ok("Registrierung fuehrt direkt in die App");

    // Benutzer-/Konto-IDs fuer Aufraeumen + DB-Pruefungen holen.
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    const me = users.users.find((u) => u.email === email);
    if (!me) throw new Error("Neuer Nutzer nicht in der DB gefunden");
    state.userId = me.id;
    cleanup.users.push(me.id);
    const { data: mem } = await admin.from("account_members").select("account_id").eq("user_id", me.id);
    state.accountId = mem[0].account_id;
    cleanup.accounts.push(state.accountId);

    // Onboarding — nach der Registrierung soll der Einrichtungs-Assistent kommen.
    await sleep(4000);
    const afterSignup = page.url();
    info(`Nach Registrierung gelandet auf: ${afterSignup}`);
    if (!afterSignup.includes("/onboarding")) {
      bug("aergerlich", "Nach der Registrierung erscheint der Einrichtungs-Assistent nicht zuverlaessig", `Der neue Nutzer bleibt auf ${afterSignup}; der Weiterleitung zum Onboarding steckt in einem nachgeladenen Teil der Kopfzeile (src/app/app/layout.tsx:101).`);
      await page.goto(`${BASE}/onboarding`, { waitUntil: "domcontentloaded" });
    }
    await page.getByRole("heading", { name: /Willkommen bei Steply|Kurz einrichten/ }).waitFor({ timeout: 30_000 });
    await sleep(1500);
    const losGehts = page.getByRole("button", { name: /Los geht/i });
    if (await losGehts.count()) {
      await losGehts.click();
    }
    await page.locator("#ob-name").waitFor({ timeout: 20_000 });
    await page.locator("#ob-name").fill("Kern Test GmbH");
    await page.locator("#ob-web").fill("https://www.kern-test.example");
    await shot(page, "02-onboarding");
    await page.getByRole("button", { name: /Fertig & loslegen/i }).click();
    await page.waitForURL(/\/app(\?|$|\/)/, { timeout: 60_000 });
    ok("Onboarding abgeschlossen -> /app");

    const { data: acc, error: accErr } = await admin.from("accounts").select("name, slug, onboarded, plan").eq("id", state.accountId).single();
    if (accErr) throw new Error("accounts-Abfrage: " + accErr.message);
    state.slug = acc.slug;
    state.plan = acc.plan;
    const { data: th } = await admin.from("themes").select("source_url").eq("account_id", state.accountId).maybeSingle();
    info(`Konto: name=${acc.name} slug=${acc.slug} plan=${acc.plan} theme.source_url=${th ? th.source_url : "(keine Theme-Zeile)"}`);
    if (!th || !th.source_url) bug("aergerlich", "Website aus dem Onboarding wird nicht gespeichert", "Im Onboarding eingetragene Adresse landet nicht in themes.source_url — die spaetere KI-CI-Uebernahme findet nichts vor.");
    if (acc.name !== "Kern Test GmbH") bug("aergerlich", "Organisationsname aus dem Onboarding kommt nicht an", `In der DB steht „${acc.name}“ statt „Kern Test GmbH“.`);
    if (!acc.onboarded) bug("aergerlich", "Onboarding-Merker wird nicht gesetzt", "accounts.onboarded ist nach „Fertig & loslegen“ weiterhin false — der Assistent koennte erneut erscheinen.");

    // Leerer Zustand der Bibliothek
    await page.getByRole("button", { name: /Neue Anleitung/i }).first().waitFor({ timeout: 90_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await sleep(1200);
    await shot(page, "03-bibliothek-leer");
    const emptyTxt = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
    info(`Leerer Zustand: ${emptyTxt.slice(0, 300)}`);

    // Erste Anleitung: Kopfleisten-Knopf
    await page.getByRole("button", { name: /Neue Anleitung/i }).first().click();
    await page.getByRole("dialog").waitFor({ timeout: 15_000 });
    await shot(page, "04-neue-anleitung-dialog");
    await page.getByRole("button", { name: "Selbst bauen" }).click();
    await page.locator("#title").fill("Beleg hochladen");
    await page.getByRole("button", { name: /Erstellen & bearbeiten/i }).click();
    await page.waitForURL(/\/app\/tutorials\//, { timeout: 60_000 });
    state.tutorialId = page.url().split("/app/tutorials/")[1].split(/[?#]/)[0];
    ok("Anleitung angelegt, Editor geoeffnet");

    // Veroeffentlichen muss bei leerer Anleitung gesperrt sein
    const pubBtn = page.getByTestId("publish-button");
    await pubBtn.waitFor({ timeout: 20_000 });
    if (await pubBtn.isEnabled()) bug("aergerlich", "Leere Anleitung laesst sich veroeffentlichen", "Der Knopf „Veroeffentlichen“ ist ohne Schritte aktiv.");
    else ok("Leere Anleitung: „Veroeffentlichen“ gesperrt");

    // Schritt von Hand anlegen
    await page.getByTestId("empty-builder").waitFor({ timeout: 20_000 });
    await page.getByRole("button", { name: /Schritt von Hand anlegen/i }).click();
    await page.locator("#step-title").waitFor({ timeout: 20_000 });
    await page.locator("#step-title").fill("Im Portal anmelden");
    const rt = page.locator('[contenteditable="true"]').first();
    await rt.click();
    await rt.type("Oeffnen Sie das Portal und melden Sie sich an.");
    // Bild hochladen
    const img1 = await makeImage("Portal-Login");
    await page.locator('input[type="file"]').first().setInputFiles(img1);
    const crop = page.getByTestId("crop-dialog");
    await crop.waitFor({ timeout: 20_000 });
    await shot(page, "05-crop");
    const useBtn = crop.getByRole("button", { name: "Übernehmen" }).first();
    if (await useBtn.count()) await useBtn.click();
    else bug("aergerlich", "Zuschneide-Dialog ohne erkennbaren Bestaetigen-Knopf", "Im Crop-Dialog liess sich kein Uebernehmen-Knopf finden.");
    await page.getByTestId("highlight-canvas").waitFor({ timeout: 40_000 });
    ok("Bild hochgeladen und im Markierungs-Editor sichtbar");
    // speichern
    const saveBtn = page.getByRole("button", { name: /^Speichern$/ });
    if (await saveBtn.count()) await saveBtn.first().click();
    await sleep(1500);
    await shot(page, "06-editor-schritt1");

    // Veroeffentlichen
    await page.getByTestId("publish-button").click();
    const t = await toastText(page, 30_000);
    info(`Toast nach Veroeffentlichen: ${t}`);
    await page.getByTestId("published-badge").waitFor({ timeout: 40_000 });
    ok("Anleitung veroeffentlicht (Etikett sichtbar)");

    const { data: tut } = await admin.from("tutorials").select("slug, status").eq("id", state.tutorialId).single();
    state.tutSlug = tut.slug;
    if (tut.status !== "published") bug("blockierend", "Veroeffentlichen speichert den Status nicht", `tutorials.status=${tut.status}`);

    // Hilfe-Seite ansehen
    const hub = await c.ctx.newPage();
    c.watch(hub);
    await hub.goto(`${BASE}/h/${state.slug}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await hub.waitForLoadState("networkidle").catch(() => {});
    await shot(hub, "07-hilfeseite");
    const hubTxt = (await hub.locator("body").innerText()).replace(/\s+/g, " ");
    if (!hubTxt.includes("Beleg hochladen")) bug("blockierend", "Veroeffentlichte Anleitung fehlt auf der Hilfe-Seite", `Auf /h/${state.slug} taucht „Beleg hochladen“ nicht auf. Sichtbar: ${hubTxt.slice(0, 300)}`);
    else ok("Anleitung erscheint auf der Hilfe-Seite");
    if (state.tutSlug) {
      await hub.goto(`${BASE}/h/${state.slug}/${state.tutSlug}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await hub.waitForLoadState("networkidle").catch(() => {});
      await shot(hub, "08-hilfeseite-anleitung");
      const wTxt = (await hub.locator("body").innerText()).replace(/\s+/g, " ");
      if (!wTxt.includes("Im Portal anmelden")) bug("aergerlich", "Schritt-Titel fehlt im oeffentlichen Player", `Sichtbar: ${wTxt.slice(0, 300)}`);
      else ok("Schritt im oeffentlichen Player sichtbar");
      const imgs = await hub.locator("main img").count();
      if (imgs === 0) bug("aergerlich", "Kein Screenshot im oeffentlichen Player", "Die veroeffentlichte Anleitung zeigt kein Bild.");
    }
    await hub.close();
  } catch (e) {
    bug("blockierend", "Phase 1 abgebrochen", String(e && e.message ? e.message : e));
    await shot(page, "phase1-fehler");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(2)) {
    setPhase("2 — Bibliothek");
    try {
      // Datenbasis: Kategorien + mehrere Anleitungen
      const { data: cats } = await admin
        .from("categories")
        .insert([
          { account_id: state.accountId, name: "Belege", position: 0 },
          { account_id: state.accountId, name: "Lohn", position: 1 },
        ])
        .select("id, name");
      state.cats = cats;
      const catId = (n) => cats.find((x) => x.name === n).id;
      const { data: tRows } = await admin
        .from("tutorials")
        .insert([
          { account_id: state.accountId, title: "Rechnung stornieren", status: "draft", visibility: "public", category_id: catId("Belege") },
          { account_id: state.accountId, title: "Lohnzettel abrufen", status: "published", visibility: "public", slug: "lohnzettel-abrufen", category_id: catId("Lohn") },
          { account_id: state.accountId, title: "Urlaub eintragen", status: "draft", visibility: "public", category_id: null },
        ])
        .select("id, title");
      state.extraTutorials = tRows;
      for (const r of tRows) await admin.from("steps").insert([{ tutorial_id: r.id, position: 0, title: "Schritt 1" }]);

      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await page.getByText("Rechnung stornieren").first().waitFor({ timeout: 60_000 });
      await sleep(800);
      await shot(page, "10-bibliothek");

      const main = page.locator("main").last();
      const metaText = async () => (await main.locator("p,span").filter({ hasText: /^\d+ Anleitung/ }).first().innerText().catch(() => ""));
      info(`Zaehler oben: ${await metaText()}`);

      // Kategorie-Filter
      const aside = page.locator("aside").first();
      await aside.getByRole("button", { name: /^Belege/ }).click();
      await sleep(500);
      const afterCat = await main.innerText();
      if (afterCat.includes("Lohnzettel abrufen")) bug("aergerlich", "Kategorie-Filter filtert nicht", "Nach Klick auf „Belege“ ist „Lohnzettel abrufen“ (Kategorie Lohn) weiter sichtbar.");
      else ok("Kategorie-Filter funktioniert");
      await shot(page, "11-kategorie-filter");

      // Status-Filter
      await aside.getByRole("button", { name: /^Alle/ }).first().click();
      await sleep(300);
      await main.getByRole("button", { name: /Status:/ }).click();
      await page.getByRole("menuitem", { name: "Veröffentlicht" }).click();
      await sleep(500);
      const afterStatus = await main.innerText();
      if (afterStatus.includes("Rechnung stornieren")) bug("aergerlich", "Status-Filter „Veroeffentlicht“ zeigt Entwuerfe", "„Rechnung stornieren“ (Entwurf) bleibt sichtbar.");
      else ok("Status-Filter funktioniert");
      await main.getByRole("button", { name: /Status:/ }).click();
      await page.getByRole("menuitem", { name: "Alle" }).click();
      await sleep(300);

      // Karten/Liste + Merken ueber Reload
      await main.getByRole("button", { name: "Liste" }).click();
      await sleep(400);
      if (!(await page.getByTestId("library-list").count())) bug("aergerlich", "Listenansicht erscheint nicht", "Nach Klick auf „Liste“ ist keine Liste da.");
      else ok("Listenansicht");
      await shot(page, "12-liste");
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(1500);
      if (!(await page.getByTestId("library-list").count())) bug("kosmetisch", "Gewaehlte Ansicht wird beim Neuladen nicht gemerkt", "Nach F5 steht die Bibliothek wieder auf Karten.");
      else ok("Ansicht wird gemerkt (F5)");
      await page.locator("main").last().getByRole("button", { name: "Karten" }).click();
      await sleep(400);

      // Kategorie umbenennen
      const catRow = page.locator('[data-testid="category-row"]').filter({ hasText: "Belege" }).first();
      await catRow.hover();
      await catRow.getByTestId("category-menu").click();
      await page.getByTestId("category-rename").click();
      const rnInput = page.getByTestId("category-rename-input");
      await rnInput.waitFor({ timeout: 10_000 });
      await rnInput.fill("Belege & Nachweise");
      await page.getByTestId("category-rename-save").click();
      await sleep(1500);
      const { data: renamed } = await admin.from("categories").select("name").eq("id", catId("Belege")).single();
      if (renamed.name !== "Belege & Nachweise") bug("aergerlich", "Kategorie umbenennen speichert nicht", `In der DB steht weiter „${renamed.name}“.`);
      else ok("Kategorie umbenannt");

      // Anleitung umbenennen / duplizieren / loeschen ueber das Karten-Menue
      const card = page.locator("div.group").filter({ hasText: "Urlaub eintragen" }).first();
      await card.getByRole("button", { name: "Aktionen" }).click();
      await page.getByRole("menuitem", { name: "Umbenennen" }).click();
      const dlg = page.getByRole("dialog").filter({ hasText: "Anleitung umbenennen" });
      await dlg.waitFor({ timeout: 10_000 });
      await dlg.locator("input").fill("Urlaub eintragen (neu)");
      await dlg.getByRole("button", { name: "Speichern" }).click();
      await sleep(2000);
      const urlaubId = tRows.find((x) => x.title === "Urlaub eintragen").id;
      const { data: ren2 } = await admin.from("tutorials").select("title").eq("id", urlaubId).single();
      if (ren2.title !== "Urlaub eintragen (neu)") bug("aergerlich", "Anleitung umbenennen speichert nicht", `DB: „${ren2.title}“`);
      else ok("Anleitung umbenannt");
      const uiAfterRename = await page.locator("main").last().innerText();
      if (!uiAfterRename.includes("Urlaub eintragen (neu)")) bug("aergerlich", "Umbenannte Anleitung zeigt weiter den alten Titel", "Erst nach manuellem Neuladen erscheint der neue Name.");

      // Duplizieren
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Rechnung stornieren").first().waitFor({ timeout: 60_000 });
      await sleep(800);
      const card2 = page.locator("div.group").filter({ hasText: "Rechnung stornieren" }).first();
      await card2.getByRole("button", { name: "Aktionen" }).click();
      await page.getByRole("menuitem", { name: "Duplizieren" }).click();
      await sleep(2500);
      const { data: dups } = await admin.from("tutorials").select("id, title").eq("account_id", state.accountId);
      const dupHit = dups.filter((x) => /Rechnung stornieren/.test(x.title));
      info(`Nach Duplizieren: ${dupHit.map((x) => x.title).join(" | ")}`);
      if (dupHit.length < 2) bug("aergerlich", "Duplizieren legt keine Kopie an", "In der Datenbank gibt es weiterhin nur eine „Rechnung stornieren“.");
      else {
        ok("Anleitung dupliziert");
        const uiTxt = await page.locator("main").last().innerText();
        if (!/Kopie|\(2\)/i.test(uiTxt)) bug("aergerlich", "Duplikat erscheint erst nach Neuladen", "Nach „Duplizieren“ bleibt die Bibliothek unveraendert; erst F5 zeigt die Kopie.");
      }
      await shot(page, "13-dupliziert");

      // Mehrfachauswahl (Aufraeum-Modus)
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(1500);
      const cleanupBtn = page.locator("main").last().getByRole("button", { name: "Löschen" }).first();
      if (await cleanupBtn.count()) {
        await cleanupBtn.click();
        await sleep(400);
        const sel = page.locator('button[aria-label*="auswählen"]');
        const n = await sel.count();
        if (n === 0) bug("aergerlich", "Mehrfachauswahl bietet keine Auswahlflaechen", "Nach „Loeschen“ erscheinen keine Haken auf den Karten.");
        else {
          await sel.first().click();
          await sleep(300);
          const delBtn = page.getByRole("button", { name: /Ausgewählte löschen/ });
          const label = await delBtn.innerText();
          if (!/\(1\)/.test(label)) bug("aergerlich", "Zaehler der Mehrfachauswahl stimmt nicht", `Knopf zeigt „${label.replace(/\s+/g, " ")}“ nach genau einer Auswahl.`);
          else ok("Mehrfachauswahl zaehlt korrekt");
          await shot(page, "14-mehrfachauswahl");
          await page.getByRole("button", { name: "Aufräumen beenden" }).click();
        }
      } else bug("kosmetisch", "Kein Mehrfachauswahl-Einstieg gefunden", "In der Filterzeile fehlt der „Loeschen“-Knopf.");

      // Kategorie loeschen
      const catRow2 = page.locator('[data-testid="category-row"]').filter({ hasText: "Belege & Nachweise" }).first();
      if (await catRow2.count()) {
        await catRow2.hover();
        await catRow2.getByTestId("category-menu").click();
        await page.getByTestId("category-delete").click();
        const cdlg = page.getByTestId("confirm-dialog");
        await cdlg.waitFor({ timeout: 10_000 });
        info(`Loesch-Dialog: ${(await cdlg.innerText()).replace(/\s+/g, " ")}`);
        await cdlg.getByRole("button", { name: /löschen/i }).last().click();
        await sleep(2000);
        const { data: leftCats } = await admin.from("categories").select("id").eq("account_id", state.accountId);
        info(`Kategorien nach Loeschen: ${leftCats.length}`);
        ok("Kategorie geloescht");
      }
    } catch (e) {
      bug("aergerlich", "Phase 2 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase2-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(3)) {
    setPhase("3 — Editor");
    try {
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("editor-controls").waitFor({ timeout: 60_000 });
      await sleep(1200);

      // Schritt 2 ueber „+“ einfuegen
      const plus = page.getByRole("button", { name: "Schritt hier einfügen" });
      const plusCount = await plus.count();
      info(`Einfuegepunkte: ${plusCount}`);
      await plus.last().click();
      await page.locator("#step-title").waitFor({ timeout: 20_000 });
      await sleep(600);
      await page.locator("#step-title").fill("Beleg auswaehlen");
      await page.getByRole("button", { name: /^Speichern$/ }).first().click();
      await sleep(1500);
      let { data: steps } = await admin.from("steps").select("id, position, title").eq("tutorial_id", state.tutorialId).order("position");
      info(`Schritte: ${steps.map((s) => `${s.position}:${s.title}`).join(" | ")}`);
      if (steps.length !== 2) bug("aergerlich", "„+“ legt nicht genau einen Schritt an", `Nach einem Klick auf „+“ gibt es ${steps.length} Schritte.`);
      else ok("Zweiter Schritt angelegt");

      // Doppelklick auf „+“ (ungeduldiger Nutzer)
      await page.getByRole("button", { name: "Schritt hier einfügen" }).last().click({ clickCount: 2, delay: 60 });
      await sleep(4000);
      const { count: afterDouble } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", state.tutorialId);
      info(`Schritte nach Doppelklick auf „+“: ${afterDouble}`);
      if (afterDouble > 3) bug("aergerlich", "Doppelklick auf „+“ legt mehrere leere Schritte an", `Aus einem Doppelklick entstehen ${afterDouble - 2} neue Schritte statt einem.`);
      else ok("Doppelklick auf „+“ legt nur einen Schritt an");
      // aufraeumen: die frisch entstandenen leeren Schritte wieder entfernen
      const { data: allSteps } = await admin.from("steps").select("id, title").eq("tutorial_id", state.tutorialId);
      for (const s of allSteps.filter((s) => !s.title)) await admin.from("steps").delete().eq("id", s.id);
      await page.reload({ waitUntil: "domcontentloaded" });
      await sleep(3500);
      steps = (await admin.from("steps").select("id, position, title").eq("tutorial_id", state.tutorialId).order("position")).data;
      await page.getByText("Beleg auswaehlen").first().click({ timeout: 60_000 });
      await page.locator("#step-title").waitFor({ timeout: 30_000 });
      await sleep(1000);

      // Reihenfolge im Ablauf (Karten von oben nach unten) — die DB-Position sagt nichts,
      // die Reihenfolge entsteht aus der Verkettung.
      const flowOrder = async () => {
        const cards = page.locator("div.rounded-2xl").first().locator("button").filter({ has: page.locator("div.size-\\[38px\\]") });
        const texts = await cards.allInnerTexts();
        return texts.map((t) => t.replace(/\s+/g, " ").trim());
      };
      const before = await flowOrder();
      info(`Ablauf vorher: ${before.join(" > ")}`);

      // Verschieben
      const up = page.getByRole("button", { name: "Schritt nach oben" });
      if (await up.isEnabled()) {
        await up.click();
        await sleep(2500);
        const after = await flowOrder();
        info(`Ablauf nach „nach oben“: ${after.join(" > ")}`);
        if (!/Beleg auswaehlen/.test(after[0] || "")) bug("aergerlich", "Schritt verschieben wirkt nicht", `Reihenfolge im Ablauf nach „nach oben“: ${after.join(" > ")}`);
        else {
          ok("Schritt verschoben");
          // ueberlebt das Neuladen?
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(3000);
          const afterReload = await flowOrder();
          info(`Ablauf nach F5: ${afterReload.join(" > ")}`);
          if (!/Beleg auswaehlen/.test(afterReload[0] || "")) bug("blockierend", "Verschobene Reihenfolge geht beim Neuladen verloren", `Nach F5 steht wieder: ${afterReload.join(" > ")}`);
          else ok("Reihenfolge ueberlebt das Neuladen");
          // zurueckschieben
          await page.getByText("Beleg auswaehlen").first().click();
          await sleep(1500);
          const down = page.getByRole("button", { name: "Schritt nach unten" });
          if (await down.isEnabled()) {
            await down.click();
            await sleep(2500);
          }
        }
      } else bug("aergerlich", "„Schritt nach oben“ bleibt gesperrt", "Beim zweiten Schritt ist der Hoch-Knopf deaktiviert.");

      // Frage / Verzweigung — am zuletzt angelegten Schritt
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await sleep(3000);
      await page.getByText("Beleg auswaehlen").first().click();
      await page.locator("#step-title").waitFor({ timeout: 30_000 });
      await sleep(800);
      const decSwitch = page.getByRole("switch", { name: /Frage \/ Verzweigung/ }).first();
      if (await decSwitch.count()) {
        await decSwitch.click();
        await sleep(2000);
        const addAnswer = page.getByRole("button", { name: /Antwort-Option/ });
        if (!(await addAnswer.count())) bug("aergerlich", "Nach Einschalten der Frage fehlen die Antwort-Optionen", "Der Bereich „Antwort-Optionen“ erscheint nicht.");
        else {
          await addAnswer.click();
          await sleep(2000);
          const rows1 = await page.getByLabel("Antwort-Text").count();
          await addAnswer.click();
          await sleep(2500);
          const rows2 = await page.getByLabel("Antwort-Text").count();
          info(`Antwort-Zeilen im Editor: nach 1. Klick ${rows1}, nach 2. Klick ${rows2}`);
          const decStepId = steps.find((s) => s.title === "Beleg auswaehlen")?.id;
          const { data: br } = await admin.from("step_branches").select("id, label").eq("step_id", decStepId);
          info(`Antworten in der DB: ${(br || []).map((b) => b.label ?? "(ohne)").join(", ") || "-"}`);
          if (rows2 < 2) bug("aergerlich", "Zweite Antwort-Option erscheint nicht", `Nach zwei Klicks auf „Antwort-Option“ stehen ${rows2} Zeilen im Editor.`);
          else if (!br || br.length < 2) bug("blockierend", "Antwort-Optionen werden nicht gespeichert", `Im Editor stehen ${rows2} Antworten, in der Datenbank nur ${br ? br.length : 0}.`);
          else ok("Verzweigung mit zwei Antworten angelegt");
          // Neuladen: bleiben sie?
          await page.reload({ waitUntil: "domcontentloaded" });
          await sleep(3000);
          await page.getByText("Beleg auswaehlen").first().click();
          await sleep(2000);
          const rows3 = await page.getByLabel("Antwort-Text").count();
          if (rows3 < 2) bug("blockierend", "Antworten sind nach dem Neuladen weg", `Nach F5 stehen ${rows3} statt ${rows2} Antwort-Zeilen.`);
          else ok("Antworten ueberleben das Neuladen");
        }
        await shot(page, "20-verzweigung");
      } else bug("aergerlich", "Schalter „Frage / Verzweigung“ nicht gefunden", "Im Schritt-Editor fehlt der Verzweigungs-Schalter.");

      // Bild ersetzen + Verpixeln im ersten Schritt
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await sleep(3000);
      await page.getByText("Im Portal anmelden").first().click({ timeout: 60_000 });
      await page.getByTestId("highlight-canvas").waitFor({ timeout: 40_000 });
      // Verpixeln zeichnen
      await page.getByRole("button", { name: "Verpixeln" }).click();
      const canvas = page.getByTestId("highlight-canvas");
      const box = await canvas.boundingBox();
      await page.mouse.move(box.x + 60, box.y + 120);
      await page.mouse.down();
      await page.mouse.move(box.x + 260, box.y + 180, { steps: 8 });
      await page.mouse.up();
      await sleep(2000);
      const { data: st1 } = await admin.from("steps").select("highlights").eq("tutorial_id", state.tutorialId).eq("title", "Im Portal anmelden");
      const hl = (st1 && st1[0] && st1[0].highlights) || [];
      if (!hl.some((h) => h.type === "blur")) bug("aergerlich", "Verpixeln wird nicht gespeichert", `In der DB stehen: ${JSON.stringify(hl).slice(0, 200)}`);
      else ok("Verpixelung gespeichert");
      await shot(page, "21-verpixeln");

      // Bild ersetzen
      const img2 = await makeImage("Neuer-Screenshot");
      await page.locator('input[type="file"]').first().setInputFiles(img2);
      const crop2 = page.getByTestId("crop-dialog");
      await crop2.waitFor({ timeout: 20_000 });
      const use2 = crop2.getByRole("button", { name: "Übernehmen" }).first();
      if (await use2.count()) await use2.click();
      await sleep(4000);
      const keep = page.getByRole("dialog").filter({ hasText: "Markierungen behalten?" });
      if (await keep.count()) {
        ok("Nach Bild-Ersetzen wird nach den Markierungen gefragt");
        await keep.getByRole("button", { name: "Behalten" }).click();
      }
      await sleep(1500);

      // Vorschau
      const prevPage = await c.ctx.newPage();
      c.watch(prevPage);
      await prevPage.goto(`${BASE}/app/preview/${state.tutorialId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await prevPage.waitForLoadState("networkidle").catch(() => {});
      await shot(prevPage, "22-vorschau");
      const pTxt = (await prevPage.locator("body").innerText()).replace(/\s+/g, " ");
      if (pTxt.length < 40) bug("aergerlich", "Vorschau bleibt leer", `Sichtbarer Text: „${pTxt}“`);
      else ok("Vorschau zeigt Inhalt");
      await prevPage.close();

      // „Texte mit KI verbessern“
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await sleep(3000);
      const improve = page.getByTestId("improve-texts");
      if (!(await improve.count())) bug("aergerlich", "„Texte mit KI verbessern“ fehlt", "Der Einstieg ueber dem Ablauf ist nicht da.");
      else {
        await improve.click();
        const dlg = page.getByTestId("improve-texts-dialog");
        await dlg.waitFor({ timeout: 20_000 });
        let done = false;
        for (let i = 0; i < 40 && !done; i++) {
          await sleep(1500);
          done = (await dlg.getByTestId("improve-texts-list").count()) > 0
            || (await dlg.getByTestId("improve-texts-empty").count()) > 0
            || (await dlg.getByTestId("improve-texts-error").count()) > 0;
        }
        await shot(page, "23-ki-texte");
        if (!done) bug("aergerlich", "„Texte mit KI verbessern“ laedt ewig", "Nach 60 Sekunden zeigt der Dialog weder Vorschlaege noch eine Meldung.");
        else if (await dlg.getByTestId("improve-texts-error").count()) {
          bug("aergerlich", "„Texte mit KI verbessern“ meldet einen Fehler", (await dlg.getByTestId("improve-texts-error").innerText()).replace(/\s+/g, " "));
        } else ok("„Texte mit KI verbessern“ liefert ein Ergebnis");
        await page.keyboard.press("Escape");
        await sleep(800);
      }

      // Zurueck auf Entwurf + wieder veroeffentlichen
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("editor-more").waitFor({ timeout: 40_000 });
      await sleep(2500);
      const stillPublished = (await page.getByTestId("published-badge").count()) > 0;
      info(`Etikett „Veroeffentlicht“ sichtbar: ${stillPublished}`);
      if (!stillPublished) {
        const { data: sp } = await admin.from("tutorials").select("status").eq("id", state.tutorialId).single();
        bug("aergerlich", "Editor zeigt die Anleitung nicht mehr als veroeffentlicht", `In der Datenbank steht status=${sp.status}; im Kopf fehlt das Etikett „Veroeffentlicht“.`);
      }
      await page.getByTestId("editor-more").click();
      await sleep(1200);
      const menuTxt = await page.locator('[role="menu"]').first().innerText().catch(() => "(kein Menue)");
      info(`Menue: ${menuTxt.replace(/\s+/g, " ").slice(0, 300)}`);
      await shot(page, "24-menue");
      const unpub = page.getByTestId("unpublish");
      if (await unpub.count()) {
        await unpub.click();
        await sleep(3000);
        const { data: tt } = await admin.from("tutorials").select("status").eq("id", state.tutorialId).single();
        if (tt.status !== "draft") bug("aergerlich", "„Zurueck auf Entwurf“ wirkt nicht", `Status bleibt ${tt.status}.`);
        else ok("Zurueck auf Entwurf");
      } else bug("aergerlich", "„Zurueck auf Entwurf“ fehlt im Menue", "Im „…“-Menue einer veroeffentlichten Anleitung gibt es den Eintrag nicht.");
    } catch (e) {
      bug("aergerlich", "Phase 3 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase3-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(4)) {
    setPhase("4 — Schulungen");
    try {
      // Tarif hochsetzen (Team/Schulungen sind Pro/Business).
      await admin.from("accounts").update({ plan: "business" }).eq("id", state.accountId);
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("audience-chips").waitFor({ timeout: 40_000 });
      await sleep(1000);
      const teamChip = page.getByTestId("audience-chips").getByRole("button", { name: "Team" });
      await teamChip.click();
      await sleep(2500);
      const { data: tv } = await admin.from("tutorials").select("visibility, in_lernen, status").eq("id", state.tutorialId).single();
      info(`Nach „Team“: visibility=${tv.visibility} in_lernen=${tv.in_lernen} status=${tv.status}`);
      if (!tv.in_lernen && tv.visibility !== "internal") bug("aergerlich", "Chip „Team“ speichert nicht", "Die Anleitung landet nicht in den Schulungen.");
      else ok("Anleitung als Schulung markiert");
      // wieder veroeffentlichen
      const pb = page.getByTestId("publish-button");
      if (await pb.count()) {
        await pb.click();
        await sleep(4000);
      }

      // Zweiter Nutzer als Mitarbeiter — ueber den echten Einladungsweg.
      const memberEmail = `steply-kern-m-${stamp}@example.com`;
      await page.goto(`${BASE}/app/settings/team`, { waitUntil: "domcontentloaded" });
      await page.locator("#invite-email").waitFor({ timeout: 60_000 });
      await page.locator("#invite-email").fill(memberEmail);
      await page.locator("#invite-role").selectOption("member");
      await page.getByRole("button", { name: /Einladen/ }).click();
      await page.locator('[role="status"]').waitFor({ timeout: 30_000 });
      await sleep(1200);
      await shot(page, "29-einladung");
      const inviteBox = (await page.locator('[role="status"]').innerText()).replace(/\s+/g, " ");
      info(`Einladung: ${inviteBox.slice(0, 250)}`);
      const m = inviteBox.match(/https?:\/\/\S+\/invite\/\w+/);
      if (!m) throw new Error("Kein Einladungs-Link in der Antwort: " + inviteBox);
      const inviteLink = m[0].replace(/^https?:\/\/[^/]+/, BASE);

      const mctx = await c.browser.newContext({ viewport: { width: 1440, height: 950 }, locale: "de-DE" });
      const mp = await mctx.newPage();
      c.watch(mp);
      await mp.goto(inviteLink, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await mp.waitForLoadState("networkidle").catch(() => {});
      await sleep(1500);
      await shot(mp, "29b-einladung-annehmen");
      const pwField = mp.locator("#invite-password");
      await pwField.waitFor({ timeout: 30_000 });
      await pwField.fill(PW);
      await mp.getByRole("button", { name: /beitreten/i }).first().click();
      await mp.waitForURL(/\/app/, { timeout: 90_000 });
      await sleep(2500);
      const { data: memberRow } = await admin.from("account_members").select("user_id, role").eq("account_id", state.accountId).eq("role", "member").maybeSingle();
      if (memberRow) {
        state.memberId = memberRow.user_id;
        cleanup.users.push(memberRow.user_id);
        ok("Einladung angenommen, Mitarbeiter im Team");
      } else bug("blockierend", "Einladung annehmen legt kein Team-Mitglied an", "Nach dem Beitreten steht keine Zeile mit Rolle „Mitarbeiter“ in account_members.");
      await shot(mp, "30-mitarbeiter-start");
      info(`Mitarbeiter landet auf: ${mp.url()}`);

      await mp.goto(`${BASE}/app/lernen`, { waitUntil: "domcontentloaded" });
      await mp.waitForLoadState("networkidle").catch(() => {});
      await sleep(1500);
      await shot(mp, "31-lernen");
      const lTxt = (await mp.locator("body").innerText()).replace(/\s+/g, " ");
      if (!lTxt.includes("Beleg hochladen")) bug("blockierend", "Schulung erscheint nicht beim Mitarbeiter", `Auf /app/lernen sieht der Mitarbeiter: ${lTxt.slice(0, 400)}`);
      else {
        ok("Mitarbeiter sieht die Schulung");
        await mp.getByText("Beleg hochladen").first().click();
        await mp.waitForURL(/\/app\/lernen\//, { timeout: 40_000 }).catch(() => {});
        await sleep(2000);
        await shot(mp, "32-schulung");
        // Durchklicken bis zum Ende, dann „Als absolviert markieren“.
        for (let i = 0; i < 12; i++) {
          if (await mp.getByRole("button", { name: /Als absolviert markieren/i }).count()) break;
          const next = mp.getByRole("button", { name: /^(Fertig|Weiter)/ }).first();
          if (await next.count()) {
            await next.click();
          } else {
            // Verzweigung: erste Antwort waehlen
            const answer = mp.locator('button[data-tx="btn"]').first();
            if (!(await answer.count())) break;
            await answer.click();
          }
          await sleep(1500);
        }
        const doneBtn = mp.getByRole("button", { name: /Als absolviert markieren/i }).first();
        if (!(await doneBtn.count())) bug("aergerlich", "Kein Knopf zum Abschliessen der Schulung", "Nach dem letzten Schritt erscheint kein „Als absolviert markieren“.");
        else {
          await doneBtn.click();
          await sleep(1500);
          let comp = null;
          for (let i = 0; i < 12 && (!comp || comp.length === 0); i++) {
            await sleep(1000);
            const r = await admin.from("tutorial_completions").select("id").eq("tutorial_id", state.tutorialId).eq("user_id", state.memberId);
            comp = r.data;
          }
          if (!comp || comp.length === 0) bug("blockierend", "Schulungsnachweis wird nicht gespeichert", "Nach „Als absolviert markieren“ steht nichts in tutorial_completions.");
          else ok("Schulungsnachweis gespeichert");
          await shot(mp, "33-schulung-erledigt");
          // Zweiter Klick (Doppelklick-Falle)?
          const again = mp.getByRole("button", { name: /Als absolviert markieren/i }).first();
          if (await again.count()) {
            await again.click().catch(() => {});
            await sleep(2500);
            const { data: comp2 } = await admin.from("tutorial_completions").select("id").eq("tutorial_id", state.tutorialId).eq("user_id", state.memberId);
            if (comp2 && comp2.length > 1) bug("aergerlich", "Schulung laesst sich doppelt abschliessen", `Nach zwei Klicks stehen ${comp2.length} Nachweise in der Datenbank.`);
          }
          // Liste des Mitarbeiters: als absolviert markiert?
          await mp.goto(`${BASE}/app/lernen`, { waitUntil: "domcontentloaded" });
          await sleep(2500);
          const doneTxt = (await mp.locator("main").last().innerText()).replace(/\s+/g, " ");
          info(`Mitarbeiter-Schulungsliste: ${doneTxt.slice(0, 250)}`);
          if (!/Absolviert am/i.test(doneTxt)) bug("aergerlich", "Abgeschlossene Schulung steht beim Mitarbeiter weiter auf „Offen“", `Sichtbar: ${doneTxt.slice(0, 250)}`);
          else ok("Schulung beim Mitarbeiter als absolviert markiert");
        }
      }
      // Mitarbeiter darf nicht in die Bibliothek
      await mp.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await sleep(1500);
      info(`Mitarbeiter /app -> ${mp.url()}`);
      await mctx.close();

      // Inhaber sieht den Nachweis
      await page.goto(`${BASE}/app/lernen`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(1500);
      await shot(page, "34-nachweis");
      const oTxt = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
      info(`Inhaber-Schulungsseite: ${oTxt.slice(0, 400)}`);
      if (/0 von \d+ im Team/.test(oTxt)) bug("aergerlich", "Schulungsnachweis zaehlt den Abschluss nicht", `Obwohl der Mitarbeiter abgeschlossen hat, steht beim Inhaber weiter „${(oTxt.match(/\d+ von \d+ im Team/) || [])[0]}“.`);
      else ok("Schulungsnachweis beim Inhaber aktualisiert");
    } catch (e) {
      bug("aergerlich", "Phase 4 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase4-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(5)) {
    setPhase("5 — KI-Assistent + Wissensdatenbank");
    try {
      await page.goto(`${BASE}/app/assistent`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(1500);
      await shot(page, "40-assistent");
      info(`/app/assistent -> ${page.url()}`);

      await page.goto(`${BASE}/app/assistent/wissen`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(1500);
      await shot(page, "41-wissen");
      const wTxt = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
      info(`Wissen: ${wTxt.slice(0, 250)}`);
      const newArt = page.getByRole("button", { name: /Ersten Artikel anlegen|Neuer Artikel/ }).first();
      if (!(await newArt.count())) bug("aergerlich", "Kein Einstieg „Neuer Artikel“ in der Wissensdatenbank", `Sichtbar: ${wTxt.slice(0, 300)}`);
      else {
        await newArt.click();
        await page.waitForURL(/\/app\/assistent\/wissen\//, { timeout: 60_000 });
        await sleep(2500);
        info(`Nach „Neuer Artikel“: ${page.url()}`);
        const tIn = page.getByPlaceholder("Titel des Artikels");
        await tIn.waitFor({ timeout: 30_000 });
        await tIn.fill("Oeffnungszeiten der Kanzlei");
        const art = page.locator('[contenteditable="true"]').first();
        await art.click();
        await art.type("Wir haben montags bis donnerstags von 8 bis 17 Uhr und freitags von 8 bis 13 Uhr geoeffnet.");
        await sleep(600);
        await page.getByRole("button", { name: /^Speichern$/ }).click();
        await sleep(2500);
        // Veroeffentlichen (Schalter „Im KI-Assistenten aktiv“)
        const toggle = page.getByRole("switch").first();
        if (!(await toggle.count())) bug("aergerlich", "Kein Schalter zum Veroeffentlichen des Wissensartikels", "„Im KI-Assistenten aktiv“ ist nicht als Schalter erreichbar.");
        else {
          await toggle.click();
          await sleep(4000);
          const { data: arts } = await admin.from("kb_articles").select("id, title, status").eq("account_id", state.accountId);
          info(`Wissensartikel: ${(arts || []).map((a) => `${a.title}=${a.status}`).join(", ")}`);
          if (!arts || !arts.some((a) => a.status === "published")) bug("aergerlich", "Wissensartikel laesst sich nicht veroeffentlichen", "Nach dem Umlegen des Schalters steht der Artikel weiter auf Entwurf.");
          else ok("Wissensartikel veroeffentlicht");
        }
        await shot(page, "42-wissen-artikel");
        // Zurueck zur Liste: Status sichtbar?
        await page.goto(`${BASE}/app/assistent/wissen`, { waitUntil: "domcontentloaded" });
        await sleep(2500);
        const lTxt2 = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
        if (!/Im KI-Assistenten aktiv/.test(lTxt2)) bug("aergerlich", "Liste zeigt den Artikel nicht als aktiv", `Sichtbar: ${lTxt2.slice(0, 250)}`);
        else ok("Wissensliste zeigt den Status");
      }

      // Wissens-Import: Dialog „Von Ihrer Website" + „Aus Dokument" (kleine Testdatei)
      await page.goto(`${BASE}/app/assistent/wissen`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      const webBtn = page.getByRole("button", { name: "Von Ihrer Website" });
      if (!(await webBtn.count())) info("Kein Website-Import sichtbar (KI evtl. nicht konfiguriert)");
      else {
        await webBtn.click();
        const impDlg = page.getByRole("dialog").filter({ hasText: "Von Ihrer Website übernehmen" });
        await impDlg.waitFor({ timeout: 15_000 });
        await shot(page, "47-import-website");
        const pre = await impDlg.getByLabel("Website-Adresse").inputValue();
        if (pre !== "https://www.kern-test.example") bug("kosmetisch", "Website-Import ist nicht mit der Adresse aus dem Onboarding vorbelegt", `Im Feld steht „${pre}“.`);
        else ok("Website-Import mit der Onboarding-Adresse vorbelegt");
        // Absichtlich unerreichbare Adresse -> verstaendliche Fehlermeldung?
        await impDlg.getByLabel("Website-Adresse").fill("https://diese-domain-gibt-es-sicher-nicht-12345.example");
        await impDlg.getByRole("button", { name: /Entwürfe erstellen/ }).click();
        const errMsg = await toastText(page, 60_000);
        info(`Fehlermeldung Website-Import: ${errMsg}`);
        if (!errMsg) bug("aergerlich", "Website-Import meldet bei einer toten Adresse gar nichts", "Nach dem Klick auf „Entwuerfe erstellen“ kommt keine Rueckmeldung.");
        else if (/^(Fehler|Import fehlgeschlagen\.?)$/i.test(errMsg.trim())) bug("kosmetisch", "Fehlermeldung des Website-Imports erklaert nichts", `Gemeldet wird nur „${errMsg}“.`);
        else ok("Website-Import meldet einen verstaendlichen Fehler");
        await page.keyboard.press("Escape");
        await sleep(1000);
      }
      const docBtn = page.getByRole("button", { name: /Aus Dokument/ });
      if (await docBtn.count()) {
        const txt = path.join(os.tmpdir(), `steply-wissen-${stamp}.txt`);
        writeFileSync(txt, "Urlaubsantrag: Bitte reichen Sie Urlaubsanträge spätestens zwei Wochen vorher im Portal ein. Die Freigabe erfolgt durch die Teamleitung.\n", "utf8");
        await page.locator('input[type="file"]').first().setInputFiles(txt);
        let drafts = null;
        for (let i = 0; i < 60; i++) {
          await sleep(2000);
          drafts = (await admin.from("kb_articles").select("title, status").eq("account_id", state.accountId)).data;
          if (drafts && drafts.length > 1) break;
        }
        const impToast = await toastText(page, 5000);
        info(`Dokument-Import, letzte Meldung: ${impToast}`);
        await shot(page, "48-import-dokument");
        info(`Artikel nach Import: ${(drafts || []).map((d) => `${d.title}=${d.status}`).join(" | ")}`);
        if (!drafts || drafts.length < 2) bug("aergerlich", "Import aus einem Dokument legt keinen Entwurf an", `In der Wissensdatenbank stehen weiterhin ${drafts ? drafts.length : 0} Artikel.`);
        else if (drafts.filter((d) => d.status === "published").length > 1) bug("blockierend", "Importierte Artikel gehen sofort live", "Der Import soll nur Entwuerfe erzeugen.");
        else ok("Dokument-Import erzeugt einen Entwurf");
      }

      // Frage im oeffentlichen KI-Assistenten stellen
      const cp = await c.ctx.newPage();
      c.watch(cp);
      await cp.goto(`${BASE}/h/${state.slug}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      await cp.waitForLoadState("networkidle").catch(() => {});
      await sleep(2000);
      const launcher = cp.getByRole("button", { name: "Hilfe-Assistent" }).first();
      if (!(await launcher.count())) bug("aergerlich", "Kein KI-Assistent auf der Hilfe-Seite", "Die Chat-Blase fehlt.");
      else {
        bug("kosmetisch", "Der KI-Assistent heisst auf der Hilfe-Seite „Hilfe-Assistent“", "In der App heisst dieselbe Funktion „KI-Assistent“ (Begriffsliste). Die oeffentlichen Texte kommen aus src/lib/i18n-hub.ts und sind vom Begriffs-Waechter ausgenommen.");
        await launcher.click();
        await sleep(1200);
        const input = cp.getByPlaceholder("Frage stellen …");
        await input.waitFor({ timeout: 20_000 });
        await input.fill("Wann haben Sie freitags geoeffnet?");
        await cp.getByRole("button", { name: "Senden" }).click();
        let answer = "";
        for (let i = 0; i < 40; i++) {
          await sleep(1500);
          const t = (await cp.locator("body").innerText()).replace(/\s+/g, " ");
          if (/13 Uhr|Uhr|leider|weiß|keine/i.test(t.split("Wann haben Sie freitags")[1] || "")) { answer = t; break; }
        }
        await shot(cp, "45-chat");
        if (!answer) bug("aergerlich", "KI-Assistent antwortet nicht", "Nach 60 Sekunden steht keine Antwort im Chat.");
        else {
          const tail = (answer.split("Wann haben Sie freitags")[1] || "").slice(0, 300);
          info(`Antwort: ${tail}`);
          if (!/13/.test(tail)) bug("aergerlich", "KI-Assistent nutzt den veroeffentlichten Wissensartikel nicht", `Antwort auf die Oeffnungszeiten-Frage: ${tail}`);
          else ok("KI-Assistent antwortet aus der Wissensdatenbank");
        }
        // Nicht beantwortbare Frage -> „Offene Fragen“
        await input.fill("Wie hoch ist der Grundfreibetrag fuer Zebras im Jahr 2031?");
        await cp.getByRole("button", { name: "Senden" }).click();
        await sleep(20_000);
        await shot(cp, "46-chat-luecke");
      }
      await cp.close();

      // Offene Fragen / Eskalation
      for (const [p, name] of [["/app/assistent/fragen", "43-fragen"], ["/app/assistent/eskalation", "44-eskalation"]]) {
        await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => {});
        await sleep(2000);
        await shot(page, name);
        const txt = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
        info(`${p}: ${txt.slice(0, 300)}`);
      }
    } catch (e) {
      bug("aergerlich", "Phase 5 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase5-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(6)) {
    setPhase("6 — Glocke, Strg+K, Konto-Wechsel");
    try {
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await sleep(2000);
      // Glocke
      const bell = page.getByRole("button", { name: /Hinweise/ }).first();
      await bell.click();
      await sleep(800);
      await shot(page, "50-glocke");
      const pop = page.locator('[role="dialog"], [data-popup]').filter({ hasText: /Aktualität prüfen|Offene Fragen/ }).first();
      if (!(await pop.count())) bug("aergerlich", "Glocke oeffnet keine Uebersicht", "Nach Klick auf die Glocke erscheint kein Hinweis-Fenster.");
      else ok("Glocke oeffnet die Uebersicht");
      await page.keyboard.press("Escape");
      await sleep(500);

      // Strg+K
      await page.locator("body").click({ position: { x: 5, y: 300 } }).catch(() => {});
      await page.keyboard.press("Control+k");
      await sleep(1200);
      const cmdInput = page.getByPlaceholder("Suchen oder Befehl eingeben …");
      if (!(await cmdInput.count())) bug("blockierend", "Strg+K oeffnet die Suche nicht", "Die Befehlspalette erscheint nicht.");
      else {
        ok("Strg+K oeffnet die Suche");
        await page.keyboard.type("Lohn");
        await sleep(3000);
        await shot(page, "51-suche");
        const cmd = page.getByRole("dialog").last();
        const cTxt = (await cmd.innerText()).replace(/\s+/g, " ");
        info(`Suchergebnis: ${cTxt.slice(0, 250)}`);
        if (!/Lohnzettel abrufen/.test(cTxt)) bug("aergerlich", "Suche findet eigene Anleitungen nicht", `Ergebnis fuer „Lohn“: ${cTxt.slice(0, 300)}`);
        else ok("Suche findet Anleitungen");
        // Tastatur: Pfeiltaste + Enter oeffnet den Treffer
        await page.keyboard.press("Escape");
        await sleep(800);
        if (await cmdInput.isVisible().catch(() => false)) bug("aergerlich", "Escape schliesst die Suche nicht", "Die Befehlspalette bleibt offen.");
        else ok("Escape schliesst die Suche");
        // Zweites Strg+K (Umschalten) darf nicht zwei Fenster oeffnen
        await page.keyboard.press("Control+k");
        await sleep(800);
        await page.keyboard.press("Control+k");
        await sleep(800);
        const openCount = await page.getByPlaceholder("Suchen oder Befehl eingeben …").count();
        if (openCount > 0) bug("kosmetisch", "Strg+K schliesst die Suche nicht wieder", `Nach zweimal Strg+K sind noch ${openCount} Suchfelder offen.`);
        await page.keyboard.press("Escape");
        await sleep(500);
      }

      // Zweite Organisation (wie im echten Leben: eigener Inhaber, der uns dazunimmt)
      const otherEmail = `steply-kern-o-${stamp}@example.com`;
      const other = await admin.auth.admin.createUser({ email: otherEmail, password: PW, email_confirm: true });
      if (other.error) throw other.error;
      cleanup.users.push(other.data.user.id);
      const { data: oMem } = await admin.from("account_members").select("account_id").eq("user_id", other.data.user.id);
      const acc2Id = oMem[0].account_id;
      cleanup.accounts.push(acc2Id);
      await admin.from("accounts").update({ name: "Zweite Kanzlei GmbH", onboarded: true, plan: "business" }).eq("id", acc2Id);
      await admin.from("account_members").insert({ account_id: acc2Id, user_id: state.userId, role: "editor" });
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await page.getByRole("button", { name: "Konto-Menü" }).click();
      await sleep(800);
      await shot(page, "52-kontomenue");
      const sw = page.getByRole("menuitem", { name: /Organisation wechseln/ });
      if (!(await sw.count())) bug("aergerlich", "Kein Eintrag „Organisation wechseln“", "Obwohl der Nutzer in zwei Organisationen ist, fehlt der Wechsel im Konto-Menue.");
      else {
        await sw.click();
        await sleep(800);
        const target = page.getByRole("menuitem", { name: /Zweite Kanzlei GmbH/ });
        await target.click();
        await sleep(5000);
        await shot(page, "53-nach-wechsel");
        const hTxt = (await page.locator("header").first().innerText()).replace(/\s+/g, " ");
        const bodyTxt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        if (bodyTxt.includes("Lohnzettel abrufen")) bug("blockierend", "Konto-Wechsel zeigt weiter die Daten der alten Organisation", "Nach dem Wechsel stehen noch die Anleitungen der ersten Organisation in der Bibliothek.");
        else ok("Konto-Wechsel zeigt die neue Organisation");
        info(`Kopfzeile nach Wechsel: ${hTxt.slice(0, 200)}`);
        // zurueckwechseln
        await page.getByRole("button", { name: "Konto-Menü" }).click();
        await sleep(600);
        await page.getByRole("menuitem", { name: /Organisation wechseln/ }).click();
        await sleep(600);
        await page.getByRole("menuitem", { name: /Kern Test GmbH/ }).click();
        await sleep(4000);
      }
    } catch (e) {
      bug("aergerlich", "Phase 6 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase6-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(7)) {
    setPhase("7 — Mobil 390 px");
    try {
      const mctx = await c.browser.newContext({
        viewport: { width: 390, height: 844 },
        locale: "de-DE",
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      const mp = await mctx.newPage();
      c.watch(mp);
      await mp.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
      await mp.locator("#email").fill(email);
      await mp.locator("#password").fill(PW);
      await mp.getByRole("button", { name: /Anmelden/i }).first().click();
      await mp.waitForURL(/\/app/, { timeout: 60_000 });
      await sleep(2500);

      const pages = [
        ["/app", "60-mobil-bibliothek"],
        [`/app/tutorials/${state.tutorialId}`, "61-mobil-editor"],
        ["/app/lernen", "62-mobil-lernen"],
        ["/app/assistent/wissen", "63-mobil-wissen"],
        ["/app/settings/profil", "64-mobil-profil"],
        ["/app/settings/team", "64b-mobil-team"],
        ["/app/settings/aussehen", "64c-mobil-aussehen"],
        ["/app/settings/tarif", "64d-mobil-tarif"],
        [`/h/${state.slug}`, "64e-mobil-hilfeseite"],
      ];
      for (const [p, name] of pages) {
        await mp.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
        await mp.waitForLoadState("networkidle").catch(() => {});
        await sleep(1800);
        const ov = await overflowPx(mp);
        await shot(mp, name);
        if (ov > 1) bug("aergerlich", `Mobil (390 px): waagerechtes Scrollen auf ${p}`, `Die Seite ist ${ov} px breiter als der Bildschirm.`);
        else ok(`Mobil ${p}: keine waagerechte Scrollleiste`);
      }

      // Mobil: einen Schritt oeffnen (Schublade) und bearbeiten
      await mp.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await sleep(3500);
      const mCard = mp.locator("div.rounded-2xl").first().locator("button").filter({ has: mp.locator("div.size-\\[38px\\]") }).first();
      if (await mCard.count()) {
        await mCard.click();
        const mTitle = mp.locator("#step-title");
        await mTitle.waitFor({ timeout: 30_000 }).catch(() => {});
        await sleep(1500);
        await shot(mp, "67-mobil-schritt");
        if (!(await mTitle.count())) bug("aergerlich", "Mobil: Schritt laesst sich nicht oeffnen", "Ein Tipp auf die Schritt-Karte oeffnet keinen Editor.");
        else {
          const ovS = await overflowPx(mp);
          if (ovS > 1) bug("aergerlich", "Mobil: Schritt-Editor erzeugt waagerechtes Scrollen", `${ovS} px Ueberbreite.`);
          // Speichern-Knopf erreichbar?
          await mTitle.fill("Mobil geaendert");
          await sleep(600);
          const sBtn = mp.getByRole("button", { name: /^Speichern$/ }).first();
          if (!(await sBtn.count())) bug("aergerlich", "Mobil: „Speichern“ im Schritt-Editor nicht erreichbar", "Nach einer Aenderung erscheint kein Speichern-Knopf im Sichtbereich.");
          else {
            const bb = await sBtn.boundingBox();
            const vh = 844;
            if (!bb || bb.y < 0 || bb.y > vh) bug("aergerlich", "Mobil: „Speichern“ liegt ausserhalb des Bildschirms", `Knopf bei y=${bb ? Math.round(bb.y) : "?"} (Bildschirm 0–${vh}).`);
            else {
              await sBtn.click();
              await sleep(2500);
              ok("Mobil: Schritt bearbeiten und speichern moeglich");
            }
          }
        }
      }

      // Untere Leiste + „Neu“
      await mp.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await sleep(2000);
      const tabbar = mp.locator("[data-mobile-tabbar]");
      if (!(await tabbar.count())) bug("aergerlich", "Mobile Navigationsleiste fehlt", "Unten erscheint keine Leiste mit Anleitungen/Schulungen/Neu.");
      else {
        const neu = mp.getByRole("button", { name: "Neue Anleitung" }).first();
        await neu.click();
        await sleep(1200);
        const d = mp.getByRole("dialog").first();
        if (!(await d.count())) bug("aergerlich", "Mobiler „Neu“-Knopf oeffnet nichts", "Der runde „+“-Knopf unten reagiert nicht.");
        else {
          const bb = await d.boundingBox();
          if (bb && (bb.x < 0 || bb.x + bb.width > 391)) bug("aergerlich", "Dialog „Neue Anleitung“ passt mobil nicht auf den Bildschirm", `Dialog von ${Math.round(bb.x)} bis ${Math.round(bb.x + bb.width)} px.`);
          else ok("Mobiler Erstell-Dialog passt");
          await shot(mp, "65-mobil-neu");
          await mp.keyboard.press("Escape");
        }
        // „Mehr“
        await sleep(600);
        const more = mp.getByRole("button", { name: "Mehr" }).first();
        if (await more.count()) {
          await more.click();
          await sleep(900);
          await shot(mp, "66-mobil-mehr");
          const ov2 = await overflowPx(mp);
          if (ov2 > 1) bug("kosmetisch", "Mobil: „Mehr“-Blatt erzeugt waagerechtes Scrollen", `${ov2} px Ueberbreite.`);
        }
      }
      await mctx.close();
    } catch (e) {
      bug("aergerlich", "Phase 7 abgebrochen", String(e && e.message ? e.message : e));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(8)) {
    setPhase("8 — Sonderfaelle: Kategorie anlegen, Schritt loeschen, Doppelklick, Zurueck-Knopf");
    try {
      // Kategorie im Editor anlegen
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("editor-controls").waitFor({ timeout: 60_000 });
      await sleep(1500);
      await page.getByRole("button", { name: "Kategorie wählen" }).click();
      await sleep(800);
      const catInput = page.getByPlaceholder("Suchen oder neu anlegen …");
      await catInput.waitFor({ timeout: 15_000 });
      await catInput.fill("Steuern & Belege");
      await sleep(500);
      await page.getByRole("button", { name: /Anlegen:/ }).click();
      await sleep(3000);
      const { data: newCats } = await admin.from("categories").select("name").eq("account_id", state.accountId);
      info(`Kategorien: ${(newCats || []).map((x) => x.name).join(", ")}`);
      if (!newCats || !newCats.some((x) => x.name === "Steuern & Belege")) bug("aergerlich", "Kategorie anlegen im Editor speichert nicht", "Die neue Kategorie taucht nicht in der Datenbank auf.");
      else ok("Kategorie im Editor angelegt und zugeordnet");
      await shot(page, "70-kategorie-anlegen");

      // Doppelklick auf „Zurueck auf Entwurf“ / „Veroeffentlichen“
      await page.getByTestId("editor-more").click();
      await sleep(1000);
      const unp = page.getByTestId("unpublish");
      if (await unp.count()) {
        await unp.click();
        await sleep(3500);
      }
      const pubB = page.getByTestId("publish-button");
      await pubB.waitFor({ timeout: 30_000 });
      await pubB.click({ clickCount: 2, delay: 40 });
      await sleep(6000);
      const { data: tutAfter } = await admin.from("tutorials").select("status, slug").eq("id", state.tutorialId).single();
      const { data: allTuts } = await admin.from("tutorials").select("id").eq("account_id", state.accountId);
      info(`Nach Doppelklick: status=${tutAfter.status}, Anleitungen im Konto=${allTuts.length}`);
      if (tutAfter.status !== "published") bug("aergerlich", "Doppelklick auf „Veroeffentlichen“ laesst die Anleitung im Entwurf", `status=${tutAfter.status}`);
      else ok("Doppelklick auf „Veroeffentlichen“ ist unschaedlich");

      // Schritt loeschen (mit Bestaetigung)
      await page.goto(`${BASE}/app/tutorials/${state.tutorialId}`, { waitUntil: "domcontentloaded" });
      await sleep(3000);
      const firstCard = page.locator("div.rounded-2xl").first().locator("button").filter({ has: page.locator("div.size-\\[38px\\]") }).first();
      await firstCard.click();
      await page.locator("#step-title").waitFor({ timeout: 30_000 });
      await sleep(800);
      const { count: before } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", state.tutorialId);
      await page.getByRole("button", { name: /Schritt löschen/ }).click();
      const conf = page.getByTestId("confirm-dialog");
      await conf.waitFor({ timeout: 15_000 });
      info(`Loesch-Abfrage: ${(await conf.innerText()).replace(/\s+/g, " ").slice(0, 200)}`);
      await conf.getByRole("button", { name: /löschen/i }).last().click();
      await sleep(4000);
      const { count: after } = await admin.from("steps").select("id", { count: "exact", head: true }).eq("tutorial_id", state.tutorialId);
      info(`Schritte vorher ${before}, nachher ${after}`);
      if (after !== before - 1) bug("aergerlich", "Schritt loeschen wirkt nicht wie erwartet", `Vorher ${before} Schritte, nachher ${after}.`);
      else ok("Schritt geloescht");
      await shot(page, "71-schritt-geloescht");

      // Letzter Schritt weg -> was passiert mit der VEROEFFENTLICHTEN Anleitung?
      if (after === 0) {
        const { data: emptyTut } = await admin.from("tutorials").select("status, slug").eq("id", state.tutorialId).single();
        info(`Anleitung ohne Schritte: status=${emptyTut.status} slug=${emptyTut.slug}`);
        if (emptyTut.status === "published") {
          const hp = await c.ctx.newPage();
          c.watch(hp);
          await hp.goto(`${BASE}/h/${state.slug}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
          await hp.waitForLoadState("networkidle").catch(() => {});
          await sleep(1500);
          const hubTxt = (await hp.locator("body").innerText()).replace(/\s+/g, " ");
          await shot(hp, "71b-hilfeseite-leer");
          if (emptyTut.slug) {
            await hp.goto(`${BASE}/h/${state.slug}/${emptyTut.slug}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
            await hp.waitForLoadState("networkidle").catch(() => {});
            await sleep(1500);
            await shot(hp, "71c-leere-anleitung-oeffentlich");
            const oTxt = (await hp.locator("body").innerText()).replace(/\s+/g, " ");
            bug(
              "aergerlich",
              "Geleerte Anleitung bleibt auf der Hilfe-Seite veroeffentlicht",
              `Nach dem Loeschen des letzten Schritts steht die Anleitung weiter auf „veroeffentlicht“ (Karte: „0 Schritte · Veroeffentlicht“) und ist oeffentlich abrufbar. Veroeffentlichen einer leeren Anleitung ist im Editor gesperrt — das Leeren einer veroeffentlichten aber nicht. Oeffentlich sichtbar: ${oTxt.slice(0, 220)}`,
            );
          }
          await hp.close();
        }
      }

      // Browser-Zurueck
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await page.goto(`${BASE}/app/lernen`, { waitUntil: "domcontentloaded" });
      await sleep(2000);
      await page.goBack({ waitUntil: "domcontentloaded" });
      await sleep(3000);
      const backUrl = page.url();
      const backTxt = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
      info(`Nach Zurueck: ${backUrl} — ${backTxt.slice(0, 160)}`);
      if (!/\/app$/.test(backUrl.replace(/[?#].*$/, ""))) bug("aergerlich", "Zurueck-Knopf landet auf der falschen Seite", `Erwartet /app, tatsaechlich ${backUrl}`);
      else if (backTxt.length < 30) bug("aergerlich", "Zurueck-Knopf zeigt eine leere Seite", `Sichtbarer Text: „${backTxt}“`);
      else ok("Zurueck-Knopf funktioniert");

      // Leere Zustaende
      for (const [p, name] of [["/app/automationen", "72-automationen"], ["/app/alerts", "73-hinweise"]]) {
        await page.goto(`${BASE}${p}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle").catch(() => {});
        await sleep(2000);
        await shot(page, name);
        const txt = (await page.locator("main").last().innerText()).replace(/\s+/g, " ");
        info(`${p}: ${txt.slice(0, 220)}`);
        if (txt.trim().length < 20) bug("aergerlich", `Leerer Zustand auf ${p} erklaert nichts`, "Die Seite ist praktisch leer.");
      }

      // Tastatur: Dialog per Tab erreichbar, Escape schliesst
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await sleep(2500);
      await page.getByRole("button", { name: /Neue Anleitung/i }).first().click();
      await page.getByRole("dialog").waitFor({ timeout: 15_000 });
      await page.keyboard.press("Tab");
      const focus1 = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}:${(el.textContent || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 60)}` : "(keins)";
      });
      info(`Fokus im Dialog nach Tab: ${focus1}`);
      await page.keyboard.press("Escape");
      await sleep(800);
      if (await page.getByRole("dialog").count()) bug("aergerlich", "Escape schliesst den Erstell-Dialog nicht", "Der Dialog „Neue Anleitung“ bleibt offen.");
      else ok("Erstell-Dialog per Escape schliessbar");
    } catch (e) {
      bug("aergerlich", "Phase 8 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase8-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  if (c.on(9)) {
    setPhase("9 — Schalter in der Bibliothek, Doppelklick auf den Schalter");
    try {
      // Anleitung MIT einem Schritt — eine leere ist seit Welle 54 absichtlich gesperrt
      // (das prueft Phase 10), hier geht es um den Schalter selbst.
      const { data: swRow } = await admin
        .from("tutorials")
        .insert([{ account_id: state.accountId, title: "Schalter-Probe", status: "draft", visibility: "public" }])
        .select("id")
        .single();
      const swId = swRow.id;
      await admin.from("steps").insert([{ tutorial_id: swId, position: 0, title: "Schritt 1" }]);

      // In der Bibliothek den Schalter einmal umlegen: wird die Anleitung wirklich veroeffentlicht?
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await page.getByText("Schalter-Probe").first().waitFor({ timeout: 60_000 });
      await sleep(1500);
      const swCard = page.locator("div.group").filter({ hasText: "Schalter-Probe" }).first();
      await swCard.getByRole("switch").first().click();
      await sleep(5000);
      const { data: et } = await admin.from("tutorials").select("status, slug").eq("id", swId).single();
      info(`Nach einem Klick auf den Schalter: status=${et.status} slug=${et.slug}`);
      await shot(page, "80-schalter");
      if (et.status !== "published") {
        bug("aergerlich", "Schalter in der Bibliothek veroeffentlicht nicht", `Nach einem Klick steht die Anleitung (mit Schritt) weiter auf „${et.status}“.`);
      } else ok("Schalter in der Bibliothek veroeffentlicht eine Anleitung mit Schritten");

      // Schalter zweimal schnell (Doppelklick): bleibt der Zustand konsistent?
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByText("Schalter-Probe").first().waitFor({ timeout: 60_000 });
      await sleep(1500);
      const card2 = page.locator("div.group").filter({ hasText: "Schalter-Probe" }).first();
      const sw2 = card2.getByRole("switch").first();
      await sw2.click();
      await sleep(150);
      await sw2.click();
      await sleep(8000);
      const { data: et2 } = await admin.from("tutorials").select("status").eq("id", swId).single();
      const uiOn = (await sw2.getAttribute("aria-checked")) === "true";
      info(`Nach schnellem Doppel-Umlegen: DB=${et2.status}, Karte zeigt „Veröffentlicht"=${uiOn}`);
      if ((et2.status === "published") !== uiOn) {
        bug("aergerlich", "Schalter und tatsaechlicher Zustand laufen auseinander", `Nach zwei schnellen Klicks auf den Veroeffentlichen-Schalter zeigt die Karte „${uiOn ? "Veröffentlicht" : "Entwurf"}“, in der Datenbank steht aber „${et2.status}“. Erst nach dem Neuladen sieht man den echten Zustand.`);
      } else ok("Schalter bleibt auch bei schnellem Doppelklick konsistent");
      await shot(page, "82-schalter-doppelklick");

      // aufraeumen
      await admin.from("tutorials").delete().eq("id", swId);
    } catch (e) {
      bug("aergerlich", "Phase 9 abgebrochen", String(e && e.message ? e.message : e));
      await shot(page, "phase9-fehler");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Nachweis-Phase zu den behobenen Kern-Befunden (Welle 54):
  //   1 leere Anleitung laesst sich weder ueber den Schalter NOCH serverseitig veroeffentlichen
  //   2 Loeschen des letzten Schritts setzt eine veroeffentlichte Anleitung auf Entwurf
  //   3 Doppelklick auf „+" legt genau EINEN Schritt an
  //   4 keine Hydration-Fehler mehr in der Bibliothek (Zeitangaben kommen fertig vom Server)
  //   5 Loesch-Abfrage beim einzigen Schritt nennt die richtige Folge
  //   8 keine grauen Browser-Abfragen mehr (Steply-Dialog)
  if (c.on(10)) {
    setPhase("10 — Nachweise: leere Anleitung, letzter Schritt, Doppelklick, Abfragen");
    const hydration = [];
    const onConsole = (m) => {
      if (m.type() === "error" && /hydrat/i.test(m.text())) hydration.push(m.text());
    };
    const onPageError = (e) => {
      if (/hydrat/i.test(e.message)) hydration.push(e.message);
    };
    page.on("console", onConsole);
    page.on("pageerror", onPageError);
    const angelegt = [];
    // Karten im Ablauf (erste Box des Builders), nicht die Vorschau im Schritt-Panel.
    const flowKarten = () =>
      page.locator("div.rounded-2xl").first().locator("button").filter({ has: page.locator("div.size-\\[38px\\]") });

    async function neueAnleitung(titel) {
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /Neue Anleitung/i }).first().waitFor({ timeout: 90_000 });
      await sleep(1200);
      await page.getByRole("button", { name: /Neue Anleitung/i }).first().click();
      await page.getByRole("dialog").waitFor({ timeout: 15_000 });
      await page.getByRole("button", { name: "Selbst bauen" }).click();
      await page.locator("#title").fill(titel);
      await page.getByRole("button", { name: /Erstellen & bearbeiten/i }).click();
      await page.waitForURL(/\/app\/tutorials\//, { timeout: 60_000 });
      const id = page.url().split("/app/tutorials/")[1].split(/[?#]/)[0];
      angelegt.push(id);
      return id;
    }

    try {
      // ── Befund 1a: Schalter auf der Karte ist bei 0 Schritten gesperrt ───────
      const leerId = await neueAnleitung("Nachweis leer");
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await page.getByText("Nachweis leer", { exact: true }).first().waitFor({ timeout: 60_000 });
      await sleep(1500);
      const leerCard = page.locator("div.group").filter({ hasText: "Nachweis leer" }).first();
      const leerSw = leerCard.getByRole("switch").first();
      const gesperrt = await leerSw.isDisabled();
      const hinweis = await leerSw.getAttribute("title");
      info(`Schalter der leeren Anleitung: gesperrt=${gesperrt}, Hinweis=„${hinweis}“`);
      if (!gesperrt) {
        bug("aergerlich", "Leere Anleitung: Schalter in der Bibliothek ist NICHT gesperrt", "Der Veroeffentlichen-Schalter der leeren Karte laesst sich weiterhin umlegen.");
      } else {
        ok("Leere Anleitung: Schalter in der Bibliothek ist gesperrt");
      }
      const tipAnker = leerCard.getByTestId("publish-blocked").first();
      if (await tipAnker.count()) {
        await tipAnker.hover().catch(() => {});
        await sleep(900);
        const sichtbar = (await page.locator("body").innerText()).includes("Erst Schritte anlegen");
        info(`Tooltip „Erst Schritte anlegen“ sichtbar: ${sichtbar}`);
        if (!sichtbar && hinweis !== "Erst Schritte anlegen") {
          bug("kosmetisch", "Gesperrter Schalter nennt den Grund nicht", "Weder Tooltip noch Titel erklaeren, warum nicht veroeffentlicht werden kann.");
        } else ok("Gesperrter Schalter erklaert den Grund");
      }
      await shot(page, "90-leere-anleitung-schalter-gesperrt");
      const { data: leerNach } = await admin.from("tutorials").select("status").eq("id", leerId).single();
      if (leerNach.status !== "draft") bug("blockierend", "Leere Anleitung steht trotz Sperre auf veroeffentlicht", `status=${leerNach.status}`);

      // ── Befund 3: Doppelklick auf „+" legt genau EINEN Schritt an ────────────
      await page.goto(`${BASE}/app/tutorials/${leerId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("empty-builder").waitFor({ timeout: 60_000 });
      await page.getByRole("button", { name: /Schritt von Hand anlegen/i }).click();
      await page.locator("#step-title").waitFor({ timeout: 30_000 });
      await sleep(3000);
      const plus = page.getByRole("button", { name: "Schritt hier einfügen" }).first();
      await plus.waitFor({ timeout: 30_000 });
      await plus.click({ clickCount: 2, delay: 40 });
      await sleep(6000);
      const { count: nachDoppel } = await admin
        .from("steps")
        .select("id", { count: "exact", head: true })
        .eq("tutorial_id", leerId);
      info(`Schritte nach Doppelklick auf „+“: ${nachDoppel} (erwartet 2)`);
      await shot(page, "91-plus-doppelklick");
      if (nachDoppel !== 2) {
        bug("aergerlich", "Doppelklick auf „+“ legt nicht genau einen Schritt an", `Nach einem Schritt von Hand und EINEM Doppelklick stehen ${nachDoppel} Schritte in der Datenbank (erwartet 2).`);
      } else ok("Doppelklick auf „+“ legt genau einen Schritt an");

      // ── Befund 1b: Serverseitige Sperre (Oberflaeche umgangen) ──────────────
      // Die echte Veroeffentlichen-Action mitschneiden und mit der ID einer LEEREN
      // Anleitung wiederholen — so wird der Server geprueft, nicht die Oberflaeche.
      let actionId = null;
      let actionBody = null;
      let actionUrl = null;
      let actionHeaders = null;
      const grab = (req) => {
        if (req.method() !== "POST") return;
        const h = req.headers();
        if (!h["next-action"]) return;
        const body = req.postData() || "";
        if (!body.includes(leerId)) return;
        actionId = h["next-action"];
        actionBody = body;
        actionUrl = req.url();
        actionHeaders = h;
      };
      page.on("request", grab);
      const pubBtn = page.getByTestId("publish-button");
      await pubBtn.waitFor({ timeout: 30_000 });
      await pubBtn.click();
      await page.getByTestId("published-badge").waitFor({ timeout: 60_000 }).catch(() => {});
      await sleep(2500);
      page.off("request", grab);
      const { data: pubTut } = await admin.from("tutorials").select("status").eq("id", leerId).single();
      if (pubTut.status !== "published") bug("blockierend", "Anleitung mit Schritten laesst sich nicht mehr veroeffentlichen", `status=${pubTut.status} — die neue Server-Sperre darf nur leere Anleitungen treffen.`);
      else ok("Anleitung MIT Schritten laesst sich weiterhin veroeffentlichen");

      const leer2Id = await neueAnleitung("Nachweis leer zwei");
      if (actionId && actionBody && actionBody.includes(leerId)) {
        const headers = { "next-action": actionId };
        for (const k of ["content-type", "accept", "next-router-state-tree"]) {
          if (actionHeaders[k]) headers[k] = actionHeaders[k];
        }
        const resp = await page.request.post(actionUrl, {
          headers,
          data: actionBody.split(leerId).join(leer2Id),
        });
        await sleep(2500);
        const { data: leer2 } = await admin.from("tutorials").select("status").eq("id", leer2Id).single();
        info(`Nachgestellter Veroeffentlichen-Aufruf: HTTP ${resp.status()}; status der leeren Anleitung=${leer2.status}`);
        const respText = await resp.text().catch(() => "");
        info(`Antwort des Servers: ${respText.replace(/\s+/g, " ").slice(0, 400)}`);
        // Next ersetzt im Produktions-Build den Text GEWORFENER Fehler durch einen Digest —
        // der Grund muss als Rückgabewert (withUserErrors) beim Nutzer ankommen.
        if (/noch keine Schritte/.test(respText)) ok("Ablehnungs-Grund kommt als deutscher Text beim Nutzer an");
        else bug("aergerlich", "Ablehnungs-Grund geht im Produktions-Build verloren", `Antwort enthaelt nur: ${respText.slice(0, 200)}`);
        if (leer2.status === "published") {
          bug("blockierend", "Server veroeffentlicht eine leere Anleitung", "Die Veroeffentlichen-Action laesst sich an der Oberflaeche vorbei mit einer Anleitung ohne Schritte aufrufen.");
        } else ok("Server lehnt das Veroeffentlichen einer leeren Anleitung ab (nicht nur die Oberflaeche)");
      } else {
        info("Veroeffentlichen-Action nicht mitgeschnitten — Server-Sperre diesmal nicht nachgestellt.");
      }

      // ── Befunde 2 + 5: letzten Schritt einer VEROEFFENTLICHTEN Anleitung loeschen ──
      for (let runde = 0; runde < 3; runde++) {
        const { count } = await admin
          .from("steps")
          .select("id", { count: "exact", head: true })
          .eq("tutorial_id", leerId);
        if (count <= 1) break;
        await page.goto(`${BASE}/app/tutorials/${leerId}`, { waitUntil: "domcontentloaded" });
        await page.getByTestId("editor-controls").waitFor({ timeout: 60_000 });
        await sleep(2500);
        await flowKarten().last().click();
        await page.locator("#step-title").waitFor({ timeout: 30_000 });
        await sleep(800);
        await page.getByRole("button", { name: /Schritt löschen/ }).click();
        const d = page.getByTestId("confirm-dialog");
        await d.waitFor({ timeout: 15_000 });
        await d.getByRole("button", { name: /löschen/i }).last().click();
        await sleep(4000);
      }
      // Jetzt der EINZIGE Schritt: Abfrage muss die Folge nennen.
      await page.goto(`${BASE}/app/tutorials/${leerId}`, { waitUntil: "domcontentloaded" });
      await page.getByTestId("editor-controls").waitFor({ timeout: 60_000 });
      await sleep(2500);
      await flowKarten().first().click();
      await page.locator("#step-title").waitFor({ timeout: 30_000 });
      await sleep(800);
      await page.getByRole("button", { name: /Schritt löschen/ }).click();
      const dlg = page.getByTestId("confirm-dialog");
      await dlg.waitFor({ timeout: 15_000 });
      const dlgTxt = (await dlg.innerText()).replace(/\s+/g, " ").trim();
      info(`Abfrage beim einzigen Schritt: ${dlgTxt}`);
      await shot(page, "92-letzter-schritt-abfrage");
      if (/endet danach beim vorigen Schritt/.test(dlgTxt)) {
        bug("aergerlich", "Abfrage verweist auf einen vorigen Schritt, den es nicht gibt", dlgTxt);
      } else if (!/keine Schritte mehr/.test(dlgTxt)) {
        bug("aergerlich", "Abfrage nennt die Folge beim einzigen Schritt nicht", dlgTxt);
      } else ok("Abfrage beim einzigen Schritt nennt die richtige Folge");
      if (!/Entwurf/.test(dlgTxt)) {
        bug("aergerlich", "Abfrage sagt das Zuruecksetzen auf Entwurf nicht an", dlgTxt);
      } else ok("Abfrage sagt an, dass die Anleitung auf Entwurf zurueckgesetzt wird");

      // Falls der Dialog zwischenzeitlich geschlossen wurde (Neu-Rendern des Panels): erneut oeffnen.
      if (!(await dlg.isVisible().catch(() => false))) {
        await page.getByRole("button", { name: /Schritt löschen/ }).first().click();
        await dlg.waitFor({ timeout: 15_000 });
      }
      await dlg.getByRole("button", { name: /löschen/i }).last().click();
      // Meldungen sofort einsammeln (sie blenden nach wenigen Sekunden wieder aus).
      const meldungen = new Set();
      for (let i = 0; i < 30; i++) {
        for (const t of await page.locator("[data-sonner-toast]").allInnerTexts()) {
          meldungen.add(t.replace(/\s+/g, " ").trim());
        }
        await sleep(400);
      }
      const meldung = [...meldungen].join(" / ") || null;
      const { count: restSchritte } = await admin
        .from("steps")
        .select("id", { count: "exact", head: true })
        .eq("tutorial_id", leerId);
      const { data: leerDanach } = await admin.from("tutorials").select("status").eq("id", leerId).single();
      info(`Nach dem Loeschen des letzten Schritts: Schritte=${restSchritte}, status=${leerDanach.status}, Meldung=${meldung}`);
      await shot(page, "93-nach-letztem-schritt");
      if (restSchritte !== 0) bug("aergerlich", "Letzter Schritt wurde nicht geloescht", `Es stehen noch ${restSchritte} Schritte in der Datenbank.`);
      if (leerDanach.status === "published") {
        bug("aergerlich", "Geleerte Anleitung bleibt veroeffentlicht", "Nach dem Loeschen des letzten Schritts steht die Anleitung weiterhin auf „veroeffentlicht“.");
      } else ok("Geleerte Anleitung wird automatisch auf Entwurf zurueckgesetzt");
      if (!meldung || !/Entwurf/i.test(meldung)) {
        bug("kosmetisch", "Zuruecksetzen auf Entwurf wird nicht gemeldet", `Sichtbare Meldungen: ${meldung || "(keine)"}`);
      } else ok("Das Zuruecksetzen auf Entwurf wird als Meldung angesagt");

      // ── Befund 4: keine Hydration-Fehler in der Bibliothek ──────────────────
      await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(2500);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await sleep(2500);
      info(`Hydration-Meldungen in der Bibliothek: ${hydration.length}`);
      if (hydration.length) {
        bug("aergerlich", "Hydration-Fehler in der Bibliothek", hydration.slice(0, 2).join(" | ").slice(0, 400));
      } else ok("Bibliothek laedt ohne Hydration-Fehler (Zeitangaben kommen fertig vom Server)");
      await shot(page, "94-bibliothek-ohne-hydration");

      // ── Befund 8: Steply-Abfragen statt grauer Browser-Dialoge ──────────────
      await page.goto(`${BASE}/app/assistent/wissen`, { waitUntil: "domcontentloaded" });
      await sleep(2000);
      const anlegen = page.getByRole("button", { name: /Artikel anlegen|Neuer Artikel/ }).first();
      await anlegen.waitFor({ timeout: 60_000 });
      await anlegen.click();
      await page.waitForURL(/\/app\/assistent\/wissen\/[0-9a-f-]{8,}/, { timeout: 60_000 });
      const artikelId = page.url().split("/wissen/")[1].split(/[?#]/)[0];
      await sleep(2000);
      await page.getByRole("button", { name: /^Löschen$/ }).first().click();
      const aDlg = page.getByTestId("confirm-dialog");
      const aDa = await aDlg.waitFor({ timeout: 10_000 }).then(() => true, () => false);
      if (!aDa) {
        bug("aergerlich", "Artikel loeschen fragt nicht im Steply-Dialog", "Statt der Steply-Abfrage kommt weiterhin die graue Browser-Abfrage (oder gar keine).");
      } else {
        info(`Abfrage „Artikel loeschen“: ${(await aDlg.innerText()).replace(/\s+/g, " ").slice(0, 220)}`);
        await shot(page, "95-artikel-loeschen-abfrage");
        ok("Artikel loeschen fragt im Steply-Dialog");
        await aDlg.getByRole("button", { name: /Abbrechen/ }).click();
        await sleep(900);
      }
      await page.getByPlaceholder("Titel des Artikels").fill("Nachweis ungespeichert");
      await sleep(600);
      // Gezielt der Zurueck-Link IM Artikel-Editor (der Reiter im Menue heisst genauso).
      await page.getByTestId("article-back").click();
      const uDlg = page.getByTestId("confirm-dialog");
      const uDa = await uDlg.waitFor({ timeout: 10_000 }).then(() => true, () => false);
      if (!uDa) {
        bug("aergerlich", "Ungespeicherte Artikel-Aenderungen fragen nicht im Steply-Dialog", "Beim Verlassen erscheint keine Steply-Abfrage.");
      } else {
        info(`Abfrage „ungespeicherte Aenderungen“: ${(await uDlg.innerText()).replace(/\s+/g, " ").slice(0, 220)}`);
        await shot(page, "96-ungespeichert-abfrage");
        ok("Ungespeicherte Artikel-Aenderungen fragen im Steply-Dialog");
        await uDlg.getByRole("button", { name: /Weiter bearbeiten|Abbrechen/ }).click();
        await sleep(700);
      }
      await admin.from("kb_articles").delete().eq("id", artikelId);

      // Quelltext-Waechter: keine grauen Browser-Abfragen mehr in diesen Dateien.
      // (Die Team-Verwaltung braucht dafuer ein zweites Konto-Mitglied — der Quelltext-
      //  Nachweis haelt die Regel trotzdem fest.)
      const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
      const nativ = [];
      for (const rel of [
        "src/components/app/article-editor.tsx",
        "src/components/app/team-manager.tsx",
      ]) {
        const src = readFileSync(path.join(wurzel, rel), "utf8");
        for (const m of src.matchAll(/(?:window\.)?\bconfirm\s*\(\s*[`"']/g)) {
          nativ.push(`${rel}: ${src.slice(m.index, m.index + 60).replace(/\s+/g, " ")}`);
        }
      }
      if (nativ.length) {
        bug("aergerlich", "Graue Browser-Abfragen noch im Quelltext", nativ.join(" | "));
      } else ok("Keine grauen Browser-Abfragen mehr in Artikel-Editor und Team-Verwaltung");
    } catch (e) {
      bug("aergerlich", "Phase 10 abgebrochen", String(e && e.stack ? e.stack : e));
      await shot(page, "phase10-fehler");
    } finally {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      for (const id of angelegt) await admin.from("tutorials").delete().eq("id", id).then(() => {}, () => {});
    }
  }

  return state;
}

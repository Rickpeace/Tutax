# Steply — Produkt- & Code-Review (Stand: 01.07.2026)

**Kontext:** MVP in aktiver Entwicklung. Vollständige Findings aus 4 parallelen
Deep-Reviews (Endkunden-Oberfläche, Funnel/Settings, Builder/Authoring,
Plattform/Next.js) + eigene Verifikation. Checkboxen zum Abhaken beim Fixen.
Severity: 🔴 kritisch · 🟠 hoch · 🟡 mittel · ⚪ niedrig.

> Dieses Dokument ist eine **Roadmap, kein Zeugnis** — die glücklichen Pfade sind
> durchweg gut gebaut; fast alles hier ist „letzter Meter" (Ränder, Fehlerfälle,
> Betrieb), nicht Architektur.

## ✅ Erledigt in der Nachtschicht 02.07. (Welle 1 + Welle 4 Schritt 1)

**Fable:** Blur in Pixel gebrannt (publish/fork/edit-published, test-blur-live 9/9) ·
Security-Header (Frame-Schutz außer /h) · `accounts.plan` + Admin-Schalter „Pro
freischalten" (Vollzugriff ohne Zahlungsanbieter; RichardTax=pro) · Free-Limit
(5 Tutorials, Forks zählen nicht) in createTutorial/duplicateTutorial · Abo-Seite
ehrlich (Plan-Status, Limit-Banner, Stripe-Fußnote raus).
**Opus (Branch welle-1-opus, reviewt+gemerged):** error/not-found/global-error
(deutsch, gebrandet) · OpenAI-Timeout 20 s + suggest-Cap/maxDuration · Publish-Toast
mit „Live ansehen" + URL · Kontrast-Ableitung `--brand-accent-fg/-strong` (dunkle CIs
pixelidentisch) · Impressum/Datenschutz-Gerüst (OpenAI/DPF-Passus, Platzhalter für
Betreiber-Angaben) · KI-Hinweis im Chat + Impressum/Datenschutz-Links im /h-Footer ·
Leere-Suche-CTA. **Entsprechende Checkboxen unten gelten als erledigt.**

**Fable (Runde 2):** Migration 0016 (HNSW-Vektorindex, kb-Source-Index,
updated_at-Trigger für Steps/Branches, drift_checked_at) · GitHub-CI (Typecheck
blockierend, Lint informativ — 26 Alt-Findings).
**Opus Welle 2 (reviewt+gemerged):** SEO-Paket (metadataBase, OG mit Kanzlei-Logo,
robots.ts, sitemap.ts) · Dashboard-Thumbnails + Titel-zuerst (1 Query, kein N+1) ·
Wizard breiter + Fortschritt (nur linear) + Bild-Lightbox + Fokus-Management ·
**Chat-Widget auf Tutorial-Seiten** · Chat-A11y (dialog-Rolle, Esc, Autofokus, dvh-Höhe,
isComposing, Reset-Confirm) · Landing: Preis-Sektion (lib/pricing.ts als Quelle) + FAQ +
„bald"-Badge weg.
**Opus Welle 5 (reviewt+gemerged):** RichText-**Links** (StarterKit hatte Link schon —
Editor-Button + Viewer rendert nur http/https, 12 Sanitisierungs-Fälle getestet) +
underline/strike · KB-Editor-Verlassen-Schutz · „Bild ersetzen"-Dialog (Markierungen
behalten/löschen) · Frage-Toggle-Confirm · „Speichern & weiter" wartet auf Erfolg ·
Drift-Cooldown (60 Min, 429) + „Hinweise ansehen"-Link · kb.ts wirft/loggt Fehler ·
deutsche Auth-Fehler überall (lib/auth-errors.ts) · Category-Rollback ·
Preview-Promise.all · Highlight-Clamp 0..1.

**Fable (Runde 3):** events-Tabelle (Migration 0018) + „**War das hilfreich?** 👍/👎" am
Wizard-Ende + View-Tracking (after()) + Chat-Frage/Status-Logging (Frage-Lücken-Basis) ·
Wizard-**Resume** (sessionStorage) · ViewerImage aspect-ratio/lazy/alt (Layout-Shift).
**Opus Welle 3 (reviewt+gemerged):** Worker-**Live-Aufbau** (Tutorial wächst sichtbar,
progress „Schritt X/Y", Crash-Waisen-Bereinigung, Cleanup erhalten) · `steps.video_time`
→ **Frame-Picker im Builder** („Bild aus Video wählen", Canvas-Capture, RLS-Gate) ·
Whisper-Marker-Bias + „cut" · Vision parallel (3er-Batches) · Retry/Backoff ·
schärfster-Frame-Heuristik · Vision-Bilder 1280px (Kosten) · „Wird erstellt…"-Karte im
Dashboard. ⚠️ **Worker-Teil ungetestet bis `deploy.sh` + Test-Video (Richard!).**
**Opus Welle 6a (reviewt+gemerged):** 📊 **Insights-Karte** im Dashboard (Aufrufe,
Chat-Fragen, Feedback-Quote, Top-3 unbeantwortete Fragen = Wissenslücken) ·
↕️ **Schritt-Umordnen** im Builder (Hoch/Runter, reines Branch-Rewiring, Trace für
Mitte/Root/Blatt/Entscheidung verifiziert) · 🔍 **Semantische Hub-Suche**
(api/hub-search via pgvector, „Meinten Sie:"-Vorschläge bei 0 Titel-Treffern).
**Opus Welle 6b (reviewt+gemerged, + Fable-Quota-Fix):** ⭐ **Frage-Lücken-Miner**
(„Entwurf erstellen" an jeder unbeantworteten Frage → KI-Rahmen → Builder; Frage gilt
als erledigt via events.handled_at; Free-Limit greift) · ⭐ **Script-Chat-Bubble**
(`<script src=…/h/embed.js?account=slug>` → KI-Hilfe auf jeder Firmen-Website;
iframe-isoliert, transparent, resize per postMessage; Snippet auf der Einbetten-Seite) ·
**QR-Codes** (api/qr nur eingeloggt + nur /h-URLs; Einbetten-Seite + Karten-Menü).
**Fable + Opus Welle 7a:** öffentlicher **Demo-Hub `/h/demo`** (Konto „Muster GmbH",
6 Beispiel-Anleitungen) + „Live-Demo ansehen"-Button im Landing-Hero ·
**Akzent-Dosierung** Hub-Karten (Rahmen/Chevron neutral, Icon-Tint; Commit `61c371c`,
revertierbar — Titel folgen weiter dem Kunden-`ink`-Token!) · Endkunden-Typo größer ·
Fonts-Preconnect · mobile Kategorie-Sprungleiste · Chat-Panel ohne Leerraum.
E-Mail ändern + Onboarding-Wiederholung + Header-Anker (Konto-Politur).
**Fable — Next.js-Finale:** ⚡ **cacheComponents/PPR aktiv** — /h/demo statisch
prerendered (1h/1d), alle Routen als Partial Prerender; /h-`load()` via `'use cache'`
+ Tags, **Invalidierung in ~20 Mutationen verdrahtet** (publish/unpublish/delete/
Builder-Edits/Branding/Theme/Logo/Templates; Draft-Edits schonen den Cache);
/app-Header + Tabs streamen in statische Shell; /admin-Gate umschließt children
(Sicherheits-Reihenfolge); Boundaries für auth/invite/onboarding; deprecated
force-dynamic/-static entfernt. Offen: Admin-Template-Publish invalidiert
Kunden-Hubs nicht (1h-Deckel) · Publish-Invalidierung in Prod einmal gegenprüfen.
**Opus Welle 7b:** Lint-Altbestand 31→**0** (typografische Quotes, begründete
disables für Hydration-Patterns, echter refs-Fix in builder.tsx) → **CI-Lint jetzt
blockierend**.
**Opus Wellen 8a/8b/8c (Feature-Finale, reviewt+gemerged):**
⏰ **Aktualitäts-Autopilot** (Vercel-Cron Mo 6:00, max 10 Checks/Lauf, Owner-Digest-
Mail via Resend; fail-closed — **Richard: CRON_SECRET in Vercel setzen!**) ·
🙋 **„Ich komme hier nicht weiter"** pro Wizard-Schritt (→ Insights-Wissenslücken) ·
🖨️ **Druckansicht** `/h/…/drucken` (nummerierte Schritte, Verzweigungen als
„Wenn X → Schritt N", cached) · 🧹 **Bulk-Aufräumen** im Dashboard ·
⭐ **Klick-Modus im Worker** (clicks jsonb, Migration 0020: Schrittgrenzen + Highlights
exakt aus Klicks, Vision-Highlight wird ignoriert) · 🎬 **Szenen-Erkennung** als
Fallback ohne Ton (Kette: Klicks→Schnitt→KI→Szenen→Gleichverteilung) ·
📧 „Fertig"-Mail (env-gated; Hetzner braucht RESEND_API_KEY+NEXT_PUBLIC_APP_URL) ·
🔗 **Video-Import per URL** (SSRF-geschützt, 200 MB) · 🧩 **Steply Recorder
Browser-Extension v1** (`extension/`: nimmt Screencast auf + zeichnet Klicks auf →
aufnahme.webm + clicks.json; manueller Chrome-Test durch Richard nötig).
⚠️ Worker-Teile wirken erst nach `deploy.sh`.
**Fable + Opus Wellen 9/10 (Selbst-Doku + Recorder v2 + Lernen):**
📚 **Steply-Hilfe-Hub `/h/steply`** (7 Anleitungen, 33 Schritte — Dogfooding: unsere
eigene Doku läuft auf Steply; Verweis auf /anleitung) · 📸 **Shoot-Pipeline v2**
(`scripts/shoot-steply-help.mjs`): echte UI-Screenshots + **automatische blaue
Markierungen** aus Playwright-BoundingBoxen an allen Hilfe-Schritten ·
🐛 **Vollbild-Bildeditor-Fix**: „Groß bearbeiten" lag hinter der App-Navbar
(Stacking-Context) → createPortal an document.body, per Screenshot bewiesen ·
🖱️ **Recorder v2** (Welle 10a): clicks.json optional im „Aus Video"-Dialog
(streng validiert, Fehlerfall degradiert sanft, nur Einzel-Upload) ·
🎓 **Interne Tutorials + Schulungsnachweis v1** (Welle 10b, Migration 0021):
Sichtbarkeit „Öffentlich | Intern (nur Team)" im Builder; interne Anleitungen
NIE auf /h, nie im Chat-RAG, nie im public Bucket (anon-RLS + Guards + Trace-Tests);
neuer Tab **„Lernen"** (/app/lernen) mit signierten Privat-Bildern, „Als absolviert
markieren", Owner-Tabelle „wer hat was wann absolviert" + Team-Fortschritt;
`setTutorialVisibility` schaltet published sauber um (Bilder/Embeddings/Cache).
**Opus Wellen 12/13/15 (reviewt+gemerged, 02.07. nachmittags):**
📥 **Wissens-Import** (W12): „Von Ihrer Website" (SSRF-sicher via lib/ssrf, Startseite
+5 Unterseiten, 40k-Kappe) + „Aus Dokument" (PDF/DOCX/TXT/MD via unpdf/mammoth,
10 MB/60k) → KI macht 3–8 kb_articles als ENTWÜRFE (nie auto-publish) ·
🌍 **Mehrsprachigkeit** (W13, Migration 0022): EN/PL/TR mit AUTO-SYNC — Publish
übersetzt voll via after(), Edits delta-übersetzen nur das geänderte Stück,
Sprachaktivierung backfillt; ?lang= im Cache-Key, Umschalter, DE-Fallback pro Feld,
UI-Wörterbuch lib/i18n-hub; anon-RLS-dicht (intern bleibt intern) ·
🖱️ **Recorder v2** (W15, Migration 0023): Klicks überleben Navigation
(host_permissions + deklaratives Content-Script) + **Direkt-Upload** per
Konto-Token (handshake→signierte Storage-URL→complete; Vercel-Body-Limit umgangen;
CORS ohne ambient authority) · Fixes: Frame-Picker in JEDEM Schritt, CI-treuer
Hub-Ladescreen (persistentes /h-Layout), Extension-Manifest, Landing v2 mit
CI-Schieberegler/Schulungs-Sektion/Bento-Miniaturen.
**Opus Wellen 14/16 + Fable (Abend):** 🔊 **Vorlesen** (TTS beim Publish, Hash-Cache,
Business) mit ▶ je Schritt; /h/steply komplett vertont (backfill-tts.mjs) ·
**Audio-UX**: Auto-Play nach erster Geste, persistenter Ton-Schalter, **Auto-Modus**
(Tour: spielt + blättert selbst, pausiert an Fragen/Hintergrund-Tab) ·
💰 **Tarife free/pro/business** (Migration 0024) mit Server-Gates + Preistabelle 0/29/79 ·
Doku-Landkarte (OVERVIEW/STATUS) auf Stand gebracht.
**Opus Welle 17 + Fable:** 🌳 **Verzweigungen aus dem Gesprochenen** — Struktur-Pass im
Worker erkennt EXPLIZITE Fallunterscheidungen („wenn/falls … ansonsten", „drei
Möglichkeiten") und baut Frage + Äste + Rejoin; konservativ (Zweifel = linear,
false-positive-Test), Fallback stellt lineare Kette wieder her (⚠️ wirkt nach deploy.sh) ·
TTS auf **onyx** + gpt-4o-mini-tts umgestellt (Modell+Stimme im Hash → Auto-Neuvertonung).
**Opus Welle 18 + Fable:** 🎬 **Video-Export** — Tutorial → 1080p-MP4 in ZWEI Stilen
(classic: Ken-Burns zur Markierung + Puls-Overlay | screencast: echte Quellvideo-Clips
+ Cursor aus Klickdaten, Hybrid-Fallback), Brand-Intro/QR-Outro, eingebrannte
Untertitel + Bauchbinde, xfade, Verzweigungen als „Fall:"-Kapitel, YouTube-Kapitelmarken;
Business-Gate; echtes Mini-Rendering lokal bewiesen (ffmpeg 8) — E2E nach deploy.sh;
sharp als Worker-Dep nachgezogen (Fable). 9:16 + Musikbett als Folgewelle vorbereitet.
**Opus Wellen 17/19/20 + Fable (Nacht 02./03.07.):** 🌳 Verzweigungen aus dem
Gesprochenen (Struktur-Pass, konservativ) · 🎙️ TTS v2: Sprechtext-KI (v2: Titel nur
Kontext, TTS-Satzzeichen, kein Denglisch) + **ElevenLabs live** (Helmut Clark,
Creator-Plan; Voice-ID = Code-Standard, nur Key als Env) · 🧰 UX-Paket: Schritt-Titel
optional, leere Kategorien löschbar + „Aufräumen"→„Löschen", Sichtbarkeit als
HÄKCHEN (Hilfe-Seite/Lern-Bereich, in_lernen, Migration 0026) + Dashboard-Filter,
Neues-Tutorial-Weiche (Selbst bauen | Aus Video, Kategorie+Thema bis in die
Worker-Prompts) · KI-Bild-Vorschlag entfernt (Route+Knopf+Doku-Schritt) ·
Landing-Demo-Links → /h/steply · Worker-Schutzgitter (Waisen-Cleanup nur
create+draft — nach Datenverlust „Kinderlieder" durch Alt-Worker).
**Opus Welle 21 (reviewt+gemerged):** 🧭 **App-Shell-Redesign** — Sidebar links
(Konto oben, gruppierte Nav Inhalte/Assistent, unten Einstellungen/Hilfe/
Hilfe-Seite/Abmelden; aktive Pill + Indigo-Bälkchen), schlanke Topbar,
Mobile-Sheet, **⌘K-Befehlspalette** (Navigation + Aktionen + eigene Tutorials
via searchMyTutorials); AppTabs entfernt; PPR-Disziplin (statisches Nav-Gerüst,
Konto streamt); CommandDialog-Fix in ui/command.tsx.
**Opus Welle 22 (reviewt+gemerged, 05.07.):** ⚡ **Sofort-Anleitung (Tango-Stil)** —
zweiter Extension-Modus: Screenshot + DOM-Element-Box je Klick (pointerdown,
normalisiert), WebP-Konvertierung clientseitig, Direkt-Upload per Token
(guide-handshake/-complete, privater Bucket), fertiger Entwurf in Sekunden OHNE
Video/Worker; Vorlagen-Titel + billiger KI-Feinschliff via after(); Free-Limit
+ Pfad-/Rect-/Count-Validierung; 32 Live-Checks. Manueller Chrome-Test offen.
WORKFLOW-WECHSEL: nur noch main wird gepusht (Vercel-Dedup-Falle), Wellen
zweigen von origin/main ab.
**Opus Welle 23 + Fable (05.07.):** 🧲 **Extension v2.0 — Seitenleiste** (Chrome
sidePanel, Tango-Architektur): Panel statt Popup+Fenster, Zustands-Screens
(Verbinden/Start/Aufnahme/Fertig), Schrittliste mit Thumbnails je Schritt;
Robustheit: Multi-Tab-Klicks (Fenster- statt Tab-Bindung), Zustands-Versöhnung
(nie mehr klemmender Aufnahme-Modus), Mikro-Preflight (kein stummes Video mehr),
Klick-Puls pro Tab; Server-Verträge unverändert (Tests grün). Vorher: v1.2.1
Klick-Puls nach Screenshot-Bestätigung (Fable direkt). **Hotfix v2.0.1 (Fable):**
captureVisibleTab scheitert im Panel-Kontext an Chromium-Bug crbug.com/40916430 →
Capture via background.js + Retry + echte Fehlermeldung; Fenster des Klicks statt
Panel-Fenster; host_permissions `<all_urls>`.
**Opus Welle 24 + Fable (05.07.):** ✍️ **Extension v2.1.0 — Aufnahme-Qualität**:
Label-Hygiene (sichtbarer Text statt textContent — styled-components-CSS landete
wörtlich im Schritttext; Code-Erkennung als Rettungsnetz; DATENSCHUTZ: Feldwerte
nie mehr als Label, bei Passwortfeldern nichts Inhaltliches) · Blur-basierte
**Eingabe-Schritte** (Tango-Verhalten: Schritt entsteht beim Verlassen des Felds
mit geändertem Wert, Screenshot zeigt das ausgefüllte Feld; Klick ins Feld = kein
Rauschen; pointerdown-vor-blur-Reihenfolge gelöst; Panel-Einzelslot → FIFO-Queue,
Eingabe+Klick <300 ms teilen einen Screenshot) · **Selektor-Vorbau** (Migration
0027 `steps.selector` jsonb: {css,text,role} je Schritt, stabile Selektoren ohne
generierte Klassen/IDs, serverseitig streng gesäubert, wirft nie, abwärts-
kompatibel — Grundlage für Live-Führung + Anleitungs-TÜV, wird noch nicht
gelesen) · neuer Headless-Beweis `scripts/test-guide-capture.mjs` (Playwright,
25 Assertionen: Labels/Editierbarkeit/blur-Reihenfolge/Passwort-Schutz/Selektoren).
**Fable-Hotfixes v2.1.1/v2.1.2 (05.07., aus Richards Live-Tests):** sichtbare
Feldüberschrift schlägt Platzhalter („Telefon" statt „+49 …") · Dead-Click-Filter
(Klick auf passive Fläche = KEIN Schritt; cursor:pointer-Heuristik mit äußerster
pointer-Grenze für klickbare DIV-Karten) · Checkbox/Radio/Switch-Label aus
zugehörigem `<label>` · Schieberegler via change (Endposition, gedrosselt);
Testkatalog auf 40 Assertionen.
**Opus Welle 25 + Fable (05.07.):** 🔌 **Extension-Onboarding (v2.2.0)**:
Ein-Klick-Pairing (Einbetten-Karte „Extension verbinden" → postMessage mit
Origin-Bindung → background validiert Token via NEUER Route `GET
/api/recorder/me` VOR dem Speichern; Panel zeigt „Verbunden mit X" live via
storage.onChanged; Token-Rotation nur mit Owner-Session, nie im DOM/URL) ·
öffentliche Seite **/extension** (ZIP-Download aus `public/downloads/` via
deterministischem `scripts/build-extension-zip.mjs`, 3-Schritt-Anleitung,
Web-Store-Hinweis) · Update-Hinweis im Panel (Versionsvergleich gegen
steply-recorder.json, nie blockierend) · „Neues Tutorial" mit DRITTER Karte
⚡ Sofort-Anleitung (erkennt Installation am DOM-Marker `data-steply-recorder`)
· Store-Paket `extension/store/LISTING.md` (Texte, Berechtigungs-Begründungen,
Richard-Checkliste). Zwischenlösung bis Chrome-Web-Store-Konto existiert.
**Fable-Hotfixes v2.2.1–v2.2.3 (05.–06.07., aus Richards Tests):** ⚡-Karte im
„Neue Anleitung"-Dialog öffnet die Seitenleiste DIREKT (Klick-Geste reicht via
content→background zu sidePanel.open() durch, Chrome ≥116) · content.js wird in
ALTOFFENE Tabs nachgeimpft (scripting-Permission; vorher blieben Klicks stumm,
bis man die Seite neu lud) + Panel-Warnung bei chrome://-Tabs · Textqualität:
zitat-sichere Titel-Kürzung (templateTitle kürzt das Zitat-Innere, Quotes immer
paarig), Kachel-Überschrift schlägt Metadaten-aria („…19 minutes"), Feinschliff
darf lange Labels paraphrasieren, keine Emojis, Text ≠ Titel-Echo ·
E-Mail-Audit: Einladungs-Mail auf Steply-Branding/warme CI (war „Taxtut" +
Alt-Indigo!), Resend live bewiesen, 4 Richard-Handgriffe in TODO (Supabase-SMTP
via Resend = kritisch für Kunden-Auth-Mails).
**Opus Welle 26 + Fable (06.07.):** 🛡️ **Darstellungs-Härtung gegen echte
Aufnahme-Inhalte** (lange Titel/URLs/Emojis aus der Sofort-Anleitung): Wizard
(Titel, Verzweigungs-Antworten), RichText zentral, /h-Tutorial-Seite, Hub-Karten
(line-clamp-2 + Grid-min-w-0), Bibliothek-Karten, Builder-Schrittliste,
Druckansicht — nur break-words/min-w-0/line-clamp, pixeltreu bei normalem
Inhalt. Beweis: `scripts/test-wizard-hostile.mjs` (Playwright, Seed feindlicher
Tutorials, scrollWidth-Asserts Desktop+Mobil, 22/22 grün, Screenshots gesichtet).
**Opus Wellen 27/28 + Fable-Hotfixes (06.07.):** ⚓ **Aufnahme-Anker (W27,
v2.3.0)**: „Ab hier mit Extension aufnehmen" an jedem Builder-Einfügepunkt +
Verzweigungs-Ast; guide-complete mit optionalem target{tutorialId, anchor};
Ketten-Umverdrahtung bewiesen (mittig/leerer Ast/Rejoin), Fallback „nie
verloren" (fremdes Konto/published/>40 → neues Tutorial, 200+fallback:true) ·
🕶️ **Auto-Schwärzung (W28, v2.4.0)**: content.js sammelt sichtbare sensible
Felder (password, api-key/token/iban-Label-Muster, data-steply-sensitive) als
Geometrie (NIE Inhalte) → Server erzeugt blur-Highlights mit suggested:true →
Editor-Hinweis „bitte prüfen" (Speichern = geprüft) → Publish-Dialog warnt bei
ungeprüften · ⌨️ CapsLock-Warnung (PasswordInput in allen 5 Formularen) ·
Team-Entfernen/Einladung-Zurückziehen geschärft · **Fable direkt:**
Auth-Mail-Templates deutsch (token_hash-Direktlinks; Magic-Link-Kette
E2E-bewiesen: /auth/confirm als ROUTE-HANDLER — als Seite verwarf Next das
Session-Cookie nach verifyOtp, Nutzer blieb ausgeloggt) · Auto-Refresh nach
Extension-Upload (ContentUpdatedRefresh im /app-Layout) · Entf löscht Form im
Bild-Editor · Nachimpfung altoffener Tabs (v2.2.2) · Karten-Klick öffnet
Seitenleiste (v2.2.1).
**Opus Welle 29 + Fable (06.07.):** 🌍 **Hilfe-Seite VOLLSTÄNDIG mehrsprachig**
(Audit aller /h-Texte im Bericht): Kategorienamen via `categories.name_i18n`
(Migration 0028, Batch je Sprache, `_src`-Feld erkennt Umbenennungen) ·
Druckansicht mit ?lang (Übersetzungen + Wörterbuch, lang im Cache-Key) ·
Beschreibung im Delta-Auto-Sync (setTutorialDescription → stale + after-Delta) ·
Rest-Lücken (Wizard-Labels, Fußzeilen, Sprachumschalter-aria) ins Wörterbuch ·
Chat-Hülle lokalisiert + Bot antwortet in Besuchersprache. Live-Test 27/27
(EN-Hub: „Tax Basics", Druck EN ohne deutsches „Wenn", DE-Regression grün).
Bewusst offen: globale Admin-Kategorien, /impressum+/datenschutz.
**Fable direkt (06.07.):** Builder-Kurzbeschreibung editierbar (Geisterfeld:
/h zeigte sie, niemand konnte sie pflegen) · Extension v2.4.1 (Ziel-Banner
immer Klartext: ohne Ziel „wird als neues Tutorial angelegt").
**Opus Welle 30 + Fable (06.07.):** 🌐 **Sprachen von Anfang an**: Sprachfrage
im Onboarding (Deutsch fix; EN/PL/TR bei Business anhakbar, Free/Pro als
Teaser mit Abo-Link; speichert über bestehende saveLanguages-Action) ·
Browser-Sprach-Vorschlag auf /h (dezente schließbare Leiste in Zielsprache,
nur wenn Sprache aktiviert; localStorage je Slug; NIE Auto-Redirect; Shell
bleibt statisch). Beweis scripts/test-lang-suggest.mjs 18/18 (Playwright-Locale,
echter Onboarding-Login, Screenshots gesichtet).
**Opus Wellen 31a–d + Fable (06.07.):** 🧭 **LIVE-FÜHRUNG (Tango-Prinzip) +
Seiten-Erkennung** — Extension v2.5.0/2.5.1. Migration 0029 (steps.page_url,
tutorials.site_domains + GIN, events.type='guide'; von Richard live angewandt).
**31a/b Live-Führung**: Panel-Bereich „Anleitung führen" (Liste published+intern,
„Live"-Badge bei Selektoren) → Führungs-Ansicht (Titel/Text/Screenshot,
Verzweigungs-Fragen, Zustand in storage.session, Navigation überlebt via
tabs.onUpdated); content.js-Overlay: guide-resolve.js (3-stufig css→role+Text→
Fuzzy, pures UMD-Modul), pulsierender Koralle-Rahmen + Schritt-Badge, Klick aufs
Ziel = weiter; Fallback „Stelle nicht zu finden → Screenshot" + guide-event
selector_miss (Drift-Signal in events). APIs: GET /api/recorder/tutorials
(+Liste), GET /api/recorder/tutorials/[id] (Detail inkl. Tiptap→Whitelist-HTML,
signierte Bilder 1h), POST /api/recorder/guide-event (nie störend).
**31c Seiten-Erkennung**: guide-complete persistiert page_url je Schritt + sät
site_domains (lib/site-domains.ts, Basis-Domain-Heuristik); Builder-Feld „Gilt
für Website" (Globe-Popover, tutorial-header) + setTutorialSiteDomains; Panel-
Sektion „📍 Für diese Seite" — Matching LOKAL (site-match.js), besuchte URLs
verlassen NIE den Browser. **31d**: Titel-Feld + Kategorie-Auswahl (bestehende/
neue; GET /api/recorder/categories, guide-complete `category` additiv,
case-insensitive Wiederverwendung) direkt im Sofort-Panel; beim Anker-Modus
ausgeblendet. Tests (alle grün auf gemergtem Stand): test-guide-api-live,
test-guide-resolve (11), test-site-context-live, test-site-match (41),
test-guide-category-live (18), test-recorder-live-Regression + Build/Lint.
Richards Live-Test-Feedback → **Welle 32** (Eingabe-Schritt-Selektoren,
Overlay-Intensität, gefilterte Führen-Liste m. Kategorien, Banner nur im
Anker-Modus, Icon-Badge, „Bring mich hin").
**Opus Welle 11 (reviewt+gemerged):** 🤖 **Chatbot-Zentrale — Tab „Assistent"**
(alle Chatbot-Themen an einem Ort statt verstreut): Unternavigation
Wissensdatenbank (umgezogen von /app/knowledge) · **Offene Fragen** (NEU: alle
Wissenslücken bis 25 mit „Entwurf erstellen"; geteilte Quelle lib/gaps.ts mit der
Dashboard-Karte) · Kontakt & Eskalation (aus den Einstellungen umgezogen);
Quick-Links „Chat testen" + „Chat-Bubble einbetten"; alte URLs leiten weiter;
Steply-Hilfe-Texte + Screenshots auf die neuen Pfade nachgezogen.

---

## Was gut ist (von 4 unabhängigen Reviews bestätigt)

- **Wizard** genau richtig reduziert für Nicht-Techniker: 1 Schritt/Karte, echter
  Zurück-Verlauf, klarer End-Screen.
- **Highlight-Editor überraschend komplett:** Rechteck, Ellipse, Pfeil, Blur, Lupe,
  4 Farben, 8 Resize-Handles mit großen Touch-Flächen. (Marketing-Versprechen gedeckt!)
- **Theming diszipliniert:** alles über CSS-Variablen mit Defaults; Skin-CSS strikt
  gekapselt und auf „malende" Properties beschränkt — Kunden-Design kann das Layout
  nicht zerbrechen.
- **Chat robust:** NDJSON-Streaming mit Fallback, localStorage mit try/catch
  (übersteht Safari/Third-Party-iFrame), Quellen-Links, Eskalations-Buttons.
- **Optimistic-UI-Architektur im Builder** sauber (Client-UUIDs, pending-Counter
  gegen Resync-Races, Fluss-Reihenfolge-Navigation); tree.ts deterministisch + kommentiert.
- **Auth-UX überdurchschnittlich:** übersetzte Fehler, Anti-Enumeration beim Reset,
  sichtbare Passwortregel, Loading-States, Magic-Link-Alternative.
- **DB-Schema solide:** FKs mit sinnvollem on delete, partieller Unique-Index
  (account_id, slug), unique Invite-Tokens, Position-Indizes, RLS überall.
- **KI-Routen kostenbewusst:** Token-Caps, Input-Kappung, Timeouts (Drift), Rate-Limit (Chat).
- **Funnel technisch dicht:** Signup ohne Bestätigungshürde → Onboarding mit Skip →
  Empty-State-CTA → Publish-Toggle → Einbetten-Anleitung. Erstes Erfolgserlebnis ~10 Min.

---

## 🚨 Top 5 (zuerst fixen)

- [x] 🔴 ~~Blur ist Schein-Schwärzung~~ **GEFIXT (02.07., Fable):** `lib/redact.ts`
  brennt Blur als irreversible Pixelierung (sharp) in ALLE öffentlichen Kopien:
  publishTutorial, forkTemplate UND beim Bearbeiten veröffentlichter Tutorials
  (updateStep→refreshPublicImage). Privates Original bleibt editierbar. Verifiziert:
  scripts/test-blur-live.mjs (9/9, Varianz 74→5.5, Nachbarpixel identisch).
- [ ] 🔴 **Impressum + Datenschutz sind Platzhalter** (live verlinkt, Abmahnrisiko);
  Datenschutz behauptet fälschlich „keine Drittland-Übermittlung" trotz OpenAI.
  → echte Angaben; OpenAI als Auftragsverarbeiter inkl. Drittland/DPF aufnehmen.
- [ ] 🔴 **Kein Billing, keine Limit-Durchsetzung** — kein Stripe, Upgrade-Buttons
  disabled, „Preise sind Platzhalter" für Kunden sichtbar (`abo/page.tsx:64-79`);
  Free-Limits (5 Tutorials, Branding) nirgends enforced (`createTutorial` ohne Limit).
  → Stripe Checkout + Portal; Limits gaten; Preise auf die Landing.
- [x] 🟠 ~~Kein error.tsx/not-found.tsx/global-error.tsx~~ **GEFIXT (02.07., Opus/W1):**
  alle drei, deutsch + gebrandet; /h/gibtsnicht liefert deutsche 404 (curl-verifiziert).
- [x] 🟠 ~~Publish-Moment verpufft~~ **GEFIXT (02.07., Opus/W1):** Erfolgs-Toast
  „Veröffentlicht! 🎉" mit „Live ansehen"-Action + URL; Unpublish-Bestätigung.

---

## A. Endkunden-Oberfläche (/h)

### UX
- [ ] 🟠 `wizard.tsx:34-51` Kein Fortschritt („Schritt 3 von 8") + kompletter
  Zustandsverlust bei Reload/Zurück → Position in sessionStorage oder `?step=`.
- [ ] 🟡 `hub-browser.tsx:55-60` Leere Suche = Sackgasse → CTA „Fragen Sie den
  Hilfe-Assistenten" (Chat öffnen) + Reset-Button.
- [ ] 🟡 `chat-widget.tsx:151` Fehlerblase ohne „Erneut versuchen"; Nutzer-Frage ist
  weg (Input vor fetch geleert) → Retry-Button, der die letzte Frage erneut sendet.
- [ ] ⚪ `hub-browser.tsx:27-32` Suche matcht nur Titel+Beschreibung, nicht
  Schritt-Inhalte → serverseitige Suche (FTS/pgvector existiert fürs RAG).

### Mobile + Accessibility
- [ ] 🟠 `chat-widget.tsx:159-169` Kein Fokus-Management: kein role="dialog"/
  aria-modal, kein Autofokus, kein Esc, kein aria-expanded → für Tastatur/Screenreader
  unbenutzbar.
- [ ] 🟠 `chat-widget.tsx:188` Kein aria-live → gestreamte Antworten für Screenreader
  stumm (polite-Wrapper, ggf. erst nach done announce).
- [ ] 🟠 `theme.ts:89` + `wizard.tsx:101-109` **Keine Kontrastprüfung** für
  Kundenfarben: brand-accent ungeprüft als Button-BG mit weißem Text UND als Text auf
  Weiß → helles Kanzlei-Gelb = unlesbar. → Luminanz prüfen, `--brand-accent-contrast`
  ableiten, zu helle Accents für Text abdunkeln.
- [ ] 🟠 `wizard.tsx:37-40` Schrittwechsel ohne Fokus-/Announce-Management, kein
  Scroll-to-top → Fokus auf Schritt-Überschrift setzen (tabIndex=-1 + focus()).
- [ ] 🟡 `viewer-image.tsx:36` Screenshot immer `alt=""`, obwohl Kerninhalt →
  mind. `alt={step.title}`, besser Alt-Feld im Editor.
- [ ] 🟡 `chat-widget.tsx:169` `h-[30rem]` fix + bottom-24 → auf iPhone SE Header
  abgeschnitten, iOS-Tastatur verdeckt Input → `h-[min(30rem,calc(100dvh-7rem))]`.
- [ ] 🟡 `hub-browser.tsx:47-52` Suchfeld ohne aria-label/type="search"; Trefferzahl
  nicht announced → aria-label + role="status"-Zeile.
- [ ] ⚪ `chat-widget.tsx:177-184` „Neu"-Button ~24px Touch-Ziel + löscht ohne
  Rückfrage → größer + Bestätigung.
- [ ] ⚪ `chat-widget.tsx:198-200` Enter ohne isComposing-Check (IME).

### Technik (SEO / iFrame / Performance)
- [ ] 🟠 `h/*/page.tsx` Metadata nur `title`: keine description, kein openGraph/
  og:image, kein metadataBase → keine Link-Preview beim Kern-Usecase „Link per
  WhatsApp/Mail teilen". Kanzlei-Logo existiert bereits → nutzen. Zudem
  robots-Strategie: /h indexierbar, /app noindex.
- [ ] 🟡 `einbetten/page.tsx:12` iFrame-Snippet mit fixer height=700 →
  Scrollbalken-im-Scrollbalken; kein loading="lazy" → postMessage-Auto-Höhe oder
  mind. Hinweis + lazy. (Positiv: Framing funktioniert, localStorage im iFrame ok.)
- [ ] 🟡 `viewer-image.tsx:36` + `wizard.tsx:67-69` `<img>` ohne width/height →
  Layout-Shift bei jedem Schritt; `image_width/height` liegen in der DB → durchreichen,
  aspect-ratio setzen.
- [ ] 🟡 `public-image.ts:4-6` Originale ungedrosselt aufs Handy → Supabase
  Image-Transform (`?width=800`) oder vorskalierte Varianten.
- [ ] ⚪ `h/*/page.tsx` Google-Fonts-<link> ohne preconnect zu fonts.gstatic.com und
  ohne precedence → FOUT. → preconnect ergänzen.

### Fehlende Features (Endkunde)
- [ ] 🟡 **„War das hilfreich? 👍/👎"** am Fertig-Screen — geringster Aufwand,
  zugleich erstes Nutzungssignal für die Kanzlei (Analytics-Grundstein).
- [ ] 🟡 Druck-/PDF-Ansicht (alle Schritte untereinander) — Zielgruppe druckt.
- [ ] ⚪ Schriftgrößen-Option; Video/GIF pro Schritt; i18n (alles hart deutsch).

---

## B. Funnel / Monetarisierung / Marketing / Settings

### Funnel
- [ ] 🟡 `onboarding-wizard.tsx:81-86` Wizard verspricht KI-CI „sobald aktiv",
  Feature ist aber live → im Onboarding direkt aus der eingegebenen Website anstoßen
  (Wow-Moment).
- [ ] ⚪ `onboarding/actions.ts:33` Onboarding unwiederholbar → „Einrichtung erneut
  zeigen"-Link in Settings.
- [ ] ⚪ `app/page.tsx:114-126` Empty-State ohne Fortschritts-Checkliste (die 7
  Schritte aus /anleitung existieren schon als Text).

### Monetarisierung
- [ ] 🟠 Free-Limits enforce'n: `createTutorial` ohne Limit, Chatbot/KI-CI/Logo für
  alle frei, „powered by Steply" für alle → ohne Gating kein Upgrade-Motiv.
- [ ] 🟠 `page.tsx` Landing ohne Preise (nur „0 €") → Pricing-Sektion mit den 3
  Tarifen aus abo/page.tsx.
- [ ] ⚪ Trial-Logik: bewusst entscheiden (free-forever bis Stripe vs. Trial) und
  dokumentieren.
- [ ] ⚪ Kurzfristig: „Preise sind Platzhalter"-Fußnote raus; „Pro vormerken"-CTA
  (Mailto) zur Nachfragemessung.

### Marketing
- [x] ~~Zielgruppen-Sprache~~ **Entschieden (01.07.26): Steply ist bewusst generisch**
  — für jede Firma mit Tutorial-Bedarf, nicht steuer-spezifisch. „Organisationen"-
  Sprache ist korrekt. (Offen bleibt nur: Landing braucht trotzdem konkrete
  Anwendungsbeispiele/Branchen-Cases als Beweis.)
- [ ] 🟡 Kein echter Screenshot/keine Demo auf der Landing (nur Mocks) → öffentlichen
  `/h/demo`-Hub bauen und verlinken (stärkster Beweis).
- [ ] 🟡 Null Social Proof → solange Kunden fehlen: Gründer-Note + „EU-Hosting,
  DSGVO"-Trust-Block.
- [ ] ⚪ `page.tsx:113` „KI übernimmt Ihr CI" trägt „bald"-Badge, ist aber live →
  Badge weg, Feature verkaufen.

### Auth + Settings
- [ ] 🟡 `settings/konto/page.tsx:49-55` „Konto löschen → Support kontaktieren", aber
  nirgends eine Support-Adresse (Impressum Platzhalter) → Mailto ergänzen.
- [ ] 🟡 E-Mail-Adresse ändern fehlt komplett → updateUser({email}) + Bestätigung.
- [ ] ⚪ `konto/actions.ts:11` changePassword gibt englische Supabase-Fehler roh
  zurück → uebersetzeAuthFehler wiederverwenden.
- [ ] ⚪ `team-manager.tsx:137` Mitglied entfernen nutzt natives confirm(), Tutorial-
  Löschen hat schönen Dialog → vereinheitlichen.
- [ ] ⚪ `team/page.tsx:45` duzt („Du gehörst…"), Rest siezt → vereinheitlichen.

### Recht + Vertrauen
- [ ] 🟡 Chat-Widget ohne KI-/Datenschutz-Hinweis für Mandanten → „Antworten werden
  automatisiert per KI erstellt – bitte keine personenbezogenen Daten eingeben" + Link.
- [ ] 🟡 Gehostete /h-Seiten ohne Impressum-/Datenschutz-Link → beide in den Footer
  neben „powered by Steply".

---

## C. Builder / Authoring

### Fehlende Features
- [ ] 🟠 **Kein Schritt-Umordnen** (kein Drag&Drop, kein Hoch/Runter) — Reihenfolge
  ändern nur destruktiv → „Nach oben/unten"-Buttons im StepPanel (Branch-Verdrahtung
  umschreiben).
- [ ] 🟡 Schritt duplizieren fehlt (nur ganzes Tutorial); Copy zwischen Tutorials fehlt.
- [ ] 🟡 Kein Undo für strukturelle Aktionen; Schritt-Löschen unwiederbringlich →
  Soft-Delete mit „Rückgängig"-Toast (Sonner-Action).
- [ ] 🟡 Kein Text-Werkzeug im Highlight-Editor („1.", „Hier klicken") — Pfeil ohne
  Beschriftung oft nicht selbsterklärend.
- [ ] 🟡 `rich-text.tsx` + `rich-text-view.tsx:42-47` **Kein Link-Support**: Tiptap
  akzeptiert Links beim Einfügen, Viewer rendert sie nicht → **beim Kunden toter
  Text** (underline/strike ebenso). → Link-Button + Viewer-Rendering.
- [ ] ⚪ Keine Tastatur-Shortcuts (Entf für Highlight, Strg+S, Pfeiltasten-Nudge) —
  billig, große Wirkung.

### UX-Reibung
- [ ] 🟡 `flow.tsx` skaliert mäßig ab ~20 Schritten: kein Zoom, keine Suche, kein
  Collapse-All → Titel-Suchfeld mit Scroll-to + Collapse-Toggle.
- [ ] 🟡 `image-field.tsx:74-86` „Bild ersetzen" behält alte (falsch sitzende)
  Highlights → nachfragen „Markierungen behalten/löschen?".
- [ ] 🟡 `builder.tsx:246-270` Frage-Toggle AUS löscht kommentarlos alle Antworten
  außer der ersten + verwaist Teilbäume (unsichtbar, aber in Zählung/Nav) →
  Confirm-Dialog + „nicht verbundene Schritte"-Hinweis im Flow.
- [ ] 🟡 `article-editor.tsx:77-105` KB-Editor: kein Auto-Save, kein Verlassen-Guard
  (auch kein beforeunload im Builder) → Änderungen können stumm verloren gehen.
- [ ] ⚪ Drift-Check: nur manuell (kein Cron), Ergebnis-Toast ohne Link zu /app/alerts,
  **kein Cooldown** (teuerster Call: web_search) → 1×/Tutorial/Stunde + Link im Toast.
- [ ] ⚪ `upload.ts:45-51` Signierte URLs laufen nach 1 h ab → in langen Sessions
  brechen Bilder stumm (Re-Sign / onError-Retry).

### Code-Bugs
- [ ] 🟡 `step-panel.tsx:326` „Speichern & weiter" wartet save() nicht ab → Navigation
  vor Ergebnis, Fehler zeigt sich nur als Refresh. → await + nur bei Erfolg navigieren.
- [ ] 🟡 `builder.tsx:148-151` handleAddStep-Fallback ohne Blatt: hängt Branch mit
  position 0 an Schritt mit vorhandenem Ausgang → neuer Schritt **unsichtbar/verwaist**.
  → position max+1 bzw. nur echte Blätter verdrahten.
- [ ] ⚪ `step-panel.tsx:131-143` KI-Vorschlag persistiert Highlight sofort, Titel/Text
  nur dirty → „Verwerfen" entfernt das KI-Highlight nicht (halbe Transaktion).
- [ ] ⚪ `highlight-editor.tsx:74,117` Move/Resize nicht auf 0..1 geklemmt → Formen
  fast ganz aus dem Bild schiebbar, im Viewer unsichtbar. → clamp wie im Crop-Dialog.
- [ ] ⚪ `category-picker.tsx:33-42` Optimistische Auswahl ohne Rollback bei Fehler.
- [ ] ⚪ `preview/[id]/page.tsx:48-52` Signierte URLs sequenziell (Wasserfall) →
  Promise.all.
- [ ] ⚪ `alerts/actions.ts:50-64` Drift-Vorschlag→Schritt-Zuordnung per Titel-Fuzzy-
  Match fragil → Step-IDs schon im Check-Ergebnis speichern.
- [ ] ⚪ Video-KI erzeugt nur Rechteck-Highlights (Editor kann mehr) — ok, aber
  Potenzial.

---

## D. Plattform / Next.js / Betrieb

- [x] 🟠 ~~keine Security-Header~~ **GEFIXT (02.07., Fable):** next.config headers() —
  X-Frame-Options DENY + frame-ancestors 'none' auf /app, /admin, Auth-/Invite-Seiten;
  /h bleibt bewusst einbettbar; global nosniff + Referrer-Policy + Permissions-Policy.
- [ ] 🟠 **Kein Error-Tracking** (kein Sentry, kein instrumentation.ts) — Produktions-
  fehler beim Kunden unsichtbar → Sentry + onRequestError.
- [ ] 🟡 Kein CI (kein .github/): Vercel deployt ungeprüft → GitHub Action mit
  next build + eslint pro Push/PR (Live-Tests optional dazu).
- [ ] 🟡 Env-Vars überall per `!`-Assertion, keine Boot-Validierung → env-Check in
  instrumentation.ts (klarer Fehler statt kryptischem Request-Crash).
- [ ] 🟡 Kein robots.ts / sitemap.ts / manifest; kein metadataBase / OG-Default →
  ergänzen (robots: Disallow /app, /api; sitemap für /h-Hubs).
- [ ] ⚪ Durchgängig `<img>` statt next/image → mind. loading="lazy" + sizes;
  next/image mit remotePatterns abwägen.

## E. Backend / API / Datenbank

- [ ] 🟠 `lib/openai.ts:9` OpenAI-Client ohne timeout/maxRetries (Default 600 s!) bei
  maxDuration=30 → hängender embed killt Function ohne Antwort. →
  `new OpenAI({ timeout: 20_000, maxRetries: 1 })`.
- [ ] 🟡 `api/steps/suggest/route.ts:63-77` Einzige Route ohne Token-Cap; kein
  maxDuration (Vercel-Default ~15 s, Vision detail:high!); rohes e.message an Client →
  maxDuration 30 + Cap ~300 + generische Fehlermeldung.
- [ ] 🟡 `api/tutorials/[id]/check/route.ts` Drift ohne Rate-Limit/Cooldown (teuerster
  Call) + DB-Writes ungeprüft (Ergebnis kann lautlos verschwinden) → Cooldown +
  Error-Checks.
- [ ] 🟡 `lib/kb.ts:59-75,124-146` Delete-then-Insert nicht atomar, {error} ignoriert →
  Tutorial kann still aus dem RAG-Index verschwinden → Fehler prüfen, Insert-vor-Delete.
- [ ] 🟡 **HNSW-Index nie angelegt** (0004 auskommentiert) → match_kb macht Seq-Scan
  über ALLE Embeddings pro Chat-Nachricht; degradiert linear mit Kundenzahl. →
  `create index ... using hnsw (embedding vector_cosine_ops)` + Index
  (source_type, source_id) für Delete-Pfade.
- [ ] ⚪ `tutorials.updated_at` ohne Trigger; Step-Änderungen bumpen es nicht →
  Dashboard-Sortierung/„Geändert vor…" lügt → moddatetime-Trigger + Bump.
- [ ] ⚪ status/freshness/severity als freier text ohne CHECK-Constraints.
- [ ] ⚪ Chat-Rate-Limit ist pro Serverless-Instanz (20×N/min, Cold-Start-Reset) —
  als Best-Effort ok; für echten Schutz später Upstash Redis/Vercel KV.

## F. Bekannt & bewusst offen (aus früheren Audits)

- [ ] 🟡 **M7 updatePassword**: /reset ist von jeder eingeloggten Session nutzbar
  (Passwort-Übernahme bei entsperrtem Gerät). Sauberer Fix braucht Recovery-Nonce im
  Auth-Confirm-Fluss — bewusst zurückgestellt (Umbau-Risiko), Plan liegt vor.
- [ ] ⚪ Middleware getUser→getClaims (warmer /app-Pfad): nur nötig, falls Inhalt nach
  Skeleton weiter träge; vorher Supabase-SSR-Docs prüfen (Token-Refresh!).
- [ ] ⚪ cacheComponents-Pilot auf /h (statische Instant-Shell): gestufte Migration,
  cache-components-Skill + Bundled Docs nutzen.
- [ ] ⚪ Analytics/Events-Tabelle (Entwurf 0015 existierte, verworfen — bei Analytics-
  Feature neu aufsetzen; „War das hilfreich?" ist der Einstieg).
- [ ] ⚪ Video-Worker-Deploy prüfen: Batch-3-Fixes (reapStale, note, Rotation) wirken
  erst nach `deploy.sh` auf Hetzner.

---

## G. Visuelles Review (echte Screenshots, 02.07.2026)

17 Screenshots, Desktop (1440) + Mobile (390), öffentlich + eingeloggt.
Gesamteindruck: Landing stark (~8/10), **Builder = stärkste Oberfläche**, Mobile
(Hub, Chat, Builder-Bottom-Sheet) überraschend gut.

> **Kontext-Entscheidung (Richard, 02.07.):** Das kräftige Rot des RichardTax-Hubs ist
> **geklonte CI** (Jakus Tax) und gewollt — das KI-CI-Feature funktioniert. Findings
> unten betreffen nur die *Dosierung* der Akzentfarbe, nie die Farbe selbst.

- [ ] 🟠 **Chat-Widget fehlt auf den Tutorial-Seiten** (`/h/[slug]/[tutorial]`) — nur
  der Hub hat es; genau beim Feststecken gibt es keinen Chat. → Widget auch dort.
- [ ] 🟠 **Dashboard = Wand identischer weißer Kacheln** (26 Stück, kein Blickanker):
  keine Thumbnails, und der Publish-Toggle steht ÜBER dem Titel (erstes Lese-Element
  ist ein Schalter). → Thumbnail (erstes Schritt-Bild) + Titel zuerst.
- [ ] 🟡 **Landing-Hero zeigt Wireframe-Mock statt Produkt** → echten
  Builder-Screenshot (Browser-Rahmen) einsetzen; „bald"-Badge bei „KI übernimmt Ihr
  CI" entfernen (Feature ist live).
- [ ] 🟡 Landing endet nach dem CTA: **Preise-, FAQ-, Demo-Hub-Sektion fehlen**
  (deckt sich mit B/Monetarisierung).
- [ ] 🟡 **Wizard auf Desktop zu schmal** (Karte ~430 px in 1440, Titel klein) →
  breiter (max-w-xl/2xl), größerer Schritt-Titel, Fortschritt „Schritt x von y",
  Bild-Lightbox (mobil: Tap-to-Zoom).
- [ ] 🟡 Hilfe-Seiten **Akzent-Dosierung** (Empfehlung, CI bleibt): Markenfarbe färbt
  jeden Kartenrahmen, jeden Titel, alle Icons → Titel in Ink, Rahmen neutral/dezenter
  Tint; Akzent konzentriert auf Logo/Topbar/Buttons/Chat-Bubble. Wirkt ruhiger,
  CI bleibt klar erkennbar.
- [ ] 🟡 Dashboard mobil: endloser Ein-Spalten-Scroll → sticky Kategorie-Sprungleiste
  oder einklappbare Sektionen. **Produkt-Nebenfund:** kein Bulk-Löschen/Archivieren
  (15 Test-Tutorials unter „Sonstiges" ohne Aufräum-Werkzeug).
- [ ] ⚪ Chat-Panel: fixe Höhe lässt Leerraum; Bot-Antwort könnte direkter zum Klick
  auf die verlinkte Anleitung auffordern.
- [x] ~~Mobile-App-Header quillt über~~ — nach Sichtung **herabgestuft**: komprimiert
  ordentlich (E-Mail wird ausgeblendet).

**Positiv bestätigt:** Builder-Zweispalter + Mobile-Bottom-Sheet exzellent;
Chat-Streaming mit Quellen-Chip stark; Hub-Layout (Suche/Kategorien/Karten) gut;
Landing-Typo/Bento/Rhythmus professionell.

---

## H. Produkt-Erweiterungen (Backlog — „geil"-Kandidaten)

**Schwungrad (Produkt verbessert sich selbst):**
- [ ] ⭐ **Frage-Lücken-Miner** (M): `no_answer`-Chatfragen sammeln → „Diese 7 Fragen
  blieben unbeantwortet — Tutorial erstellen?" → KI legt Entwurfs-Rahmen an.
  Schließt die Schleife Content → Chat → Content. Kein Wettbewerber hat das.
- [ ] **Aktualitäts-Autopilot** (M): Drift-Check als Cron + Digest-Mail + 1-Klick-
  Übernahme („Deine Hilfe hält sich selbst aktuell" = Abo-Argument).
- [ ] **Semantische Endkunden-Suche** (S): vorhandenes pgvector-RAG ins Hub-Suchfeld.

**Reichweite & Verteilung:**
- [ ] ⭐ **Script-Chat-Bubble** (M): ein `<script>`-Tag → KI-Hilfe schwebt auf JEDER
  Seite der Firmen-Website, nicht nur im Hub. Größter Adoptions-Hebel.
- [ ] **Custom Domain** (M): `hilfe.firma.de` per CNAME — White-Label komplett,
  klassisches Bezahl-Feature.
- [ ] **QR-Codes pro Tutorial** (S): für Brief, Rechnung, Aushang, Gerät.

**Neuer Markt (großer Hebel):**
- [ ] ⭐ **Interne Tutorials + Schulungsnachweis** (L): Zugriffsschutz (Login/Einladung)
  + „Mitarbeiter X hat Anleitung Y am … durchgearbeitet ✓" → SOP-/Onboarding-Markt
  (Scribes Kernmarkt); Video-Pipeline ist dort stärker (Desktop-Software).
- [ ] **Freigabe-Workflow** (M): Entwurf → Review → Freigabe durch Owner (Teams ≥5).

**Endkunde:**
- [ ] **Inline-Feedback pro Schritt** (S–M): „Hier komme ich nicht weiter" am Schritt
  (ergänzt „War das hilfreich?" aus A) → zeigt exakt den schwachen Schritt.

**Top-3-Empfehlung:** Frage-Lücken-Miner · Script-Bubble · Interne Tutorials.
Story: *überall erreichbar → weiß, was fehlt → funktioniert auch nach innen.*

---

## I. Video→Tutorial-Pipeline (Kern-Feature — Roadmap)

**Nächstes Paket (abgesegnet 01.07.):**
- [ ] ① **Fortschritt + Live-Aufbau**: `video_jobs.progress` („Schritt 3/6"), Tutorial
  früh als Draft anlegen + Schritte einfügen sobald fertig; „Wird erstellt…"-Karte im
  Dashboard → Dialog darf zu, kein „Fenster offen lassen" mehr.
- [ ] ② **Timestamps → Scrubber**: `video_path` + Zeitpunkt pro Schritt speichern; im
  Builder „anderes Bild aus dem Video wählen" (Mini-Timeline). Macht KI-Fehlgriffe zu
  5-Sekunden-Fixes statt Neuaufnahmen.
- [ ] ③ **Quick-Wins**: Whisper `prompt:"Schnitt"` (Marker-Bias) + Marker-Varianten
  konfigurierbar + Sprache als Konto-Setting statt hart `de`; Vision-Calls parallel
  (3–4); Retry mit Backoff um alle OpenAI-Calls; schärfsten von 3 Kandidaten-Frames
  wählen; Frames auf ~1280 px für Vision verkleinern (Kosten).

**Danach:**
- [ ] Szenen-Erkennung (ffmpeg `scdet`) als Fallback ohne Ton (statt Gleichverteilung).
- [ ] **Mini-Clip/GIF pro Schritt** (2–4 s Loop aus dem Video) — Marktlücke: Scribe hat
  nur Screenshots, Loom keine Schritte.
- [ ] **Auto-Redaktion**: Vision findet sensible Stellen (Namen, IBAN, Kundennr.) →
  Blur-Vorschläge. Setzt Top-1 „Blur einbrennen" voraus → macht daraus ein Premium-Feature.
- [ ] Mehrsprachige Ausgabe (Übersetzungs-Pass über fertige Schritte).
- [ ] Import per Loom-/MP4-Link („bring dein vorhandenes Video mit").
- [ ] E-Mail „Tutorial ist fertig → im Builder öffnen".

**Nordstern:**
- [ ] **Browser-Extension mit Klick- + DOM-Telemetrie**: exakte Highlights ohne
  Vision-Raten, Schrittgrenzen aus echten Klicks, „Schnitt" optional. Kombi-USP:
  Extension für Web-Apps **plus** Video-Pipeline für Desktop-Software (DATEV & Co.) —
  das kann kein Wettbewerber beides.

> ⚠️ Worker-Änderungen wirken erst nach menschlich ausgelöstem `deploy.sh` (Hetzner).

---

## Muster (was wir strukturell besser machen)

1. **„Demo-fertig" ≠ „belastbar fertig":** Vor jedem Feature-Haken fragen: *Was
   passiert, wenn ein echter Kunde das benutzt?* (Blur, Abo, Datenschutz.)
2. **Blindflug beenden:** Analytics + Error-Tracking + Feedback-Widget — sonst ist
   unbeantwortbar, ob je ein Mandant eine Anleitung durchgeklickt hat.
3. **Letzter Meter:** Publish-Moment, 404/Fehler-Seiten, leere Suche, Chat-Retry —
   die Ränder entscheiden über den Eindruck beim Kunden.
4. **Zielgruppe scharf ziehen:** Kanzlei-Sprache in Landing + Beispielen, oder
   bewusst generisch dokumentieren.

## Umsetzungsplan (Wellen · Wer · Wie)

### Arbeitsmodell (vereinbart 02.07.2026)

- **Fable (Claude Fable 5)** = Architekt + Reviewer + Gate: schreibt pro Welle das
  präzise Arbeitspaket (Scope = Checkboxen aus diesem Dokument + Akzeptanzkriterien),
  reviewt den Diff, macht Stichproben/Screenshots, merged erst dann nach `main`.
  Ausnahme: **sicherheitskritische Kern-Fixes codet Fable selbst** (Blur-Einbrennen,
  Security-Header).
- **Opus (Claude Opus 4.8)** = Umsetzung: codet die Arbeitspakete **nur auf
  `staging`**, hält die AGENTS.md-Verifikationspflicht ein (`npm run build` grün +
  relevante `scripts/test-*-live.mjs`; bei UI-Änderungen zusätzlich Screenshot),
  committed batch-weise mit klaren Messages, pusht **nur staging — nie main**.
  Pflicht-Lektüre vor Start: `AGENTS.md`, Skill `tutax-frontend`, betroffene
  REVIEW.md-Abschnitte, `OVERVIEW.md`.
- **Gate-Ablauf:** Opus pusht staging → Fable reviewt `staging..main`-Diff → Findings
  zurück an Opus ODER ff-merge nach `main` (= Prod-Deploy via Vercel) → Checkboxen
  hier abhaken.
- **Richard (Mensch):** `deploy.sh` für Worker-Wellen; **echte Impressums-/
  Datenschutz-Angaben** liefern (kann keine KI erfinden); Stripe-Konto + Keys;
  visuelle Abnahme pro Welle; strategische Entscheidungen.

### Wellen (Reihenfolge)

**Welle 1 — Risiko & Vertrauen** *(zuerst; Blur + Header: Fable selbst)*
Blur in Pixel einbrennen (Top-1) · error.tsx/not-found.tsx/global-error.tsx gebrandet
(Root + /h) · Security-Header via next.config (frame-ancestors DENY außer /h) ·
OpenAI-Client-Timeout + steps/suggest-Cap+maxDuration · Publish-Erfolgsmoment (Toast
mit Link) · Kontrast-Ableitung für zu helle Brand-Farben · Impressum/Datenschutz-
Struktur + OpenAI-Passus + KI-Hinweis im Chat + Rechts-Links im /h-Footer
*(Inhalte: Richard)*.

**Welle 2 — Sichtbarkeit & Funnel** *(Opus)*
OG/SEO-Paket (metadataBase, descriptions, og-Image mit Kanzlei-Logo, robots.ts,
sitemap.ts) · Landing: echter Builder-Screenshot in den Hero, Preis-Sektion,
FAQ, „bald"-Badge weg, Demo-Hub verlinken · G-Visuelles: Dashboard-Thumbnails +
Titel-zuerst, Wizard breiter + Fortschritt + Lightbox, Chat-Widget auf
Tutorial-Seiten, Akzent-Dosierung, leere-Suche-CTA.

**Welle 3 — Video-Pipeline ①②③** *(Opus; Review besonders streng; danach deploy.sh)*
Komplett Abschnitt I, „Nächstes Paket". Live-Test mit echtem Video Pflicht.

**Welle 4 — Geschäft** *(Entscheidung Richard 02.07.: KEIN Stripe — LemonSqueezy
als Merchant of Record [übernimmt MwSt/Rechnungen — guter Fit für Solo-Betrieb];
Konto/Keys: Richard)*
Schritt 1 (ohne Payment, sofort baubar): `accounts.plan` (free/pro) + **manueller
Vollzugriff durch Plattform-Admin** (Admin-UI-Schalter „Pro freischalten" — Richards
Anforderung: Kunden Vollzugriff OHNE LemonSqueezy geben) + Limit-Gating liest nur
`plan` (5 Tutorials free etc.) + Abo-Seite ehrlich. Schritt 2: LemonSqueezy Checkout +
Webhooks setzen denselben `plan` automatisch. · „War das hilfreich?" + events-Tabelle
+ Mini-Insights-Karte im Dashboard.

**Welle 5 — Builder- & Ränder-Politur** *(Opus)*
Schritt-Umordnen · RichText-Links (Editor + Viewer!) · KB-Verlassen-Guard +
beforeunload · „Bild ersetzen"-Nachfrage zu Highlights · Frage-Toggle-Confirm +
Orphan-Hinweis · Drift-Cooldown + Alert-Link · HNSW-Index + (source_type,source_id)-
Index · updated_at-Trigger · Sentry + instrumentation env-Check · GitHub-Action
(build+lint) · E-Mail ändern · Bulk-Löschen/Archiv · Chat-Retry-Button · A11y-Paket
(Chat-Dialog-Rollen, aria-live, Wizard-Fokus, Suchfeld-Label).

**Welle 6 — Wachstum** *(je Feature eigenes Konzept vorab)*
Frage-Lücken-Miner → Script-Bubble → semantische Suche → QR-Codes → Custom Domain →
interne Tutorials + Nachweis → Freigabe-Workflow. Danach: Pipeline-„Danach"-Liste
(Clips, Auto-Redaktion, Import), cacheComponents-Pilot, Redis-Rate-Limit, i18n.

**Bewusst zurückgestellt:** M7 updatePassword-Recovery (Plan liegt in F),
getClaims-Middleware (nur bei Bedarf), Nordstern-Extension (nach Welle 6).

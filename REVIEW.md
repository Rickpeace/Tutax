# Steply — Produkt- & Code-Review (Stand: 01.07.2026 · abgeglichen 23.09.2026)

**Kontext:** MVP in aktiver Entwicklung. Vollständige Findings aus 4 parallelen
Deep-Reviews (Endkunden-Oberfläche, Funnel/Settings, Builder/Authoring,
Plattform/Next.js) + eigene Verifikation. Checkboxen zum Abhaken beim Fixen.
Severity: 🔴 kritisch · 🟠 hoch · 🟡 mittel · ⚪ niedrig.

> Dieses Dokument ist eine **Roadmap, kein Zeugnis** — die glücklichen Pfade sind
> durchweg gut gebaut; fast alles hier ist „letzter Meter" (Ränder, Fehlerfälle,
> Betrieb), nicht Architektur.

## Audit + Bugsuche 23.09.2026 (Branch `audit-2026-09-23`)

Kern-Durchlauf gegen den Produktions-Build + 4 unabhängige Bug-Reviews (Editor, Hilfe-Seite,
Konto/Team/Tarife, Erweiterung) → ~40 verifizierte Befunde, alle unten **behoben** und per
Test belegt (Nachweise: Kern-Durchlauf 10 Phasen, 30 DB-/Logik-Tests, Server-E2E-Serie).

**Sicherheit (behoben):**
- [x] 🔴 Erweiterung: jede Website konnte per `postMessage` die Kopplung auf einen fremden
  Server umbiegen (Aufnahmen/Automationen beim Angreifer) → feste Herkunftsliste + Absender-
  Herkunft von Chrome (`extension/background.js`, v2.19.2; `scripts/test-bridge-origin.mjs`)
- [x] 🔴 Gespeichertes XSS über Extrem-Design-CSS (`</style>`) auf /h, per `?preview=extreme`
  auslösbar → `src/lib/skin-css.ts` (kein `<`, keine Escapes); Design-Farben/Schriften geprüft (`theme.ts`)
- [x] 🔴 Öffentlicher Player bekam ganze Schritt-Zeilen (Seiten-URLs inkl. Query, Selektor-Texte,
  Dateinamen) → `src/lib/public-step.ts`
- [x] 🔴 Logo-Upload löschte beliebige Dateien fremder Konten (Pfad aus DB-Spalte) → `src/lib/storage-path.ts`,
  gleiche Prüfung in tts-core/public-images; Publish kopiert nur noch Bilder des eigenen Kontos
- [x] 🔴 Wissensartikel-Aktionen ohne Konto-Filter (fremden Chatbot-Index löschen/kopieren) → `assistent/wissen/actions.ts`, `kb.ts`
- [x] 🟠 SSRF über HTTP-Weiterleitungen (Theme-Analyse, Video-Import) → `safeFetch` prüft jede Station (33 Fälle)
- [x] 🟠 Open Redirect `/logout?next=/%09/evil.com` → `safeNext` (26 Fälle)
- [x] 🟠 Theme-KI-Routen ohne Rollen-Prüfung/Limit (Kosten) → nur Inhaber/Bearbeiter, 20/h
- [x] 🟡 M7: Passwort ändern ohne altes Passwort / `/reset` in jeder Sitzung → altes Passwort bzw.
  frischer E-Mail-Link (amr „otp“ < 30 min) (`scripts/test-reset-password.mjs`, 8/8)

**Funktion (behoben):**
- [x] 🟠 Fehlertexte aus Server-Actions kamen im Produktions-Build nie an (Next ersetzt geworfene
  Fehler durch englischen Standardtext) → `src/lib/action-error.ts` (`UserError`/`withUserErrors`/
  `unwrap`/`errorText`), 16 Actions + 40 Anzeige-Stellen; Kern-Durchlauf Phase 10 prüft es
- [x] 🟠 Editor: neuer Schritt nach Löschen des letzten unsichtbar · „nach unten“ schob Ast-Schritt
  hinter den Zusammenführungspunkt · Frage löschen schnitt den Rest ab (`src/lib/builder/rewire.ts`)
- [x] 🟡 Editor: Ungespeichertes ohne Warnung weg · Kopf zeigte nach Auto-Entwurf „Veröffentlicht“ ·
  Duplizieren verlor Live-Führungsdaten · „Erneut versuchen“ endlos (Anlegen/Löschen idempotent) ·
  falsche Verwerfen-Abfrage · KI-Texte teilweise gespeichert
- [x] 🟠 Abgeschaltete angepasste Vorlage blieb per URL/Druck/Chat/Sitemap öffentlich · Vorlagen-
  Änderungen erreichten Kunden-Caches nicht · Slug-Kollision eigene Anleitung ↔ Vorlage ·
  Vorlagen wurden nie übersetzt
- [x] 🟡 Player-„Zurück“ sprang hin und her (`src/lib/wizard-history.ts`) · Chat-Blase mit Farbring
  + ohne Sprache auf Kunden-Websites · Kontaktbox nur deutsch · Chat-Verlauf sprach-unabhängig
- [x] 🟡 Org-Wechsel in anderem Tab → Aktionen schrieben still in die falsche Organisation
  (`assertActiveAccount`) · Autopilot-Cron: nur Business, max. 5/Konto, Fehler blockieren nicht
- [x] 🟡 Erweiterung: Tarif-Grenze als „erneut versuchen“ + Doppel-Anleitung bei Retry · Free-Limit
  über Video umgehbar (auch im Worker) · >500 Klicks → alle weg · Läufe ewig „Läuft“ ·
  Zeilen-Grenze bei Schrittzahlen · Wecker nach Trennen · KI-Feinschliff ohne Limit
- [x] ⚪ Datenschutz nennt jetzt Vercel (USA), Hetzner, Resend, ElevenLabs, thum.io, Google Fonts;
  „Organisation verlassen“/„Auf Standard zurücksetzen“ im Steply-Dialog

**Offen — braucht Richard (Entscheidung/Zugang):**
- [ ] 🔴 Impressum/Datenschutz: Betreiber-Angaben · Landing/Footer „DSGVO-konform, Hosting in der EU“
  stimmt so nicht (Vercel + OpenAI USA)
- [x] 🟠 Tarif-Umfang: Chatbot, Logo/CI, Insights, Wissen liefen für Free (pricing.ts sagt Pro) — ✅ 23.09.2026 serverseitig ab Pro
  (Richards Entscheid): Hilfe-Seite (Logo/CI, Chat, „Erstellt mit Steply“ nur Gratis), /api/chat, Wissen/Import,
  Offene Fragen, Kontakt, Logo-Upload/Farben; Tarif-Wechsel im Admin räumt den Hub-Cache (`scripts/test-pro-gates.mjs`, 21/21).
  Bewusst NICHT gesperrt: Sofort-Anleitung per Erweiterung (Standard-Erstellweg, ohne KI)
- [x] 🔴 Gratis nutzt KEINE KI, die Geld kostet (Richards Vorgabe 23.09.2026): zusätzlich gesperrt KI-Suche auf der
  Hilfe-Seite, Chatbot-Index beim Veröffentlichen (Upgrade baut ihn nach: `reindexAccount`), „Texte mit KI verbessern“,
  KI-Feinschliff nach Sofort-Anleitung, „Aktualität prüfen“ + Vorschläge, Anleitung aus Video (Gratis 0, auch im Worker),
  KI-Design-Erzeugung nur Business. UI: „Aus Video“ + Editor-Menü mit „Ab Pro“. `scripts/test-pro-gates.mjs` 27/27.
- [x] 🟡 Chat versprach „Unten finden Sie, wie Sie uns erreichen“ auch bei off_topic, ohne Kontaktbox → Box kommt mit,
  sobald die Antwort darauf verweist und ein Kontakt hinterlegt ist
- [ ] ⚪ KI-Grenzfall: „Grundfreibetrag“ an ein Projekt-Software-Konto wird teils als „unbeantwortet“ statt „fachfremd“ eingestuft
  (`test-chat-topic-e2e`, 23.09.2026 abends stabil so; mittags grün — Code unverändert, Modell-Schwankung)
- [ ] 🟠 Migrationen (Entwurf im Audit-Bericht): Pfad-Wächter für `steps.image_path/audio_path` +
  `themes.*logo_path` (fremde Pfade → signierte URLs), Trigger „letzter Inhaber“ (atomar)
- [ ] 🟡 Rollout: Vercel-Deploy, `deploy.sh` Video-Worker, Erweiterung 2.19.2 neu laden;
  `app.steply.de` erst nach Besitz-Nachweis in die Erweiterungs-Liste
- [ ] ⚪ Chat-Reset + Admin-Komponenten noch mit Browser-`confirm()`; Chat-Bot-Schnellbremse nur pro Instanz

## Abgleich 23.09.2026

Alle 110 bis dahin offenen Checkboxen (Top 5, A–I, Lückenliste) gegen den Code geprüft
(`src/`, `extension/`, `video-worker/`, `supabase/migrations/`). Ergebnis:
**66 erledigt · 24 teilweise/unklar (⏳) · 2 entfallen (➖) · 18 offen.**
Abgehakt wurde nur mit Code-Beleg (Datei steht jeweils am Punkt).

**Wichtigste offene Punkte (schwerste zuerst):**
- 🔴 Impressum + Datenschutz: Betreiber-Angaben weiter „[ANGABE FOLGT]“; Datenschutz nennt
  ElevenLabs, Resend, thum.io, Google Fonts, Hetzner-Video-Server nicht → *Top 5*
- 🔴 Kein Zahlungsanbieter (LemonSqueezy), Upgrade nur von Hand → *Top 5*
- 🟠 Tarif-Versprechen ohne Durchsetzung: KI-Chat/Bubble, Logo/CI, Insights, Video-Limit,
  Autopilot für alle frei; „Erstellt mit Steply“ auch bei Pro/Business sichtbar → *B / Monetarisierung*
- 🟠 Kein Error-Tracking (Sentry/instrumentation) → *D*
- 🟡 M7: /reset setzt Passwort in jeder eingeloggten Session (Übernahme am entsperrten Gerät) → *F*
- 🟡 Drift-Check: DB-Writes ungeprüft, alter Hinweis wird vor dem neuen aufgelöst → *E*
- 🟡 handleAddStep-Fallback hängt Branch mit position 0 an Schritt mit Ausgang → *C / Code-Bugs*
- 🟡 Chat ohne „Erneut versuchen“ → *A / UX*
- 🟡 Onboarding verspricht KI-CI „sobald aktiv“ (ist live, aber nur Business) → *B / Funnel*
- 🟡 „Organisation löschen → Support“ ohne Adresse → *B / Auth + Settings*
- 🟡 Env-Vars ohne Boot-Validierung → *D*
- 🟡 iFrame-Snippet fixe Höhe 700, ohne lazy → *A / Technik*
- 🟡 Kein Text-Werkzeug im Bild-Editor; Schritt-Löschen ohne Rückgängig → *C*
- ⚪ Signierte Bild-URLs im Builder laufen nach 1 h stumm ab → *C / UX-Reibung*
- ⚪ Video-Worker: deploy.sh-Stand unklar; Whisper hart `de` → *F, I*

**Nebenfunde beim Abgleich (neu, noch ohne eigene Checkbox):** `src/components/app/category-jump.tsx`
ist toter Code (nirgends eingebunden) · natives `confirm()` noch in `leave-team.tsx`,
`template-section.tsx`, Admin-Komponenten und Chat-Reset · `src/app/admin/technik/inventory.ts`
beschreibt noch die entfernte Route `/api/steps/suggest` · `rebuildPublicCopy` in
`src/lib/public-images.ts` lädt JPEG/PNG-Quellen mit `contentType: "image/webp"` hoch
(Browser verzeihen das, sauber ist es nicht) · Landing wirbt mit „DSGVO-konform“, obwohl die
Rechtstexte unvollständig sind.

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
Richards Live-Test-Feedback → Welle 32 (s. u.).
**Opus Welle 32 + Fable (06.07.):** 🎯 **Führungs-Feedback-Welle** — Extension
v2.6.0. (A) Eingabe-Schritte: Aufnahme erfasst jetzt auch bei blur-Schritten den
Selektor (Label als text), Resolver prüft Felder gegen label/placeholder/
aria-label/name statt textContent, Weiterschalten bei Enter/blur-mit-Wert
(Checkbox/Select bei change) statt pointerdown. (B) Overlay: Hingucker-Zoom +
Glow-Blitz beim Erscheinen, ruhiger 1,2s-Puls, größeres Badge (Web-Animations-
API). (C) Führen-Liste: Default „Diese Seite + Live", Filter-Chips (session-
persistent), Kategorien-Gruppen; API-Liste liefert category {id,name}|null
(löst auch globale Kategorien auf). (D) Banner nur noch im Anker-Modus;
einheitliche 2-zeilige Treffer-Karten (Kategorie-Chip, Schrittzahl, Status-
Punkt) für „Für diese Seite" + „Führen". (E) Icon-Badge (Koralle, Trefferzahl,
NUR published — Fable-Fix beim Merge) via background-SW + site-match/
importScripts, 5-min-Cache, URLs bleiben lokal. (F) „Bring mich hin": Führung
öffnet bei fremder Seite einen Tab zur page_url von Schritt 1 und bindet sich
daran. Tests grün auf gemergtem Stand (guide-resolve erweitert um Feld-Fälle,
guide-api-live um category, recorder-Regression).
**Opus Welle 51 a/b (22.09.2026, v2.18.1):** 🧩 **KUNDENWÜNSCHE Susann + Max** (aus agent-bridge,
außer Du/Sie + Video-KI): Video-Dialog schließt · echte Unschärfe im Editor/Großansicht (svg-marks)
· fluide Editor-Vorschau · „Link kopieren“ (Slug war schon stabil) · Markierungen in Firmenfarbe
(Standardfarben #ef6a4e/#111827/leer → --brand-accent, highlight-color.ts) · „Bild in neuen Schritt
übernehmen“ (geteilter image_path) · Verpixelung vom Vorgänger als Vorschlag · Einrasten/Zentrieren
· gescheiterte Videos sichtbar (Bibliothek/Glocke/Erweiterung + /api/recorder/video-status) ·
Video-Server: Aufnahmen OHNE Tonspur + ungerade Maße (media.mjs — wirkt erst nach deploy.sh!) · keine
verlorenen Schritte bei schnellen Klicks (Chromium-Kontingent 2/s statt Kappung) · Edge-Hinweis ·
Wissens-Import 12 Unterseiten + Sitemap + eigene Unterseiten. Funde: refreshPublicImage war nie
wirksam (zwei FK steps↔tutorials) → nachträgliche Verpixelung blieb öffentlich lesbar; updateStep
nahm fremde Bildpfade an. Sicherheitsprüfung → public-images.ts (Neuaufbau entfernt Kopie bei
Fehler + wirft, Aufräumen bei Ersetzen/Löschen/Zurückziehen nur wenn kein anderer veröffentlichter
Schritt den Pfad nutzt, Cache-Control 60), SSRF (IPv4-in-IPv6, NAT64, Multicast …), Import liest
gekappt + 60 Entwürfe/h, Upload-IDs UUID. Live-Aufräumen (Richard freigegeben): 6 verwaiste
öffentliche Schritt-Bilder gelöscht, 1 verpixelte Kopie neu eingebrannt. Tests: test-editor-wishes,
-video-failed, -public-images, -ssrf, -kb-import-links, -video-normalize (neu) + alle bisherigen grün.
OFFEN: deploy.sh Video-Server; wackliger test-inpage-advance-e2e (schon vor W51, ~1/3); /h/steply neu.
**Opus Welle 50 a/b/c/d (22.09.2026, v2.18.0):** 🎨 **MAKEOVER EXTENSION + APP** — Richard:
„Extension zu vollgestopft, Liste springt nach 5 s auf; alles stimmig nach Industriestandard.“
Vorgehen: Audit (2 Agenten, Screenshots jedes Bildschirms) → 2 Entwurfs-Artifacts → Freigabe
(„Anleitungen“, Video ins Menü, „Lernen“ → „Schulungen“) → 4 Agenten in Worktrees → Merge →
QA. (a) Erweiterung: Reiter Aufnehmen/Anleitungen/Automationen, EIN „Aufnahme starten“, ?- und
Konto-Menü (Video mit Ton, Steply lernen, Update, Verbinden/Trennen), Bildschirm „Nicht
verbunden“, feste Steuerleiste bei der Aufnahme, Prüfen mit fester Fußleiste, „Auf der Seite
zeigen“ statt führen, Linien-Icons + echte Umlaute; 5-s-Liste: sofort aus chrome.storage
(badgeCache mit Token-fp, auch vom Service-Worker), parallel aktualisiert, Sequenz-Schutz;
Server zählt Schritte ohne selector-jsonb (seitenweise). (b) App-Kopf/Glocken-Popover/Avatar/
Handy-Leiste (+Automationen, „Mehr“)/⌘K aus EINER nav-config; Schulungen; PageHeader; Automations-
Schritte ab 1. (c) Einstellungen mit Seitenleiste (Allgemein, Team, Aussehen, Adresse & Teilen,
Sprachen & Vorlesen, Chat, Steply-Erweiterung, Tarif, Profil) + Weiterleitungen alter Routen,
Speichern-Balken; FEHLER behoben: Standardfarben waren Indigo (Speichern machte Hilfe-Seite
blau) → DEFAULT_BRAND_COLORS warm (keine Datenkorrektur nötig, DB lesend geprüft). (d) Editor-Kopf
(Status-Schalter, „Hilfe-Seite | Nur Team“, „Mit Schulungsnachweis“), gemeinsamer StatusSwitch,
Standard-Anleitungen im Listenstil, ~120 Begriffe app-weit, Wächter test-ui-glossary.
QA-Nacharbeit: saveBranding schreibt nur übergebene Felder (getrennte Formulare überschrieben
sich sonst Name/Adresse), Kontowechsel bei geschlossenem Panel (fp-Pflicht + Cache-Löschen beim
Pairing), Live-Führung bleibt während Hilfe-Seite geschützt, 401 ≠ Netzfehler, Update-Hinweis
auch ohne Verbindung (am ?), Glocke „25+“, fester Screenreader-Name der Schalter. Tests: alle
Extension-Suiten, test-app-shell/-settings/-library-views/-builder-header (echter Login),
test-panel-start-cache (+E2), Build + Lint grün. OFFEN: /h/steply neu einspielen + Screenshots
(steply-help-content.mjs Texte neu, SHOT_ROUTES/Locator in shoot-steply-help.mjs noch alt).
**Opus Welle 49 (21.09.2026):** 📚 **BIBLIOTHEK NEU** — Richard fand die Bibliothek
unübersichtlich; Auswahl per anklickbarer Varianten-Vorschau (Artifact). Umgesetzt: Karte mit
TITEL + Website im Kategorie-Farbfeld (keine Screenshot-Vorschau mehr — sah zufällig aus, half
nicht beim Wiederfinden), nur „Intern" wird markiert (kein „Kunde"-Etikett), EIN Status-Schalter
statt Etikett + Schalter, Umschalter Karten/Liste (localStorage `steply-library-view`), Liste nach
Kategorie gruppiert mit Spalten Website/Schritte/Geändert/Status. Eine Komponente (TutorialCard,
layout card|row) teilt Menü/Dialoge/Aufräum-Modus. page.tsx signiert keine Bild-URLs mehr.
KI-Titel bewusst NICHT (Ersteller benennen selbst). Beweis: test-library-views (echter Login).
Offen: Standard-Anleitungen darunter noch im alten Stil („Auf Hilfe-Seite"-Schalter).
**Opus Welle 48 a/b/c (21.09.2026, v2.17.0):** ⚡ **SOFORT-AUFNAHME VOLLSTÄNDIG** — Richards
Fund: Google-Suche (tippen + Enter) wurde nicht aufgenommen (Feld schon beim Laden fokussiert →
kein focusin; Enter navigiert ohne blur). Daraus Lückenanalyse 1–11 und Umsetzung: (Basis) Feld
beim Start/beim Tippen übernehmen, Enter meldet den Schritt sofort; Vertrag `step.interaction`
{enter, variant right|double|drag|key, key, drop/dropLabel, hover/hoverLabel, frame} +
`selector.shadow`, Migration 0036 (`interaction jsonb` an steps + automation_steps). (a) Panel:
Bereit → Aufnahme starten → Pause/Fortsetzen → Stopp → Prüfen → Erstellen/Weiter/Verwerfen
(vorher: Aufnahme sofort beim Kartenklick, kein Stopp ohne Upload); Popups (opener-Kette) werden
mit aufgenommen, fremde Fenster nicht; Hinweis bei nicht aufnehmbaren Seiten (Ping). (b)
Erfassung: iframes (all_frames, Geometrie per postMessage-Kette nach oben, Panel setzt Tab-URL),
Shadow DOM (composedPath, guide-resolve steigt über `shadow` ab), ARIA-Hover-Menüs, Enter in
Chat-Feldern (contenteditable/textarea: Probe 400 ms, sonst retract), Doppelklick/Ziehen (patch),
Rechtsklick nur bei eigenem Kontextmenü, Tastenkürzel (ohne Textbearbeitung/AltGr), Datei-Drop.
(c) Speichern/Texte/Abspielen: Vorlagen-Texte je Art („Doppelklicken Sie …", „Drücken Sie
Strg+S"), KI-Feinschliff kennt die Art, Führung schaltet auf dem passenden Ereignis weiter
(Hover-Phase zeigt erst den Auslöser), Automation: fill+Enter (Seite schickt selbst ab oder
requestSubmit), contextmenu/dblclick/DnD/Tasten, Hover-Vorlauf, Frame-Filter (nur passender
Frame/nur Hauptfenster antwortet); Chips im Automations-Detail; duplicate/fork/Snapshot tragen
interaction. Nebenfund behoben: role=combobox (Google-Suchfeld) wurde als „select" konvertiert.
Nacharbeit (Haupt-Session): offene Eingabe bei Pause/Stopp wird gemeldet, Chat-textarea-Enter.
Unabhängige QA-Prüfung (Befunde behoben, Beweis test-welle48-review-fixes): gleichartige
Geschwister-iframes (Kartenfelder) → frame.nth, nur EIN Frame führt aus; about:blank-Editor-Frames
abspielbar; Strg+Z auf QWERTZ (key statt code); Enter schickt nur ab, wo ein echtes Enter es täte
(HTML implicit submission); Bedingungen/Sprünge von iframe-Schritten im richtigen Frame;
Seiten-Tastenkürzel ohne Ziel ausführbar (+ bei Konvertierung behalten); Hover-Führung max. 30 s;
Nachträge aus Popups + kurz nach Pause/Stopp angenommen; zweites Enter im selben Feld; kein Hover-
Fehlalarm in per Klick geöffneten Mehrfach-Dropdowns; iframe-Geometrie über PRIVATEN MessageChannel
(rec.nonce) statt offenem postMessage; Schritt-Abfragen scheitern laut statt still „0 Schritte".
**Rollout-Pflicht: Migration 0036 VOR dem Vercel-Deploy** (sonst Lesefehler in Führung/Automationen).
Tests: test-guide-enter, -capture-plus, -flow-panel, -guide-interaction, -exec-interaction-e2e
(neu) + alle bestehenden E2E grün; Build + Lint grün. Grenzen: geschlossene Shadow-Roots, reine
CSS-:hover-Menüs (Automation: ehrlicher Miss), Uploads in iframes, Canvas-Apps.
**Opus Welle 47 + Fable (07.07., v2.16.0):** ↪️ **BEDINGTER SPRUNG / Block-Überspringen**
— Richards Kernbedarf: eine Automation soll ein- UND ausgeloggt laufen. Das per-Schritt-„?"
(Welle 42) reichte nicht, weil jeder Login-Schritt SEINE Login-/Google-Seite als page_url
trägt und der Lauf sich selbst dorthin navigiert, BEVOR die Bedingung greift („SOBALD ICH AUF
DIE SEITE KOMME STEHT DA MEIN NAME"). LÖSUNG: `step.jump = {when:<Bedingung>, to_position:N}` —
der Sprung wird GANZ VORNE in execExecuteCurrent geprüft, VOR execSelectTabForStep und
execNavigateIfNeeded. Eingeloggt → „Anmelden"-Element fehlt (negate) → springt sofort über
den ganzen Login-Block (die Extension navigiert gar nicht erst zur Login-/Google-Seite).
NUR VORWÄRTS (to_position > position, keine Schleife). BEDIENUNG einfach: Häkchen am Schritt
„…überspringen bis Schritt N" + Ziel-Dropdown; der Selektor kommt IMMER vom Server (aus dem
Schritt selbst, nie zum Client exponiert — wie markAutomationStepOptional). Nachträglich an
bestehenden Automationen editierbar. Migration 0035 (`jump jsonb` an steps + automation_steps),
gespiegelt im autonomen Runner (exec-run.js/runner.js). Fable-Nachtrag: Schritt-Bedingungs-
Symbol „?" statt eingekreister „④" (verwirrend) — passt zur Aufnahme-Ansicht. Oneshot:
test-jump-e2e (neu: ausgeloggt→Login läuft / eingeloggt→Block übersprungen, Server-Log ohne
/login-Call); test-automations-live grün gegen Prod-DB (jump 1:1 in Snapshot, API-Auslieferung,
Setzen/Entfernen); alle 11 E2E-Suiten grün.
**Opus Welle 46 + Fable (07.07., v2.15.1):** 🔧 **BUGFIX Lauf hängt nach In-Page-Klick**
— Richards echter Test: Schritt „Konto-Menü öffnen" (Klick öffnet Dropdown IN der Seite,
keine Navigation/kein neuer Tab) → Klick klappte, aber Lauf schaltete nicht weiter
(„merkt nicht, dass er ausgeführt hat"). URSACHE (im echten Browser reproduziert, Fables
Erstverdacht WIDERLEGT): `execSelectTabForStep` (Welle 43) wählte bei einer zweiten
lauf-zugehörigen Tab-Kopie mit gleichem page_url-Pfad den zuletzt fokussierten — den
FALSCHEN — Tab statt des gebundenen sichtbaren → Klick lief ins Leere → Timeout/Miss.
FIX: `pickTabForStep(step, tabs, preferTabId)` — der gebundene Tab gewinnt, wenn er selbst
passt (reiner In-Page-Klick wechselt die Bindung nie); Ergebnis-Zuordnung im Handler
token-autoritativ (Tab-ID nur noch Sicherheitsnetz); gespiegelt im autonomen Runner
(exec-run.js/runner.js). Welle-43-Tab-Folgen (neuer Tab/OAuth-Popup/Rückkehr) intakt —
bei echtem Wechsel ist der gebundene Tab kein Kandidat, Token trägt die Eindeutigkeit.
Oneshot: test-inpage-advance-e2e (neu, VORHER rot/NACHHER grün, A/B/C); alle 11 E2E-
Suiten grün. Agent widerlegte den Fable-Verdacht selbst (prüfen statt übernehmen).
**Opus Welle 45 + Fable-Hotfix v2.14.1 (07.07., v2.15.0):** 👁️ **SICHTBARE ELEMENTE
BEVORZUGEN** — aus Richards echtem Test. v2.14.1: Bedingungs-Prüfung (steply-eval-
condition) streng auf confidence exact/text — Fuzzy/healed täuschten „Element
vorhanden" vor (WeTransfer klickte „Anmelden" trotz eingeloggt). Welle 45: der
Resolver bekam ein OPTIONALES `opts.isVisible(el)`-Prädikat (content.js liefert
getBoundingClientRect>0); Stufe 2/3 bevorzugen sichtbare Kandidaten, Stufe 1 lässt
einen unsichtbaren css-Einzeltreffer los, wenn ein sichtbarer Text-Zwilling
existiert → löst „target-hidden" bei unsichtbaren Duplikaten (Steply-Signup:
„Anmelden" im eingeklappten Mobil-Menü statt des sichtbaren Links). Voll
rückwärtskompatibel (ohne opts byte-identisch); Resolver bleibt PUR (Prädikat
injiziert). Keine Härtung aufgeweicht (W32/33/43/44 intakt). Bewiesen: DOM-Stub
(+12 Fälle) + echtes Chromium (test-guide-visible-e2e: display:none-Duplikat real
0×0, vorher target-hidden → nachher sichtbarer gewählt). Alle 10 E2E-Suiten grün.
Agent befolgte NEUE AGENTS.md-Regel (finale Prozessliste, nichts verwaist).
**Opus Welle 44 + Fable (07.07., v2.14.0):** 🩹 **SELBSTHEILUNG STUFE A (ohne KI)** —
aus Richards Test (Knopf „…(v2.13.0)" → live „…(v2.13.1)", weil Fable die Version im
Knopf-Text hatte): Resolver akzeptiert einen css-Treffer bei rein VOLATILER Text-Drift
(Versionsnummer/Datum/Uhrzeit/Zähler) als `confidence:'healed'` — aber NUR unter 5
strengen Bedingungen: (1) css nicht flüchtig, (2) css eindeutig (querySelectorAll==1),
(3) Rolle stimmt, (4) `nearText` (beide Texte nach stripVolatileTokens gleich),
(5) Rest ≥3 sichtbare Zeichen. Keine frühere Härtung (W32 Mindestlänge, W33 volatile
IDs, W43 innerText) aufgeweicht; echter Textwechsel (Speichern/Löschen), mehrdeutiger/
flüchtiger css, Rollenwechsel → NICHT geheilt (fallen zu Stufe 2/3). Kein App-/Server-/
Migration-Change. Bewiesen: DOM-Stub (62 Assertions, 42 alt grün + 20 neu) + echtes
Chromium-DOM (test-guide-heal-e2e, ausgelieferte guide-resolve.js verbatim geladen,
echte querySelectorAll-Eindeutigkeit). Fable-Nebenfix: /extension-Download-Knopf ohne
Version im Text (driftete pro Release); markAutomationStepOptional (Schritt nachträglich
„nur wenn vorhanden" im Automations-Detail, ohne Neuaufnahme). Alle 8 E2E-Suiten grün.
Geplant: Stufe B (KI-Fallback, opt-in) wenn selbst der stabile css bricht.
**Opus Welle 43 + Fable (07.07., v2.13.1):** 🪟 **TAB-/FENSTER-FOLGEN** — aus
Richards ERSTEM ECHTEN Test (WeTransfer + „Über Google anmelden"-Popup): zwei reale
Bugs, dieselbe Wurzel (Lauf starr an EINEN Tab gebunden). Fix: Lauf/Führung
verfolgen lauf-zugehörige Tabs (background.js je Port-Session, onCreated-openerTabId-
Kette fängt target=_blank UND window.open-Popups); vor jedem Schritt wählt
`pickTabForStep` (pure, getestet) den Tab, dessen URL zur page_url passt →
**rebind + AKTIVIEREN** (tabs.update active + windows.update focused); frisch
geöffnete Fenster bekommen Ladezeit; Popup schließt sich → Rückkehr zum Opener
(onRemoved). Reihenfolge: Tab-Auswahl VOR Navigation/Zustand(W40)/Bedingung(W42),
konsolidiert mit execHandleUnexpectedNav (ein Pfad). Autonomer Runner + Führung
gleich. ZUSATZ-Bug gefunden: Google-Kontowähler „text-mismatch", weil Aufnahme
innerText (Block-Umbrüche) erfasst, Resolver aber textContent verglich (Name+E-Mail
klebten zusammen) → Resolver bevorzugt jetzt innerText (Fuzzy-Grenzen unverändert).
Oneshot: test-tab-follow-e2e (geladene Extension, Testsite öffnet echt neuen Tab +
Popup-Fenster + Selbst-Schluss) 3/3 grün (Tab aktiviert, Popup fokussiert+geklickt,
Rückkehr zum Opener); alle Regressions-E2E (W38–W42) grün. Additiv: Single-Tab-Läufe
unverändert. **Erkenntnis: ein echter Test deckte mehr auf als 12 synthetische Wellen.**
**Opus Welle 42 + Fable (07.07., v2.13.0):** 🍪 **BEDINGTE SCHRITTE** — Richards
Vereinheitlichung: Cookie-Banner-Ja/Nein ist dieselbe Logik wie die Tutorial-
Verzweigungen, nur beantwortet die MASCHINE die Frage (Element da? URL passt?)
statt der Mensch per Klick. Migration 0034 (steps/automation_steps.condition).
Ein Schritt mit `condition {kind:element,selector|kind:url,pattern, negate?}` läuft
NUR bei Erfüllung, sonst nahtloser Skip (keine Pause) — deckt den unbeaufsichtigten
Fall ab (Cookie-Banner/optionale Dialoge/„Sitzung abgelaufen"). Pure Auswertung in
exec-plan.js (parseCondition/evalUrlCondition/shouldRunStep = EINZIGE negate-
Autorität); Element-Check via content.js `steply-eval-condition` (sichtbar +
300ms-Gnadenfrist). BEIDE Motoren (panel.js manuell + exec-run.js autonom) werten
aus. Auswert-Reihenfolge Navigation→Zustand(W40)→Bedingung→Ausführung (Bedingung
nur bei W40-proceed). Aufnahme: „?"-Toggle je Schritt; Builder: Bedingungs-Feld je
Schritt (Mensch ignoriert, Automation nutzt); App-Detail: Chip „⓸ nur wenn"
+ „immer ausführen"-Toggle. ADDITIV: kein condition → heutiges Verhalten exakt.
Randfall: bedingter Download übersprungen + später gebraucht → ehrliche Pause
(skipCrossesNeededDownload). Oneshot: test-conditional-e2e (Testsite mit/ohne
Banner, geladene Extension) — Banner da → geklickt (Server-Log), Banner weg →
sauber übersprungen; + autonomer Motor + negate/url pur. Alle Regressions-E2E
(W38–W41) grün. MVP = linearer „nur-wenn"-Fall; voller Zwei-Wege-Baum für
Automationen (Graph-Modell) bleibt geparkt.
**Opus Welle 41 + Fable (07.07., v2.12.0):** ⏰ **ZEITPLAN (Stufe 2)** — Automationen
laufen wiederkehrend von selbst („jeden Montag 08:00", „am 3. des Monats") via
chrome.alarms IM Browser des Nutzers (Rechner an + Chrome offen — KEIN Server-Cron,
das wäre Stufe 3). Migration 0033 (automations.schedule + automation_runs.trigger).
App: „⏰ Zeitplan"-Abschnitt (Frequenz/Tag/Uhrzeit + Klartext-Vorschau + prominente
Ehrlichkeits-Hinweise); Historie mit „⏰ geplant"/„▶ manuell"-Chip. Extension
(permissions += alarms/notifications): Sync-Wecker holt Zeitpläne + setzt
`steply-run:<id>` auf nextFireTime (pure, getestet: Schaltjahr/Monatsende/tz);
onAlarm → **Runner-Tab** (`runner.html`/`runner.js` + geteilter DOM-freier Motor
`exec-run.js`) führt den Lauf AUTONOM aus — `panel.js` NULL angefasst (manuelle
Läufe unberührt). Zwei Ehrlichkeits-Wächter: geplanter Lauf startet nur mit allen
required-Werten lokal gemerkt (sonst failed/„werte-fehlen" + Notification), und
Belegt-Schutz (kein zweiter Lauf im Tab-Chaos). Fertig-Meldung je Lauf. Autonome
Semantik: Miss/fremde Anmeldung/unerwartete Seite ⇒ ehrlicher Abbruch (kein
Warten-auf-Menschen). Oneshot: test-schedule-e2e.mjs (geladene Extension, realer
onAlarm → Runner → content.js im Ziel-Tab → Server-Log; autonomer Login-Lauf
success/scheduled; werte-fehlen-Skip; Recompute/Doppel-Fire) 3× grün + nextFireTime-
Unit; alle Regressions-E2E (Datei-Brücke/Zustands-Intelligenz/Login-Repro) grün.
Grenze (ehrlich): Datei-Brücke autonom nur über Speicher-Weg (Disk/Mensch nachts
nicht bedienbar → Abbruch). Push erst NACH Migration 0033 (sonst 500 auf Detail).
**Opus Welle 40 + Fable (07.07., v2.11.0):** 🧠 **ZUSTANDS-INTELLIGENZ** — Läufe
und Führungen kommen mit dem Anmelde-Zustand klar (Richards Konvention: Aufnahme
ab Basis-Seite INKL. Login). (1) **Vorspulen**: leitet die Website um (= schon
angemeldet), springt der Lauf zum ersten Schritt, dessen page_url zur gelandeten
Seite passt — Anzeige als beantworteter Knoten „Angemeldet? → Ja ✓ — Schritte
2–4 übersprungen" (Richards Baum-Metapher); nur vorwärts; Server-Log-Beweis:
übersprungene Login-Schritte werden NIE ausgeführt (kein POST /login). Datei-
Kohärenz: Skip über einen gebrauchten Download → ehrliche Pause. (2) **Anmelde-
Wache**: fremde Login-Seite (URL-Heuristik + Passwortfeld-Probe) → Phase
waiting-login „🔐 Bitte kurz anmelden — es geht automatisch weiter", ohne
Timeout, auto-Fortsetzung via tabs-Wächter; tippt NIE selbst Zugangsdaten.
(3) Führung: Wache identisch; Vorspulen nur bei LINEAREN Tutorials. Pure Helfer
resyncTarget/looksLikeLoginUrl/skipCrossesNeededDownload/skipCrossesLogin in
exec-plan.js (getestet). Wechselwirkungen explizit verifiziert: W38-Submit-
Kontrolle hat Vorrang (verifying-Sperre), W39-file-bridge-E2E + repro-login
weiter grün, Hydration-Sonde unangetastet. Oneshot-Beweis: test-state-
intelligence-e2e.mjs (geladene Extension, node:http-Login-Site mit echten
Session-Cookies) 5/5 grün. Geparkt (TODO): Bedingte Verzweigungen für
Automationen = Verallgemeinerung dieses Musters auf beliebige Ja/Nein-Knoten.
**Opus Welle 39 + Fable (07.07., v2.10.0):** 🌉 **DATEI-BRÜCKE** — Automationen
reichen eine Datei von Website A (Download) nach Website B (Upload) durch, komplett
LOKAL im Browser (Kanzlei-Kernfall: Abrechnungsportal → DATEV Unternehmen online;
validiert durch Richards Steuerberater; Nische à la GetMyInvoices, aber „selbst
aufnehmen statt auf Konnektoren warten"). Migration 0032 (steps/automation_steps
.file_meta + upload-Aktion, Richard angewandt). Aufnahme erkennt Downloads
(chrome.downloads-Watch, nur Metadaten — nie URLs persistiert) und Uploads (change
an input[type=file]; „Datei wählen"-Klick wird in den Upload-Schritt GEFALTET, da
der OS-Dialog beim Lauf übersprungen wird). Konvertierung: linkFileSteps (FIFO
file1/file2, Upload ohne Download → sprechender Fehler); 📥/📤-Chips im App-Detail.
Lauf: 3-Wege-Brücke — (1) Speicher-Refetch mit Site-Cookies + downloads.cancel/
erase, (2) file://-Disk-Fallback nur mit Datei-Zugriffs-Schalter, (3) ehrliche
Miss-Pause; 50-MB-Deckel, >8-MB-Chunk-Transport, Datei-Chip im Panel, exec.files
bei JEDEM Lauf-Ende gelöscht — Bytes verlassen NIE den Browser (einziger neuer
fetch: file:///, geprüft). Injektion: DataTransfer in file-inputs (auch verdeckte:
Maus zielt aufs sichtbare Label) + Drag-Events für Drop-Zonen. **ONESHOT-Beweis:**
test-file-bridge-e2e.mjs — echte Extension in Playwright-Chromium, zwei node:http-
Mini-Sites, 13/13 grün inkl. HASH-Asserts (Byte-Treue file-input UND Drop-Zone),
Weg-1/2/3-Verhalten, Deckel/Chunks; Randfälle vom Agenten selbst gefunden
(0×0-Guard vs. verdeckte Inputs, roleFor-Falle file-input→fill). Live-Tests +
Regressionen grün. Offen (dokumentiert): Cross-Origin-Refetch fällt auf Weg 2/3;
reine JS-Drop-Zonen ohne input werden bei der AUFNAHME nicht erkannt.
**Opus Welle 38 + Fable-Hotfixes v2.9.3–v2.9.7 (06.07. abends):** 🐉 **Kaltstart-Login
erlegt (mit Beweis).** Hotfix-Kette: v2.9.3/4 Settle-Pause nach Navigationen +
Bühne räumt sich nach erledigtem Schritt selbst (Marker/Maus weg in Halbautomatik-
Pausen) · v2.9.5 Navigations-Warten ohne tabs.get-Frühstart (Schritt lief sonst auf
der sterbenden Seite ins Timeout) · v2.9.6 Hydration-SONDE (MAIN-World-Probe via
background: Submit erst, wenn React das Formular übernommen hat). Welle 38 fand
per Drossel-Repro (CDP: CPU 8–20×, Fast-3G, Cache aus; scripts/repro-login-
coldstart.mjs, deterministisch: Submit vor Hydration = nativer Voll-Reload) die
DREI Restlücken: 8s-Deckel < echte Kaltstart-Hydration (bis 14s), isReact-Erkennung
fragil (data-reactroot existiert in React 19 nicht; window.next kommt ~2,5s spät;
NEU script[src*="/_next/"] steht nach ~50ms), und kalter MV3-Service-Worker nach
Browser-NEUSTART → Sonde ok:false → offener Durchfall (Richards Trigger!). Fixes:
Deckel 12s, /_next/-Signal, kein offener Durchfall auf Framework-Seiten. Dazu
**Submit-Ehrlichkeits-Kontrolle**: exec-Ergebnis meldet submitted, Panel verifiziert
(eigenes 10s-Budget) Pfadwechsel vs. Voll-Reload-auf-selben-Pfad → Miss-Pause
„submit-bounced" statt blindem Weiterstapfen; pure submitOutcome/submitBounced in
exec-plan.js (+14 Tests). Richards Netzwerk-Mitschnitt lieferte zusätzlich den
Beweis eines zweiten Fehlmodus (Session gesetzt, Redirect nie angewandt, KEIN
Reload) — von der gehärteten Sonde mit abgedeckt. Repro 3× stabil grün, Welle-37-
Repro regressionsfrei, Build/Pure-Tests grün.
Richards erstem echten Lauf („Steply anmelden" — funktioniert!): (1) Submit-Buttons
in Formularen werden per `form.requestSubmit(button)` ausgelöst statt roher
Klick-Sequenz — schließt den Voll-Reload-Pfad aus, der den Login-Hänger erklärt
(Playwright-Repro `scripts/repro-login-exec.mjs`: Fehlerklasse belegt, Fix → /app,
Gegenprobe Nicht-Submit ok; exakter Live-Auslöser lokal nicht reproduzierbar,
Härtung greift kategorisch). (2) Start-Navigation vergleicht Host+PFAD
(needsNavigation auf Schritt 1): gleicher Host → tabs.update im gebundenen Tab,
fremd → neuer Tab. (3) Maus ruhiger: EXEC_CURSOR_TRAVEL_MS 750 + DWELL 250.
(4) Referenzbilder MIT Markierungen: Migration 0031 (automation_steps.highlights,
von Richard angewandt), Snapshot kopiert 1:1, API liefert, App-Detail +
Extension-Miss-Ansicht rendern Overlay pixelgenau (shrink-wrap statt
object-contain; App-Overlay per Wegwerf-Playwright-E2E bestätigt). Bestands-
Automationen: highlights=null → kein Overlay; einmal neu konvertieren. Tests grün:
repro-login-exec, test-automations-live (erweitert, gegen Live-DB), exec-plan +
guide-resolve-Regression, Build/Lint.
**Opus Wellen 36a+36b + Fable (06.07., v2.9.0):** ⚙️ **AUTOMATIONEN (Stufe 1)** —
dritte Produkt-Ebene (Helpdesk · internes Wissen · Automationen): aufgezeichnete
Abläufe, die die Extension AUSFÜHRT. Migration 0030 (automations/steps/runs + RLS;
Parameter-DEFINITIONEN serverseitig, WERTE nie). Konvertierung aus Sofort-Aufnahme
(lib/automations.ts: linearer Pfad, Verzweigung → Fehler, Hinweis-Schritte
übersprungen, fill/select→Parameter mit secret-Erkennung); App-Bereich
/app/automationen (Liste, Detail mit Parameter-Tabelle + Lauf-Historie,
Karten-Menü „Als Automation nutzen"); Token-APIs automations(+/[id]) +
automation-runs. Extension: Karte „⚙️ Automationen" (nur gepairt) →
Parameter-Formular (Secrets als password, „Im Browser merken" opt-in, Werte NUR
in chrome.storage.local, redactDetail-Schwärzung) → Lauf mit ANIMIERTER MAUS
(Koralle-Cursor + Klick-Puls), React-sicherem fill (nativer value-Setter +
input/change), Halbautomatik-DEFAULT, Vollautomatik opt-in, Miss = PAUSE (nie
raten), Port „steply-exec" räumt bei Panel-Schließen ab, Download-Hinweis.
Geplant: Stufe 2 Zeitplan (chrome.alarms), Stufe 3 dynamische Quellen (params
haben dafür schon `source`). Tests grün: exec-plan (pure, neu), Kern-Logik-Mock
(20 Assertions), Build/Lint, recorder/resolve/site-match-Regression;
test-automations-live wartet auf Migration 0030 (Preflight-Skip).
**Opus Welle 35 + Fable (06.07., v2.8.0):** 🎓 **„Steply lernen" für ALLE Kunden** —
öffentliche Doku-API (`/api/guide/steply` Liste + `/[slug]` Detail: hart aufs
Steply-Doku-Konto verdrahtet, NUR published+public, publicImageUrl statt Signatur,
kein Auth, 'use cache' hours + Tags; Tiptap→HTML in geteiltes `lib/guide-payload.ts`,
Recorder-Detail-Route nutzt es mit). Extension: Start-Karte + Führen-Gruppe
„🎓 Steply lernen" (auch OHNE Pairing — Onboarding direkt nach Installation),
Doku-Touren im „Für diese Seite"-Matching + Icon-Badge (id-Dedupe bei
Steply-Pairing), guide-events nur mit Token, kein „Bring mich hin" bei Doku-Touren.
Fable-Fix beim Merge: DEFAULT_APP_URL/BADGE_DEFAULT_APP_URL zeigten auf
app.steply.de (403, Domain nicht verdrahtet) → tutax-ivory.vercel.app, Kommentar
für den Domain-Umzug. **Doku-Markierungen nachgeschärft:** 8 Hand-Markierungen
(patch-steply-highlights.mjs, idempotent), 13 bewusst `highlight:null`
(Extension-Panel/Overlay nicht im Screenshot) — 30→38 von 51 markiert. Tests grün:
test-guide-steply-live (24, neu; Entwurf taucht NIE auf), recorder/resolve/
site-match-Regression, Build.
**Opus Welle 34 + Fable (06.07.):** 📚 **Steply-Selbst-Doku KOMPLETT NEU + FÜHRBAR**
(/h/steply): 9 Anleitungen/51 Schritte, frische Warm-Design-Screenshots (Playwright-
Pipeline v3), erstmals mit `selector`/`page_url`/`site_domains` je Schritt → die Doku
ist per Extension LIVE FÜHRBAR (Dogfooding; site_domains=tutax-ivory.vercel.app).
Sofort-Anleitung als Standard auf Position 2 (Richards Direktive; auch im Neue-
Anleitung-Dialog jetzt zuerst + „Empfohlen"-Chip). Neue Skripte: steply-help-content
(geteilte Quelle), delete-steply-help (nur Steply-Konto, ID-Log); getCatalog sortiert
jetzt deterministisch (created_at). ElevenLabs-Audio (Helmut Clark) für alle 51 Schritte.
⚠️ **INCIDENT 06.07.:** Nach der Welle fehlten die 6 globalen DATEV-Templates + die
komplette account_templates-Tabelle. Aufklärung: KEIN Skript verantwortlich (alle
Löschungen id-/konto-scoped, Agent-Verlauf geprüft); wahrscheinlichste Ursache ist ein
(Bulk-)Löschen in der Bibliothek durch den Plattform-Admin-Login — die RLS-Policy
„admin manage template tutorials" erlaubte deleteTutorial auch auf Templates.
BEHOBEN: Templates via seed-datev.mjs --templates wiederhergestellt (test-templates-live
grün); deleteTutorial jetzt hart aufs eigene Konto gescopt (Vorlagen löscht nur noch
/admin/deleteTemplate). OFFEN: account_templates-Häkchen (welche Konten Templates
aktiviert hatten) müssen einmal neu gesetzt werden (Dashboard → Standard-Anleitungen).
**Fable-Hotfix v2.6.1 + Opus Welle 33 (06.07., v2.7.0):** 🔧 **Führungs-Bugfixes**
nach Richards zweiter Test-Runde. Hotfix: globales `[hidden]{display:none
!important}` in styles.css — `.target-banner{display:flex}` überstimmte das
hidden-Attribut, das „Aufnahme für:"-Banner klebte IMMER sichtbar (leer) und
„Ziel verwerfen" wirkte tot; gleiche Falle latent in 3 weiteren Panel-Bereichen.
Welle 33: (1) Panel-Screenshot-Markierungen pixelgenau (aspect-ratio-Frame
`--run-ar` statt object-fit-Letterbox; Beweis scripts/test-run-geometry.mjs);
(2) Overlay-Lifecycle — Führungs-Port Panel↔SW (onDisconnect → hide an Tab),
20s-Ping/60s-Watchdog im content.js, Ziel weg → Overlay sofort verstecken statt
bei 0,0 kleben; (3) Element-Suche 5s mit MutationObserver + `reason` im
Fallback-Hinweis („… nicht zu finden (timeout)"); (4) Banner-Härtung
(target-banner.js, nur bei echtem Ziel, Selbstheilung kaputter Storage-Objekte,
Init-try/catch); (5) **flüchtige IDs** (DB-Diagnose: Base UI vergibt je Render
neue `#base-ui-_r_*`-IDs!) — Aufnahme wählt nur noch stabile Anker
(isVolatileId geteilt), Resolver springt bei toten Wegwerf-ID-css direkt zur
role+Text-Suche (reason "volatile-id"). Tests grün: guide-resolve (erweitert),
target-banner (neu), run-geometry (neu), Build.
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
  — ⏳ teilweise: OpenAI/Drittland/DPF-Passus steht (`src/app/datenschutz/page.tsx` §5), aber
  `src/app/impressum/page.tsx` + Datenschutz §1 haben weiter „[ANGABE FOLGT — Betreiber …]“;
  Datenschutz nennt ElevenLabs, Resend, thum.io, Google Fonts und den Hetzner-Video-Server nicht
  (Admin-Inventar `src/app/admin/technik/inventory.ts` listet sie selbst als US-Übermittlung).
- [ ] 🔴 **Kein Billing, keine Limit-Durchsetzung** — kein Stripe, Upgrade-Buttons
  disabled, „Preise sind Platzhalter" für Kunden sichtbar (`abo/page.tsx:64-79`);
  Free-Limits (5 Tutorials, Branding) nirgends enforced (`createTutorial` ohne Limit).
  → Stripe Checkout + Portal; Limits gaten; Preise auf die Landing.
  — ⏳ teilweise: Tarife + Gates da (`src/lib/plan.ts`, Free-Limit in `src/app/app/actions.ts`,
  `guide-complete`, `insights-actions.ts`; Preise auf Landing; Platzhalter-Fußnote weg). Fehlt:
  Zahlungsanbieter (LemonSqueezy) — Knöpfe „Bald buchbar“ disabled (`settings/tarif/page.tsx`).
- [x] 🟠 ~~Kein error.tsx/not-found.tsx/global-error.tsx~~ **GEFIXT (02.07., Opus/W1):**
  alle drei, deutsch + gebrandet; /h/gibtsnicht liefert deutsche 404 (curl-verifiziert).
- [x] 🟠 ~~Publish-Moment verpufft~~ **GEFIXT (02.07., Opus/W1):** Erfolgs-Toast
  „Veröffentlicht! 🎉" mit „Live ansehen"-Action + URL; Unpublish-Bestätigung.

---

## A. Endkunden-Oberfläche (/h)

### UX
- [x] 🟠 `wizard.tsx:34-51` Kein Fortschritt („Schritt 3 von 8") + kompletter
  Zustandsverlust bei Reload/Zurück → Position in sessionStorage oder `?step=`.
  — ✅ erledigt (Beleg: `src/components/viewer/wizard.tsx`, „Schritt {n} von {total}“ + Balken
  bei linearen Anleitungen, Position/Verlauf in sessionStorage)
- [x] 🟡 `hub-browser.tsx:55-60` Leere Suche = Sackgasse → CTA „Fragen Sie den
  Hilfe-Assistenten" (Chat öffnen) + Reset-Button.
  — ✅ erledigt (Beleg: `src/components/viewer/hub-browser.tsx`, Reset-Knopf + „Meinten Sie“ +
  Hinweis auf den Assistenten unten rechts)
- [ ] 🟡 `chat-widget.tsx:151` Fehlerblase ohne „Erneut versuchen"; Nutzer-Frage ist
  weg (Input vor fetch geleert) → Retry-Button, der die letzte Frage erneut sendet.
  — ⏳ teilweise: Frage bleibt als Blase sichtbar, aber es gibt weiter keinen „Erneut
  versuchen“-Knopf (`src/components/viewer/chat-widget.tsx`, catch → nur `chatError`)
- [x] ⚪ `hub-browser.tsx:27-32` Suche matcht nur Titel+Beschreibung, nicht
  Schritt-Inhalte → serverseitige Suche (FTS/pgvector existiert fürs RAG).
  — ✅ erledigt (Beleg: `src/app/api/hub-search/route.ts` pgvector-Fallback bei 0 Titel-Treffern;
  lokal zusätzlich Kategorienamen)

### Mobile + Accessibility
- [x] 🟠 `chat-widget.tsx:159-169` Kein Fokus-Management: kein role="dialog"/
  aria-modal, kein Autofokus, kein Esc, kein aria-expanded → für Tastatur/Screenreader
  unbenutzbar.
  — ✅ erledigt (Beleg: `src/components/viewer/chat-widget.tsx`, role="dialog", aria-expanded,
  Autofokus Eingabe, Esc schließt)
- [x] 🟠 `chat-widget.tsx:188` Kein aria-live → gestreamte Antworten für Screenreader
  stumm (polite-Wrapper, ggf. erst nach done announce).
  — ✅ erledigt (Beleg: `chat-widget.tsx`, sr-only role="status" aria-live="polite", Ansage nach Abschluss)
- [x] 🟠 `theme.ts:89` + `wizard.tsx:101-109` **Keine Kontrastprüfung** für
  Kundenfarben: brand-accent ungeprüft als Button-BG mit weißem Text UND als Text auf
  Weiß → helles Kanzlei-Gelb = unlesbar. → Luminanz prüfen, `--brand-accent-contrast`
  ableiten, zu helle Accents für Text abdunkeln.
  — ✅ erledigt (Beleg: `src/lib/theme.ts`, `--brand-accent-fg` + `--brand-accent-strong` per Luminanz)
- [x] 🟠 `wizard.tsx:37-40` Schrittwechsel ohne Fokus-/Announce-Management, kein
  Scroll-to-top → Fokus auf Schritt-Überschrift setzen (tabIndex=-1 + focus()).
  — ✅ erledigt (Beleg: `wizard.tsx`, Titel tabIndex=-1 + focus() bei jedem Schrittwechsel)
- [x] 🟡 `viewer-image.tsx:36` Screenshot immer `alt=""`, obwohl Kerninhalt →
  mind. `alt={step.title}`, besser Alt-Feld im Editor.
  — ✅ erledigt (Beleg: `wizard.tsx` übergibt `alt={step.title}`; eigenes Alt-Feld im Editor gibt es nicht)
- [x] 🟡 `chat-widget.tsx:169` `h-[30rem]` fix + bottom-24 → auf iPhone SE Header
  abgeschnitten, iOS-Tastatur verdeckt Input → `h-[min(30rem,calc(100dvh-7rem))]`.
  — ✅ erledigt (Beleg: `chat-widget.tsx`, `max-h-[min(30rem,calc(100dvh-7rem))]`)
- [ ] 🟡 `hub-browser.tsx:47-52` Suchfeld ohne aria-label/type="search"; Trefferzahl
  nicht announced → aria-label + role="status"-Zeile.
  — ⏳ teilweise: `type="search"` + aria-label da (`hub-browser.tsx`); Trefferzahl wird weiter
  nicht per role="status" angesagt
- [x] ⚪ `chat-widget.tsx:177-184` „Neu"-Button ~24px Touch-Ziel + löscht ohne
  Rückfrage → größer + Bestätigung.
  — ✅ erledigt (Beleg: `chat-widget.tsx`, größerer Knopf px-2.5 py-2 + Rückfrage vor dem Löschen)
- [x] ⚪ `chat-widget.tsx:198-200` Enter ohne isComposing-Check (IME).
  — ✅ erledigt (Beleg: `chat-widget.tsx`, `!e.nativeEvent.isComposing`)

### Technik (SEO / iFrame / Performance)
- [x] 🟠 `h/*/page.tsx` Metadata nur `title`: keine description, kein openGraph/
  og:image, kein metadataBase → keine Link-Preview beim Kern-Usecase „Link per
  WhatsApp/Mail teilen". Kanzlei-Logo existiert bereits → nutzen. Zudem
  robots-Strategie: /h indexierbar, /app noindex.
  — ✅ erledigt (Beleg: `generateMetadata` mit description/openGraph/Logo in
  `src/app/h/[account_slug]/page.tsx` + Tutorial-Seite; `metadataBase` in `src/app/layout.tsx`;
  `src/app/robots.ts` sperrt /app, /admin, /api)
- [ ] 🟡 `einbetten/page.tsx:12` iFrame-Snippet mit fixer height=700 →
  Scrollbalken-im-Scrollbalken; kein loading="lazy" → postMessage-Auto-Höhe oder
  mind. Hinweis + lazy. (Positiv: Framing funktioniert, localStorage im iFrame ok.)
- [x] 🟡 `viewer-image.tsx:36` + `wizard.tsx:67-69` `<img>` ohne width/height →
  Layout-Shift bei jedem Schritt; `image_width/height` liegen in der DB → durchreichen,
  aspect-ratio setzen.
  — ✅ erledigt (Beleg: `src/components/viewer/viewer-image.tsx`, aspect-ratio aus DB-Maßen + loading="lazy")
- [ ] 🟡 `public-image.ts:4-6` Originale ungedrosselt aufs Handy → Supabase
  Image-Transform (`?width=800`) oder vorskalierte Varianten.
- [x] ⚪ `h/*/page.tsx` Google-Fonts-<link> ohne preconnect zu fonts.gstatic.com und
  ohne precedence → FOUT. → preconnect ergänzen.
  — ✅ erledigt (Beleg: preconnect in allen vier /h-Seiten, z. B. `src/app/h/[account_slug]/page.tsx`;
  Achtung: Google Fonts live eingebunden = DSGVO-Thema, s. Admin-Inventar „selbst hosten“)

### Fehlende Features (Endkunde)
- [x] 🟡 **„War das hilfreich? 👍/👎"** am Fertig-Screen — geringster Aufwand,
  zugleich erstes Nutzungssignal für die Kanzlei (Analytics-Grundstein).
  — ✅ erledigt (Beleg: `wizard.tsx` sendFeedback → events, Migration 0018)
- [x] 🟡 Druck-/PDF-Ansicht (alle Schritte untereinander) — Zielgruppe druckt.
  — ✅ erledigt (Beleg: `src/app/h/[account_slug]/[tutorial_slug]/drucken/page.tsx`)
- [ ] ⚪ Schriftgrößen-Option; Video/GIF pro Schritt; i18n (alles hart deutsch).
  — ⏳ teilweise: i18n erledigt (EN/PL/TR, `src/lib/i18n-hub.ts`); Schriftgrößen-Option und
  Video/GIF pro Schritt fehlen

---

## B. Funnel / Monetarisierung / Marketing / Settings

### Funnel
- [ ] 🟡 `onboarding-wizard.tsx:81-86` Wizard verspricht KI-CI „sobald aktiv",
  Feature ist aber live → im Onboarding direkt aus der eingegebenen Website anstoßen
  (Wow-Moment).
- [x] ⚪ `onboarding/actions.ts:33` Onboarding unwiederholbar → „Einrichtung erneut
  zeigen"-Link in Settings.
  — ✅ erledigt (Beleg: `src/app/app/settings/allgemein/page.tsx` „Einrichtung erneut zeigen“ →
  `reopenOnboarding` in `settings/konto/actions.ts`)
- [ ] ⚪ `app/page.tsx:114-126` Empty-State ohne Fortschritts-Checkliste (die 7
  Schritte aus /anleitung existieren schon als Text).

### Monetarisierung
- [ ] 🟠 Free-Limits enforce'n: `createTutorial` ohne Limit, Chatbot/KI-CI/Logo für
  alle frei, „powered by Steply" für alle → ohne Gating kein Upgrade-Motiv.
  — ⏳ teilweise: gegatet sind 5-Anleitungen-Limit, KI-CI, Sprachen, Vorlesen, Intern, Team-Größe
  (`src/lib/plan.ts`, `src/app/app/actions.ts`, `settings/branding/actions.ts`). NICHT gegatet,
  obwohl `src/lib/pricing.ts` sie als Pro/Business verkauft: KI-Chat + Chat-Bubble, eigenes
  Logo/CI-Farben, Insights, Erweiterungs-Direkt-Upload, Video-Limit 3, wöchentlicher Autopilot
  (`src/app/api/cron/drift/route.ts` prüft alle Konten); „Erstellt mit Steply“ steht im Hub-Fuß
  auch bei Pro/Business (`src/app/h/[account_slug]/page.tsx`, ohne Tarif-Abfrage)
- [x] 🟠 `page.tsx` Landing ohne Preise (nur „0 €") → Pricing-Sektion mit den 3
  Tarifen aus abo/page.tsx.
  — ✅ erledigt (Beleg: `src/app/page.tsx` rendert `PLANS` aus `src/lib/pricing.ts` + FAQ)
- [ ] ⚪ Trial-Logik: bewusst entscheiden (free-forever bis Stripe vs. Trial) und
  dokumentieren.
  — ⏳ unklar: Code ist faktisch free-forever (kein Trial in `src/lib/plan.ts`), eine
  dokumentierte Entscheidung fand ich nicht
- [ ] ⚪ Kurzfristig: „Preise sind Platzhalter"-Fußnote raus; „Pro vormerken"-CTA
  (Mailto) zur Nachfragemessung.
  — ⏳ teilweise: Fußnote raus; statt Mailto-CTA nur Text „schreiben Sie dem Steply-Support“
  ohne Adresse + Knopf „Bald buchbar“ disabled (`src/app/app/settings/tarif/page.tsx`)

### Marketing
- [x] ~~Zielgruppen-Sprache~~ **Entschieden (01.07.26): Steply ist bewusst generisch**
  — für jede Firma mit Tutorial-Bedarf, nicht steuer-spezifisch. „Organisationen"-
  Sprache ist korrekt. (Offen bleibt nur: Landing braucht trotzdem konkrete
  Anwendungsbeispiele/Branchen-Cases als Beweis.)
- [x] 🟡 Kein echter Screenshot/keine Demo auf der Landing (nur Mocks) → öffentlichen
  `/h/demo`-Hub bauen und verlinken (stärkster Beweis).
  — ✅ erledigt (Beleg: `src/app/page.tsx`, echte Produkt-Screenshots via next/image + Link auf `/h/steply`)
- [ ] 🟡 Null Social Proof → solange Kunden fehlen: Gründer-Note + „EU-Hosting,
  DSGVO"-Trust-Block.
  — ⏳ teilweise: nur Zeile „Keine Kreditkarte nötig · DSGVO-konform · Made in Germany“
  (`src/app/page.tsx`); kein Trust-Block/Gründer-Note. Achtung: „DSGVO-konform“ ist bei
  Platzhalter-Impressum + unvollständiger Datenschutzerklärung selbst ein Abmahnrisiko
- [x] ⚪ `page.tsx:113` „KI übernimmt Ihr CI" trägt „bald"-Badge, ist aber live →
  Badge weg, Feature verkaufen.
  — ✅ erledigt (Beleg: `src/app/page.tsx` ohne „bald“-Badge, Landing neu aufgebaut)

### Auth + Settings
- [ ] 🟡 `settings/konto/page.tsx:49-55` „Konto löschen → Support kontaktieren", aber
  nirgends eine Support-Adresse (Impressum Platzhalter) → Mailto ergänzen.
  — ⏳ teilweise: Landing-Fuß hat `mailto:kontakt@steply.de`, aber „Organisation löschen“ in
  `src/app/app/settings/allgemein/page.tsx` sagt weiter nur „kontaktieren Sie den Steply-Support“ ohne Adresse
- [x] 🟡 E-Mail-Adresse ändern fehlt komplett → updateUser({email}) + Bestätigung.
  — ✅ erledigt (Beleg: `src/app/app/settings/konto/actions.ts`, `updateUser({ email })`)
- [x] ⚪ `konto/actions.ts:11` changePassword gibt englische Supabase-Fehler roh
  zurück → uebersetzeAuthFehler wiederverwenden.
  — ✅ erledigt (Beleg: `settings/konto/actions.ts` nutzt `uebersetzeAuthFehler`)
- [x] ⚪ `team-manager.tsx:137` Mitglied entfernen nutzt natives confirm(), Tutorial-
  Löschen hat schönen Dialog → vereinheitlichen.
  — ✅ erledigt (Beleg: `src/components/app/team-manager.tsx` nutzt Steply-`confirm`-Dialog;
  Rest-Nativ-confirm noch in `leave-team.tsx`, `template-section.tsx`, Admin, Chat-Reset)
- [x] ⚪ `team/page.tsx:45` duzt („Du gehörst…"), Rest siezt → vereinheitlichen.
  — ✅ erledigt (Beleg: keine Du-Formen mehr in `src/app/app/settings/team/` + `team-manager.tsx`)

### Recht + Vertrauen
- [x] 🟡 Chat-Widget ohne KI-/Datenschutz-Hinweis für Mandanten → „Antworten werden
  automatisiert per KI erstellt – bitte keine personenbezogenen Daten eingeben" + Link.
  — ✅ erledigt (Beleg: `src/lib/i18n-hub.ts` KI-Hinweis + Datenschutz-Link in `chat-widget.tsx`)
- [x] 🟡 Gehostete /h-Seiten ohne Impressum-/Datenschutz-Link → beide in den Footer
  neben „powered by Steply".
  — ✅ erledigt (Beleg: Footer in `src/app/h/[account_slug]/page.tsx` + `[tutorial_slug]/page.tsx`)

---

## C. Builder / Authoring

### Fehlende Features
- [x] 🟠 **Kein Schritt-Umordnen** (kein Drag&Drop, kein Hoch/Runter) — Reihenfolge
  ändern nur destruktiv → „Nach oben/unten"-Buttons im StepPanel (Branch-Verdrahtung
  umschreiben).
  — ✅ erledigt (Beleg: `src/components/builder/builder.tsx` swapPair/Hoch-Runter per Branch-Rewiring)
- [ ] 🟡 Schritt duplizieren fehlt (nur ganzes Tutorial); Copy zwischen Tutorials fehlt.
  — ⏳ teilweise: nur „Bild in neuen Schritt übernehmen“ (`src/components/builder/image-field.tsx`);
  echtes Schritt-Duplizieren und Kopieren zwischen Anleitungen fehlen
- [ ] 🟡 Kein Undo für strukturelle Aktionen; Schritt-Löschen unwiederbringlich →
  Soft-Delete mit „Rückgängig"-Toast (Sonner-Action).
  — ⏳ teilweise: „Rückgängig“ für Bild-Entfernen (`builder.tsx`) und KI-Texte
  (`improve-texts.tsx`); Schritt-Löschen hat nur eine Rückfrage, kein Undo
- [ ] 🟡 Kein Text-Werkzeug im Highlight-Editor („1.", „Hier klicken") — Pfeil ohne
  Beschriftung oft nicht selbsterklärend.
- [x] 🟡 `rich-text.tsx` + `rich-text-view.tsx:42-47` **Kein Link-Support**: Tiptap
  akzeptiert Links beim Einfügen, Viewer rendert sie nicht → **beim Kunden toter
  Text** (underline/strike ebenso). → Link-Button + Viewer-Rendering.
  — ✅ erledigt (Beleg: `src/components/viewer/rich-text-view.tsx` rendert link/underline/strike, nur http/https)
- [ ] ⚪ Keine Tastatur-Shortcuts (Entf für Highlight, Strg+S, Pfeiltasten-Nudge) —
  billig, große Wirkung.
  — ⏳ teilweise: Entf/Backspace löscht Form (`highlight-editor.tsx`); Strg+S und Pfeil-Nudge fehlen

### UX-Reibung
- [ ] 🟡 `flow.tsx` skaliert mäßig ab ~20 Schritten: kein Zoom, keine Suche, kein
  Collapse-All → Titel-Suchfeld mit Scroll-to + Collapse-Toggle.
- [x] 🟡 `image-field.tsx:74-86` „Bild ersetzen" behält alte (falsch sitzende)
  Highlights → nachfragen „Markierungen behalten/löschen?".
  — ✅ erledigt (Beleg: `src/components/builder/image-field.tsx` Dialog „Markierungen behalten?“)
- [ ] 🟡 `builder.tsx:246-270` Frage-Toggle AUS löscht kommentarlos alle Antworten
  außer der ersten + verwaist Teilbäume (unsichtbar, aber in Zählung/Nav) →
  Confirm-Dialog + „nicht verbundene Schritte"-Hinweis im Flow.
  — ⏳ teilweise: Rückfrage mit Folgen-Text da (`step-panel.tsx` toggleDecision); ein
  „nicht verbundene Schritte“-Hinweis im Flow fehlt weiter
- [ ] 🟡 `article-editor.tsx:77-105` KB-Editor: kein Auto-Save, kein Verlassen-Guard
  (auch kein beforeunload im Builder) → Änderungen können stumm verloren gehen.
  — ⏳ teilweise: KB-Editor hat beforeunload + Verwerfen-Rückfrage (`article-editor.tsx`), Builder
  fragt beim Schrittwechsel (`builder.tsx` confirmDiscard); kein Auto-Save, kein beforeunload im Builder
- [x] ⚪ Drift-Check: nur manuell (kein Cron), Ergebnis-Toast ohne Link zu /app/alerts,
  **kein Cooldown** (teuerster Call: web_search) → 1×/Tutorial/Stunde + Link im Toast.
  — ✅ erledigt (Beleg: Cooldown/429 in `src/app/api/tutorials/[id]/check/route.ts`, Toast-Link
  „Hinweise ansehen“ in `drift-check-button.tsx`, Cron `vercel.json` → `/api/cron/drift`)
- [ ] ⚪ `upload.ts:45-51` Signierte URLs laufen nach 1 h ab → in langen Sessions
  brechen Bilder stumm (Re-Sign / onError-Retry).

### Code-Bugs
- [x] 🟡 `step-panel.tsx:326` „Speichern & weiter" wartet save() nicht ab → Navigation
  vor Ergebnis, Fehler zeigt sich nur als Refresh. → await + nur bei Erfolg navigieren.
  — ✅ erledigt (Beleg: `src/components/builder/step-panel.tsx`, `if (await save())` vor der Navigation)
- [x] 🟡 `builder.tsx:148-151` handleAddStep-Fallback ohne Blatt: hängt Branch mit
  position 0 an Schritt mit vorhandenem Ausgang → neuer Schritt **unsichtbar/verwaist**.
  → position max+1 bzw. nur echte Blätter verdrahten.
  — (Abgleich-Stand, überholt: Blätter wurden bevorzugt, aber der Fallback
  (kein Blatt, z. B. alle Enden als Branch mit Ziel null) hängt weiter einen Branch mit
  `position: 0` an einen Schritt, der schon einen Ausgang hat) — ✅ erledigt 23.09.2026 (`src/lib/builder/rewire.ts` appendAnchor, `scripts/test-builder-rewire.ts`)
- [x] ⚪ `step-panel.tsx:131-143` KI-Vorschlag persistiert Highlight sofort, Titel/Text
  nur dirty → „Verwerfen" entfernt das KI-Highlight nicht (halbe Transaktion).
  — ➖ entfällt: KI-Bild-Vorschlag samt Route `/api/steps/suggest` entfernt (Welle 19)
- [x] ⚪ `highlight-editor.tsx:74,117` Move/Resize nicht auf 0..1 geklemmt → Formen
  fast ganz aus dem Bild schiebbar, im Viewer unsichtbar. → clamp wie im Crop-Dialog.
  — ✅ erledigt (Beleg: `src/components/builder/highlight-editor.tsx` clamp01 bei Move/Resize)
- [x] ⚪ `category-picker.tsx:33-42` Optimistische Auswahl ohne Rollback bei Fehler.
  — ✅ erledigt (Beleg: `src/components/builder/category-picker.tsx`, setSelectedId(prev) im catch)
- [x] ⚪ `preview/[id]/page.tsx:48-52` Signierte URLs sequenziell (Wasserfall) →
  Promise.all.
  — ✅ erledigt (Beleg: `src/app/app/preview/[id]/page.tsx` Promise.all)
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
- [x] 🟡 Kein CI (kein .github/): Vercel deployt ungeprüft → GitHub Action mit
  next build + eslint pro Push/PR (Live-Tests optional dazu).
  — ✅ erledigt (Beleg: `.github/workflows/ci.yml`, Typecheck + Lint blockierend; `next build`
  bewusst weggelassen, Vercel baut pro Deploy)
- [ ] 🟡 Env-Vars überall per `!`-Assertion, keine Boot-Validierung → env-Check in
  instrumentation.ts (klarer Fehler statt kryptischem Request-Crash).
- [x] 🟡 Kein robots.ts / sitemap.ts / manifest; kein metadataBase / OG-Default →
  ergänzen (robots: Disallow /app, /api; sitemap für /h-Hubs).
  — ✅ erledigt (Beleg: `src/app/robots.ts`, `src/app/sitemap.ts`, `metadataBase` in
  `src/app/layout.tsx`; nur ein Web-Manifest fehlt — unkritisch)
- [ ] ⚪ Durchgängig `<img>` statt next/image → mind. loading="lazy" + sizes;
  next/image mit remotePatterns abwägen.
  — ⏳ teilweise: Endkunden-Bilder lazy (`viewer-image.tsx`), Landing nutzt next/image; übrige
  ~16 `<img>` (Builder, Hub-Logo, Admin, Automationen) ohne lazy/sizes

## E. Backend / API / Datenbank

- [x] 🟠 `lib/openai.ts:9` OpenAI-Client ohne timeout/maxRetries (Default 600 s!) bei
  maxDuration=30 → hängender embed killt Function ohne Antwort. →
  `new OpenAI({ timeout: 20_000, maxRetries: 1 })`.
  — ✅ erledigt (Beleg: `src/lib/openai.ts`, `timeout: 20_000, maxRetries: 1`)
- [x] 🟡 `api/steps/suggest/route.ts:63-77` Einzige Route ohne Token-Cap; kein
  maxDuration (Vercel-Default ~15 s, Vision detail:high!); rohes e.message an Client →
  maxDuration 30 + Cap ~300 + generische Fehlermeldung.
  — ➖ entfällt: Route `/api/steps/suggest` gibt es nicht mehr (Welle 19 entfernt)
- [ ] 🟡 `api/tutorials/[id]/check/route.ts` Drift ohne Rate-Limit/Cooldown (teuerster
  Call) + DB-Writes ungeprüft (Ergebnis kann lautlos verschwinden) → Cooldown +
  Error-Checks.
  — ⏳ teilweise: Cooldown (429) da; in `src/lib/drift.ts` werden alte Hinweise auf „resolved“
  gesetzt und der neue per insert geschrieben, ohne `{error}` zu prüfen → Hinweis kann weiter
  lautlos verschwinden
- [x] 🟡 `lib/kb.ts:59-75,124-146` Delete-then-Insert nicht atomar, {error} ignoriert →
  Tutorial kann still aus dem RAG-Index verschwinden → Fehler prüfen, Insert-vor-Delete.
  — ✅ erledigt (Beleg: `src/lib/kb.ts` atomare RPC `replace_kb_source` (Migration 0040) + Fehler werfen/loggen)
- [x] 🟡 **HNSW-Index nie angelegt** (0004 auskommentiert) → match_kb macht Seq-Scan
  über ALLE Embeddings pro Chat-Nachricht; degradiert linear mit Kundenzahl. →
  `create index ... using hnsw (embedding vector_cosine_ops)` + Index
  (source_type, source_id) für Delete-Pfade.
  — ✅ erledigt (Beleg: `supabase/migrations/0016_perf_indexes_triggers.sql`, HNSW + source-Index)
- [x] ⚪ `tutorials.updated_at` ohne Trigger; Step-Änderungen bumpen es nicht →
  Dashboard-Sortierung/„Geändert vor…" lügt → moddatetime-Trigger + Bump.
  — ✅ erledigt (Beleg: `0016_perf_indexes_triggers.sql`, Trigger steps/branches → tutorials.updated_at)
- [ ] ⚪ status/freshness/severity als freier text ohne CHECK-Constraints.
- [ ] ⚪ Chat-Rate-Limit ist pro Serverless-Instanz (20×N/min, Cold-Start-Reset) —
  als Best-Effort ok; für echten Schutz später Upstash Redis/Vercel KV.

## F. Bekannt & bewusst offen (aus früheren Audits)

- [x] 🟡 **M7 updatePassword**: /reset ist von jeder eingeloggten Session nutzbar
  (Passwort-Übernahme bei entsperrtem Gerät). Sauberer Fix braucht Recovery-Nonce im
  Auth-Confirm-Fluss — bewusst zurückgestellt (Umbau-Risiko), Plan liegt vor. — ✅ erledigt 23.09.2026 (amr-Nachweis in `(auth)/actions.ts`, `scripts/test-reset-password.mjs`)
- [ ] ⚪ Middleware getUser→getClaims (warmer /app-Pfad): nur nötig, falls Inhalt nach
  Skeleton weiter träge; vorher Supabase-SSR-Docs prüfen (Token-Refresh!).
- [x] ⚪ cacheComponents-Pilot auf /h (statische Instant-Shell): gestufte Migration,
  cache-components-Skill + Bundled Docs nutzen.
  — ✅ erledigt (Beleg: `next.config.ts` `cacheComponents: true`, /h-`load()` mit 'use cache' + Tags)
- [x] ⚪ Analytics/Events-Tabelle (Entwurf 0015 existierte, verworfen — bei Analytics-
  Feature neu aufsetzen; „War das hilfreich?" ist der Einstieg).
  — ✅ erledigt (Beleg: `supabase/migrations/0018_events.sql` + `src/lib/events.ts`, Insights-Karte)
- [ ] ⚪ Video-Worker-Deploy prüfen: Batch-3-Fixes (reapStale, note, Rotation) wirken
  erst nach `deploy.sh` auf Hetzner.
  — ⏳ unklar: aus dem Repo nicht belegbar, ob `deploy.sh` gelaufen ist; `TODO.md` führt
  „deploy.sh ausführen + Test-Video“ weiter offen (inkl. W51-Tonspur-Fix in `video-worker/media.mjs`)

---

## G. Visuelles Review (echte Screenshots, 02.07.2026)

17 Screenshots, Desktop (1440) + Mobile (390), öffentlich + eingeloggt.
Gesamteindruck: Landing stark (~8/10), **Builder = stärkste Oberfläche**, Mobile
(Hub, Chat, Builder-Bottom-Sheet) überraschend gut.

> **Kontext-Entscheidung (Richard, 02.07.):** Das kräftige Rot des RichardTax-Hubs ist
> **geklonte CI** (Jakus Tax) und gewollt — das KI-CI-Feature funktioniert. Findings
> unten betreffen nur die *Dosierung* der Akzentfarbe, nie die Farbe selbst.

- [x] 🟠 **Chat-Widget fehlt auf den Tutorial-Seiten** (`/h/[slug]/[tutorial]`) — nur
  der Hub hat es; genau beim Feststecken gibt es keinen Chat. → Widget auch dort.
  — ✅ erledigt (Beleg: `ChatWidget` in `src/app/h/[account_slug]/[tutorial_slug]/page.tsx`)
- [x] 🟠 **Dashboard = Wand identischer weißer Kacheln** (26 Stück, kein Blickanker):
  keine Thumbnails, und der Publish-Toggle steht ÜBER dem Titel (erstes Lese-Element
  ist ein Schalter). → Thumbnail (erstes Schritt-Bild) + Titel zuerst.
  — ✅ erledigt (Beleg: `src/components/app/tutorial-card.tsx` — Bibliothek neu (W49): Titel +
  Website im Kategorie-Farbfeld, ein Status-Schalter, Karten/Liste)
- [x] 🟡 **Landing-Hero zeigt Wireframe-Mock statt Produkt** → echten
  Builder-Screenshot (Browser-Rahmen) einsetzen; „bald"-Badge bei „KI übernimmt Ihr
  CI" entfernen (Feature ist live).
  — ✅ erledigt (Beleg: `src/app/page.tsx` „Browser-Mockup mit echtem Produkt-Screenshot“)
- [x] 🟡 Landing endet nach dem CTA: **Preise-, FAQ-, Demo-Hub-Sektion fehlen**
  (deckt sich mit B/Monetarisierung).
  — ✅ erledigt (Beleg: `src/app/page.tsx` Preise (PLANS) + FAQ + Link `/h/steply`)
- [x] 🟡 **Wizard auf Desktop zu schmal** (Karte ~430 px in 1440, Titel klein) →
  breiter (max-w-xl/2xl), größerer Schritt-Titel, Fortschritt „Schritt x von y",
  Bild-Lightbox (mobil: Tap-to-Zoom).
  — ✅ erledigt (Beleg: `[tutorial_slug]/page.tsx` bis `lg:max-w-4xl`, Fortschritt + Großansicht in `wizard.tsx`)
- [x] 🟡 Hilfe-Seiten **Akzent-Dosierung** (Empfehlung, CI bleibt): Markenfarbe färbt
  jeden Kartenrahmen, jeden Titel, alle Icons → Titel in Ink, Rahmen neutral/dezenter
  Tint; Akzent konzentriert auf Logo/Topbar/Buttons/Chat-Bubble. Wirkt ruhiger,
  CI bleibt klar erkennbar.
  — ✅ erledigt (Beleg: `hub-browser.tsx` Karten mit neutralen Rahmen/`--brand-title`, Commit `61c371c`)
- [ ] 🟡 Dashboard mobil: endloser Ein-Spalten-Scroll → sticky Kategorie-Sprungleiste
  oder einklappbare Sektionen. **Produkt-Nebenfund:** kein Bulk-Löschen/Archivieren
  (15 Test-Tutorials unter „Sonstiges" ohne Aufräum-Werkzeug).
  — ⏳ teilweise: Bulk-Aufräumen da (`src/components/app/bulk-cleanup.tsx` in `library-browser.tsx`);
  die Sprungleiste `src/components/app/category-jump.tsx` wird seit der neuen Bibliothek nirgends
  mehr eingebunden (toter Code), Listenansicht gruppiert nur
- [x] ⚪ Chat-Panel: fixe Höhe lässt Leerraum; Bot-Antwort könnte direkter zum Klick
  auf die verlinkte Anleitung auffordern.
  — ✅ erledigt (Beleg: `chat-widget.tsx` h-auto + max-h; Prompt in `src/lib/ai-prompts.ts`
  nennt passende Anleitungen, die als Link erscheinen)
- [x] ~~Mobile-App-Header quillt über~~ — nach Sichtung **herabgestuft**: komprimiert
  ordentlich (E-Mail wird ausgeblendet).

**Positiv bestätigt:** Builder-Zweispalter + Mobile-Bottom-Sheet exzellent;
Chat-Streaming mit Quellen-Chip stark; Hub-Layout (Suche/Kategorien/Karten) gut;
Landing-Typo/Bento/Rhythmus professionell.

---

## H. Produkt-Erweiterungen (Backlog — „geil"-Kandidaten)

**Schwungrad (Produkt verbessert sich selbst):**
- [x] ⭐ **Frage-Lücken-Miner** (M): `no_answer`-Chatfragen sammeln → „Diese 7 Fragen
  blieben unbeantwortet — Tutorial erstellen?" → KI legt Entwurfs-Rahmen an.
  Schließt die Schleife Content → Chat → Content. Kein Wettbewerber hat das.
  — ✅ erledigt (Beleg: `src/lib/gaps.ts` + „Entwurf erstellen“ in `src/app/app/insights-actions.ts`)
- [x] **Aktualitäts-Autopilot** (M): Drift-Check als Cron + Digest-Mail + 1-Klick-
  Übernahme („Deine Hilfe hält sich selbst aktuell" = Abo-Argument).
  — ✅ erledigt (Beleg: `src/app/api/cron/drift/route.ts` + `vercel.json` Mo 6:00 + Resend-Digest;
  läuft nur mit `CRON_SECRET` in Vercel — laut `TODO.md` noch Richards Handgriff)
- [x] **Semantische Endkunden-Suche** (S): vorhandenes pgvector-RAG ins Hub-Suchfeld.
  — ✅ erledigt (Beleg: `src/app/api/hub-search/route.ts` + „Meinten Sie“ in `hub-browser.tsx`)

**Reichweite & Verteilung:**
- [x] ⭐ **Script-Chat-Bubble** (M): ein `<script>`-Tag → KI-Hilfe schwebt auf JEDER
  Seite der Firmen-Website, nicht nur im Hub. Größter Adoptions-Hebel.
  — ✅ erledigt (Beleg: `src/app/h/embed.js/route.ts` + `src/app/h/[account_slug]/chat/page.tsx`)
- [ ] **Custom Domain** (M): `hilfe.firma.de` per CNAME — White-Label komplett,
  klassisches Bezahl-Feature.
- [x] **QR-Codes pro Tutorial** (S): für Brief, Rechnung, Aushang, Gerät.
  — ✅ erledigt (Beleg: `src/app/api/qr/route.ts`, nur eingeloggt + nur /h-URLs)

**Neuer Markt (großer Hebel):**
- [x] ⭐ **Interne Tutorials + Schulungsnachweis** (L): Zugriffsschutz (Login/Einladung)
  + „Mitarbeiter X hat Anleitung Y am … durchgearbeitet ✓" → SOP-/Onboarding-Markt
  (Scribes Kernmarkt); Video-Pipeline ist dort stärker (Desktop-Software).
  — ✅ erledigt (Beleg: Migration `0021_internal_tutorials.sql`, `src/app/app/lernen/` „Schulungen“ mit Nachweis)
- [ ] **Freigabe-Workflow** (M): Entwurf → Review → Freigabe durch Owner (Teams ≥5).
  — ⏳ teilweise: Rollen Inhaber/Bearbeiter/Mitarbeiter (`0037_team_roles.sql`); einen
  Review-/Freigabe-Status zwischen Entwurf und Veröffentlicht gibt es nicht

**Endkunde:**
- [x] **Inline-Feedback pro Schritt** (S–M): „Hier komme ich nicht weiter" am Schritt
  (ergänzt „War das hilfreich?" aus A) → zeigt exakt den schwachen Schritt.
  — ✅ erledigt (Beleg: `wizard.tsx` sendStuck → events → Insights-Wissenslücken)

**Top-3-Empfehlung:** Frage-Lücken-Miner · Script-Bubble · Interne Tutorials.
Story: *überall erreichbar → weiß, was fehlt → funktioniert auch nach innen.*

---

## I. Video→Tutorial-Pipeline (Kern-Feature — Roadmap)

**Nächstes Paket (abgesegnet 01.07.):**
- [x] ① **Fortschritt + Live-Aufbau**: `video_jobs.progress` („Schritt 3/6"), Tutorial
  früh als Draft anlegen + Schritte einfügen sobald fertig; „Wird erstellt…"-Karte im
  Dashboard → Dialog darf zu, kein „Fenster offen lassen" mehr.
  — ✅ erledigt (Beleg: `video-worker/index.mjs` progress „Schritt X von Y“ + Live-Insert,
  Migration `0017_video_progress_scrubber.sql`; wirkt erst nach deploy.sh)
- [x] ② **Timestamps → Scrubber**: `video_path` + Zeitpunkt pro Schritt speichern; im
  Builder „anderes Bild aus dem Video wählen" (Mini-Timeline). Macht KI-Fehlgriffe zu
  5-Sekunden-Fixes statt Neuaufnahmen.
  — ✅ erledigt (Beleg: `steps.video_time` im Worker, `src/components/builder/video-frame-picker.tsx`)
- [ ] ③ **Quick-Wins**: Whisper `prompt:"Schnitt"` (Marker-Bias) + Marker-Varianten
  konfigurierbar + Sprache als Konto-Setting statt hart `de`; Vision-Calls parallel
  (3–4); Retry mit Backoff um alle OpenAI-Calls; schärfsten von 3 Kandidaten-Frames
  wählen; Frames auf ~1280 px für Vision verkleinern (Kosten).
  — ⏳ teilweise: Marker-Bias, 3er-Batches, withRetry, grabSharpestFrame, 1280 px erledigt
  (`video-worker/index.mjs`); Whisper-Sprache weiter hart `language: "de"`, Marker nicht konfigurierbar

**Danach:**
- [x] Szenen-Erkennung (ffmpeg `scdet`) als Fallback ohne Ton (statt Gleichverteilung).
  — ✅ erledigt (Beleg: `video-worker/index.mjs` scdet-Pass in der Fallback-Kette)
- [ ] **Mini-Clip/GIF pro Schritt** (2–4 s Loop aus dem Video) — Marktlücke: Scribe hat
  nur Screenshots, Loom keine Schritte.
- [ ] **Auto-Redaktion**: Vision findet sensible Stellen (Namen, IBAN, Kundennr.) →
  Blur-Vorschläge. Setzt Top-1 „Blur einbrennen" voraus → macht daraus ein Premium-Feature.
  — ⏳ teilweise: Auto-Schwärzung für die Sofort-Aufnahme per DOM (Passwort/IBAN/Token-Felder →
  `suggested`-Blur, Welle 28, `extension/content.js`); per Vision im Video gibt es sie nicht
- [x] Mehrsprachige Ausgabe (Übersetzungs-Pass über fertige Schritte).
  — ✅ erledigt (Beleg: `src/lib/translate.ts` + Migration `0022_translations_tts.sql`, EN/PL/TR Auto-Sync)
- [x] Import per Loom-/MP4-Link („bring dein vorhandenes Video mit").
  — ✅ erledigt (Beleg: `src/app/api/video-import/route.ts`, SSRF-geschützt; Loom bewusst nur
  über „Video herunterladen“ und hochladen)
- [x] E-Mail „Tutorial ist fertig → im Builder öffnen".
  — ✅ erledigt (Beleg: `video-worker/index.mjs` sendDoneEmail, env-gated; wirkt nach deploy.sh)

**Nordstern:**
- [x] **Browser-Extension mit Klick- + DOM-Telemetrie**: exakte Highlights ohne
  Vision-Raten, Schrittgrenzen aus echten Klicks, „Schnitt" optional. Kombi-USP:
  Extension für Web-Apps **plus** Video-Pipeline für Desktop-Software (DATEV & Co.) —
  das kann kein Wettbewerber beides.
  — ✅ erledigt (Beleg: `extension/` v2.19.1 — Sofort-Anleitung mit DOM-Box + Selektor je Klick,
  Klick-Modus im Worker, Live-Führung, Automationen)

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

---

## 📋 Sofort-Aufnahme: belegte Lückenliste (22.09.2026, v2.18.7)

Eigenes Dokument: **[`REVIEW-aufnahme-luecken.md`](REVIEW-aufnahme-luecken.md)** — 62 Bedien-Muster
headless mit der echten `content.js` durchgespielt (`node scripts/test-capture-gaps.mjs`,
`--strict` als Regressionsschutz), Ergebnis 45 erfasst / 6 teilweise / 11 nicht erfasst,
sauber getrennt in **Browser-Grenze** (nicht behebbar) und **behebbar**.

- [x] Tastatur-Bedienung (Tab + Enter/Leertaste auf Knopf/Link/Kästchen) erzeugt jetzt Schritte
- [x] Farbwähler: Schritt beim `change` statt Klick davor (Screenshot zeigt die gewählte Farbe)
- [x] Kontrollkästchen ohne Label: Text von rechts statt „input“
- [x] `label[for=…]` als stabiler Selektor-Anker
- [x] 🟠 **L1** Seitenwechsel ohne Klick (Zurück-Knopf, F5, Weiterleitung) erzeugt keinen Schritt
  — ✅ erledigt (Beleg: `extension/content.js` pageshow/popstate → `interaction.variant:"nav"`, v2.19.0)
- [x] 🟠 **L3** Strg-/Shift-Klick: Modifikator fehlt im Schritt (falsche Anleitung + Automation)
  — ✅ erledigt (Beleg: `interaction.modifiers` in `extension/content.js`, `src/lib/guide.ts`, `extension/exec-plan.js`)
- [ ] 🟠 **L2** Ergebnis nach langem Laden ist in keinem Screenshot (zweites Bild je Schritt)
  — ⏳ teilweise: Variante A (ein Abschluss-Bild beim „Fertig“, `extension/panel.js`); Ergebnis-Bild
  je Schritt (Variante C) offen
- [x] 🟡 **L4** Pfeiltasten-Menüs · **L5** Canvas · **L6** geschlossenes Shadow DOM · **L7** Doppelklick in Tabellenzellen
  — ✅ erledigt (Beleg: Commit `1ded246`, `extension/content.js` Pfeil-Serien + `variant:"spot"` + Zellen-dblclick;
  Nachweis in `REVIEW-aufnahme-luecken.md`)
- [ ] ⚪ **L9** reines Scrollen · **L10** Markierung bei Strg+C · **L11** Hover-Tooltips

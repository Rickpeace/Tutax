# Steply – Entwickler-Übersicht („Start hier")

> **Zweck:** Eine Landkarte für alle, die neu reinkommen (oder eine neue KI-Session).
> Damit man **vorhandene Funktionen findet statt sie neu zu erfinden**, die richtigen
> **Farben/Tokens** nutzt und weiß, **wie alles zusammenhängt**.
> Stand: 2026-09-27 (nach den Bugsuch-Runden 23./24.09., Erweiterung v2.19.9, Migrationen bis 0048).
> Bitte bei größeren Änderungen hier nachziehen.

Steply (früher „Tutax") ist ein **einbettbares Klick-Anleitungs-SaaS**: Organisationen
bauen Schritt-für-Schritt-Tutorials (Screenshot + Markierung + Text, mit Ja/Nein-
Verzweigungen) — standardmäßig per **Sofort-Anleitung** in der Steply-Erweiterung, sonst
von Hand oder aus einem **Video** (KI-Pipeline) — und veröffentlichen sie auf einer
gehosteten Hilfe-Seite im eigenen CI (die Erweiterung kann sie auch **live führen** und als
**Automation** ausführen):
mit **KI-Chatbot** (RAG nur aus eigenen Inhalten), semantischer Suche,
**Mehrsprachigkeit** (EN/PL/TR, Auto-Sync), **Vorlesen** (TTS), QR/Druck/Chat-Bubble.
Dazu: **Schulungen + Schulungsnachweis** (/app/lernen, Team-Rollen), Insights mit „Offene
Fragen"→KI-Entwurf, Aktualitäts-Autopilot, **Wissens-Import** (Website/Dokumente) und
3 Tarif-Stufen free/pro/**business** (serverseitig gegated, `lib/plan.ts`).
Die eigene Doku ist selbst ein Steply-Hub: **/h/steply** (?-Icon in der App-Leiste).

---

## 1. Doku-Landkarte (wo steht was)

| Datei | Inhalt |
|---|---|
| **`OVERVIEW.md`** (diese Datei) | Funktions-Inventar, Farben, lokale Skripte – „was gibt es schon" |
| `../ARCHITEKTUR.md` | **Vollständige Spezifikation** (Datenmodell, RLS, Routen, Editor-Spec, KI-CI, Viewer, Design-System §13) |
| `STATUS.md` | Projekt-Status (erledigt/offen), Architektur-Entscheidungen, Datei-Landkarte; §7j = aktueller Stand + Richard-Handgriffe |
| `REVIEW.md` / `TODO.md` | abhakbare Befunde je Prüfrunde / kompakte offene Punkte |
| `REVIEW-aufnahme-luecken.md` | Was die Sofort-Aufnahme (nicht) erfasst, belegt per `npm run test:capture-report` |
| `../INFRA.md` | **Infrastruktur & Deploy** (Hosting, Keys, Betrieb, Cheat-Sheet) |
| `video-worker/DEPLOY.md` | Deploy des Video-Workers (`deploy.sh`) |
| `../HETZNER-KI-ANLEITUNG.md` | Docker-Box-Isolation (agent-bridge) |
| `AGENTS.md` | Pflicht-Regeln vor Abschluss (Build muss grün, Next 16 ist anders) |

---

## 2. Tech-Stack

- **Next.js 16** (App Router, Turbopack, **cacheComponents/PPR aktiv** — Suspense-Pflicht,
  `'use cache'` + Tags via `lib/cache-tags.ts`), **React 19**, **TypeScript**, **Tailwind v4**.
- **shadcn auf Base UI** (⚠️ nicht Radix — siehe Konventionen).
- **Supabase**: Postgres + Auth + Storage + pgvector. RLS über `my_account_ids()`.
- **OpenAI**: `gpt-5.4-mini` (Chat+Vision), `whisper-1` (Transkript), `text-embedding-3-small`.
- **Vercel** (App, Auto-Deploy auf `main`, Funktionen in Region **dub1** neben Supabase eu-west-1 — `vercel.json`).
  **Hetzner** (Video-Worker + agent-bridge, via `deploy.sh`). **Resend** (App-Mails), **ElevenLabs** (Vorlese-Stimme).

---

## 3. Design-System / Farben — **erst hier schauen, keine neuen Farben erfinden**

**WARM-REDESIGN 07/2026** (Design-Handoff `desing claude/` — README + SPEC-*.md sind die
Quelle der Wahrheit; ersetzt die alte Indigo-Welt aus ARCHITEKTUR §13). Definiert in
[`src/app/globals.css`](src/app/globals.css) (`:root`), als Tailwind-Klassen nutzbar.

**Kern-Palette:**
| Token | Klasse | Wert | Verwendung |
|---|---|---|---|
| `--ink` | `text-ink` | `#33291f` | Haupt-Text, dunkle Pills/Sektionen |
| `--ink-2` | `text-ink-2` | `#6b5e4b` | sekundärer Text |
| `--muted-foreground` | `text-muted-foreground` | `#76674f` | gedämpfter Text (≥4.5:1 auf Papier) |
| `--faint` | `text-faint` | `#b3a48c` | Meta/Labels (Stufe 3) |
| `--line` | `border-line` | `#f0e7d9` | Borders — Konvention: **immer 2px** |
| `--line-2` | `bg-line-2` | `#f7f1e6` | Beige-Flächen, Skeletons |
| `--primary` | `bg-primary` | `#ef6a4e` (Koralle) | primäre Aktion, Marker, Logo |
| `--primary-pressed` | — | `#d3543a` | „harter Schatten" + gedrückt |
| `--accent` | `bg-accent` | `#ffe8e2` | Koralle-Pastell (Hover/Chips) |
| `--background` | `bg-background` | `#fdf9f3` | Seiten-Hintergrund (Creme) |
| `--destructive` | `variant="destructive"` | `#d3543a` | Löschen |

**Akzentfamilien** (Kategorien/Status/Landing; via `lib/category-colors.ts` deterministisch je Kategorie):
Teal `#18a999`/`#dcf3ef`/`#118576` · Violett `#8b7cf6`/`#ece7fd`/`#6d59d8` ·
Amber `#f2a93b`/`#fdeecd`/`#c07d16` · Blau `#5aa9e6`/`#e3f0fb` · dunkle Sektion `#33291f`/`#3f3428`.
Status-Chips: Veröffentlicht = Teal-Pastell, Entwurf = Amber-Pastell.

**Ja/Nein-Verzweigungen:** `--yes #18a999` (Teal) / `--no #d3543a` — Konstanten in
[`src/lib/builder/constants.ts`](src/lib/builder/constants.ts); bestehende Branches behalten ihre DB-Farbe.

**Marken-Utilities:** `.shadow-hard` (0 4px 0 pressed), `.shadow-hard-line(-lg)`, `.pressable`,
`.bg-stripes` (Streifen-Platzhalter, via `--stripe-a/-b` einfärbbar). Buttons sind Pills
(`rounded-full`), Karten `rounded-card` (18px) mit `border-2 border-line`.

**CI-Brand (öffentlicher Viewer/Hub, pro Kanzlei überschrieben):** `--brand-accent/-soft/-bg/-ink`
— Defaults jetzt warm (Koralle); Kategorien-Farbfamilien im Hub NUR bei mode=manual
(`colorful`-Prop), Kunden-CI bleibt monochrom. **Nicht** hart verdrahten.

**Fonts:** NUR Nunito (600/700/800/900) via `next/font` — Headlines 900/black, Buttons/Labels
800/extrabold, Fließtext 600–700. `--font-display` zeigt ebenfalls auf Nunito (Kompatibilität).

---

## 4. Kernfunktionen & wo sie leben (Inventar)

> **Bevor du etwas Neues baust: hier suchen.** Pfade relativ zu `src/`.

### Editor / Builder (`components/builder/`)
- **`builder.tsx`** – Orchestrator: State aller Schritte/Branches, Zwei-Spalten-Layout (Ablauf links, Editor angedockt rechts ab ≥1024px; Sheet auf schmal), Vor/Zurück-Navigation, Schritt anlegen/löschen/einfügen (auch in Äste).
- **`flow.tsx`** – der „Karten-Flow" (Signature-Diagramm mit verschachtelten Ja/Nein-Ästen), `+`-Einfüge-Punkte.
- **`step-panel.tsx`** – der Schritt-Editor (Titel, Screenshot, Erklärtext, Frage/Verzweigung-Toggle, Antwort-Optionen mit „→ Öffnen/anlegen", **„Danach weiter mit“** für normale Schritte = Antwort-Wege zusammenführen (24.09.), Vor/Zurück, Ungespeichert-Dialog). Umverdrahtung beim Löschen/Verschieben: [`lib/builder/rewire.ts`](src/lib/builder/rewire.ts); Einfügen/Löschen rechnen serverseitig aus der DB (zwei Tabs/Personen).
- **`highlight-editor.tsx`** – Screenshot annotieren: Rechteck/Kreis/Pfeil/**Blur**, Farben, Verschieben/Resizen, **Lupe** (Zoom). Koordinaten relativ 0..1. Welle 51a: Verpixeln = echte Unschärfe (gemeinsame SVG-Bausteine `viewer/svg-marks.tsx`, auch in der Lupe), **Einrasten** (Bildmitte + Kanten anderer Markierungen, ±1,5 %, Hilfslinien, Alt = frei), **Zentrieren**, erstes Farbfeld = „Firmenfarbe“.
- **Ein Bild, mehrere Schritte** (Welle 51a): „Bild in neuen Schritt übernehmen“ (image-field → `builder.tsx` → `addStep(…, { imageFromStepId })`) teilt den `image_path`; Verpixelungen des Vorgängers werden als Vorschlag (`suggested` + `suggestedFrom: "previous"`) übernommen — auch beim Upload/Frame-Picker mit gleichen Bildmaßen. Geteilte Pfade: `/api/upload-url` vergibt dann einen eigenen Pfad (kein stilles Überschreiben), die öffentliche Kopie brennt die Vereinigung aller Verpixelungen ein (`unionBlurs`).
- **`image-field.tsx`** – Screenshot hochladen/ersetzen/entfernen, **Zuschneiden** (`crop-dialog.tsx`), **„Groß bearbeiten"** (Vollbild-Overlay).
- **`tutorial-header.tsx`** – Kopf: Zurück-Breadcrumb, **editierbarer Titel** (Stift), Knopf **„Veröffentlichen“** bzw. Etikett „✓ Veröffentlicht“ (+ „Ansehen“), **Zielgruppen-Chips „Hilfe-Seite (für alle)“ / „Team“**, Nebenaktionen im „…“-Menü (u. a. Aktualität prüfen, Link zur Hilfe-Seite kopieren).
- **`rich-text.tsx`** – Erklärtext-Editor (Fett/Kursiv/Listen/Links). Anzeige: `viewer/rich-text-view.tsx`.
- **`category-picker.tsx`**, **`drift-check-button.tsx`**, **`improve-texts.tsx`** („Texte mit KI verbessern“, ab Pro), **`record-into.tsx`** („Ab hier aufnehmen“, fügt auch in veröffentlichte Anleitungen ein), **`video-frame-picker.tsx`**, **`site-domains-picker.tsx`** („Gilt für Website“).
- Dialoge immer über **`ui/confirm-dialog.tsx`** (Steply-Dialog statt Browser-`confirm`/`prompt`).
- Baum-Logik: [`lib/builder/tree.ts`](src/lib/builder/tree.ts) (`buildRenderTree`).

### Video → Tutorial (Screencast + Stimme → Schritte)
- **`components/app/video-upload.tsx`** – „Aus Video": In-App-Recorder, Datei-Upload (auch **Bulk**), **Import per URL** (`/api/video-import`, SSRF-sicher via `lib/ssrf.ts`) und optionales **clicks.json** (Validierung `lib/clicks.ts`) → Bucket `tutorial-videos` + `video_jobs`-Zeile, pollt Status.
- **Recorder-Extension** (`extension/`, MV3): Screencast + **Klicks** (überleben Navigation); **Direkt-Upload** über die Erweiterungs-Verbindung der Person (`recorder_tokens`, s. u.; Einstellungen → Steply-Erweiterung) über `/api/recorder/handshake` (signierte Storage-URL) + `/api/recorder/complete`. Anleitung aus Video ist **ab Pro** (`FREE_VIDEO_LIMIT = 0`, `videoQuotaErrorFor` in `lib/tutorial-quota.ts`, auch im Worker geprüft).
- **`video-worker/index.mjs`** (Hetzner, pm2 `video-worker`; nimmt nur echte Video-Container + sichere Speicherpfade an — wirkt erst nach `deploy.sh`) – pollt `video_jobs`: ffmpeg-Normalisierung → Whisper (mit **Wort-Zeitstempeln**) → Segmentierung (**Marker-Wort „Schnitt"** = Schritt-Ende, sonst KI-Fallback) → pro Schritt Screenshot **kurz vor „Schnitt"** + **Frame-Diff-Grounding** (Vorher/Nachher) + Gitter-Overlay → Vision (Titel/Text/Highlight) → Tutorial-Entwurf.
- Wichtig: **„Schnitt" sagen** = ein Schritt fertig. Schrittgrenzen-Priorität: **Klicks → „Schnitt" → KI → Szenen-Erkennung → Gleichverteilung**; Live-Aufbau (Schritte erscheinen während der Verarbeitung, progress „Schritt X/Y"). Prompts/Logik im Worker (SEG_SYS/STEP_SYS). ⚠️ Neuer Worker-Stand wirkt erst nach `deploy.sh` (Richard).
- Builder: **„Bild aus Video wählen"** (Frame-Picker) in JEDEM Schritt, sobald ein Quell-Video existiert.

### Steply-Erweiterung: Sofort-Anleitung, Live-Führung, Automationen (`extension/`, v2.19.9)
- **Sofort-Anleitung** (Standard-Erstellweg): `content.js` erfasst Klicks/Eingaben/Tasten/Seitenwechsel (Feld `step.interaction`, Vertrag + Validierung in [`lib/guide.ts`](src/lib/guide.ts), Texte `lib/interaction-text.ts`), `panel.js` = Seitenleiste (Bereit → Start → Pause → Stopp, Abschluss-Bild). Upload über `/api/recorder/guide-handshake` + `/guide-complete`; KI-Feinschliff der Texte ab Pro (`lib/guide-ai.ts`). Sensible Werte (Passwort, IBAN, Steuernummer/Steuer-ID/SV-Nr. …) werden verpixelt und nie als Wert gesendet (+ Server-Sicherheitsnetz, sensible Abfrage-Parameter fliegen aus `page_url`). Cookie-Banner-Klicks sind automatisch „nur wenn vorhanden“. Was (nicht) erfasst wird: `REVIEW-aufnahme-luecken.md`.
- **Live-Führung** auf der echten Website: `guide-resolve.js` (Selektor-Auflösung), Overlay, „Für diese Seite“ (`site-match.js`, Matching nur lokal).
- **Automationen** (`/app/automationen`, [`lib/automations.ts`](src/lib/automations.ts)): Ablauf aus einer Anleitung, `exec-plan.js`/`exec-run.js`/`runner.*` führen mit sichtbarer Maus aus (Kontrollkästchen mit Zielzustand, bedingte Schritte/Sprünge, Datei-Brücke, Zeitplan). APIs `/api/recorder/automations`, `/automation-runs`.
- Verbindung/Status: `/api/recorder/me`, `/disconnect`; Einrichtung auf der Einstellungs-Seite (`components/extension-setup-steps.tsx`, `lib/extension-release.ts`); Brücke nur von echten Steply-Adressen (`STEPLY_TRUSTED_APP_ORIGINS` in `background.js`).
- Version bumpen + ZIP bauen: `node scripts/build-extension-zip.mjs` (→ `public/downloads/steply-recorder.zip` + `.json`). Nutzer müssen die Erweiterung danach neu laden.

### KI-Funktionen
- ~~`/api/steps/suggest`~~ – entfernt (Welle 20). Heute: **„Texte mit KI verbessern“** im Editor + **KI-Feinschliff** nach der Sofort-Anleitung (`lib/guide-ai.ts`, max. 30/h je Person, ab Pro).
- **KI-Kostenbremsen**: `lib/ai-rate-limit.ts`, `lib/ai-run-limit.ts`, `lib/theme-ai-limits.ts`. Gratis nutzt **keine** kostenpflichtige KI (Nachweis `scripts/test-pro-gates.mjs`).
- **`/api/theme/analyze`** – **CI-Übernahme**: Theme aus einem thum.io-**Screenshot** der Kanzlei-Website (zuverlässiger als CSS).
- **`/api/theme/extreme`** – „Extremes" Design (CSS-Skin), sanitisiert via [`lib/skin-css.ts`](src/lib/skin-css.ts) (Paint-only-Whitelist).
- **`/api/tutorials/[id]/check`** – **Drift-Agent** (prüft, ob Anleitung noch aktuell ist) → Alerts.
- **`/api/chat`** – **Hilfe-Chatbot** (RAG über Knowledge Base, [`lib/kb.ts`](src/lib/kb.ts)).
- **Mehrsprachigkeit** (EN/PL/TR, Business): AUTO-SYNC — Publish=Vollübersetzung, Edits=Delta (nur das geänderte Stück), Sprachaktivierung=Backfill, alles via `after()`. Kern `lib/translate*.ts`, Actions `app/app/actions-translate.ts`, UI-Wörterbuch `lib/i18n-hub.ts`, öffentlich via `?lang=` (Teil des Cache-Keys!).
- **Vorlesen/TTS** (Business): MP3 je Schritt beim Publish, Hash-Cache (`steps.audio_hash`), `lib/tts.ts` + `lib/tts-core.ts` (ElevenLabs, wenn `ELEVENLABS_API_KEY` gesetzt, sonst OpenAI), ▶ im Wizard — nur auf deutschen Seiten; spielt erst, nachdem der Besucher ▶ gedrückt hat (Wahl im Browser gemerkt, Richard 24.09.). Backfill für Bestand: `scripts/backfill-tts.mjs <slug>`.
- **Wissens-Import**: „Von Ihrer Website" (`assistent/wissen/import-actions.ts`) + „Aus Dokument" (`/api/kb-import`, unpdf/mammoth) → `lib/kb-import.ts` erzeugt kb_articles-**ENTWÜRFE** (nie auto-publish).
- **Aktualitäts-Autopilot**: Vercel-Cron Mo 6:00 (`/api/cron/drift`, fail-closed ohne CRON_SECRET) + `lib/drift.ts`.
- Prompts zentral: [`lib/ai-prompts.ts`](src/lib/ai-prompts.ts). OpenAI-Client: [`lib/openai.ts`](src/lib/openai.ts), Helfer [`lib/ai.ts`](src/lib/ai.ts) (Modelle inkl. `tts`/`ttsVoice`).

### Veröffentlichen / Viewer
- **Publish**: `publishTutorial` / `unpublishTutorial` in [`app/app/actions.ts`](src/app/app/actions.ts) – Slug erzeugen + Schritt-Bilder in **öffentlichen** Bucket kopieren + für Chatbot indexieren. **Immer diese nutzen**, nicht nur `status` setzen.
- **Vorschau** (auch für Entwürfe): Route `/app/preview/[id]` → `viewer/wizard.tsx`.
- **Öffentlich**: `/h/[account_slug]` (Hub, `viewer/hub-browser.tsx`) + `/h/[account_slug]/[tutorial_slug]` (Wizard: Lightbox MIT Markierungen, ▶-Vorlesen, `?lang=`-Umschalter). Highlights: `viewer/viewer-image.tsx`. Chat: `viewer/chat-widget.tsx`. Persistentes CI-Layout (auch für Ladescreens): `h/[account_slug]/layout.tsx` + `lib/hub-theme.ts`. Öffentliche Schritte nur über `toPublicStep` ([`lib/public-step.ts`](src/lib/public-step.ts)); Organisationsname öffentlich nie als E-Mail (`lib/public-name.ts`). Fehlende/zurückgezogene Anleitung: **`viewer/tutorial-missing.tsx`** im Kanzlei-Design (Anleitungs- + Druckseite rendern es direkt, s. §10).
- **Verbreitung**: QR (`/api/qr`), Druckansicht (`…/drucken`), **Chat-Bubble-Script** (`/h/embed.js?account=slug`), iframe/Link (Einstellungen → „Adresse & Teilen“ / „Chat auf Ihrer Website“), Hub-Suche (Textabgleich umlaut-/wortreihenfolge-tolerant mit Synonymen: [`lib/search-match.ts`](src/lib/search-match.ts), auch für ⌘K in der App; semantische KI-Suche `/api/hub-search` ab Pro).

### Assistent-Zentrale (`/app/assistent` — Tab „Assistent")
- **Wissensdatenbank** (`assistent/wissen`; alte URL `/app/knowledge` leitet um) + Wissens-Import (s. o.).
- **Offene Fragen** (`assistent/fragen`): unbeantwortete Chat-Fragen (`lib/gaps.ts`) mit „Entwurf erstellen" (`gap-action.tsx`).
- **Persönlicher Kontakt** (`assistent/eskalation`, früher „Kontakt & Eskalation“; eine Quelle für Vorschau + Chat: [`lib/escalation.ts`](src/lib/escalation.ts), nur sichere Links).
- Alle Pro-Seiten der Assistent-Zentrale gaten **selbst** (nicht nur im Layout — PPR-Falle).

### Schulungen & Lernen (Schulung mit Nachweis ab Pro, „nur Team“ = Business)
- Zielgruppen-Chips „Hilfe-Seite (für alle)“ / „Team“ im `tutorial-header.tsx` (Mapping: `visibility` public/internal + `in_lernen`; Tarif-Regel `audienceGateError` in `lib/plan.ts`). „Nur Team“-Anleitungen (intern): NIE auf /h, nie im RAG, nie im public Bucket (Migration 0021 + Guards in `kb.ts`/`templates.ts`/Actions).
- **`/app/lernen`**: Lern-Tab fürs Team, „Als absolviert markieren", **Schulungsnachweis** (`tutorial_completions`, `lernen/[id]`) sehen **Inhaber und Bearbeiter** (seit 24.09.), Mitarbeiter nur den eigenen Stand. Gezählt werden nur aktuelle Mitglieder (Migration 0045).

### Insights
- Dashboard-Karte `insights-card.tsx` (events-Tabelle: Aufrufe, Chat-Fragen, Feedback, Wissenslücken) + Schritt-Feedback „Ich komme hier nicht weiter" im Wizard.

### Multi-Tenant / Auth / Settings
- Account/Guard: [`lib/account.ts`](src/lib/account.ts) (`requireAccount` — weist **Mitarbeiter** standardmäßig ab, Freigabe nur per `{ allowMember: true }`), Admin: [`lib/admin.ts`](src/lib/admin.ts).
- **Team-Rollen** ([`lib/roles.ts`](src/lib/roles.ts), Migration 0037): **Inhaber** (alles inkl. Team) · **Bearbeiter** (Inhalte, Erweiterung, Einstellungen der Organisation — nicht Team) · **Mitarbeiter** (nur Schulungen + Profil). DB: restriktive RLS-Policies (`can_edit_account`) für alle Schreibzugriffe; `accounts.plan` nur per Server änderbar (Trigger). Rolle änderbar im Team-Tab. Team-Grenze: Free 1 · Pro 5 · Business ∞ (inkl. offener Einladungen, `teamLimit` in `lib/plan.ts`).
- **Erweiterungs-Verbindung pro Person** (`recorder_tokens`, 0037; **0041: mehrere je Person, eine je Browser/Gerät**, Name aus User-Agent, `last_used_at` gedrosselt, max. 10 — älteste ungenutzte fliegt): verbinden trennt niemand anderen und keinen anderen Browser; Einstellungen → Steply-Erweiterung listet „Ihre verbundenen Browser“ mit „Trennen“; Entfernen/Herabstufen zu Mitarbeiter trennt ALLE Verbindungen der Person.
- **Mitarbeiter lesen nur Schulungen** (0039, restriktive SELECT-Policies `members read scope`): nur veröffentlichte Anleitungen + eigener Nachweis + veröffentlichte Wissensartikel; keine Entwürfe/Hinweise/Chat-Fragen/Automationen/Videos/Original-Bilder. Team-Zählungen auf `/app/lernen` laufen deshalb über den Admin-Client.
- **Verpixelt bleibt verpixelt in Schulungen** ([`lib/training-images.ts`](src/lib/training-images.ts)): Schritte mit Verpixelung bekommen eine Kopie mit eingebrannter Pixelierung (`{konto}/_verpixelt/<hash>.webp`, inhalts-adressiert, privat, signiert); scheitert das, kein Bild statt Original.
- **Einladungen** ([`lib/invitations.ts`](src/lib/invitations.ts)): 14 Tage gültig (auf `created_at`), „Neu senden" im Team-Tab (neuer Link, alter ungültig), abgelaufene belegen keinen Platz. Grenze wird beim Einladen UND Annehmen geprüft; Einladungen schreibt nur der Server (0038).
- **Organisation verlassen** (Profil, `leaveTeam`): jede Rolle, außer dem einzigen Inhaber.
- Auth-Formulare: `components/auth/*`. Token-Hash-Flow via `/auth/confirm` (nicht PKCE) für Anmelde-Link/Reset/E-Mail-Wechsel: ein GET leitet auf die Bestätigungsseite **`/link`** (`app/(auth)/link/page.tsx`), erst deren Knopf löst das Token ein (Link-Scanner wie Outlook Safe Links verbrauchen es sonst). Passwort-Regel `lib/password-rule.ts`; Passwort ändern nur mit altem Passwort bzw. frischem Mail-Link.
- **Mails**: ein Design in [`lib/email/`](src/lib/email) (Einladung, Willkommen, Team-Beitritt, Hinweis-Digest über Resend); Supabase-Auth-Vorlagen erzeugt `scripts/build-email-templates.mjs` nach `supabase/email-templates/` (Richard klebt sie ein).
- Einstellungen: `app/app/settings/*` mit Seitenleiste (`components/app/settings-nav.tsx`): **Allgemein · Team · Aussehen** (`components/app/appearance-editor.tsx`, feste Vorschau) **· Adresse & Teilen · Sprachen & Vorlesen · Chat auf Ihrer Website · Steply-Erweiterung · Tarif · Mein Profil** (Mitarbeiter sehen nur „Mein Profil“). Alte URLs `branding/einbetten/konto/abo/eskalation` leiten um.
- Tarife: `lib/plan.ts` (free/pro/**business**; `isPro`/`isBusiness`; Pro: Chat/Wissen/Offene Fragen, Logo/CI, Insights, Schulungen mit Nachweis, Video, Team bis 5; Business: Sprachen, Vorlesen, KI-Design, „nur Team“, Video-Export) + `lib/pricing.ts` (PLANS für Landing & Tarif-Seite). Gratis-Grenzen: `lib/tutorial-quota.ts`. Admin schaltet 3-stufig.
- Team-Einladungen: `components/app/team-manager.tsx` + `app/app/settings/team/actions.ts`.
- Onboarding: `components/app/onboarding-wizard.tsx`.

### Standard-Tutorials (Templates) + Admin
- Admin verwaltet Referenz-Templates: `components/admin/*`, `app/admin/actions.ts`, `app/app/template-actions.ts`.
- **Kundenverwaltung** `/admin/kunden` (Liste, Details, Tarif-Wechsel räumt den Hub-Cache, Support, Vorschau jeder Kunden-Anleitung inkl. Entwürfe): `lib/admin-customers.ts`, `components/admin/customer-*.tsx`. **Technik-Übersicht** `/admin/technik` (Fremddienste, Datenflüsse, Env-Check).
- „Fork beim Bearbeiten" + Zurücksetzen: siehe ARCHITEKTUR.md §14.

---

## 5. Wiederverwendbare Helfer (`src/lib/`)

| Datei | Zweck |
|---|---|
| `utils.ts` | `cn()` (clsx + **tailwind-merge**) |
| `supabase/{server,client,admin,proxy-session}.ts` | Supabase-Clients (Server/Browser/Service-Role) |
| `account.ts` / `admin.ts` | `requireAccount()`, `checkAdmin()` |
| `types.ts` | zentrale TS-Typen (`Step`, `StepBranch`, `Tutorial`, `Highlight`, …) |
| `upload.ts` | `compressAndUpload()`, `signedImageUrl()` (private Bilder) |
| `public-image.ts` | `publicImageUrl()` (öffentlicher Bucket) |
| `theme.ts` | `resolveTheme()`, `brandStyle()`, Fonts/Tokens (manual/ai/extreme) |
| `skin-css.ts` | `sanitizeSkinCss()` (Extreme-Design, Paint-only) |
| `slug.ts` | `slugify()` |
| `url.ts` | `appBaseUrl()` (räumt `NEXT_PUBLIC_APP_URL` auf) |
| `kb.ts` | Knowledge Base: `indexTutorial()`, Embeddings, Match |
| `templates.ts` | Standard-Templates |
| `ai.ts` / `openai.ts` / `ai-prompts.ts` | KI-Helfer, Client, Prompts |
| `builder/tree.ts` / `builder/constants.ts` | Render-Baum, YES/NO-Farben |
| `format.ts` | Formatierungen (`relativeDe`, `dateDe`) |
| `cache-tags.ts` | hubTag/tutTag + Invalidierungs-Helfer (cacheComponents) |
| `plan.ts` / `pricing.ts` | Tarif-Gates (isPro/isBusiness) / PLANS-Tabelle |
| `redact.ts` | `burnBlur()` — Blur unwiderruflich einbrennen (Publish); `unionBlurs()` für geteilte Bilder |
| `highlight-color.ts` | Standard-Markierungsfarbe → Kunden-Akzent (`markColor()`, `var(--brand-accent)`), eigene Farben bleiben |
| `share-link.ts` | „Link kopieren“: `hubTutorialUrl()`, `copyText()` (Editor-Kopf + ⋮-Menü) |
| `ssrf.ts` / `clicks.ts` / `recorder.ts` | safeFetch (SSRF) / clicks.json-Validierung / Recorder-Token+CORS |
| `translate.ts` / `translate-core.ts` / `translate-stale.ts` / `i18n-hub.ts` | Übersetzungs-Kern + stale + UI-Wörterbuch |
| `tts.ts` / `tts-core.ts` | Vorlesen (server-only Wrapper / import-freier Kern für Tests) |
| `kb-import.ts` / `gaps.ts` / `drift.ts` | Wissens-Import-Kern / Offene Fragen / Autopilot |
| `hub-theme.ts` | gecachter Theme-Load fürs persistente /h-Layout |
| `action-error.ts` | `UserError` / `withUserErrors` / `unwrap` / `errorText` — Fehlertexte aus Server-Actions (s. §10) |
| `storage-path.ts` | `isAccountStoragePath` / `isSafeStorageKey` — Speicherpfade nur im eigenen Konto, nur harmlose Zeichen (DB-Gegenstück 0042/0047) |
| `public-step.ts` / `public-name.ts` | Schritt-Felder für den öffentlichen Player / Organisationsname nie als E-Mail |
| `roles.ts` / `invitations.ts` / `training-images.ts` | Team-Rollen (`canEdit`) / Einladungen / verpixelte Schulungsbilder |
| `tutorial-quota.ts` / `text-limits.ts` | Gratis-Grenzen (Anleitungen, Video) / Längengrenzen für Freitexte |
| `search-match.ts` / `wizard-history.ts` | tolerante Textsuche / Player-Zurück-Historie |
| `guide.ts` / `guide-ai.ts` / `interaction-text.ts` / `automations.ts` | Sofort-Anleitung (Vertrag, KI-Feinschliff, Schritt-Texte) / Automationen |
| `email/` | Mail-Layout, -Texte, Versand (Resend) |
| `password-rule.ts` / `auth-errors.ts` | Passwort-Regel / deutsche Auth-Fehlertexte |

**UI-Bausteine** (`components/ui/`, Base UI): `button, input, password-input, textarea, label, select, switch, dialog, confirm-dialog, sheet, popover, dropdown-menu, command, badge, card, tooltip, separator, skeleton, input-group, sonner` (Toasts via `sonner`; Rückfragen immer über `confirm-dialog`).

---

## 6. Datenmodell / Migrations

Postgres, RLS über `my_account_ids()`. Migrations in [`supabase/migrations/`](supabase/migrations):
`0001_schema` · `0002_rls` · `0003_storage` · `0004_onboarding_and_kb` · `0005_kb_match` ·
`0006_admin_templates` · `0007_global_categories` · `0008_escalation` · `0009_theme_modes` ·
`0010_invitations` · `0011_extreme_design` · `0012_video_jobs` · `0013–0020` (Nachtschicht:
u. a. Indizes, events, plan, clicks) · `0021_internal_tutorials` (visibility + completions) ·
`0022_translations_tts` (3 Übersetzungstabellen + audio_path/hash + languages) ·
`0023_recorder_token` · `0024_business_plan` · `0025_render_jobs` · `0026_lernen_flag_video_category` ·
`0027_step_selector` · `0028_category_i18n` · `0029_site_context_guide` · `0030–0035` (Automationen,
Datei-Brücke, Zeitplan, bedingte Schritte/Sprünge) · `0036_step_interaction` · `0037_team_roles` ·
`0038_drop_legacy_recorder_token` · `0039_member_read_scope` · `0040_kb_index_integrity` ·
`0041_recorder_multi_connection` · `0042_integrity_guards` · `0043_rest_write_guards` ·
`0044_public_read_scope` · `0045_completion_guard` · `0046_guard_hardening` ·
`0047_storage_key_charset` · `0048_business_check_own_only` (alle live, Stand 24.09.2026).

Kern-Tabellen: `accounts` (plan, languages, slug), `account_members` (Rolle), `recorder_tokens`
(Erweiterungs-Verbindungen je Person/Browser; die alte Spalte `accounts.recorder_token` ist seit 0038 geleert und ungenutzt),
`automations` + Schritte/Läufe, `tutorials` (visibility, in_lernen),
`steps` (video_time, audio_path/hash), `step_branches`, `categories`, `themes`,
`change_alerts`, `kb_articles`(+Embeddings), `invitations`, `video_jobs` (clicks),
`events`, `tutorial_completions`, `tutorial_/step_/branch_translations`.
Storage-Buckets: `tutorial-images` (privat, signierte URLs), `tutorial-images-public`
(öffentlich, beim Publish gefüllt), `tutorial-videos` (privat, Worker-Input).

Migrationen werden **inline** angewandt (kein CLI):
`node --env-file=.env.local -e "import('pg')…"` mit `SUPABASE_DB_URL`.

---

## 7. Server-Actions (was es schon gibt)

- `app/app/actions.ts` – Tutorials: anlegen, **publish/unpublish** (kopiert Bilder + brennt Blur ein + indexiert + übersetzt + TTS via `after()`), `setTutorialVisibility` (intern↔öffentlich mit allen Nebenwirkungen).
- `app/app/tutorials/[id]/actions.ts` – Schritte/Branches CRUD (+ stale-Markierung & Delta-Übersetzung & TTS-Refresh), Kategorie, Titel, Frame-Picker-URL.
- `app/app/actions-translate.ts` – translateTutorial/Deltas/Backfill. `app/app/lernen/actions.ts` – Schulungsnachweis.
- `app/app/settings/{team,branding,konto,einbetten,eskalation}/actions.ts` (die Seiten dieser Ordner sind nur noch Weiterleitungen, die Actions werden von den neuen Einstellungs-Seiten genutzt; einbetten: `rotateRecorderToken`, `disconnectRecorderConnection`), `app/app/account-actions.ts` (Organisation wechseln), `app/app/search-actions.ts` (⌘K), `app/app/automationen/actions.ts`, `app/app/alerts/actions.ts`,
  `app/app/assistent/wissen/{actions,import-actions}.ts`, `app/app/insights-actions.ts`, `app/admin/actions.ts`, `app/onboarding/actions.ts`, `app/(auth)/actions.ts`.

Builder-Actions **persistieren nur** (kein `revalidatePath`); die UI ist optimistisch, IDs kommen vom Client.

---

## 8. Lokale Test-/Prototyp-Skripte (nur lokal, **gitignored**)

Liegen in `tutax/` (nicht im Repo, s. `.gitignore`). Aus `tutax/` starten (wegen `node_modules`):

| Skript | Zweck | Aufruf |
|---|---|---|
| `video-to-tutorial.mjs` | **Prototyp** der Video-Pipeline (schreibt lokal nach `video-out/`) | `node --env-file=.env.local video-to-tutorial.mjs ../sample.mp4` |
| `test-video-live.mjs` | E2E gegen den **deployten** Worker (lädt Video hoch, pollt, zeigt Highlights) | `node --env-file=.env.local test-video-live.mjs ../test1.mp4 richard` |
| `fetch-live-boxes.mjs` | lädt Schritt-Bilder eines Tutorials + **zeichnet die Boxen** drauf (Kontrolle) | `node --env-file=.env.local fetch-live-boxes.mjs <tutorialId>` |
| `seg-stability.mjs` | testet Stabilität der Segmentierung (5× denselben Transkript) | `node --env-file=.env.local seg-stability.mjs` |
| `delete-test-drafts.mjs` | löscht bestimmte Test-Entwürfe sauber (per ID-Liste im Skript) | `node --env-file=.env.local delete-test-drafts.mjs` |

---

## 9. Deploy & Branch-Workflow

- **App** (`src/…`): Änderung → `staging` → PR/Merge → **`main`** → **Vercel deployt automatisch**.
  (Workflow hier meist: commit auf `staging`, dann ff-merge nach `main`, beide pushen.)
- **Video-Worker** (`video-worker/…`, Hetzner): `git push` → einmal `deploy.sh` ausführen
  (`ssh root@… "su - tutax -c 'cd /opt/tutax/video-worker && bash deploy.sh'"`). Manuell, kein Cron/CI.
- **agent-bridge** (eigenes Repo): analog `deploy.sh` in `/opt/agent-bridge`.
- Details + Zugangs-Realität (root-only, kein tutax-Login-Key): **`../INFRA.md`** §7.
- **Kontingente (Stand 24.09.2026):** Vercel (ISR-Writes, Funktionszeit) und Resend liegen nahe am
  Gratis-Limit → große Prüfrunden lokal gegen `next build && next start` (`TEST_BASE=http://localhost:<port>`,
  gleiche DB), gegen live nur gezielte Smoke-Tests; **keine Test-Mails ohne Rückfrage**.
- **CI:** GitHub Actions nur als Minimal-Gate (`.github/workflows/ci.yml`: Typecheck + Lint);
  automatische Tests in CI bewusst nicht (Richard 24.09.2026).

---

## 10. Konventionen (sonst Build-Fehler / Chaos)

- **Base UI, nicht Radix**: `render={<Comp/>}` statt `asChild`, `delay` statt `delayDuration`.
- **`npm run build` MUSS grün sein** vor commit/push (AGENTS.md).
- **Next 16 ist anders** als gewohnt – im Zweifel `node_modules/next/dist/docs/` lesen.
- **Nur EINE agent-bridge-Instanz** pro Telegram-Token (sonst 409 Conflict).
- **`.sh` immer LF** (`.gitattributes`), sonst bricht bash auf Linux.
- Highlight-Koordinaten überall **relativ 0..1**, Ursprung oben-links.
- Bilder privat → **signierte URLs** im Builder/Preview; Publish kopiert in den Public-Bucket (+ brennt Blur ein, erzeugt TTS, übersetzt — **immer `publishTutorial` nutzen**).
- **cacheComponents**: neue /app- und /h-Routen brauchen loading.tsx/Suspense; gecachte Daten via `'use cache'` + `cacheTag` und Invalidierung über `lib/cache-tags.ts` — sonst zeigen Hub-Seiten bis zu 1 h alte Daten.
- **PPR + `notFound()` = HTTP 200 („weiches 404")** — bekannt und bewusst so gelassen (geprüft 22.09.2026 gegen `next build` + `next start`). Weil die statische Hülle rausgeht, BEVOR die dynamischen Daten da sind, steht der Status-Code schon fest, wenn `notFound()` greift. Betroffen sind **alle** PPR-Routen (◐), u. a. `/h/<unbekannt>`, `/h/<konto>/<unbekannt>`, `/h/<konto>/<unbekannt>/drucken`, `/invite/<kaputt>`, `/app/automationen/<unbekannt>`. Sichtbar ist trotzdem die richtige „Nicht gefunden"-Seite, und Next setzt dabei selbst `<meta name="robots" content="noindex">` + `<title>Nicht gefunden · Steply</title>` — Suchmaschinen indexieren die Seiten also nicht. Ein echter 404 ginge nur, indem man die Suspense-Grenzen (loading.tsx + den Marken-Wrapper in `/h/[account_slug]/layout.tsx`) entfernt und damit PPR für die öffentliche Hilfe-Seite aufgibt: erst-Byte-Zeit und der ruhige Ladezustand im Kunden-Design wären weg. Das ist der Preis nicht wert — **nicht umbauen**, ohne dass jemand PPR insgesamt in Frage stellt.
- **`not-found.tsx` in einem PPR-Segment greift nicht zuverlässig** (24.09.2026: live erschien trotzdem die
  Steply-404). Wo eine eigene „nicht gefunden“-Ansicht im Kunden-Design nötig ist, die Komponente direkt aus
  der Seite zurückgeben statt `notFound()` — Muster: `components/viewer/tutorial-missing.tsx` (Commit `f7dabd9`).
- **Gates gehören in jede geschützte Page**, nicht nur ins Layout (PPR liefert sonst den Page-Payload an
  Unberechtigte aus; Admin 22.09., Assistent-Seiten 24.09.).
- **Cache-Invalidierung so eng wie möglich**: Schritt-/Antwort-Änderungen nur den Anleitungs-Tag
  (`invalidateTutorialTags(id, { hub: false })`), den Hub-Tag nur bei Titel/Beschreibung/Kategorie/Sichtbarkeit —
  jeder Hub-Tag-Wurf lässt alle Seiten des Kontos neu rendern (Vercel-ISR-Writes).
- **Speicherpfade** (Bilder, Logos, Audio) nie ungeprüft aus DB/Client übernehmen: `lib/storage-path.ts`.
- **Fehlertexte aus Server-Actions** (23.09.2026): Next ersetzt im Produktions-Build den Text
  JEDES geworfenen Fehlers durch eine englische Standardmeldung (lokal mit `next dev` unsichtbar).
  Erwartete Ablehnungen daher `throw new UserError(…)` + Export über `withUserErrors`, Client
  `unwrap(await action())`, Anzeige `errorText(e, "…")` — alles in `lib/action-error.ts`.
- **Tarif-Gates**: Pro-Funktionen (Chat, Wissen, Offene Fragen, Logo/CI, ohne „Erstellt mit Steply“)
  über `isPro`/`brandedTheme`/`PRO_REQUIRED` in `lib/plan.ts`; Nachweis `scripts/test-pro-gates.mjs`.
  Business-Funktionen (Sprachen, Vorlesen, KI-Design, nur Team, Video-Export) über `isBusiness`;
  **gespeicherte** Sprachen immer durch `planLanguages(account, …)` filtern (Hilfe-Seite, Auto-
  Übersetzung, Editor), KI-Design fällt über `brandedTheme` unter Business auf „Steply-Standard“ —
  nach einem Herabstufen bleibt alles gespeichert, wirkt aber nicht (und kostet keine KI).
  Nachweis Ende-zu-Ende inkl. Herabstufen: `scripts/test-business-e2e.mjs`.
- **PostgREST-Embeds zwischen steps↔tutorials bzw. step_branches↔steps sind mehrdeutig**
  (zwei Fremdschlüssel: `tutorial_id`/`root_step_id`, `step_id`/`target_step_id`) → Fehler,
  `data` = null. Immer mit FK-Hinweis (`tutorials!steps_tutorial_id_fkey(…)`) oder zwei Abfragen.
- Deutsche UI-Texte NUR mit **typografischen Anführungszeichen** („…") — gerade Quotes haben schon Skripte zerlegt; Umlaute/Sonderzeichen nie durch Shell-Pipes schleusen (Write/Edit-Tool nutzen).
- **Arbeits-Workflow für KI-Wellen**: Agenten arbeiten in git-Worktrees auf `welle-XX-opus` (Basis origin/staging), pushen NUR ihren Branch; Review/Merge/Deploy macht die Haupt-Session. Tabu für Agenten: staging/main, package.json, next.config.ts, Migrationen, REVIEW.md, TODO.md.
</content>

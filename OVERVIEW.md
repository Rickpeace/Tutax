# Steply – Entwickler-Übersicht („Start hier")

> **Zweck:** Eine Landkarte für alle, die neu reinkommen (oder eine neue KI-Session).
> Damit man **vorhandene Funktionen findet statt sie neu zu erfinden**, die richtigen
> **Farben/Tokens** nutzt und weiß, **wie alles zusammenhängt**.
> Stand: 2026-07-02 (abends). Bitte bei größeren Änderungen hier nachziehen.

Steply (früher „Tutax") ist ein **einbettbares Klick-Anleitungs-SaaS**: Organisationen
bauen Schritt-für-Schritt-Tutorials (Screenshot + Markierung + Text, mit Ja/Nein-
Verzweigungen) — von Hand, aus einem **Video** (KI-Pipeline) oder per **Recorder-
Extension** — und veröffentlichen sie auf einer gehosteten Hilfe-Seite im eigenen CI:
mit **KI-Chatbot** (RAG nur aus eigenen Inhalten), semantischer Suche,
**Mehrsprachigkeit** (EN/PL/TR, Auto-Sync), **Vorlesen** (TTS), QR/Druck/Chat-Bubble.
Dazu: **interne Tutorials + Schulungsnachweis** (/app/lernen), Insights mit „Offene
Fragen"→KI-Entwurf, Aktualitäts-Autopilot, **Wissens-Import** (Website/Dokumente) und
3 Tarif-Stufen free/pro/**business** (serverseitig gegated, `lib/plan.ts`).
Die eigene Doku ist selbst ein Steply-Hub: **/h/steply** (?-Icon in der App-Leiste).

---

## 1. Doku-Landkarte (wo steht was)

| Datei | Inhalt |
|---|---|
| **`OVERVIEW.md`** (diese Datei) | Funktions-Inventar, Farben, lokale Skripte – „was gibt es schon" |
| `../ARCHITEKTUR.md` | **Vollständige Spezifikation** (Datenmodell, RLS, Routen, Editor-Spec, KI-CI, Viewer, Design-System §13) |
| `STATUS.md` | Projekt-Status (erledigt/offen), Architektur-Entscheidungen, Datei-Landkarte |
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
- **Vercel** (App, Auto-Deploy auf `main`). **Hetzner** (Video-Worker + agent-bridge, via `deploy.sh`).

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
| `--muted-foreground` | `text-muted-foreground` | `#8a7a63` | gedämpfter Text |
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
- **`step-panel.tsx`** – der Schritt-Editor (Titel, Screenshot, Erklärtext, Frage/Verzweigung-Toggle, Antwort-Optionen mit „→ Öffnen/anlegen", Vor/Zurück, Ungespeichert-Dialog).
- **`highlight-editor.tsx`** – Screenshot annotieren: Rechteck/Kreis/Pfeil/**Blur**, Farben, Verschieben/Resizen, **Lupe** (Zoom). Koordinaten relativ 0..1. Welle 51a: Verpixeln = echte Unschärfe (gemeinsame SVG-Bausteine `viewer/svg-marks.tsx`, auch in der Lupe), **Einrasten** (Bildmitte + Kanten anderer Markierungen, ±1,5 %, Hilfslinien, Alt = frei), **Zentrieren**, erstes Farbfeld = „Firmenfarbe“.
- **Ein Bild, mehrere Schritte** (Welle 51a): „Bild in neuen Schritt übernehmen“ (image-field → `builder.tsx` → `addStep(…, { imageFromStepId })`) teilt den `image_path`; Verpixelungen des Vorgängers werden als Vorschlag (`suggested` + `suggestedFrom: "previous"`) übernommen — auch beim Upload/Frame-Picker mit gleichen Bildmaßen. Geteilte Pfade: `/api/upload-url` vergibt dann einen eigenen Pfad (kein stilles Überschreiben), die öffentliche Kopie brennt die Vereinigung aller Verpixelungen ein (`unionBlurs`).
- **`image-field.tsx`** – Screenshot hochladen/ersetzen/entfernen, **Zuschneiden** (`crop-dialog.tsx`), **„Groß bearbeiten"** (Vollbild-Overlay).
- **`tutorial-header.tsx`** – Kopf: Zurück-Breadcrumb, **editierbarer Titel** (Stift), **Veröffentlicht-Schalter**, Kategorie, Jetzt-prüfen/Vorschau.
- **`rich-text.tsx`** – Erklärtext-Editor (Fett/Kursiv/Listen). Anzeige: `viewer/rich-text-view.tsx`.
- **`category-picker.tsx`**, **`drift-check-button.tsx`** – Kategorie zuordnen / KI-Drift-Check anstoßen.
- Baum-Logik: [`lib/builder/tree.ts`](src/lib/builder/tree.ts) (`buildRenderTree`).

### Video → Tutorial (Screencast + Stimme → Schritte)
- **`components/app/video-upload.tsx`** – „Aus Video": In-App-Recorder, Datei-Upload (auch **Bulk**), **Import per URL** (`/api/video-import`, SSRF-sicher via `lib/ssrf.ts`) und optionales **clicks.json** (Validierung `lib/clicks.ts`) → Bucket `tutorial-videos` + `video_jobs`-Zeile, pollt Status.
- **Recorder-Extension** (`extension/`, MV3): Screencast + **Klicks** (überleben Navigation); **Direkt-Upload** per Konto-Token (`accounts.recorder_token`, Einstellungen→Einbetten) über `/api/recorder/handshake` (signierte Storage-URL) + `/api/recorder/complete`. Ohne Token: 2 Datei-Downloads.
- **`video-worker/index.mjs`** (Hetzner, pm2 `video-worker`) – pollt `video_jobs`: ffmpeg-Normalisierung → Whisper (mit **Wort-Zeitstempeln**) → Segmentierung (**Marker-Wort „Schnitt"** = Schritt-Ende, sonst KI-Fallback) → pro Schritt Screenshot **kurz vor „Schnitt"** + **Frame-Diff-Grounding** (Vorher/Nachher) + Gitter-Overlay → Vision (Titel/Text/Highlight) → Tutorial-Entwurf.
- Wichtig: **„Schnitt" sagen** = ein Schritt fertig. Schrittgrenzen-Priorität: **Klicks → „Schnitt" → KI → Szenen-Erkennung → Gleichverteilung**; Live-Aufbau (Schritte erscheinen während der Verarbeitung, progress „Schritt X/Y"). Prompts/Logik im Worker (SEG_SYS/STEP_SYS). ⚠️ Neuer Worker-Stand wirkt erst nach `deploy.sh` (Richard).
- Builder: **„Bild aus Video wählen"** (Frame-Picker) in JEDEM Schritt, sobald ein Quell-Video existiert.

### KI-Funktionen
- **`/api/steps/suggest`** – Titel/Text/**Highlight** aus einem Screenshot vorschlagen (Gitter-Overlay).
- **`/api/theme/analyze`** – **CI-Übernahme**: Theme aus einem thum.io-**Screenshot** der Kanzlei-Website (zuverlässiger als CSS).
- **`/api/theme/extreme`** – „Extremes" Design (CSS-Skin), sanitisiert via [`lib/skin-css.ts`](src/lib/skin-css.ts) (Paint-only-Whitelist).
- **`/api/tutorials/[id]/check`** – **Drift-Agent** (prüft, ob Anleitung noch aktuell ist) → Alerts.
- **`/api/chat`** – **Hilfe-Chatbot** (RAG über Knowledge Base, [`lib/kb.ts`](src/lib/kb.ts)).
- **Mehrsprachigkeit** (EN/PL/TR, Business): AUTO-SYNC — Publish=Vollübersetzung, Edits=Delta (nur das geänderte Stück), Sprachaktivierung=Backfill, alles via `after()`. Kern `lib/translate*.ts`, Actions `app/app/actions-translate.ts`, UI-Wörterbuch `lib/i18n-hub.ts`, öffentlich via `?lang=` (Teil des Cache-Keys!).
- **Vorlesen/TTS** (Business): MP3 je Schritt beim Publish, Hash-Cache (`steps.audio_hash`), `lib/tts.ts` + `lib/tts-core.ts`, ▶ im Wizard. Backfill für Bestand: `scripts/backfill-tts.mjs <slug>`.
- **Wissens-Import**: „Von Ihrer Website" (`assistent/wissen/import-actions.ts`) + „Aus Dokument" (`/api/kb-import`, unpdf/mammoth) → `lib/kb-import.ts` erzeugt kb_articles-**ENTWÜRFE** (nie auto-publish).
- **Aktualitäts-Autopilot**: Vercel-Cron Mo 6:00 (`/api/cron/drift`, fail-closed ohne CRON_SECRET) + `lib/drift.ts`.
- Prompts zentral: [`lib/ai-prompts.ts`](src/lib/ai-prompts.ts). OpenAI-Client: [`lib/openai.ts`](src/lib/openai.ts), Helfer [`lib/ai.ts`](src/lib/ai.ts) (Modelle inkl. `tts`/`ttsVoice`).

### Veröffentlichen / Viewer
- **Publish**: `publishTutorial` / `unpublishTutorial` in [`app/app/actions.ts`](src/app/app/actions.ts) – Slug erzeugen + Schritt-Bilder in **öffentlichen** Bucket kopieren + für Chatbot indexieren. **Immer diese nutzen**, nicht nur `status` setzen.
- **Vorschau** (auch für Entwürfe): Route `/app/preview/[id]` → `viewer/wizard.tsx`.
- **Öffentlich**: `/h/[account_slug]` (Hub, `viewer/hub-browser.tsx`) + `/h/[account_slug]/[tutorial_slug]` (Wizard: Lightbox MIT Markierungen, ▶-Vorlesen, `?lang=`-Umschalter). Highlights: `viewer/viewer-image.tsx`. Chat: `viewer/chat-widget.tsx`. Persistentes CI-Layout (auch für Ladescreens): `h/[account_slug]/layout.tsx` + `lib/hub-theme.ts`.
- **Verbreitung**: QR (`/api/qr`), Druckansicht (`…/drucken`), **Chat-Bubble-Script** (`/h/embed.js?account=slug`), iframe/Link (Einstellungen→Einbetten), semantische Hub-Suche (`/api/hub-search`).

### Assistent-Zentrale (`/app/assistent` — Tab „Assistent")
- **Wissensdatenbank** (`assistent/wissen`; alte URL `/app/knowledge` leitet um) + Wissens-Import (s. o.).
- **Offene Fragen** (`assistent/fragen`): unbeantwortete Chat-Fragen (`lib/gaps.ts`) mit „Entwurf erstellen" (`gap-action.tsx`).
- **Kontakt & Eskalation** (`assistent/eskalation`; aus den Settings umgezogen).

### Intern & Lernen (Business)
- Sichtbarkeit „Öffentlich | Intern" im `tutorial-header.tsx`. Interne Tutorials: NIE auf /h, nie im RAG, nie im public Bucket (Migration 0021 + Guards in `kb.ts`/`templates.ts`/Actions).
- **`/app/lernen`**: Lern-Tab fürs Team, „Als absolviert markieren", Owner sieht **Schulungsnachweis** (`tutorial_completions`).

### Insights
- Dashboard-Karte `insights-card.tsx` (events-Tabelle: Aufrufe, Chat-Fragen, Feedback, Wissenslücken) + Schritt-Feedback „Ich komme hier nicht weiter" im Wizard.

### Multi-Tenant / Auth / Settings
- Account/Guard: [`lib/account.ts`](src/lib/account.ts) (`requireAccount`), Admin: [`lib/admin.ts`](src/lib/admin.ts).
- Auth-Formulare: `components/auth/*`. Token-Hash-Flow via `/auth/confirm` (nicht PKCE) für Reset/Invite.
- Einstellungen: `app/app/settings/*` (Branding/CI inkl. **Sprachen**, Team/Invites, Konto, Abo, Einbetten inkl. **Recorder-Token** — Eskalation wohnt jetzt unter `/app/assistent`).
- Tarife: `lib/plan.ts` (free/pro/**business**; `isPro`/`isBusiness`; Gates: Sprachen/KI-CI/Intern/TTS=Business) + `lib/pricing.ts` (PLANS für Landing & Abo). Admin schaltet 3-stufig.
- Team-Einladungen: `components/app/team-manager.tsx` + `app/app/settings/team/actions.ts`.
- Onboarding: `components/app/onboarding-wizard.tsx`.

### Standard-Tutorials (Templates) + Admin
- Admin verwaltet Referenz-Templates: `components/admin/*`, `app/admin/actions.ts`, `app/app/template-actions.ts`.
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

**UI-Bausteine** (`components/ui/`, Base UI): `button, input, textarea, label, select, dialog, sheet, popover, dropdown-menu, command, badge, card, tooltip, separator, skeleton, input-group, sonner` (Toasts via `sonner`).

---

## 6. Datenmodell / Migrations

Postgres, RLS über `my_account_ids()`. Migrations in [`supabase/migrations/`](supabase/migrations):
`0001_schema` · `0002_rls` · `0003_storage` · `0004_onboarding_and_kb` · `0005_kb_match` ·
`0006_admin_templates` · `0007_global_categories` · `0008_escalation` · `0009_theme_modes` ·
`0010_invitations` · `0011_extreme_design` · `0012_video_jobs` · `0013–0020` (Nachtschicht:
u. a. Indizes, events, plan, clicks) · `0021_internal_tutorials` (visibility + completions) ·
`0022_translations_tts` (3 Übersetzungstabellen + audio_path/hash + languages) ·
`0023_recorder_token` · `0024_business_plan`.

Kern-Tabellen: `accounts` (plan, languages, recorder_token), `tutorials` (visibility),
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
- `app/app/settings/{team,branding,konto,einbetten}/actions.ts` (einbetten: `rotateRecorderToken`; eskalation-Action liegt weiter unter settings/eskalation), `app/app/alerts/actions.ts`,
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
- Deutsche UI-Texte NUR mit **typografischen Anführungszeichen** („…") — gerade Quotes haben schon Skripte zerlegt; Umlaute/Sonderzeichen nie durch Shell-Pipes schleusen (Write/Edit-Tool nutzen).
- **Arbeits-Workflow für KI-Wellen**: Agenten arbeiten in git-Worktrees auf `welle-XX-opus` (Basis origin/staging), pushen NUR ihren Branch; Review/Merge/Deploy macht die Haupt-Session. Tabu für Agenten: staging/main, package.json, next.config.ts, Migrationen, REVIEW.md, TODO.md.
</content>

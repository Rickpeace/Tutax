# Steply – Entwickler-Übersicht („Start hier")

> **Zweck:** Eine Landkarte für alle, die neu reinkommen (oder eine neue KI-Session).
> Damit man **vorhandene Funktionen findet statt sie neu zu erfinden**, die richtigen
> **Farben/Tokens** nutzt und weiß, **wie alles zusammenhängt**.
> Stand: 2026-07-01. Bitte bei größeren Änderungen hier nachziehen.

Steply (früher „Tutax") ist ein **einbettbares Klick-Anleitungs-SaaS**: Organisationen
bauen Schritt-für-Schritt-Tutorials (Screenshot + Markierung + Text, mit Ja/Nein-
Verzweigungen) und veröffentlichen sie auf einer gehosteten Hilfe-Seite mit Chatbot.

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

- **Next.js 16** (App Router, Turbopack), **React 19**, **TypeScript**, **Tailwind v4**.
- **shadcn auf Base UI** (⚠️ nicht Radix — siehe Konventionen).
- **Supabase**: Postgres + Auth + Storage + pgvector. RLS über `my_account_ids()`.
- **OpenAI**: `gpt-5.4-mini` (Chat+Vision), `whisper-1` (Transkript), `text-embedding-3-small`.
- **Vercel** (App, Auto-Deploy auf `main`). **Hetzner** (Video-Worker + agent-bridge, via `deploy.sh`).

---

## 3. Design-System / Farben — **erst hier schauen, keine neuen Farben erfinden**

Definiert in [`src/app/globals.css`](src/app/globals.css) (`:root`) und als Tailwind-Klassen nutzbar
(`bg-…`, `text-…`, `border-…`). Details/Regeln: ARCHITEKTUR.md §13.

**App-Chrome / Editor:**
| Token | Klasse | Wert | Verwendung |
|---|---|---|---|
| `--ink` | `text-ink` | `#101524` | Haupt-Text/Überschriften |
| `--ink-2` | `text-ink-2` | `#3b4254` | sekundärer Text |
| `--muted-foreground` | `text-muted-foreground` | `#6b7280` | gedämpfter Text |
| `--line` | `border-line` / `bg-line` | `#e7e8ee` | Linien/Ränder, Toggle-Off |
| `--line-2` | `border-line-2` | `#f1f2f6` | feine Trenner |
| `--primary` | `bg-primary` / `text-primary` | `#3d4ee6` (Indigo) | primäre Aktion, Fokus-Ring (`ring`) |
| `--accent` | `bg-accent` | `#eef0fe` | dezente Hover-/Badge-Fläche |
| `--card` | `bg-card` | `#ffffff` | Karten/Panels |
| `--background` | `bg-background` | `#f7f8fb` | Seiten-Hintergrund |
| `--destructive` | `variant="destructive"` | `#d6455d` | Löschen |

**Signature – Ja/Nein-Verzweigungen (NUR dafür!):**
| Token | Klasse | Wert |
|---|---|---|
| `--yes` / `--yes-soft` | `bg-yes` / `bg-yes-soft` `text-yes` | `#0f9d72` grün / `#e9f7f1` |
| `--no` / `--no-soft` | `bg-no` / `bg-no-soft` `text-no` | `#d6455d` rosé / `#fdedf0` |

Konstanten `YES`/`NO` (Hex) für Branch-Farben: [`src/lib/builder/constants.ts`](src/lib/builder/constants.ts).

**CI-Brand (öffentlicher Viewer/Hub, pro Kanzlei überschrieben):** `--brand-accent/-soft/-bg/-ink`
(`bg-brand`, …). Wird aus dem Theme des Accounts gesetzt, **nicht** hart verdrahten.

**Radius:** `--radius: 0.75rem`; abgeleitet `rounded-md/lg/xl/2xl` (Karten meist `rounded-2xl`).
**Fonts:** `--font-sans` (Inter), `--font-display` (Space Grotesk) via `next/font`.

---

## 4. Kernfunktionen & wo sie leben (Inventar)

> **Bevor du etwas Neues baust: hier suchen.** Pfade relativ zu `src/`.

### Editor / Builder (`components/builder/`)
- **`builder.tsx`** – Orchestrator: State aller Schritte/Branches, Zwei-Spalten-Layout (Ablauf links, Editor angedockt rechts ab ≥1024px; Sheet auf schmal), Vor/Zurück-Navigation, Schritt anlegen/löschen/einfügen (auch in Äste).
- **`flow.tsx`** – der „Karten-Flow" (Signature-Diagramm mit verschachtelten Ja/Nein-Ästen), `+`-Einfüge-Punkte.
- **`step-panel.tsx`** – der Schritt-Editor (Titel, Screenshot, Erklärtext, Frage/Verzweigung-Toggle, Antwort-Optionen mit „→ Öffnen/anlegen", Vor/Zurück, Ungespeichert-Dialog).
- **`highlight-editor.tsx`** – Screenshot annotieren: Rechteck/Kreis/Pfeil/**Blur**, Farben, Verschieben/Resizen, **Lupe** (Zoom). Koordinaten relativ 0..1.
- **`image-field.tsx`** – Screenshot hochladen/ersetzen/entfernen, **Zuschneiden** (`crop-dialog.tsx`), **„Groß bearbeiten"** (Vollbild-Overlay).
- **`tutorial-header.tsx`** – Kopf: Zurück-Breadcrumb, **editierbarer Titel** (Stift), **Veröffentlicht-Schalter**, Kategorie, Jetzt-prüfen/Vorschau.
- **`rich-text.tsx`** – Erklärtext-Editor (Fett/Kursiv/Listen). Anzeige: `viewer/rich-text-view.tsx`.
- **`category-picker.tsx`**, **`drift-check-button.tsx`** – Kategorie zuordnen / KI-Drift-Check anstoßen.
- Baum-Logik: [`lib/builder/tree.ts`](src/lib/builder/tree.ts) (`buildRenderTree`).

### Video → Tutorial (Screencast + Stimme → Schritte)
- **`components/app/video-upload.tsx`** – „Aus Video": In-App-Recorder (Bildschirm+Mikro) **oder** Datei-Upload → lädt in Bucket `tutorial-videos` + legt `video_jobs`-Zeile an, pollt Status.
- **`video-worker/index.mjs`** (Hetzner, pm2 `video-worker`) – pollt `video_jobs`: ffmpeg-Normalisierung → Whisper (mit **Wort-Zeitstempeln**) → Segmentierung (**Marker-Wort „Schnitt"** = Schritt-Ende, sonst KI-Fallback) → pro Schritt Screenshot **kurz vor „Schnitt"** + **Frame-Diff-Grounding** (Vorher/Nachher) + Gitter-Overlay → Vision (Titel/Text/Highlight) → Tutorial-Entwurf.
- Wichtig: **„Schnitt" sagen** = ein Schritt fertig. Prompts/Logik im Worker (SEG_SYS/STEP_SYS).

### KI-Funktionen
- **`/api/steps/suggest`** – Titel/Text/**Highlight** aus einem Screenshot vorschlagen (Gitter-Overlay).
- **`/api/theme/analyze`** – **CI-Übernahme**: Theme aus einem thum.io-**Screenshot** der Kanzlei-Website (zuverlässiger als CSS).
- **`/api/theme/extreme`** – „Extremes" Design (CSS-Skin), sanitisiert via [`lib/skin-css.ts`](src/lib/skin-css.ts) (Paint-only-Whitelist).
- **`/api/tutorials/[id]/check`** – **Drift-Agent** (prüft, ob Anleitung noch aktuell ist) → Alerts.
- **`/api/chat`** – **Hilfe-Chatbot** (RAG über Knowledge Base, [`lib/kb.ts`](src/lib/kb.ts)).
- Prompts zentral: [`lib/ai-prompts.ts`](src/lib/ai-prompts.ts). OpenAI-Client: [`lib/openai.ts`](src/lib/openai.ts), Helfer [`lib/ai.ts`](src/lib/ai.ts).

### Veröffentlichen / Viewer
- **Publish**: `publishTutorial` / `unpublishTutorial` in [`app/app/actions.ts`](src/app/app/actions.ts) – Slug erzeugen + Schritt-Bilder in **öffentlichen** Bucket kopieren + für Chatbot indexieren. **Immer diese nutzen**, nicht nur `status` setzen.
- **Vorschau** (auch für Entwürfe): Route `/app/preview/[id]` → `viewer/wizard.tsx`.
- **Öffentlich**: `/h/[account_slug]` (Hub, `viewer/hub-browser.tsx`) + `/h/[account_slug]/[tutorial_slug]` (Wizard). Highlights rendern: `viewer/viewer-image.tsx`. Chat: `viewer/chat-widget.tsx`.

### Multi-Tenant / Auth / Settings
- Account/Guard: [`lib/account.ts`](src/lib/account.ts) (`requireAccount`), Admin: [`lib/admin.ts`](src/lib/admin.ts).
- Auth-Formulare: `components/auth/*`. Token-Hash-Flow via `/auth/confirm` (nicht PKCE) für Reset/Invite.
- Einstellungen: `app/app/settings/*` (Branding/CI, Team/Invites, Eskalation, Konto, Abo, Einbetten).
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
| `format.ts` | Formatierungen |

**UI-Bausteine** (`components/ui/`, Base UI): `button, input, textarea, label, select, dialog, sheet, popover, dropdown-menu, command, badge, card, tooltip, separator, skeleton, input-group, sonner` (Toasts via `sonner`).

---

## 6. Datenmodell / Migrations

Postgres, RLS über `my_account_ids()`. Migrations in [`supabase/migrations/`](supabase/migrations):
`0001_schema` · `0002_rls` · `0003_storage` · `0004_onboarding_and_kb` · `0005_kb_match` ·
`0006_admin_templates` · `0007_global_categories` · `0008_escalation` · `0009_theme_modes` ·
`0010_invitations` · `0011_extreme_design` · `0012_video_jobs`.

Kern-Tabellen: `accounts`, `tutorials`, `steps`, `step_branches`, `categories`, `themes`,
`change_alerts`, `kb_articles`(+Embeddings), `invitations`, `video_jobs`.
Storage-Buckets: `tutorial-images` (privat, signierte URLs), `tutorial-images-public`
(öffentlich, beim Publish gefüllt), `tutorial-videos` (privat, Worker-Input).

Migrationen werden **inline** angewandt (kein CLI):
`node --env-file=.env.local -e "import('pg')…"` mit `SUPABASE_DB_URL`.

---

## 7. Server-Actions (was es schon gibt)

- `app/app/actions.ts` – Tutorials: anlegen, **publish/unpublish**, u. a.
- `app/app/tutorials/[id]/actions.ts` – Schritte/Branches CRUD, Kategorie, **Titel** (`setTutorialTitle`), Einfügen/Löschen mit Auto-Verdrahtung.
- `app/app/settings/{team,branding,eskalation,konto}/actions.ts`, `app/app/alerts/actions.ts`,
  `app/app/knowledge/actions.ts`, `app/admin/actions.ts`, `app/onboarding/actions.ts`, `app/(auth)/actions.ts`.

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
- Bilder privat → **signierte URLs** im Builder/Preview; Publish kopiert in den Public-Bucket.
</content>

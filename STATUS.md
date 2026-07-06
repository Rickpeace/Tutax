# Tutax — Projekt-Status & Betriebsanleitung

> Selbstgepflegte Status-/Kontextdatei (für Claude). **Bei jeder größeren Änderung aktualisieren.**
> **Neu reinkommen? Zuerst [`OVERVIEW.md`](OVERVIEW.md) lesen** (Funktions-Inventar, Farben, lokale Skripte – „was gibt es schon").
> Spezifikation: `../ARCHITEKTUR.md` · Infra/Deploy: `../INFRA.md`
> **Design-Referenz NEU: `desing claude/` (README + SPEC-*.md, gitignored) — ersetzt prototyp-v4.jsx/§13-Farben.**

Letztes Update: 2026-07-06 (LIVE-FÜHRUNG + Seiten-Erkennung, s. §7h; davor Warm-Redesign §7g — Details: REVIEW.md, offene Punkte: TODO.md)

## 7h. Live-Führung + Seiten-Erkennung (06.07.2026, Wellen 31a–d) — LIVE, Extension v2.5.1
> Tango-Prinzip: Die Extension führt Tutorials DIREKT auf der echten Website — Panel
> „Anleitung führen" + pulsierendes Koralle-Overlay (`extension/guide-resolve.js`,
> 3-stufige Selektor-Auflösung), Klick = weiter, Verzweigungen als Frage, Screenshot-
> Fallback + `selector_miss`-Drift-Event. Seiten-Kontext: Migration 0029
> (`steps.page_url`, `tutorials.site_domains`, `events.type='guide'`), Sofort-Aufnahme
> sät Domains, Builder-Feld „Gilt für Website", Panel-Sektion „📍 Für diese Seite"
> (Matching NUR lokal im Browser). Titel + Kategorie beim Aufnehmen im Panel (31d).
> APIs: `/api/recorder/tutorials(+/[id])`, `/api/recorder/categories`,
> `/api/recorder/guide-event`. Tests: `test-guide-api-live`, `test-guide-resolve`,
> `test-site-context-live`, `test-site-match`, `test-guide-category-live`.
> **Welle 32 GEMERGED (v2.6.0)**: Eingabe-Schritte live führbar (Selektor auch bei
> blur-Aufnahme, weiter bei Enter/blur-mit-Wert), Overlay mit Hingucker-Zoom+Glow,
> Führen-Liste „Diese Seite + Live" mit Kategorien-Gruppen, Banner nur im Anker-
> Modus, Icon-Badge (nur published), „Bring mich hin". Details REVIEW.md.

## 7g. Warm-Redesign (05.07.2026, Design-Handoff „desing claude/") — LIVE (Commit 172717b)
> Komplettes visuelles Redesign nach dem High-Fidelity-Handoff (Nunito, Creme #FDF9F3,
> Ink-Braun #33291F, Koralle #EF6A4E + „harter Schatten" 0 4px 0 #D3543A, 2px-Borders,
> Teal/Violett/Amber/Blau-Pastelle). Funktionalität 1:1. Build+Lint grün, Playwright-
> Screenshots aller Flächen geprüft. Die alte §13-Farbwelt (Indigo/Space Grotesk) ist Geschichte.
- **Fundament**: globals.css-Tokens komplett warm; Nunito 600–900 (einzige Schrift);
  Utilities `.shadow-hard(-line)`, `.pressable`, `.bg-stripes`; Buttons app-weit Pills
  (Primär mit hartem Schatten, `ink`-Variante NEU); Card = border-2/rounded-card(18px);
  NEU `lib/category-colors.ts` (deterministische Akzentfamilie je Kategorie + Streifen).
- **Bibliothek /app (Option 2a/2b)**: NEU `components/app/app-header.tsx` (64px-Topnav:
  Pills Bibliothek/Lernen/Assistent, Such-Pill→⌘K, Glocke, „＋ Neue Anleitung", Avatar-
  Menü mit Org-Wechsel/Settings/Admin/Abmelden; mobil TabBar mit „Aufnehmen"-Aktion);
  NEU `components/app/library-browser.tsx` (Kategorien-Sidebar 230px m. Bereich-/
  Kategorie-Filtern + Zählern, Status-Filter, Kartenraster, Anlegen-Karte gestrichelt);
  `tutorial-card.tsx` = Design-Karte (110px-Streifen-Thumb im Kategorie-Pastell,
  Kategorie-/Kunde-/Intern-Chips, Teal-/Amber-Status-Chips, Toggle+Menü erhalten);
  page.tsx liefert Schritt-Zähler (eine steps-Query für Thumb+Count). Wordmark NEU
  (S-Kreis, alte Ja/Nein-Punkte weg). ALT ENTFÄLLT: CollapsibleSection auf dem Dashboard,
  CategoryJump, AudienceFilter-Chips (Bereich wohnt jetzt in der Sidebar).
- **Hilfe-Center /h (3b/4a)**: Branding-Header-Leiste, Hero „Wie können wir helfen?"
  (NEUER i18n-Key `heroTitle` DE/EN/PL/TR), große Such-Pille, 2-spaltiges Kategorien-
  Grid mit Familien-Icon-Kacheln + →-Pfeilen. **Kunden-CI bleibt**: Farbfamilien nur
  bei mode=manual (`colorful`-Prop), sonst monochrom brand-accent; alle neuen Flächen
  nutzen brand-Vars + color-mix(ink) für Neutraltöne. Warme brand-Defaults in
  globals.css + theme.ts-Fallbacks.
- **Viewer (3a/4a)**: IN PLACE restylt (Logik unangetastet): Fortschrittszeile
  „SCHRITT X VON Y" + Balken, Bühnen-Schatten, Pill-Buttons (Weiter mit hartem
  Akzent-Schatten), **Schrittlisten-Sidebar nur Desktop + nur lineare Tutorials**
  (linearPath; bei Verzweigungen keine ehrliche Liste), klickbare Schritte (jumpTo).
  Tutorial-Seiten-Wrapper lg:max-w-4xl.
- **Landing (4b/5a)**: komplett neu mit finaler Handoff-Copy; Browser-Mockup zeigt
  ECHTEN Bibliotheks-Screenshot (`public/marketing-bibliothek.png`); Preis-Sektion im
  Handoff-Stil ergänzt (PLANS). SiteHeader/SiteFooter/CompareSlider auf der Landing
  nicht mehr verwendet (Dateien existieren noch für Unterseiten).
- **Nachgezogen**: Builder-Branch-Farben YES/NO → Teal/#d3543a (neue Branches; alte
  behalten DB-Farbe), GUIDE_HIGHLIGHT_COLOR → Koralle, Drift-Mail-Button → Koralle.
  eslint ignoriert `desing claude/**`; Ordner ist gitignored.
- **CI-Designer verifiziert**: KI-Design = Tokens→brand-Vars (Struktur unberührt);
  Extreme = Paint-only via sanitizeSkinCss, alle data-tx-Hooks existieren weiter
  (+ NEU data-tx="hero", Prompt-Hookliste aktualisiert). test-branding-live +
  test-render-live GRÜN. Video-Worker-Fallbacks → Koralle/Teal (wirken live erst
  nach deploy.sh!); Test-Assertion angepasst.
- **Recorder-Extension**: API unverändert (test-recorder-live GRÜN); Popup-CSS auf
  Warm-Palette (Token-Block + Pill-Buttons mit hartem Schatten), Klick-Marker im
  content.js + generierte Icons → Koralle. Nutzer müssen die Extension neu laden
  (chrome://extensions → Aktualisieren), Store-Paket ggf. neu bauen.
- **Offen (bewusst)**: Settings/Lernen/Assistent/Builder erben die warmen Tokens,
  sind aber noch nicht komponentenweise nachpoliert; „KUNDEN"-Sidebar-Gruppe des
  Designs entfällt (kein Kunden-Entity im Datenmodell); Landing-Burger (5a) entfällt
  (kein Menü definiert); ARCHITEKTUR.md §13 muss auf die Warm-Palette umgeschrieben
  werden.

---

## 1. Was ist Steply?
Embeddable Step-by-Step-Tutorial-SaaS — **bewusst generisch für JEDE Organisation mit
Erklärbedarf** (nicht steuer-spezifisch; Kanzleien sind nur die erste Zielgruppe).
Organisationen bauen klickbare Anleitungen (Screenshots + Highlights + Verzweigungen —
von Hand, aus Video oder per Recorder-Extension), veröffentlichen sie als **gehostete
Hilfe-Hub-Seite** im eigenen CI-Look, mehrsprachig und mit Vorlese-Audio. Endnutzer
klicken sich durch oder fragen den KI-Chat. Fürs eigene Team: interne Tutorials mit
Schulungsnachweis.

## 2. Stack
- **Next.js 16** (App Router, Turbopack), React 19, TypeScript
- **Tailwind v4** + **shadcn/ui auf Base UI** (NICHT Radix!)
- **Supabase** (Postgres, Auth, Storage) — Projekt „ClickTax", Region eu-west-1
- **Tiptap** (Rich Text), **browser-image-compression** (WebP)

## 3. Konventionen (WICHTIG — sonst Build-Fehler)
- shadcn = **Base UI**: Komposition via `render={<Link/>}` statt `asChild`;
  `<Button render={<Link/>}>` braucht zusätzlich **`nativeButton={false}`**;
  `TooltipProvider delay` statt `delayDuration`. Im Zweifel `src/components/ui/<x>.tsx` lesen.
- Next 16: `proxy.ts` statt `middleware.ts`; `cookies()`/`headers()`/`params`/`searchParams` sind **async**.
- `"use server"`-Dateien dürfen **nur async Funktionen** exportieren (keine Konstanten).
- Dev-Skripte unter `scripts/` sind in `tsconfig.json` excluded.

## 4. Umgebung / Secrets (`.env.local`, NICHT committen)
```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY,
SUPABASE_JWKS_URL, SUPABASE_DB_URL (Session-Pooler!), NEXT_PUBLIC_APP_URL
OPENAI_API_KEY    = LEER  ← EINZIGER KI-Key. Aktiviert ALLES: CI-Analyse (gpt-4o Vision),
                            Chatbot/RAG (gpt-4o-mini + text-embedding-3-small), Drift (gpt-4o-mini)
```
> KI-Entscheidung (vom Nutzer): ALLES über OpenAI. Zentrale Config `src/lib/ai.ts`
> (aiConfigured()), Client `src/lib/openai.ts`, Prompts `src/lib/ai-prompts.ts`.
> Sobald OPENAI_API_KEY gesetzt ist, sind alle KI-Features aktiv — kein Code-Change nötig.
> Migrationen 0004/0005 NUR neu anwenden (0001-0003 sind schon da), inline via pg.
> ⚠️ Keys liegen im Chat-Verlauf → der Nutzer will sie nach Go-Live rotieren.

## 5. Befehle
- Dev: `npm run dev` · Build/Typecheck: `npm run build`
- Migrationen anwenden: `node --env-file=.env.local scripts/apply-migrations.mjs`
- **Verifikation (alle gegen echte DB):**
  - `node --env-file=.env.local scripts/test-auth-rls.mjs`     (Trigger + RLS + Isolation)
  - `node --env-file=.env.local scripts/test-builder-live.mjs` (Schritte/Verdrahtung)
  - `node --env-file=.env.local scripts/test-editing-live.mjs` (Update/Decision/Branches)
  - `node --env-file=.env.local scripts/test-insert-live.mjs`  (§7.4 Einfügen)
  - `node --env-file=.env.local scripts/test-upload-live.mjs`  (Storage + RLS)
  - `node --env-file=.env.local scripts/test-publish-live.mjs` (Publish + public Bucket)
  - `node --env-file=.env.local scripts/test-category-live.mjs` (Kategorien)
  - `node --env-file=.env.local scripts/test-branding-live.mjs` (Branding + Slug-Unique)
  - `node --env-file=.env.local scripts/test-logo-live.mjs`    (Logo public Bucket)
  - `node --env-file=.env.local scripts/test-onboarding-live.mjs` (onboarded + KB-RLS)
  - `node --env-file=.env.local scripts/test-kb-live.mjs`      (pgvector + match_kb)
  - `node --env-file=.env.local scripts/test-templates-live.mjs` (Standard-Templates §14)
  - `node --env-file=.env.local scripts/test-blur-live.mjs`    (Blur-Einbrennen)
  - `node --env-file=.env.local scripts/test-internal-rls.mjs` (interne Tutorials anon-dicht)
  - `node --env-file=.env.local scripts/test-internal-trace.mjs` (intern: keine public Bilder/Embeddings)
  - `node --env-file=.env.local scripts/test-kb-import-live.mjs` (Wissens-Import + SSRF + PDF)
  - `node --env-file=.env.local scripts/test-translate-live.mjs` (Übersetzungen inkl. Delta + stale)
  - `node --env-file=.env.local scripts/test-tts-live.mjs`     (Vorlesen: Hash-Cache, public MP3)
  - `node --env-file=.env.local scripts/test-recorder-live.mjs` (Extension-Direkt-Upload, startet Server :3013)
  - `npx tsx scripts/test-tree.ts`                             (Tree-Derivation)
  - `node --env-file=.env.local scripts/seed-datev.mjs`        (DATEV-Tutorials seeden, idempotent)
  - Seeds/Pipelines: `seed-steply-help.mjs` (/h/steply-Doku), `shoot-steply-help.mjs <pw-dir>`
    (Screenshots + Auto-Markierungen), `backfill-tts.mjs <slug>` (Vorlesen für Bestand;
    mit `--experimental-strip-types` starten)
  > Stand 2026-07-02: alle Live-Tests + Build + Lint(0) GRÜN. Lint ist in CI blockierend.

## 6. Architektur-Entscheidungen (mit Nutzer abgestimmt)
- **Kapitel optional**: `steps.tutorial_id` direkt; `chapter_id` nullable (Schublade).
- **`tutorials.root_step_id`** = Startschritt; Ablauf über `step_branches`, nicht position.
- **Builder optimistisch**: Client-State, sofortige UI, Hintergrund-Persistenz (kein revalidate);
  Client vergibt IDs (`crypto.randomUUID`). Resync nur bei echtem Reload.
- **Einfügen §7.4**: kontextuelle „+" (Connector + oben in Ast-Block), Auto-Verdrahtung.
- **Storage §5**: privat `tutorial-images` (Signed Upload URL), beim Publish Kopie in
  public `tutorial-images-public`. Anzeige im Editor = signierte URLs (Client).
- **Lupe**: In-Place (Form vergrößert Inhalt darunter 2×), CSS/SVG-Clip. Blur im Viewer = echtes feGaussianBlur.
- **Crop**: nach Bildauswahl, Seitenverhältnis-Lock (Frei/16:9/4:3/1:1/9:16).
- **Öffentliche Seiten (`/h/...`)**: serverseitig **Admin-Client** mit explizitem
  `status='published'`-Filter (umgeht RLS bewusst, kontrolliert). CI via `brandStyle(tokens)`.

## 7. Status — ERLEDIGT & verifiziert
- [x] Setup, Design-Tokens (§13), deutsches Layout
- [x] DB: Schema/RLS/Trigger/Storage (`supabase/migrations/0001-0003`) — live verifiziert
- [x] Auth (E-Mail+Passwort, Magic Link, Signup-Trigger legt Account/Member/Theme an)
- [x] Dashboard (Tutorial-CRUD: neu/umbenennen/duplizieren/löschen/publish)
- [x] Builder: Karten-Flow + verschachtelte Ja/Nein-Äste, Tiptap, Frage/Antworten,
      Löschen+Umverdrahtung, Auto-Save, „+"-Einfügen, Bild-Upload+Crop, Highlights
      (Rechteck/Kreis/Pfeil/Blur), Lupe, Resize-Handles (mobil-tauglich)
- [x] Publish-Flow (Slug eindeutig/Account, Bildkopie public)
- [x] Hub-Seite `/h/[account]` (nach Kategorie, Suche, CI-Look)
- [x] Viewer `/h/[account]/[slug]` (Wizard folgt Branches, Pfad-History, Bild/Highlights/Lupe/Blur)
- [x] CI-Theming (Tokens→CSS-Vars, Default Indigo)
- [x] **Kategorien** (Editor-Combobox §7.3, „on the fly" anlegen + zuordnen) — verifiziert
- [x] **Manuelles Branding** `/app/settings/branding`: Name, Slug (unique), Farben (Live-Vorschau),
      **Logo** (Upload→public Bucket, im Viewer/Hub gerendert) — verifiziert
- [x] Mobile-Feinschliff am Header (Label auf <sm ausgeblendet)
- [x] Settings-Link + „Hilfe-Seite"-Link im App-Header

## 7b. SaaS-Ausbau (Nacht-Lauf 2) — ERLEDIGT & verifiziert
- [x] Proxy gehärtet (fail-open bei Supabase-Aussetzer, 3s-Timeout)
- [x] Dashboard nach Kategorie gruppiert + „+ Tutorial" pro Kategorie
- [x] Marketing-Landingpage (Hero, Features, How-it-works, Signature-Mockup, CTA) +
      `SiteHeader`/`SiteFooter`, `/anleitung` (Doku), `/impressum`, `/datenschutz`
- [x] Settings-Hub `/app/settings` mit Tabs: **Branding · Einbetten · Konto · Abo**
      (Zahnrad im Header → Hub). Branding in den Hub verschoben.
- [x] Einbetten-Seite: Hilfe-Link + iFrame-Snippet (Copy), `CopyField`
- [x] Konto: E-Mail, **Passwort ändern** (funktional), Konto-Löschen (Platzhalter)
- [x] Abo: 3 Platzhalter-Tarife (Kostenlos/Pro/Premium), Upgrade „bald" (Stripe später)
- [x] **Onboarding-Wizard** `/onboarding` (erster Login, via `accounts.onboarded`):
      Willkommen → Name + Kanzlei-Website-URL (→ themes.source_url für KI). Skip möglich.
- [x] KI-Scaffolding: `src/lib/ai.ts`, `/api/theme/analyze` (Stub, speichert URL,
      meldet Key-Status), `AutoCi`-Box in Branding, Migration 0004 (onboarded + kb_embeddings/pgvector)
- [x] Live verifiziert: `scripts/test-onboarding-live.mjs` (onboarded, source_url, kb RLS)

## 7c. Design-Overhaul + KI-Framework (Nacht-Lauf 3) — ERLEDIGT
**Design (entgenerifiziert):**
- [x] Display-Font **Space Grotesk** (Headings global) + **Inter** (Body) via next/font
- [x] Landingpage komplett neu: editorial, Bento-Grid, Verzweigungs-Motiv (grün/rot) als
      Marke, dunkler Kontrast-Abschnitt, Produkt-Canvas (Builder + Phone), Punkt-Raster
- [x] Konsistente `Wordmark` (Ja/Nein-Punkte) in Marketing/Auth/App; Texturen+Motiv-Utilities in globals.css

**KI-Framework — ALLES OpenAI (gated auf OPENAI_API_KEY, baut & läuft ohne Key als No-op):**
- [x] `lib/ai.ts` (Config), `lib/openai.ts` (Client + embed/embedMany), `lib/ai-prompts.ts` (Prompts)
- [x] **CI-Analyse** `/api/theme/analyze`: Website holen → Farben/Fonts/og:image extrahieren →
      gpt-4o (Vision) → Theme-Tokens → `themes.tokens` (status ready). UI: `AutoCi` in Branding.
- [x] **Chatbot/RAG**: `lib/kb.ts` (Indizierung beim Publish), Migration 0005 `match_kb` (pgvector),
      `/api/chat` (Frage→Embed→Suche→gpt-4o-mini, antwortet nur aus Kontext + Quell-Links),
      `ChatWidget` auf der Hub-Seite. Backbone live verifiziert (test-kb-live).
- [x] **Drift-Agent**: `/api/tutorials/[id]/check` (gpt-4o-mini bewertet Veralterung →
      `change_alerts` + `freshness`), `DriftCheckButton` im Editor, Alert-Center `/app/alerts`,
      Glocke mit Zähler im Header.
- [x] **6 echte DATEV-Tutorials geseedet** (ohne Bilder, als Entwurf): SmartLogin einrichten,
      Troubleshooter (Verzweigung), Gerätewechsel, Belege hochladen, Meine Steuern, Passwort/2FA.
      Script: `scripts/seed-datev.mjs` (idempotent). Bilder ergänzt der Nutzer.

## 7d. Admin + Standard-Templates §14 (Live-Referenz-Modell) — ERLEDIGT & verifiziert
**Entscheidung Nutzer:** zentral gepflegte Tutorials, Updates wirken AUTOMATISCH bei allen
Kunden (Referenz-Modell, nicht Kopie). Fork erst beim Bearbeiten.
- [x] Migration **0006**: `admins`, `is_admin()` (SECURITY DEFINER), RLS für Templates
      (`account_id IS NULL`), Admin = richard@petrasch.com geseedet.
- [x] **/admin** (gated via `requireAdmin`): Template-Liste, anlegen, veröffentlichen/zurückziehen/
      löschen (`src/app/admin/`), Bearbeitung über bestehenden Builder; Admin-Link im App-Header.
- [x] **Kunden-Actions** `src/app/app/template-actions.ts`: `setTemplateEnabled` (Häkchen),
      `forkTemplate` (Deep-Copy + gleicher Slug → URL stabil → Editor), `resetTemplate`.
- [x] **Auflösung** `src/lib/templates.ts`: `getCatalog` (eigene + Standard/Fork),
      `resolveCustomerTutorial` (Slug → eigene/Fork/zentrale Version).
      Standard = zentrale Version (Auto-Update); Angepasst = eigene Kopie.
- [x] **Dashboard**: Sektion „Standard-Anleitungen von Tutax" (Häkchen, Tags Standard/Angepasst,
      Anpassen, Zurücksetzen). **Hub + Viewer**: aktivierte Templates live aufgelöst.
- [x] **6 DATEV-Anleitungen als globale Templates** (published, mit Slug):
      `node scripts/seed-datev.mjs --templates`. Redundante account-DATEV in RichardTax entfernt.
- [x] Verifiziert: `scripts/test-templates-live.mjs` (aktivieren/auflösen/forken/zurücksetzen/deaktivieren).

## 7e. KI scharf geschaltet (OPENAI_API_KEY gesetzt) — 2026-06-26
- [x] Key lokal in `.env.local` gesetzt + verifiziert (text-embedding-3-small, 1536 Dim).
      ⚠️ **Auch bei Vercel** eintragen, sonst hat die Live-Seite keine KI.
- [x] **RAG-Backfill** `scripts/index-kb.mjs`: indexiert eigene Tutorials, Wissensartikel
      und aktivierte Standard-Templates (pro Account). End-to-end getestet (Frage→match_kb→gpt-4o-mini).
- [x] `lib/kb.ts`: `indexTutorial`-Delete **account-scoped** (geteilte Templates sicher).
- [x] `template-actions`: Aktivieren/Fork/Reset halten den Chatbot-Index automatisch in sync.
- [x] **KI-Schritt-Assistent**: `/api/steps/suggest` (gpt-4o Vision) → Titel, Text, Markierung
      aus Screenshot. Button im Builder (`step-panel.tsx`) übernimmt Vorschlag + Highlight.
      Nur für eigene Tutorials (Templates haben account_id NULL → kein Upload-Pfad, s. §9).

## 7f. Wellen-Ausbau 01.–02.07.2026 (Fable dirigiert, Opus baut in Worktrees) — ERLEDIGT
> Vollständiges Protokoll: **REVIEW.md → „Erledigt in der Nachtschicht"-Block.** Kurzfassung:
- [x] **Sicherheit/Basis**: Blur wird beim Publish IN die Pixel gebrannt (`lib/redact.ts`);
      Security-Header; Plan-Gating + Admin-Tarif-Schalter; Fehlerseiten; SEO (OG/robots/sitemap).
- [x] **cacheComponents/PPR aktiv**: `'use cache'`+Tags auf /h, Invalidierung in ~20 Mutationen
      (`lib/cache-tags.ts`), persistentes CI-Layout für /h inkl. CI-treuer Ladescreens.
- [x] **Video-Pipeline**: Live-Aufbau + progress, Klick-Modus (clicks.json), Szenen-Erkennung,
      Frame-Picker in jedem Schritt, Bulk/URL-Import; **Recorder-Extension v2** (Klicks überleben
      Navigation, Direkt-Upload per Konto-Token). ⚠️ Worker-Stand wirkt erst nach `deploy.sh`.
- [x] **Assistent-Zentrale** /app/assistent (Wissensdatenbank + Offene Fragen + Eskalation);
      **Wissens-Import** (Website SSRF-sicher / PDF/DOCX) → Entwürfe; Chat-Bubble-Embed; QR; Druck.
- [x] **Insights** (events) + Frage-Lücken-Miner; **Aktualitäts-Autopilot** (Cron, fail-closed).
- [x] **Interne Tutorials + Schulungsnachweis** (/app/lernen, Migration 0021, anon-dicht).
- [x] **Mehrsprachigkeit** EN/PL/TR mit Auto-Sync (Migration 0022) + **Vorlesen/TTS** (▶ im Wizard).
- [x] **Tarife** free/pro/**business** (Migration 0024) mit Server-Gates; neue Landing v2
      (echte Screenshots, CI-Vergleichs-Slider, Preistabelle 0/29/79).
- [x] **Selbst-Doku**: /h/steply (7 Anleitungen, echte Screenshots + Auto-Markierungen + Audio).

## 8. PHASE 1 KOMPLETT ✅ — inzwischen weit darüber hinaus (s. 7f)
Der gesamte Kreislauf (bauen → veröffentlichen → live ansehen → messen → nachschärfen)
steht und ist gegen die echte DB verifiziert. Aktuelle offene Punkte: **TODO.md**.

## 9. Status — OFFEN
> **Aktuelle, gepflegte Liste: TODO.md** (Richard-Aufgaben, geparkte Features, Technik).
Historische Spec-Lücken aus `ARCHITEKTUR.md`, die weiterhin offen sind:
- [ ] **§9.5 Missbrauchs-Logging** (`view_logs`) — events-Tabelle deckt Insights ab, kein Abuse-Report.
- [ ] **§9.5 Rate-Limiting** öffentl. Endpunkte (Chat hat eins; Hub/Viewer nicht) — vor Go-Live.
- [x] **§10 Drift als Cron** — ERLEDIGT (Aktualitäts-Autopilot, Mo 6:00, braucht CRON_SECRET in Vercel).
- [x] **§11 Knowledge-Base** — ERLEDIGT (heute unter /app/assistent/wissen, inkl. Import).
- [ ] **§9.3 Custom Domain** (Business, „bald") · **§9.4** `/view/[token]` (Chat-Bubble-embed.js EXISTIERT).
- [x] **Mehrsprachigkeit** — ERLEDIGT (Welle 13). Analytics-Basis via Insights; Drop-off/PDF-Export offen
      (Druckansicht existiert), React-Flow-Vogelperspektive offen.
- [ ] dnd-Sortierung + Kapitel (bewusst zurückgestellt; Hoch/Runter-Umordnen existiert).
- [ ] Detail: Template-BILDER — bei Bild-Templates Upload-Pfad (account_id NULL) + Fork-Bildkopie nachziehen.

## 10. Datei-Landkarte
- `src/app/(auth)/` — Login/Signup/Actions · `src/app/auth/confirm/route.ts`
- `src/app/app/` — Dashboard, Layout, `actions.ts` (CRUD+Publish), `template-actions.ts` (Kunden-Templates), `tutorials/[id]/` (Editor+actions)
- `src/app/admin/` — Admin-Bereich (Templates) · `src/lib/admin.ts` (checkAdmin/requireAdmin)
- `src/lib/templates.ts` — getCatalog + resolveCustomerTutorial (§14) · `src/components/app/template-section.tsx`
- `src/app/h/[account_slug]/` — Hub + `[tutorial_slug]/` Viewer
- `src/app/api/upload-url/route.ts` — Signed Upload URL
- `src/components/builder/` — builder, flow, step-panel, rich-text, image-field, crop-dialog, highlight-editor
- `src/components/viewer/` — wizard, viewer-image, rich-text-view, hub-browser
- `src/lib/` — supabase/{client,server,admin,proxy-session}, account, types, builder/tree, upload, theme, public-image, format
- `supabase/migrations/` — 0001 schema, 0002 rls, 0003 storage
- `scripts/` — Migrations-Runner + Live-Test-Skripte

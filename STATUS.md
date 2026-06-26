# Tutax — Projekt-Status & Betriebsanleitung

> Selbstgepflegte Status-/Kontextdatei (für Claude). **Bei jeder größeren Änderung aktualisieren.**
> Spezifikation: `../ARCHITEKTUR.md` · Design-Referenz: `../prototyp-v4.jsx`

Letztes Update: 2026-06-26 (autonomer Nacht-Lauf)

---

## 1. Was ist Tutax?
Embeddable Step-by-Step-Tutorial-SaaS für Steuerberater („Quixplain-Klon"). Kanzleien bauen
klickbare Anleitungen (Screenshots + Highlights + Verzweigungen), veröffentlichen sie als
**gehostete Hilfe-Hub-Seite** im eigenen CI-Look. Endnutzer (Mandanten) klicken sich durch.

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
  - `npx tsx scripts/test-tree.ts`                             (Tree-Derivation)
  - `node --env-file=.env.local scripts/seed-datev.mjs`        (DATEV-Tutorials seeden, idempotent)
  > Stand 2026-06-26: alle 11 Live-Tests + Tree + Build GRÜN.

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

## 8. PHASE 1 KOMPLETT ✅ + SaaS-Shell + Design + KI-Framework + Admin/Templates steht
Der gesamte MVP-Kreislauf (bauen → veröffentlichen → live ansehen) steht und ist
gegen die echte DB verifiziert. Nichts mehr offen, das ohne ANTHROPIC_API_KEY /
externe Entscheidungen baubar wäre.

## 9. Status — OFFEN (Spec-Lücken, dem Nutzer am 2026-06-26 genannt)
KI-Framework, Chatbot/RAG, Drift, CI-Analyse, Admin/Templates sind ERLEDIGT (s.o.).
Noch offen aus `ARCHITEKTUR.md`:
- [ ] **§9.5 Missbrauchs-Logging** (`view_logs`) + interne Auswertung — Tabelle da, kein Logging/Report.
- [ ] **§9.5 Rate-Limiting** öffentl. Endpunkte (Hub/Viewer/Chat) — vor Go-Live einplanen.
- [ ] **§10 Drift als Cron** (täglich automatisch) — aktuell nur manuell „Jetzt prüfen";
      `/admin/alerts` (interne Template-Hinweise) noch offen; kein E-Mail-Digest.
- [x] **§11 Knowledge-Base-Artikel** — ERLEDIGT: `/app/knowledge` (Liste + Editor, Rich-Text),
      Toggle „Aktiv im Chatbot" indexiert via `indexArticle` (source_type kb_article).
      Chatbot nutzt jetzt Tutorials UND Wissensartikel. Sub-Nav Tutorials|Wissensdatenbank.
- [ ] **§9.3 Custom Domain** (Premium) · **§9.4** fortgeschrittener `/embed.js`+`/view/[token]`
      (Standard-iFrame-Embed unter Settings→Einbetten EXISTIERT bereits).
- [ ] **Phase-3-Zusatz**: Analytics/Drop-off, Mehrsprachigkeit, PDF-Export,
      KI-Schritt-Assistent (Vision: Screenshot→Titel/Texte), React-Flow-Vogelperspektive.
- [ ] dnd-Sortierung + Kapitel (bewusst zurückgestellt).
- [ ] Detail: Template-BILDER — Templates haben aktuell keine Bilder; bei Bild-Templates muss
      Upload-Pfad (account_id NULL) + Fork-Bildkopie nachgezogen werden.

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

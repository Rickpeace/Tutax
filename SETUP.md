# Steply (Repo `tutax`) – Setup

> Für ein **neues** Supabase-Projekt bzw. eine frische lokale Umgebung. Das Live-Projekt
> läuft bereits — dort nichts davon neu ausführen. Stand: 27.09.2026.

## 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen.
   **Region: EU.** Das Live-Projekt liegt in **`eu-west-1` (Irland)**; die Vercel-Funktionen
   laufen deshalb in `dub1` (`vercel.json`). Andere Region ⇒ `vercel.json` anpassen, sonst
   geht jede DB-Abfrage über weite Strecken (spürbar langsam).
2. Aus _Project Settings → API → Tab "Publishable and secret API keys"_ kopieren:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key (`sb_secret_…`) → `SUPABASE_SECRET_KEY` (geheim!)
   - Settings → Database → Connection string → **Session-Pooler**-URI → `SUPABASE_DB_URL`
     (nur lokal, für Migrationen/Skripte)

## 2. Env-Datei
```bash
cp .env.local.example .env.local
# Werte eintragen
```

| Variable | Pflicht? | Wofür |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | ja | Supabase (Secret nur serverseitig) |
| `SUPABASE_DB_URL` | nur lokal | Migrationen, Live-Test-Skripte |
| `OPENAI_API_KEY` | ja (sonst KI aus) | Chat, Vision, Übersetzung, Embeddings, Whisper |
| `NEXT_PUBLIC_APP_URL` | ja | Basis für Links in Mails/QR (Live: `https://tutax-ivory.vercel.app`) |
| `RESEND_API_KEY`, `INVITE_FROM_EMAIL` | optional | App-Mails (Einladung, Willkommen, Hinweise) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | optional | Vorlesen; ohne Key Fallback auf OpenAI-TTS |
| `CRON_SECRET` | optional | Wöchentlicher Aktualitäts-Autopilot (`/api/cron/drift`); ohne ⇒ 503 |

Dieselben Variablen (ohne `SUPABASE_DB_URL`) in Vercel hinterlegen. Übersicht mit
„gesetzt / fehlt"-Prüfung: `/admin/technik` (Quelle `src/app/admin/technik/inventory.ts`).

## 3. Migrationen anwenden
Die SQL-Dateien liegen in `supabase/migrations/` (aktuell **0001–0048**, in Reihenfolge).
Die ersten drei legen das Grundgerüst an (`0001_schema.sql` Tabellen, `0002_rls.sql`
`my_account_ids()`/Signup-Trigger/RLS, `0003_storage.sql` Buckets `tutorial-images`
(privat) + `tutorial-images-public`); alles Weitere baut darauf auf (u. a. pgvector ab
`0004`, Video-Bucket `tutorial-videos` ab `0012`).

- **Frische DB:** `node --env-file=.env.local scripts/apply-migrations.mjs` — spielt
  **alle** Dateien der Reihe nach ein (kein Merker, was schon lief ⇒ **nur** für eine leere DB).
- **Bestehende DB:** nur die neue Datei einzeln einspielen (per `pg` + `SUPABASE_DB_URL`
  oder im Supabase SQL Editor). Beim Live-Projekt macht das Richard.

## 4. Auth-Einstellungen (Supabase Dashboard)
- _Authentication → Providers → Email_ aktivieren (E-Mail/Passwort + Magic Link).
- _Authentication → URL Configuration → Site URL_ = `http://localhost:3000` bzw. die
  Produktions-URL, **ohne** Schrägstrich am Ende; `/auth/confirm` in die Redirect-Allowlist.
- Mail-Vorlagen einkleben: `supabase/email-templates/README.md`.
- Für echte Kunden: eigenes SMTP (Resend) eintragen — ohne gehen Auth-Mails nur ans
  Projekt-Team. Außerdem „Secure password change", „Secure email change" und
  „Leaked password protection" einschalten.

## 5. Dev-Server
```bash
npm install
npm run dev        # oder: npm run fresh (löscht vorher .next)
```

---

### Stack
Next.js 16 (App Router, Turbopack, cacheComponents/PPR) · React 19 · TypeScript ·
Tailwind v4 · shadcn/ui (Base UI) · Supabase (Postgres/Auth/Storage/pgvector, EU) ·
OpenAI · Vercel (App) · Hetzner (Video-Worker, agent-bridge).

### Hinweise
- shadcn-Komponenten basieren auf **Base UI** (nicht Radix): Komposition via
  `render={<Link/>}` statt `asChild` (+ `nativeButton={false}` bei Button-als-Link);
  `TooltipProvider delay` statt `delayDuration`.
- Next.js 16: `proxy.ts` statt `middleware.ts`; `cookies()`/`headers()` sind async.
- Einstieg/Konventionen: `OVERVIEW.md`. Design-Tokens: `src/app/globals.css` +
  `OVERVIEW.md` §3 (warmes Design, Koralle/Creme, Nunito). `../prototyp-v4.jsx` ist das
  alte, überholte Indigo-Design. Ursprüngliche Spezifikation: `../ARCHITEKTUR.md`.

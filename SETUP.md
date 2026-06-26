# Tutax – Setup

## 1. Supabase-Projekt anlegen
1. Auf [supabase.com](https://supabase.com) ein neues Projekt erstellen.
   **Region: EU (Frankfurt / `eu-central-1`)** – DSGVO (ARCHITEKTUR.md §2).
2. Aus _Project Settings → API → Tab "Publishable and secret API keys"_ kopieren:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Publishable key (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - Secret key (`sb_secret_…`) → `SUPABASE_SECRET_KEY` (geheim!)
   - Settings → Database → Connection string → URI → `SUPABASE_DB_URL`

## 2. Env-Datei
```bash
cp .env.local.example .env.local
# Werte aus Schritt 1 eintragen
```

## 3. Migrationen anwenden
Die SQL-Dateien liegen in `supabase/migrations/` (in Reihenfolge):
- `0001_schema.sql` – Tabellen, Indexe
- `0002_rls.sql` – `my_account_ids()`, Signup-Trigger, RLS-Policies
- `0003_storage.sql` – Buckets `tutorial-images` (privat) & `tutorial-images-public` + Policies

Anwenden – eine der Optionen:
- **Supabase SQL Editor:** Inhalt der drei Dateien nacheinander einfügen & ausführen.
- **Supabase CLI:** `supabase link` dann `supabase db push`.

## 4. Auth-Einstellungen (Supabase Dashboard)
- _Authentication → Providers → Email_ aktivieren (E-Mail/Passwort + Magic Link).
- _Authentication → URL Configuration → Site URL_ = `http://localhost:3000`
  (später Produktions-URL ergänzen).

## 5. Dev-Server
```bash
npm run dev
```

---

### Stack
Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui (Base UI) · Supabase (Postgres/Auth/Storage, EU).

### Hinweise
- shadcn-Komponenten basieren auf **Base UI** (nicht Radix): Komposition via
  `render={<Link/>}` statt `asChild`; `TooltipProvider delay` statt `delayDuration`.
- Next.js 16: `proxy.ts` statt `middleware.ts`; `cookies()`/`headers()` sind async.
- Referenz-Spezifikation: `../ARCHITEKTUR.md`. Design-Referenz: `../prototyp-v4.jsx`.

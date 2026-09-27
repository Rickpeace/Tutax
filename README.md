# Steply (Repo/Ordner: `tutax`)

Einbettbares Klick-Anleitungs-SaaS: Organisationen bauen Schritt-für-Schritt-Anleitungen
(Screenshot + Markierung + Text, mit Verzweigungen) — per **Sofort-Anleitung** aus der
Browser-Erweiterung, aus einem Video oder von Hand — und veröffentlichen sie auf einer
gehosteten Hilfe-Seite (`/h/<konto>`) im eigenen Design, mit KI-Chat, Suche und
Mehrsprachigkeit. Das Produkt heißt **Steply**; Repo, Ordner und Vercel-Projekt heißen
aus historischen Gründen weiter `tutax`.

- **Live:** https://tutax-ivory.vercel.app (Vercel, Region `dub1`, Auto-Deploy von `main`)
- **Datenbank:** Supabase (Postgres/Auth/Storage/pgvector, EU `eu-west-1`)
- **Stack:** Next.js 16 (App Router, cacheComponents/PPR) · React 19 · TypeScript ·
  Tailwind v4 · shadcn auf **Base UI** (nicht Radix) · OpenAI direkt (nicht Vercel AI SDK)

## Wo steht was

| Datei | Inhalt |
|---|---|
| `OVERVIEW.md` | Start hier: Funktions-Inventar, Farben/Tokens, Helfer, Konventionen |
| `STATUS.md` | Aktueller Stand, Befehle, Live-Tests |
| `TODO.md` / `REVIEW.md` | Offene Punkte / abhakbare Findings |
| `AGENTS.md` | Pflicht-Regeln für KI-Agenten (Build grün, Tests, Push-Reihenfolge) |
| `SETUP.md` | Neues Supabase-Projekt + lokale Umgebung aufsetzen |
| `extension/README.md` | Chrome-Erweiterung („Steply-Erweiterung", MV3) |
| `video-worker/DEPLOY.md` | Video-Worker auf Hetzner aktualisieren |
| `supabase/email-templates/README.md` | Supabase-Auth-Mails einkleben |
| `../INFRA.md` | Infrastruktur, Deploy, Orte der Schlüssel |
| `../ARCHITEKTUR.md` | Ursprüngliche Spezifikation (Juni 2026, teils überholt) |

## Lokal starten

```bash
npm install
cp .env.local.example .env.local   # Werte eintragen, siehe SETUP.md
npm run dev                        # http://localhost:3000
```

Weitere Skripte (`package.json`): `npm run build` (Typecheck + Build, Pflicht vor jedem
Commit), `npm run lint`, `npm run fresh` (`.next` löschen + dev), `npm run build:extension`
(Erweiterungs-ZIP nach `public/downloads/`), `npm run test:*` (Tests ohne Server/DB:
Aufnahme-Logik der Erweiterung, Automationen, Begriffsliste — teils headless Chromium). Live-Tests gegen die echte DB: `node --env-file=.env.local
scripts/test-<bereich>-live.mjs` (siehe `STATUS.md` §5).

## Deploy

- **App:** `main` pushen → Vercel baut automatisch. **Erst `main`, auf erfolgreichen Build
  warten, dann `staging` nachziehen** (sonst überspringt Vercel den Production-Build).
- **Video-Worker + agent-bridge (Hetzner):** manuell per `deploy.sh`, siehe
  `video-worker/DEPLOY.md` und `../INFRA.md` §7.
- **DB-Migrationen** (`supabase/migrations/`, aktuell 0001–0048) vor dem Push von Code
  anwenden, der neue Spalten nutzt (siehe `AGENTS.md` Punkt 6).

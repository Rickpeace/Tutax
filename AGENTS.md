<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Verifikation vor Abschluss (PFLICHT bei jeder Code-Änderung)

Wenn du Code änderst, gilt eine Änderung erst als fertig, wenn sie NACHWEISLICH
funktioniert. Niemals annehmen — immer prüfen, bevor du committest/pushst/abschließt:

1. `npm run build` MUSS fehlerfrei durchlaufen (Typecheck + Build). Fehler = Stopp, erst beheben.
2. Führe die für die Änderung relevanten Live-Tests aus STATUS.md §5 aus
   (`node --env-file=.env.local scripts/test-<bereich>-live.mjs`). Im Zweifel mehr testen.
   Alle müssen grün sein.
3. Deckt kein Test das geänderte Verhalten ab: schreibe einen kleinen Smoke-/Prüf-Test
   oder belege mit einem konkreten Befehl, dass es wirklich tut, was es soll.
4. Prüfe selbstkritisch auf Regressionen (Edge-Cases, null/async, RLS, geteilte Templates)
   und behebe sie, bevor du abschließt.

Wird der Build oder ein relevanter Test nicht grün und du kannst es nicht reparieren:
NICHT committen/pushen — Änderungen verwerfen und das Problem klar benennen. Lieber kein
Ergebnis als ein kaputtes. Berichte am Ende, welche Verifikationen mit welchem Ergebnis liefen.

5. **Hintergrund-Prozesse beenden (PFLICHT).** Wenn du für Tests Server, Dev-Prozesse
   oder Browser (Next `start`, Playwright-Chromium o. Ä.) startest, beende sie am Ende
   NACHWEISLICH — und liste in deinem Abschlussbericht die verbliebenen `node`-/Browser-
   Prozesse auf, sodass belegt ist, dass nichts von dir weiterläuft. (Grund: verwaiste
   Test-Server haben mehrfach im Hintergrund weiter gerechnet.)
6. **Migrations-Reihenfolge beim Push.** Code, der NEUE DB-Spalten/-Tabellen liest oder
   schreibt (SELECT/INSERT auf frisch angelegte Felder), darf ERST auf `main` gepusht
   werden, NACHDEM die zugehörige Migration auf der Live-DB angewandt ist — sonst gibt
   es 500er in Prod. Wellen-Agenten wenden Migrationen NICHT selbst an (Richard tut das);
   melde im Abschlussbericht klar, dass der Push bis zur Migration zurückzuhalten ist.

# Stack & Skills (autoritativ)

Für JEDE Frontend-/Next.js-Arbeit gilt zuerst der Skill **`tutax-frontend`**
(`.claude/skills/tutax-frontend/SKILL.md`) — er fixiert unseren Stack und schlägt bei
Konflikt die generischen Skills.

- **Stack:** Next 16 App Router (RSC-first), React 19, Tailwind v4, **shadcn auf Base UI
  (NICHT Radix)** → `render` statt `asChild`, `nativeButton={false}`; **OpenAI direkt
  (NICHT Vercel AI SDK)**; Supabase (Auth/RLS/pgvector).
- **Installierte, on-stack Skills:** `supabase`, `supabase-postgres-best-practices`,
  `cache-components`, `next-best-practices`, `react-best-practices`,
  `postgres-semantic-search`. Nutze sie.
- **IGNORIEREN** (widersprechen unserem Stack): alles Radix-basierte (`shadcn`,
  `nextjs-shadcn`) und alles Vercel-AI-SDK-basierte (`ai-sdk*`, `ai-elements`,
  `nextjs-chatbot`).
- **Live-Diagnose:** `next-devtools-mcp` ist via `.mcp.json` verdrahtet (Dev-Server nötig)
  — Build-/Typ-/Laufzeitfehler, Routen, Cache-Components-Guide.

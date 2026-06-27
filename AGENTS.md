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

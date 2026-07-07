-- 0034: BEDINGTE SCHRITTE (Welle 42) — die maschinenlesbare Antwort auf Richards
-- Erkenntnis: Cookie-Banner-Ja/Nein ist dieselbe Logik wie die manuellen Tutorial-
-- Verzweigungen; der einzige Unterschied ist, WER die Frage beantwortet.
--
-- condition (jsonb) am Schritt: „führe diesen Schritt NUR aus, wenn …". MVP-Formen:
--   { kind:'element', selector:{css,text,role} }  → nur wenn das Element vorhanden ist
--   { kind:'url', pattern:'…' }                   → nur wenn die aktuelle URL passt (Host/Pfad-Teil)
--   optional negate:true  → Umkehrung („nur wenn NICHT vorhanden/passend")
-- Fehlt condition → Schritt läuft immer (heutiges Verhalten). Der MENSCH (Tutorial/
-- Führung) ignoriert die Bedingung — er beantwortet die Frage selbst; nur der AUTOMATIONS-
-- Lauf wertet sie aus (Element da? URL passt?) und überspringt den Schritt sonst nahtlos.
-- Damit deckt der lineare „nur-wenn"-Fall Cookie-Banner/optionale Dialoge ab; der volle
-- Zwei-Wege-Verzweigungsbaum fuer Automationen bleibt eine spaetere Ausbaustufe.
alter table public.steps add column if not exists condition jsonb;
comment on column public.steps.condition is
  'Optionale Ausfuehr-Bedingung {kind:element|url, selector|pattern, negate?} — vom Automations-Lauf ausgewertet, vom Menschen ignoriert';

alter table public.automation_steps add column if not exists condition jsonb;
comment on column public.automation_steps.condition is
  'Kopie von steps.condition in den Automations-Snapshot — Basis der bedingten (optionalen) Schritte im Lauf';

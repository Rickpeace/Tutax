-- 0027: Selektor-Vorbau (Welle 24) — robuster Element-Selektor je Schritt.
-- Die Sofort-Anleitung speichert pro Klick zusaetzlich, WELCHES Element es war
-- ({css, text, role}), nicht nur wo es lag. Heute nur erfasst + gespeichert;
-- Grundlage fuer spaetere Live-Fuehrung auf der echten Website und den
-- Anleitungs-TUEV per Agent (siehe TODO.md).
alter table public.steps add column if not exists selector jsonb;
comment on column public.steps.selector is
  'Element-Selektor aus der Aufnahme {css,text,role} — fuer Live-Fuehrung/Anleitungs-TUEV';

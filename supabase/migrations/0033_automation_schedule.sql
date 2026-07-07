-- 0033: ZEITPLAN fuer Automationen (Welle 41, Stufe 2). Ein Ablauf kann sich
-- wiederholen ("jeden Montag 08:00", "am 3. des Monats"). Der Zeitplan lebt in der DB
-- (App verwaltet ihn, Lauf-Historie zeigt geplant/manuell); die Extension synct ihn und
-- stellt ihre chrome.alarms danach. WICHTIG: geloest wird der Wecker NUR im Browser des
-- Nutzers (Rechner an + Chrome offen) — echte serverseitige Automatik waere Stufe 3.
--
-- schedule (jsonb) am Automation-Datensatz, oder null = kein Zeitplan. Form:
--   { enabled:bool, freq:'weekly'|'monthly', weekday:0-6 (bei weekly), day:1-31 (bei
--     monthly), hour:0-23, minute:0-59 }
-- Werte-Pflicht: geplante Laeufe brauchen ALLE required-Parameter als lokal GEMERKTE
-- Werte (chrome.storage) — sonst wuerde der Lauf unbeaufsichtigt an einem leeren Feld
-- pausieren. Die App warnt beim Aktivieren; die Extension prueft vor jedem geplanten Lauf.
alter table public.automations add column if not exists schedule jsonb;
comment on column public.automations.schedule is
  'Wiederholungs-Zeitplan {enabled,freq,weekday|day,hour,minute} — geloest via chrome.alarms IM Browser des Nutzers (kein Server-Cron)';

-- Laeufe unterscheiden manuell vs. geplant (fuer die Historie + Doppel-Fire-Schutz).
alter table public.automation_runs add column if not exists trigger text not null default 'manual';
alter table public.automation_runs drop constraint if exists automation_runs_trigger_check;
alter table public.automation_runs add constraint automation_runs_trigger_check
  check (trigger in ('manual', 'scheduled'));

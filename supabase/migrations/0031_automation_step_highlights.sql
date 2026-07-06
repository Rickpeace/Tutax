-- 0031: Automations-Schritte tragen die MARKIERUNGEN ihres Aufnahme-Screenshots mit
-- (Welle 37). Der Welle-36-Snapshot kopierte image_path, aber nicht die highlights —
-- die Referenzbilder in App-Detail und Extension-Miss-Ansicht waren dadurch "nackt"
-- und oft nicht selbsterklaerend (Richard: "da sind die Markierungen nicht zu sehen").
alter table public.automation_steps add column if not exists highlights jsonb;
comment on column public.automation_steps.highlights is
  'Kopie der steps.highlights zum Snapshot-Zeitpunkt — fuers Referenzbild (App + Extension)';

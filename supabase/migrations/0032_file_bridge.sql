-- 0032: DATEI-BRUECKE (Welle 39) — Automationen koennen eine Datei von Website A
-- (Download) nach Website B (Upload) durchreichen. Der Kanzlei-Kernfall: Belege aus
-- Abrechnungsportalen holen und bei DATEV Unternehmen online hochladen.
--
-- 1) Aufnahme-Erkennung: Die Sofort-Aufnahme merkt sich an Schritten, dass ein Klick
--    einen DOWNLOAD ausgeloest hat bzw. dass ein Datei-Feld einen UPLOAD bekam.
--    file_meta (jsonb): { role: 'download'|'upload', filename?, mime?, size? }
alter table public.steps add column if not exists file_meta jsonb;
comment on column public.steps.file_meta is
  'Datei-Kontext der Aufnahme: {role:download|upload, filename, mime, size} — Basis der Datei-Bruecke';

-- 2) Automations-Snapshot traegt die Verknuepfung: Download-Schritte liefern eine Datei
--    (key), Upload-Schritte verbrauchen sie (source = key des Download-Schritts).
--    file_meta (jsonb): { role:'download', key } | { role:'upload', source, filename? }
alter table public.automation_steps add column if not exists file_meta jsonb;
comment on column public.automation_steps.file_meta is
  'Datei-Bruecke: {role:download,key} liefert, {role:upload,source} verbraucht — Werte bleiben IMMER lokal im Browser';

-- 3) Neue Aktion 'upload' fuer Automations-Schritte (Datei ins Feld/die Drop-Zone legen).
alter table public.automation_steps drop constraint if exists automation_steps_action_check;
alter table public.automation_steps add constraint automation_steps_action_check
  check (action in ('click', 'fill', 'select', 'toggle', 'upload'));

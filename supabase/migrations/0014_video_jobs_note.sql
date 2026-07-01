-- Optionaler Hinweis-Text für einen fertigen Video-Job (z. B. "Schnitt"-Marker nicht
-- erkannt -> Schritte geschätzt). Wird im "fertig"-Dialog des Uploaders angezeigt.
alter table public.video_jobs add column if not exists note text;

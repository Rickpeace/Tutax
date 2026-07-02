-- Welle 20: Häkchen-Modell für Sichtbarkeit + Kategorie-Durchreichung an die Video-Pipeline.

-- „Auch im Lern-Bereich": öffentliche Tutorials können ZUSÄTZLICH als Schulung im
-- Team-Lernbereich erscheinen (mit Nachweis). Interne sind implizit immer dort.
alter table public.tutorials add column if not exists in_lernen boolean not null default false;

-- „+ Tutorial" an einer Kategorie -> auch der Video-Weg soll die Kategorie kennen.
alter table public.video_jobs add column if not exists category_id uuid
  references public.categories(id) on delete set null;

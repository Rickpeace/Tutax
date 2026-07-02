-- Nordstern-Einstieg "Klicks statt Zauberwort": optionale Klick-Telemetrie zum Video
-- (aus der Browser-Extension). Format: [{ t: Sekunden, x: 0..1, y: 0..1, label?: text }]
-- Der Worker nutzt Klicks als exakte Schrittgrenzen + Highlight-Positionen.
alter table public.video_jobs add column if not exists clicks jsonb;

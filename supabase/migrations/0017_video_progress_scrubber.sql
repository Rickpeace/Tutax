-- Video-Pipeline Welle 3:
-- 1) Live-Fortschritt des Video-Jobs ("Schritt 3/6") für Dialog + Dashboard-Karte.
alter table public.video_jobs add column if not exists progress text;

-- 2) Zeitstempel des Schritt-Screenshots im Quell-Video -> Builder-Scrubber
--    ("anderes Bild aus dem Video wählen") weiß, wo er hinspringen muss.
alter table public.steps add column if not exists video_time numeric;

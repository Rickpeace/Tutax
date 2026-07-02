-- Frage-Lücken-Miner: eine unbeantwortete Frage gilt als "erledigt", sobald daraus
-- ein Tutorial-Entwurf erzeugt wurde -> verschwindet aus der Insights-Lückenliste.
alter table public.events add column if not exists handled_at timestamptz;

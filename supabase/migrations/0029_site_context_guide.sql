-- 0029: Seiten-Kontext + Live-Fuehrung (Welle 31).
--
-- 1) Jeder Sofort-Aufnahme-Schritt merkt sich die Seiten-URL, auf der geklickt
--    wurde. Die Extension schickt sie laengst mit (lib/guide.ts validiert sie) —
--    bisher wurde sie beim Speichern verworfen.
alter table public.steps add column if not exists page_url text;
comment on column public.steps.page_url is
  'URL der Seite zum Aufnahme-Zeitpunkt (Sofort-Anleitung) — Basis fuer die Extension-Sektion „Fuer diese Seite" und die Live-Fuehrung';

-- 2) Tutorials wissen, fuer welche Website(s) sie gelten (normalisierte Hostnamen
--    ohne www.). Auto-gesaeet aus der Sofort-Aufnahme, im Builder editierbar.
alter table public.tutorials add column if not exists site_domains text[] not null default '{}';
comment on column public.tutorials.site_domains is
  'Hostnamen (lowercase, ohne www.), fuer die dieses Tutorial gilt — Extension-Matching „Fuer diese Seite"';
create index if not exists tutorials_site_domains_idx
  on public.tutorials using gin (site_domains);

-- 3) Live-Fuehrungs-Telemetrie in events zulassen (Drift-Signal „Selektor tot",
--    Fuehrung gestartet/abgeschlossen). INSERTs weiterhin NUR serverseitig
--    (Service-Role, keine Insert-Policy — wie 0018).
alter table public.events drop constraint if exists events_type_check;
alter table public.events add constraint events_type_check
  check (type in ('view', 'feedback', 'chat', 'guide'));

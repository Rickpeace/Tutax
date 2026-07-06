-- 0030: AUTOMATIONEN (Welle 36) — dritte Produkt-Ebene neben Helpdesk (oeffentliche
-- Tutorials) und internem Wissen: aufgezeichnete Ablaeufe, die die Extension AUSFUEHRT
-- (Klicks + Eingaben mit Parametern), statt sie nur zu zeigen.
--
-- Entsteht als SNAPSHOT aus einer Sofort-Aufnahme (Tutorial mit Selektoren): eigene
-- Schritt-Kopie, damit die Automation unabhaengig vom Tutorial weiterlebt (Tutorial
-- editieren/loeschen bricht keine Automation). MVP: LINEARE Ablaeufe (keine
-- Verzweigungen). Parameter-Definitionen liegen serverseitig — WERTE (insb. Secrets)
-- NIEMALS: die speichert ausschliesslich die Extension lokal beim Nutzer.

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  title text not null,
  -- Herkunft (informativ); Tutorial darf verschwinden, Automation bleibt.
  source_tutorial_id uuid references public.tutorials(id) on delete set null,
  site_domains text[] not null default '{}',
  -- Parameter-DEFINITIONEN: [{key, label, type:'text'|'secret', required, source:'manual'|'stored'}]
  -- `source` ist Vorbau fuer dynamische Quellen (E-Mail/API) — MVP kennt manual|stored.
  params jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_account_idx on public.automations (account_id, updated_at desc);
create index if not exists automations_site_domains_idx on public.automations using gin (site_domains);

create table if not exists public.automation_steps (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  position int not null,
  title text,
  -- Was die Engine tut: click | fill | select | toggle (fill/select/toggle nutzen param_key).
  action text not null check (action in ('click', 'fill', 'select', 'toggle')),
  selector jsonb,        -- {css,text,role} wie steps.selector — Pflicht fuers Ausfuehren
  page_url text,         -- Seite, auf der der Schritt spielt (Navigation/Kontrolle)
  param_key text,        -- fill/select/toggle: welcher Parameter liefert den Wert
  image_path text        -- optionaler Referenz-Screenshot (Snapshot-Zeitpunkt; darf fehlen)
);
create unique index if not exists automation_steps_pos_idx
  on public.automation_steps (automation_id, position);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  status text not null check (status in ('running', 'success', 'aborted', 'failed')),
  mode text not null default 'semi' check (mode in ('semi', 'auto')),
  current_step int,
  detail text,           -- kurzer Grund bei aborted/failed (z. B. "Schritt 4: selector-miss")
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists automation_runs_automation_idx
  on public.automation_runs (automation_id, started_at desc);
create index if not exists automation_runs_account_idx
  on public.automation_runs (account_id, started_at desc);

-- RLS: Mitglieder verwalten die Automationen IHRES Kontos (App-UI, Session-Client).
-- Laeufe: Mitglieder LESEN; INSERT/UPDATE macht ausschliesslich der Server (Token-API,
-- Admin-Client) — bewusst keine Insert-Policy (Muster events, 0018).
alter table public.automations enable row level security;
alter table public.automation_steps enable row level security;
alter table public.automation_runs enable row level security;

drop policy if exists "members manage own automations" on public.automations;
create policy "members manage own automations" on public.automations for all
  using (account_id in (select account_id from public.account_members where user_id = auth.uid()))
  with check (account_id in (select account_id from public.account_members where user_id = auth.uid()));

drop policy if exists "members manage own automation steps" on public.automation_steps;
create policy "members manage own automation steps" on public.automation_steps for all
  using (exists (
    select 1 from public.automations a
    where a.id = automation_steps.automation_id
      and a.account_id in (select account_id from public.account_members where user_id = auth.uid())))
  with check (exists (
    select 1 from public.automations a
    where a.id = automation_steps.automation_id
      and a.account_id in (select account_id from public.account_members where user_id = auth.uid())));

drop policy if exists "members read own automation runs" on public.automation_runs;
create policy "members read own automation runs" on public.automation_runs for select
  using (account_id in (select account_id from public.account_members where user_id = auth.uid()));

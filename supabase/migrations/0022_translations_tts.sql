-- Mehrsprachige Tutorials (Welle 13) + TTS-Grundlage (Welle 14).
-- Deutsch bleibt das Original in tutorials/steps; Übersetzungen liegen daneben.

alter table public.accounts add column if not exists languages text[] not null default '{}';

-- Vorlesen (OpenAI TTS): MP3 im public Bucket + Hash über den vorgelesenen Text,
-- damit nur bei Textänderung neu erzeugt wird.
alter table public.steps add column if not exists audio_path text;
alter table public.steps add column if not exists audio_hash text;

create table if not exists public.tutorial_translations (
  id uuid primary key default gen_random_uuid(),
  tutorial_id uuid not null references public.tutorials(id) on delete cascade,
  lang text not null check (lang in ('en', 'pl', 'tr')),
  title text not null,
  description text,
  -- Original wurde nach der Übersetzung geändert -> Anzeige weiter möglich,
  -- aber als veraltet markiert, bis neu übersetzt wird.
  stale boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (tutorial_id, lang)
);

create table if not exists public.step_translations (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.steps(id) on delete cascade,
  lang text not null check (lang in ('en', 'pl', 'tr')),
  title text,
  body jsonb,
  unique (step_id, lang)
);
create index if not exists step_translations_step_idx on public.step_translations (step_id);

create table if not exists public.branch_translations (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.step_branches(id) on delete cascade,
  lang text not null check (lang in ('en', 'pl', 'tr')),
  label text,
  unique (branch_id, lang)
);
create index if not exists branch_translations_branch_idx on public.branch_translations (branch_id);

alter table public.tutorial_translations enable row level security;
alter table public.step_translations enable row level security;
alter table public.branch_translations enable row level security;

-- Mitglieder verwalten Übersetzungen der eigenen Tutorials.
drop policy if exists "members manage tutorial translations" on public.tutorial_translations;
create policy "members manage tutorial translations" on public.tutorial_translations for all
  using (tutorial_id in (
    select t.id from public.tutorials t
    where t.account_id in (select account_id from public.account_members where user_id = auth.uid())
  ))
  with check (tutorial_id in (
    select t.id from public.tutorials t
    where t.account_id in (select account_id from public.account_members where user_id = auth.uid())
  ));

drop policy if exists "members manage step translations" on public.step_translations;
create policy "members manage step translations" on public.step_translations for all
  using (step_id in (
    select s.id from public.steps s join public.tutorials t on t.id = s.tutorial_id
    where t.account_id in (select account_id from public.account_members where user_id = auth.uid())
  ))
  with check (step_id in (
    select s.id from public.steps s join public.tutorials t on t.id = s.tutorial_id
    where t.account_id in (select account_id from public.account_members where user_id = auth.uid())
  ));

drop policy if exists "members manage branch translations" on public.branch_translations;
create policy "members manage branch translations" on public.branch_translations for all
  using (branch_id in (
    select b.id from public.step_branches b
    join public.steps s on s.id = b.step_id
    join public.tutorials t on t.id = s.tutorial_id
    where t.account_id in (select account_id from public.account_members where user_id = auth.uid())
  ))
  with check (branch_id in (
    select b.id from public.step_branches b
    join public.steps s on s.id = b.step_id
    join public.tutorials t on t.id = s.tutorial_id
    where t.account_id in (select account_id from public.account_members where user_id = auth.uid())
  ));

-- Öffentlichkeit liest Übersetzungen NUR veröffentlichter, öffentlicher Tutorials
-- (exakt dieselbe Sichtbarkeitskette wie bei steps/branches — interne bleiben dicht).
drop policy if exists "public read published tutorial translations" on public.tutorial_translations;
create policy "public read published tutorial translations" on public.tutorial_translations for select
  using (exists (
    select 1 from public.tutorials t
    where t.id = tutorial_translations.tutorial_id
      and t.status = 'published' and t.visibility = 'public'
  ));

drop policy if exists "public read published step translations" on public.step_translations;
create policy "public read published step translations" on public.step_translations for select
  using (exists (
    select 1 from public.steps s join public.tutorials t on t.id = s.tutorial_id
    where s.id = step_translations.step_id
      and t.status = 'published' and t.visibility = 'public'
  ));

drop policy if exists "public read published branch translations" on public.branch_translations;
create policy "public read published branch translations" on public.branch_translations for select
  using (exists (
    select 1 from public.step_branches b
    join public.steps s on s.id = b.step_id
    join public.tutorials t on t.id = s.tutorial_id
    where b.id = branch_translations.branch_id
      and t.status = 'published' and t.visibility = 'public'
  ));

-- Interne Tutorials + Schulungsnachweis (v1):
-- visibility 'public' (Hilfe-Seite) | 'internal' (nur Team, /app/lernen).

alter table public.tutorials add column if not exists visibility text not null default 'public';
alter table public.tutorials drop constraint if exists tutorials_visibility_check;
alter table public.tutorials add constraint tutorials_visibility_check
  check (visibility in ('public', 'internal'));

-- WICHTIG (Sicherheit): Die anon-Read-Policies hingen nur an status='published' —
-- interne Tutorials wären sonst über die REST-API öffentlich lesbar.
drop policy if exists "public read published tutorials" on public.tutorials;
create policy "public read published tutorials" on public.tutorials for select
  using (status = 'published' and visibility = 'public');

drop policy if exists "public read published steps" on public.steps;
create policy "public read published steps" on public.steps for select
  using (exists (
    select 1 from public.tutorials t
    where t.id = steps.tutorial_id and t.status = 'published' and t.visibility = 'public'
  ));

drop policy if exists "public read published branches" on public.step_branches;
create policy "public read published branches" on public.step_branches for select
  using (exists (
    select 1 from public.steps s
    join public.tutorials t on t.id = s.tutorial_id
    where s.id = step_branches.step_id and t.status = 'published' and t.visibility = 'public'
  ));

-- Schulungsnachweis: wer hat welches interne Tutorial wann absolviert.
create table if not exists public.tutorial_completions (
  id uuid primary key default gen_random_uuid(),
  tutorial_id uuid not null references public.tutorials(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (tutorial_id, user_id)
);
create index if not exists tutorial_completions_account_idx
  on public.tutorial_completions (account_id, tutorial_id);

alter table public.tutorial_completions enable row level security;

-- Team-Mitglieder sehen die Nachweise ihres Kontos (Owner-Übersicht + eigener Status).
drop policy if exists "members read completions" on public.tutorial_completions;
create policy "members read completions" on public.tutorial_completions for select
  using (account_id in (select account_id from public.account_members where user_id = auth.uid()));

-- Jeder bestätigt nur FÜR SICH und nur in Konten, deren Mitglied er ist.
drop policy if exists "members insert own completion" on public.tutorial_completions;
create policy "members insert own completion" on public.tutorial_completions for insert
  with check (
    user_id = auth.uid()
    and account_id in (select account_id from public.account_members where user_id = auth.uid())
  );

-- Eigenen Haken zurücknehmen dürfen.
drop policy if exists "members delete own completion" on public.tutorial_completions;
create policy "members delete own completion" on public.tutorial_completions for delete
  using (user_id = auth.uid());

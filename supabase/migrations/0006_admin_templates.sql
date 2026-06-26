-- ============================================================
-- Tutax – Admin-Rolle + Template-Pflege (§10 / §14)
-- ============================================================

-- Wer ist Plattform-Admin (pflegt globale Standard-Tutorials)?
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table admins enable row level security;
-- (kein Self-Service: nur Service-Role/SQL verwaltet diese Tabelle)

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ------------------------------------------------------------
-- Admin darf globale Templates (account_id IS NULL) voll verwalten.
-- (Kunden lesen veröffentlichte Templates über die bestehende
--  "public read published"-Policy; Schreibrechte hat nur der Admin.)
-- ------------------------------------------------------------
drop policy if exists "admin manage template tutorials" on tutorials;
create policy "admin manage template tutorials" on tutorials
  for all
  using (account_id is null and is_admin())
  with check (account_id is null and is_admin());

drop policy if exists "admin manage template steps" on steps;
create policy "admin manage template steps" on steps
  for all
  using (exists (select 1 from tutorials t where t.id = steps.tutorial_id and t.account_id is null) and is_admin())
  with check (exists (select 1 from tutorials t where t.id = steps.tutorial_id and t.account_id is null) and is_admin());

drop policy if exists "admin manage template branches" on step_branches;
create policy "admin manage template branches" on step_branches
  for all
  using (exists (
    select 1 from steps s join tutorials t on t.id = s.tutorial_id
    where s.id = step_branches.step_id and t.account_id is null) and is_admin())
  with check (exists (
    select 1 from steps s join tutorials t on t.id = s.tutorial_id
    where s.id = step_branches.step_id and t.account_id is null) and is_admin());

-- Admin darf change_alerts der Templates sehen/bearbeiten (für /admin/alerts)
drop policy if exists "admin template alerts" on change_alerts;
create policy "admin template alerts" on change_alerts
  for all
  using (exists (select 1 from tutorials t where t.id = change_alerts.tutorial_id and t.account_id is null) and is_admin())
  with check (exists (select 1 from tutorials t where t.id = change_alerts.tutorial_id and t.account_id is null) and is_admin());

-- ------------------------------------------------------------
-- Initialen Admin setzen
-- ------------------------------------------------------------
insert into admins (user_id)
  select id from auth.users where email = 'richard@petrasch.com'
  on conflict (user_id) do nothing;

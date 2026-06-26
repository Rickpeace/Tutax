-- ============================================================
-- Tutax – Funktionen, Signup-Trigger & RLS-Policies (§4)
-- ============================================================

-- ------------------------------------------------------------
-- Helper: Account-IDs des aktuellen Users (SECURITY DEFINER)
-- ------------------------------------------------------------
create or replace function public.my_account_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select account_id from public.account_members where user_id = auth.uid();
$$;

revoke all on function public.my_account_ids() from public;
grant execute on function public.my_account_ids() to authenticated;

-- ------------------------------------------------------------
-- Signup-Trigger: beim Anlegen eines auth.users automatisch
-- Account + Mitgliedschaft (owner) + leeres Theme erzeugen (§12.3)
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_account_id uuid;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  base_slug := coalesce(
    nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), ''),
    'kanzlei'
  );
  final_slug := base_slug;
  while exists (select 1 from public.accounts where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n;
  end loop;

  insert into public.accounts (name, slug)
  values (coalesce(new.raw_user_meta_data->>'account_name', new.email), final_slug)
  returning id into new_account_id;

  insert into public.account_members (account_id, user_id, role)
  values (new_account_id, new.id, 'owner');

  insert into public.themes (account_id) values (new_account_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- RLS aktivieren
-- ------------------------------------------------------------
alter table accounts          enable row level security;
alter table account_members   enable row level security;
alter table themes            enable row level security;
alter table categories        enable row level security;
alter table tutorials         enable row level security;
alter table chapters          enable row level security;
alter table steps             enable row level security;
alter table step_branches     enable row level security;
alter table change_alerts     enable row level security;
alter table account_templates enable row level security;
alter table view_logs         enable row level security;
alter table kb_articles       enable row level security;

-- ------------------------------------------------------------
-- accounts / account_members
-- (Insert läuft über den Definer-Trigger -> keine Insert-Policy nötig)
-- ------------------------------------------------------------
create policy "members read own account" on accounts
  for select using (id in (select my_account_ids()));
create policy "members update own account" on accounts
  for update using (id in (select my_account_ids()))
  with check (id in (select my_account_ids()));

create policy "read own membership" on account_members
  for select using (user_id = auth.uid());

-- ------------------------------------------------------------
-- themes — Owner voll; öffentlich lesbar (nur Design-Tokens, nicht sensibel;
-- für den CI-Look der öffentlichen Hub/Viewer nötig)
-- ------------------------------------------------------------
create policy "owner full themes" on themes
  for all using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));
create policy "public read themes" on themes
  for select using (true);

-- ------------------------------------------------------------
-- categories — Owner voll; öffentlich lesbar (Gruppierung auf der Hub-Seite)
-- ------------------------------------------------------------
create policy "owner full categories" on categories
  for all using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));
create policy "public read categories" on categories
  for select using (true);

-- ------------------------------------------------------------
-- tutorials — Owner voll; öffentlich NUR veröffentlichte (Embed/Hub)
-- ------------------------------------------------------------
create policy "owner full tutorials" on tutorials
  for all using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));
create policy "public read published tutorials" on tutorials
  for select using (status = 'published');

-- ------------------------------------------------------------
-- chapters / steps / step_branches — lesbar wenn Tutorial veröffentlicht
-- ODER User Eigentümer (Join auf tutorials)
-- ------------------------------------------------------------
create policy "owner full chapters" on chapters
  for all using (exists (
    select 1 from tutorials t
    where t.id = chapters.tutorial_id and t.account_id in (select my_account_ids())))
  with check (exists (
    select 1 from tutorials t
    where t.id = chapters.tutorial_id and t.account_id in (select my_account_ids())));
create policy "public read published chapters" on chapters
  for select using (exists (
    select 1 from tutorials t
    where t.id = chapters.tutorial_id and t.status = 'published'));

create policy "owner full steps" on steps
  for all using (exists (
    select 1 from tutorials t
    where t.id = steps.tutorial_id and t.account_id in (select my_account_ids())))
  with check (exists (
    select 1 from tutorials t
    where t.id = steps.tutorial_id and t.account_id in (select my_account_ids())));
create policy "public read published steps" on steps
  for select using (exists (
    select 1 from tutorials t
    where t.id = steps.tutorial_id and t.status = 'published'));

create policy "owner full branches" on step_branches
  for all using (exists (
    select 1 from steps s join tutorials t on t.id = s.tutorial_id
    where s.id = step_branches.step_id and t.account_id in (select my_account_ids())))
  with check (exists (
    select 1 from steps s join tutorials t on t.id = s.tutorial_id
    where s.id = step_branches.step_id and t.account_id in (select my_account_ids())));
create policy "public read published branches" on step_branches
  for select using (exists (
    select 1 from steps s join tutorials t on t.id = s.tutorial_id
    where s.id = step_branches.step_id and t.status = 'published'));

-- ------------------------------------------------------------
-- change_alerts — Owner (über Tutorial-Account); Templates = nur Service-Role
-- ------------------------------------------------------------
create policy "owner alerts" on change_alerts
  for all using (exists (
    select 1 from tutorials t
    where t.id = change_alerts.tutorial_id and t.account_id in (select my_account_ids())))
  with check (exists (
    select 1 from tutorials t
    where t.id = change_alerts.tutorial_id and t.account_id in (select my_account_ids())));

-- ------------------------------------------------------------
-- account_templates — Owner voll
-- ------------------------------------------------------------
create policy "owner account_templates" on account_templates
  for all using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));

-- ------------------------------------------------------------
-- view_logs — Owner liest eigene; Insert läuft serverseitig (Service-Role)
-- ------------------------------------------------------------
create policy "owner read view_logs" on view_logs
  for select using (account_id in (select my_account_ids()));

-- ------------------------------------------------------------
-- kb_articles — Owner voll; öffentlich nur veröffentlichte
-- ------------------------------------------------------------
create policy "owner kb_articles" on kb_articles
  for all using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));
create policy "public read published kb_articles" on kb_articles
  for select using (status = 'published');

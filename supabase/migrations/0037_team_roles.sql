-- ============================================================
-- 0037: Team-Rollen (Inhaber / Bearbeiter / Mitarbeiter), Tarif-Schutz,
--       Erweiterungs-Verbindung pro Person
-- ============================================================
-- Rollen:
--   owner  = Inhaber     — alles, inkl. Team verwalten
--   editor = Bearbeiter  — Inhalte + Einstellungen der Organisation (ohne Team)
--   member = Mitarbeiter — NUR Schulungen ansehen/abschließen (liest, schreibt keine Inhalte)
--
-- Bisher erlaubten die Policies JEDEM Mitglied Vollzugriff (my_account_ids()). Statt jede
-- Policy neu zu schreiben, kommen RESTRICTIVE Policies für INSERT/UPDATE/DELETE dazu: sie
-- werden mit den bestehenden (permissiven) Policies UND-verknüpft. Lesen (SELECT) und die
-- öffentlichen Lese-Policies bleiben unverändert. Der Service-Role-Client (Server) umgeht
-- RLS wie bisher — dort prüft die App die Rolle (requireAccount).

-- ---------- Rollen-Werte ----------
alter table public.account_members drop constraint if exists account_members_role_check;
alter table public.account_members add constraint account_members_role_check
  check (role in ('owner', 'editor', 'member'));
alter table public.invitations drop constraint if exists invitations_role_check;
alter table public.invitations add constraint invitations_role_check
  check (role in ('owner', 'editor', 'member'));

-- ---------- Hilfsfunktionen ----------
-- Darf der aktuelle Nutzer Inhalte dieses Kontos schreiben? (Inhaber/Bearbeiter; globale
-- Vorlagen mit account_id NULL nur der Admin — wie die bestehenden Admin-Policies.)
create or replace function public.can_edit_account(aid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select case
    when aid is null then public.is_admin()
    else exists (
      select 1 from public.account_members
      where account_id = aid and user_id = auth.uid() and role in ('owner', 'editor')
    )
  end;
$$;
revoke all on function public.can_edit_account(uuid) from public;
grant execute on function public.can_edit_account(uuid) to authenticated;

create or replace function public.can_edit_tutorial(tid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.tutorials t where t.id = tid and public.can_edit_account(t.account_id));
$$;
revoke all on function public.can_edit_tutorial(uuid) from public;
grant execute on function public.can_edit_tutorial(uuid) to authenticated;

create or replace function public.can_edit_step(sid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.steps s where s.id = sid and public.can_edit_tutorial(s.tutorial_id));
$$;
revoke all on function public.can_edit_step(uuid) from public;
grant execute on function public.can_edit_step(uuid) to authenticated;

-- ---------- Restriktive Schreib-Policies ----------
-- Pro Tabelle drei Policies (insert/update/delete). `expr` = Ausdruck über die Zeile.
do $$
declare
  r record;
  cmd text;
begin
  for r in
    select * from (values
      ('themes',               'public.can_edit_account(account_id)'),
      ('categories',           'public.can_edit_account(account_id)'),
      ('tutorials',            'public.can_edit_account(account_id)'),
      ('account_templates',    'public.can_edit_account(account_id)'),
      ('kb_articles',          'public.can_edit_account(account_id)'),
      ('kb_embeddings',        'public.can_edit_account(account_id)'),
      ('video_jobs',           'public.can_edit_account(account_id)'),
      ('automations',          'public.can_edit_account(account_id)'),
      ('chapters',             'public.can_edit_tutorial(tutorial_id)'),
      ('steps',                'public.can_edit_tutorial(tutorial_id)'),
      ('change_alerts',        'public.can_edit_tutorial(tutorial_id)'),
      ('tutorial_translations','public.can_edit_tutorial(tutorial_id)'),
      ('step_branches',        'public.can_edit_step(step_id)'),
      ('step_translations',    'public.can_edit_step(step_id)'),
      ('branch_translations',  'exists (select 1 from public.step_branches b where b.id = branch_id and public.can_edit_step(b.step_id))'),
      ('automation_steps',     'exists (select 1 from public.automations a where a.id = automation_id and public.can_edit_account(a.account_id))')
    ) as t(tbl, expr)
  loop
    foreach cmd in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', 'editors ' || cmd, r.tbl);
      if cmd = 'insert' then
        execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (%s)',
          'editors ' || cmd, r.tbl, r.expr);
      elsif cmd = 'update' then
        execute format('create policy %I on public.%I as restrictive for update to authenticated using (%s) with check (%s)',
          'editors ' || cmd, r.tbl, r.expr, r.expr);
      else
        execute format('create policy %I on public.%I as restrictive for delete to authenticated using (%s)',
          'editors ' || cmd, r.tbl, r.expr);
      end if;
    end loop;
  end loop;
end $$;

-- Speicher (Bilder/Videos der Anleitungen): Schreiben nur Inhaber/Bearbeiter. Andere Buckets
-- unberührt (CASE schützt den uuid-Cast vor fremden Pfaden).
do $$
declare
  cmd text;
  expr text := $e$case when bucket_id in ('tutorial-images', 'tutorial-videos')
    then public.can_edit_account(((storage.foldername(name))[1])::uuid) else true end$e$;
begin
  foreach cmd in array array['insert', 'update', 'delete'] loop
    execute format('drop policy if exists %I on storage.objects', 'editors write ' || cmd);
    if cmd = 'insert' then
      execute format('create policy %I on storage.objects as restrictive for insert to authenticated with check (%s)',
        'editors write ' || cmd, expr);
    elsif cmd = 'update' then
      execute format('create policy %I on storage.objects as restrictive for update to authenticated using (%s) with check (%s)',
        'editors write ' || cmd, expr, expr);
    else
      execute format('create policy %I on storage.objects as restrictive for delete to authenticated using (%s)',
        'editors write ' || cmd, expr);
    end if;
  end loop;
end $$;

-- ---------- Organisations-Datensatz ----------
-- Inhaber UND Bearbeiter dürfen Name/Adresse/Sprachen/Eskalation ändern (Produktentscheid
-- 22.09.2026); Mitarbeiter nicht.
drop policy if exists "owner update own account" on public.accounts;
drop policy if exists "editors update own account" on public.accounts;
create policy "editors update own account" on public.accounts
  for update to authenticated
  using (public.can_edit_account(id))
  with check (public.can_edit_account(id));
-- Zusätzlich restriktiv: falls noch eine ältere, großzügigere Update-Policy existiert
-- (z. B. „members update own account" aus 0002), darf ein Mitarbeiter trotzdem nichts ändern.
drop policy if exists "editors update restrict" on public.accounts;
create policy "editors update restrict" on public.accounts
  as restrictive for update to authenticated
  using (public.can_edit_account(id))
  with check (public.can_edit_account(id));

-- Tarif darf NUR der Server (Service-Role / Admin-Aktion) ändern. Vorher konnte jeder
-- Inhaber per REST-Aufruf mit eigenem Login `plan = 'business'` setzen.
create or replace function public.protect_account_plan()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- current_user = die DB-Rolle des Aufrufers (Funktion ist NICHT security definer):
  -- Browser/Nutzer-Login = authenticated/anon, Server = service_role, Migration = postgres.
  if new.plan is distinct from old.plan and current_user in ('authenticated', 'anon') then
    raise exception 'Der Tarif kann nur über die Abrechnung geändert werden.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists accounts_protect_plan on public.accounts;
create trigger accounts_protect_plan before update on public.accounts
  for each row execute function public.protect_account_plan();

-- ---------- Erweiterungs-Verbindung pro Person ----------
-- Vorher EIN Token pro Organisation (accounts.recorder_token): wer neu verband, trennte
-- alle anderen; Bearbeiter konnten gar nicht verbinden. Jetzt ein Token je Person und
-- Organisation; Entfernen aus dem Team löscht ihn.
create table if not exists public.recorder_tokens (
  token       uuid primary key,
  account_id  uuid not null references public.accounts(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (account_id, user_id)
);
alter table public.recorder_tokens enable row level security;
-- Bewusst KEINE Policies: nur der Server (Service-Role) liest/schreibt Tokens.

-- Bestehende Verbindungen übernehmen (die Extension bleibt verbunden): der alte Konto-
-- Token wird dem ersten Inhaber zugeordnet — nur Inhaber konnten ihn bisher speichern.
insert into public.recorder_tokens (token, account_id, user_id)
select a.recorder_token, a.id, m.user_id
from public.accounts a
join lateral (
  select user_id from public.account_members
  where account_id = a.id and role = 'owner'
  order by user_id limit 1
) m on true
where a.recorder_token is not null
on conflict do nothing;

-- Den alten Konto-Token NICHT hier leeren: die bis zum Deploy laufende App-Version liest
-- ihn noch (sonst fielen verbundene Erweiterungen bis zum Deploy aus). Das Aufräumen macht
-- 0038 — NACH dem Deploy anwenden.

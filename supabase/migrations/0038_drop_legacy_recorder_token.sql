-- ============================================================
-- 0038: Nacharbeit Team-Rollen (NACH dem Deploy des 0037-Codes anwenden)
--   1) alten gemeinsamen Erweiterungs-Token aufräumen
--   2) Einladungen: Nutzer dürfen nur noch lesen (Schreiben nur Server -> Team-Grenze hält)
--   3) Business-Funktionen auch in der DB absichern (nicht nur in der App)
-- ============================================================

-- ---------- 1) Alter Konto-Token ----------
-- Seit 0037 liest die App nur recorder_tokens (pro Person). Tokens, die die alte App-Version
-- zwischen 0037 und Deploy noch erzeugt hat, ein letztes Mal übernehmen.
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

-- Vorsicht: Die alte Spalte war für JEDES Mitglied lesbar. Hat ein Konto inzwischen
-- Nicht-Inhaber, könnte jemand den übernommenen Token gesehen haben -> diese übernommenen
-- Verbindungen verwerfen (die Inhaber verbinden ihre Erweiterung einmal neu).
delete from public.recorder_tokens rt
using public.accounts a
where rt.account_id = a.id
  and a.recorder_token is not null
  and rt.token = a.recorder_token
  and exists (
    select 1 from public.account_members m
    where m.account_id = a.id and m.role <> 'owner'
  );

update public.accounts set recorder_token = null where recorder_token is not null;

-- ---------- 2) Einladungen ----------
-- Vorher „for all" für Inhaber: per REST ließen sich Einladungen am Server vorbei anlegen
-- (Team-Grenze umgangen) oder angenommene wieder auf „pending" setzen. Die App schreibt
-- Einladungen jetzt ausschließlich über den Server (Admin-Client nach der Grenzprüfung).
drop policy if exists "owner manage invitations" on public.invitations;
drop policy if exists "members manage invitations" on public.invitations;
drop policy if exists "owner read invitations" on public.invitations;
create policy "owner read invitations" on public.invitations
  for select to authenticated
  using (account_id in (
    select account_id from public.account_members
    where user_id = auth.uid() and role = 'owner'
  ));

-- ---------- 3) Business-Funktionen ----------
-- Die App prüft den Tarif; per REST mit eigenem Login ließ er sich umgehen. Nur Aufrufe aus
-- dem Browser (authenticated/anon) werden geprüft — der Server (service_role) entscheidet
-- selbst. Zurückschalten/Verkleinern bleibt immer erlaubt (auch nach einem Downgrade).
create or replace function public.account_is_business(aid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.accounts where id = aid and plan = 'business');
$$;
revoke all on function public.account_is_business(uuid) from public;
grant execute on function public.account_is_business(uuid) to authenticated;

-- Mehrsprachige Hilfe-Seite: neue Sprachen nur mit Business.
create or replace function public.guard_account_business_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.plan <> 'business'
     and not (coalesce(new.languages, '{}') <@ coalesce(old.languages, '{}')) then
    raise exception 'Mehrsprachigkeit ist im Business-Tarif enthalten.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists accounts_guard_business on public.accounts;
create trigger accounts_guard_business before update on public.accounts
  for each row execute function public.guard_account_business_fields();

-- Interne Anleitungen (nur fürs Team): nur mit Business neu auf „intern" stellen.
create or replace function public.guard_tutorial_internal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.visibility = 'internal'
     and (tg_op = 'INSERT' or old.visibility is distinct from 'internal')
     and new.account_id is not null
     and not public.account_is_business(new.account_id) then
    raise exception 'Interne Anleitungen sind im Business-Tarif enthalten.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists tutorials_guard_internal on public.tutorials;
create trigger tutorials_guard_internal before insert or update on public.tutorials
  for each row execute function public.guard_tutorial_internal();

-- KI-Design (ai/extreme): nur mit Business aktivieren.
create or replace function public.guard_theme_mode()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.mode in ('ai', 'extreme')
     and new.mode is distinct from old.mode
     and not public.account_is_business(new.account_id) then
    raise exception 'KI-Design ist im Business-Tarif enthalten.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists themes_guard_mode on public.themes;
create trigger themes_guard_mode before update on public.themes
  for each row execute function public.guard_theme_mode();

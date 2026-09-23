-- ============================================================
-- 0043: Schutzregeln gegen direkte REST-Schreibzugriffe am Server vorbei.
-- Bug-Audit 23.09.2026 (live reproduziert). Die Server-Aktionen prüfen sauber — aber
-- Inhaber/Bearbeiter dürfen einige Tabellen per RLS mit ihrem eigenen Login direkt beschreiben,
-- und Server/Video-Worker vertrauten diesen Werten danach. Die Regeln gelten nur für
-- Nutzer-Zugriffe (Rolle authenticated/anon); Server und Worker (Service-Rolle) sind frei.
--
-- 1) video_jobs: Nutzer dürfen nur „frische“ Aufträge fürs EIGENE Konto anlegen und nichts
--    ändern. Vorher: gefälschter Auftrag mit fremder tutorial_id -> Worker löschte fremden
--    Entwurf; fremder video_path -> signierte URL auf fremdes Video; kind='render' ohne Business.
-- 2) Standard-Vorlagen (is_template) entstehen nur über den Server und haben nie ein Konto.
--    Vorher: eigene Anleitung per REST als „Vorlage“ markiert -> erschien bei allen Kunden.
-- 3) account_templates: nur echte Vorlagen, Kopie nur aus dem eigenen Konto.
-- 4) Gratis-Grenze (5 eigene Anleitungen, Vorlagen-Kopien zählen nicht) auch bei direktem
--    Anlegen. Spiegelt lib/tutorial-quota.ts; die App legt Vorlagen-Kopien mit Server-Rechten an.
--
-- Idempotent (der Runner spielt alle Dateien erneut ein).
-- ============================================================

create or replace function public.is_user_request()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon');
$$;

-- ---------- 1) video_jobs ----------

create or replace function public.guard_video_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_user_request() then return new; end if;

  if tg_op = 'UPDATE' then
    raise exception 'Video-Aufträge ändert nur der Server' using errcode = '42501';
  end if;

  if new.status is distinct from 'queued' or new.output_path is not null
     or new.error is not null or new.note is not null then
    raise exception 'Neue Video-Aufträge starten immer als „wartend“' using errcode = '42501';
  end if;
  if not public.path_in_account(new.video_path, new.account_id) then
    raise exception 'Video liegt nicht im Ordner dieses Kontos' using errcode = '42501';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.account_id = new.account_id
  ) then
    raise exception 'Kategorie gehört nicht zu diesem Konto' using errcode = '42501';
  end if;

  if new.kind = 'render' then
    if new.tutorial_id is null or new.video_path is not null or not exists (
      select 1 from public.tutorials t where t.id = new.tutorial_id and t.account_id = new.account_id
    ) then
      raise exception 'Video-Export nur für eigene Anleitungen' using errcode = '42501';
    end if;
    if not exists (select 1 from public.accounts a where a.id = new.account_id and a.plan = 'business') then
      raise exception 'Video-Export ist im Tarif Business enthalten' using errcode = '42501';
    end if;
  else
    -- Video -> Anleitung: die Anleitung legt der Worker an, nie der Nutzer.
    if new.tutorial_id is not null then
      raise exception 'Neue Video-Aufträge verweisen noch auf keine Anleitung' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists video_jobs_guard on public.video_jobs;
create trigger video_jobs_guard
  before insert or update on public.video_jobs
  for each row execute function public.guard_video_jobs();

-- ---------- 2) Standard-Vorlagen ----------

create or replace function public.guard_tutorial_template()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Für alle: eine Vorlage gehört keinem Konto.
  if new.is_template and new.account_id is not null then
    raise exception 'Vorlagen gehören keinem Konto' using errcode = '23514';
  end if;
  if public.is_user_request() then
    if tg_op = 'INSERT' and new.is_template then
      raise exception 'Vorlagen legt nur der Server an' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.is_template is distinct from old.is_template
                             or new.account_id is distinct from old.account_id) then
      raise exception 'Vorlagen-Status und Konto ändert nur der Server' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tutorials_template_guard on public.tutorials;
create trigger tutorials_template_guard
  before insert or update of is_template, account_id on public.tutorials
  for each row execute function public.guard_tutorial_template();

-- ---------- 3) account_templates ----------

create or replace function public.guard_account_templates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_user_request() then return new; end if;
  if not exists (
    select 1 from public.tutorials t where t.id = new.template_id and t.is_template and t.account_id is null
  ) then
    raise exception 'Das ist keine Standard-Vorlage' using errcode = '42501';
  end if;
  if new.forked_tutorial_id is not null and not exists (
    select 1 from public.tutorials t where t.id = new.forked_tutorial_id and t.account_id = new.account_id
  ) then
    raise exception 'Angepasste Kopie gehört nicht zu diesem Konto' using errcode = '42501';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.account_id = new.account_id
  ) then
    raise exception 'Kategorie gehört nicht zu diesem Konto' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists account_templates_guard on public.account_templates;
create trigger account_templates_guard
  before insert or update on public.account_templates
  for each row execute function public.guard_account_templates();

-- ---------- 4) Gratis-Grenze ----------

create or replace function public.guard_free_tutorial_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  plan_ text;
  own int;
begin
  if not public.is_user_request() or new.account_id is null then return new; end if;
  select plan into plan_ from public.accounts where id = new.account_id for update;
  if plan_ in ('pro', 'business') then return new; end if;
  select (select count(*) from public.tutorials t where t.account_id = new.account_id)
       - (select count(*) from public.account_templates x
           where x.account_id = new.account_id and x.forked_tutorial_id is not null)
    into own;
  if own >= 5 then
    raise exception 'Der kostenlose Tarif erlaubt keine weiteren Anleitungen.' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tutorials_free_limit on public.tutorials;
create trigger tutorials_free_limit
  before insert on public.tutorials
  for each row execute function public.guard_free_tutorial_limit();

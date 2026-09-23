-- ============================================================
-- 0042: Zwei Schutzregeln direkt in der Datenbank („zweites Schloss“ hinter der App).
-- Audit 23.09.2026, von Richard freigegeben.
--
-- 1) Bilder/Audio/Logos nur aus dem EIGENEN Ordner des Kontos.
--    Speicherpfade liegen als `<account_id>/…` im Storage. Inhaber/Bearbeiter dürfen steps/
--    themes/automation_steps per REST selbst schreiben (RLS) — ohne diese Regel könnten sie
--    dort den Pfad eines FREMDEN Kontos eintragen; Vorschau, Schulungen und Veröffentlichen
--    lesen Bilder mit Service-Rechten und hätten fremde (private) Screenshots ausgeliefert.
--    Die App prüft das seit dem Audit selbst (lib/storage-path.ts); hier zusätzlich in der DB.
--    Vorlagen (account_id NULL) haben keinen Konto-Ordner: dort setzt nur der Server Pfade.
--
-- 2) Jede Organisation mit Mitgliedern behält mindestens einen Inhaber.
--    Die App verhindert das Entfernen/Herabstufen des letzten Inhabers schon, aber nicht atomar:
--    zwei Inhaber, die GLEICHZEITIG austreten, sahen beide noch den anderen. Die Regel sperrt
--    die Organisation kurz (FOR UPDATE) und prüft dann frisch. Ausnahmen: Organisation wird
--    gerade gelöscht (Kaskade) oder es bleibt niemand übrig (letzte Person geht/wird gelöscht).
--
-- Idempotent (der Runner spielt alle Dateien erneut ein).
-- ============================================================

-- ---------- 1) Speicherpfade ----------

create or replace function public.path_in_account(p_path text, p_account uuid)
returns boolean
language sql
immutable
as $$
  select p_path is null
      or (
        p_account is not null
        and p_path like p_account::text || '/%'
        and position('..' in p_path) = 0
        and position('\' in p_path) = 0
        and position('//' in p_path) = 0
      );
$$;

create or replace function public.guard_step_paths()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare acc uuid;
begin
  if new.image_path is null and new.audio_path is null then return new; end if;
  select account_id into acc from public.tutorials where id = new.tutorial_id;
  if acc is null then
    -- Vorlage: nur der Server (Service-Rolle) darf Pfade setzen.
    if coalesce(auth.role(), '') in ('authenticated', 'anon') then
      raise exception 'Speicherpfad für Vorlagen nur über den Server' using errcode = '42501';
    end if;
    return new;
  end if;
  if not public.path_in_account(new.image_path, acc) or not public.path_in_account(new.audio_path, acc) then
    raise exception 'Speicherpfad liegt nicht im Ordner dieses Kontos' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists steps_path_guard on public.steps;
create trigger steps_path_guard
  before insert or update of image_path, audio_path on public.steps
  for each row execute function public.guard_step_paths();

create or replace function public.guard_automation_step_paths()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare acc uuid;
begin
  if new.image_path is null then return new; end if;
  select account_id into acc from public.automations where id = new.automation_id;
  if not public.path_in_account(new.image_path, acc) then
    raise exception 'Speicherpfad liegt nicht im Ordner dieses Kontos' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists automation_steps_path_guard on public.automation_steps;
create trigger automation_steps_path_guard
  before insert or update of image_path on public.automation_steps
  for each row execute function public.guard_automation_step_paths();

create or replace function public.guard_theme_paths()
returns trigger
language plpgsql
as $$
begin
  if not public.path_in_account(new.logo_path, new.account_id)
     or not public.path_in_account(new.ai_logo_path, new.account_id)
     or not public.path_in_account(new.extreme_logo_path, new.account_id) then
    raise exception 'Logo-Pfad liegt nicht im Ordner dieses Kontos' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists themes_path_guard on public.themes;
create trigger themes_path_guard
  before insert or update of logo_path, ai_logo_path, extreme_logo_path on public.themes
  for each row execute function public.guard_theme_paths();

-- ---------- 2) Letzter Inhaber ----------

create or replace function public.keep_last_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role <> 'owner' then return coalesce(new, old); end if;
  if tg_op = 'UPDATE' and new.role = 'owner' then return new; end if;

  -- Organisation kurz sperren: gleichzeitige Änderungen an ihren Inhabern laufen nacheinander,
  -- und die Prüfung unten sieht danach den frischen Stand (READ COMMITTED, neue Abfrage).
  perform 1 from public.accounts where id = old.account_id for update;
  -- Organisation wird gerade gelöscht (Kaskade): nichts zu schützen.
  if not exists (select 1 from public.accounts where id = old.account_id) then
    return coalesce(new, old);
  end if;
  -- Es bleibt ein anderer Inhaber: in Ordnung.
  if exists (
    select 1 from public.account_members
    where account_id = old.account_id and role = 'owner' and user_id <> old.user_id
  ) then
    return coalesce(new, old);
  end if;
  -- Niemand sonst im Team (letzte Person geht / Konto wird gelöscht): in Ordnung.
  if not exists (
    select 1 from public.account_members
    where account_id = old.account_id and user_id <> old.user_id
  ) then
    return coalesce(new, old);
  end if;
  raise exception 'Der letzte Inhaber kann nicht entfernt oder herabgestuft werden' using errcode = '23514';
end $$;

drop trigger if exists account_members_last_owner on public.account_members;
create trigger account_members_last_owner
  before update of role or delete on public.account_members
  for each row execute function public.keep_last_owner();

-- ============================================================
-- 0046: Härtung nach dem Sicherheits-Review vom 24.09.2026 (Befunde live reproduziert).
--
-- 1) account_templates.forked_tutorial_id setzt nur der Server. Nutzer durften bisher eigene,
--    normale Anleitungen als „angepasste Kopie“ einer Vorlage verknüpfen → die zählten nicht
--    mehr zur Gratis-Grenze (5 + Anzahl Vorlagen). Nutzer dürfen die Verknüpfung nur LÖSEN.
-- 2) „Schulung mit Nachweis“ (in_lernen) ist ab Pro — wie „intern“ auch in der Datenbank.
-- 3) kb_embeddings (KI-Index) schreibt nur der Server. Selbst angelegte Einträge ließen die
--    KI-Suche Titel fremder Entwürfe nachschlagen (dort zusätzlich im Code gefiltert).
-- 4) Öffentlicher Bild-Bucket: keine Auflistung für jeden mehr. Öffentliche Bild-Adressen
--    brauchen keine Lese-Regel (Bucket ist public); die Regel erlaubte nur das Aufzählen aller
--    Konto-Ordner und Dateinamen.
-- Idempotent.
-- ============================================================

-- ---------- 1) Verknüpfung „angepasste Kopie“ ----------
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
  -- Nur der Server verknüpft eine Kopie; Nutzer dürfen sie nur lösen (auf NULL setzen).
  if new.forked_tutorial_id is not null
     and (tg_op = 'INSERT' or new.forked_tutorial_id is distinct from old.forked_tutorial_id) then
    raise exception 'Angepasste Kopien verknüpft nur der Server' using errcode = '42501';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c where c.id = new.category_id and c.account_id = new.account_id
  ) then
    raise exception 'Kategorie gehört nicht zu diesem Konto' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------- 2) Schulung mit Nachweis erst ab Pro ----------
create or replace function public.guard_tutorial_in_lernen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_user_request() or not coalesce(new.in_lernen, false) or new.account_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and coalesce(old.in_lernen, false) then return new; end if; -- bleibt nach Herabstufen
  if not exists (select 1 from public.accounts a where a.id = new.account_id and a.plan in ('pro', 'business')) then
    raise exception 'Schulungen mit Nachweis sind ab dem Pro-Tarif enthalten' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tutorials_in_lernen_guard on public.tutorials;
create trigger tutorials_in_lernen_guard
  before insert or update of in_lernen on public.tutorials
  for each row execute function public.guard_tutorial_in_lernen();

-- ---------- 3) KI-Index nur lesend für Nutzer ----------
drop policy if exists "owner kb_embeddings" on public.kb_embeddings;
drop policy if exists "members read kb_embeddings" on public.kb_embeddings;
create policy "members read kb_embeddings" on public.kb_embeddings for select to authenticated
  using (account_id in (select public.my_account_ids()));

-- ---------- 4) Öffentlicher Bucket nicht auflistbar ----------
drop policy if exists "public read published images" on storage.objects;

-- ---------- 5) Standard-Kategorien (für Vorlagen) für angemeldete Nutzer lesbar ----------
-- 0044 hatte „public read categories“ entfernt — daran hing auch das Lesen der globalen
-- Standard-Kategorien (account_id NULL) in der Bibliothek (Regressions-Audit 24.09.).
drop policy if exists "read template categories" on public.categories;
create policy "read template categories" on public.categories for select to authenticated
  using (account_id is null);

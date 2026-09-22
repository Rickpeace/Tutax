-- ============================================================
-- 0039: Mitarbeiter lesen nur, was sie für Schulungen brauchen
-- ============================================================
-- Seit 0037 können Mitarbeiter (Rolle „member") nichts mehr schreiben — per Direktzugriff
-- (REST mit eigenem Login) konnten sie aber weiter ALLES der Organisation lesen: Entwürfe,
-- Hinweise, Chat-Fragen der Endkunden, Automationen, Videos und die ORIGINAL-Screenshots
-- (unverpixelt; die Verpixelung wird nur beim Anzeigen darübergelegt).
--
-- Jetzt RESTRIKTIVE Lese-Policies (UND-verknüpft mit den bestehenden): für Mitarbeiter nur
-- veröffentlichte Anleitungen (= Schulungen/Hilfe-Seite) samt Schritten, der EIGENE
-- Schulungsnachweis und veröffentlichte Wissensartikel. Inhaber/Bearbeiter, fremde Nutzer
-- und die öffentliche Hilfe-Seite sind unberührt (die Policies greifen nur, wenn der Nutzer
-- im betreffenden Konto Mitarbeiter ist). Schulungs-Bilder bekommen Mitarbeiter nur noch als
-- signierte Kopie mit EINGEBRANNTER Verpixelung (lib/training-images.ts).

create or replace function public.is_member_only(aid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select aid is not null and exists (
    select 1 from public.account_members
    where account_id = aid and user_id = auth.uid() and role = 'member'
  );
$$;
revoke all on function public.is_member_only(uuid) from public;
grant execute on function public.is_member_only(uuid) to authenticated;

-- Anleitung eines Kontos, in dem ich Mitarbeiter bin, und NICHT veröffentlicht?
create or replace function public.member_hidden_tutorial(tid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.tutorials t
    where t.id = tid and t.status <> 'published' and public.is_member_only(t.account_id)
  );
$$;
revoke all on function public.member_hidden_tutorial(uuid) from public;
grant execute on function public.member_hidden_tutorial(uuid) to authenticated;

create or replace function public.member_hidden_step(sid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.steps s where s.id = sid and public.member_hidden_tutorial(s.tutorial_id));
$$;
revoke all on function public.member_hidden_step(uuid) from public;
grant execute on function public.member_hidden_step(uuid) to authenticated;

-- Irgendeine Anleitung eines Kontos, in dem ich Mitarbeiter bin (für Hinweise: nie sichtbar).
create or replace function public.member_account_tutorial(tid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.tutorials t where t.id = tid and public.is_member_only(t.account_id));
$$;
revoke all on function public.member_account_tutorial(uuid) from public;
grant execute on function public.member_account_tutorial(uuid) to authenticated;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('tutorials',             $x$not public.is_member_only(account_id) or status = 'published'$x$),
      ('chapters',              $x$not public.member_hidden_tutorial(tutorial_id)$x$),
      ('steps',                 $x$not public.member_hidden_tutorial(tutorial_id)$x$),
      ('tutorial_translations', $x$not public.member_hidden_tutorial(tutorial_id)$x$),
      ('step_branches',         $x$not public.member_hidden_step(step_id)$x$),
      ('step_translations',     $x$not public.member_hidden_step(step_id)$x$),
      ('branch_translations',   $x$not exists (select 1 from public.step_branches b where b.id = branch_id and public.member_hidden_step(b.step_id))$x$),
      ('change_alerts',         $x$not public.member_account_tutorial(tutorial_id)$x$),
      ('kb_articles',           $x$not public.is_member_only(account_id) or status = 'published'$x$),
      ('kb_embeddings',         $x$not public.is_member_only(account_id)$x$),
      ('automations',           $x$not public.is_member_only(account_id)$x$),
      ('automation_steps',      $x$not exists (select 1 from public.automations a where a.id = automation_id and public.is_member_only(a.account_id))$x$),
      ('automation_runs',       $x$not public.is_member_only(account_id)$x$),
      ('video_jobs',            $x$not public.is_member_only(account_id)$x$),
      ('events',                $x$not public.is_member_only(account_id)$x$),
      ('view_logs',             $x$not public.is_member_only(account_id)$x$),
      ('tutorial_completions',  $x$not public.is_member_only(account_id) or user_id = auth.uid()$x$)
    ) as t(tbl, expr)
  loop
    execute format('drop policy if exists %I on public.%I', 'members read scope', r.tbl);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (%s)',
      'members read scope', r.tbl, r.expr);
  end loop;
end $$;

-- Speicher: Original-Bilder und Videos der Anleitungen sind für Mitarbeiter tabu.
drop policy if exists "members read scope" on storage.objects;
create policy "members read scope" on storage.objects
  as restrictive for select to authenticated
  using (
    case when bucket_id in ('tutorial-images', 'tutorial-videos')
      then not public.is_member_only(((storage.foldername(name))[1])::uuid)
      else true end
  );

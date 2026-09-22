-- ============================================================
-- Chatbot-Index (kb_embeddings) konsistent halten — unabhängig vom Löschweg.
--
-- Befund 22.09.2026: kb_embeddings.source_id hat keinen FK (zeigt je nach source_type auf
-- tutorials ODER kb_articles). Wer an der App vorbei löscht (Skripte) oder wenn der
-- App-Aufräumschritt scheitert, blieben Einträge stehen → der Chatbot antwortete aus einer
-- gelöschten Anleitung und verlinkte eine 404-Seite.
--
-- 1) Trigger: Löschen / Zurückziehen / auf intern stellen räumt den Index in der DB selbst.
-- 2) replace_kb_source(): Index einer Quelle atomar ersetzen (Delete+Insert in EINER
--    Transaktion, serialisiert per Advisory-Lock) — nötig, seit Speichern an veröffentlichten
--    Anleitungen den Index im Hintergrund nachzieht (parallele Saves → sonst Duplikate).
-- 3) Einmalige Bereinigung vorhandener Waisen.
-- Idempotent (der Runner spielt alle Dateien erneut ein).
-- ============================================================

-- 1a) Anleitung gelöscht → Index weg (auch Vorlagen: dort account-übergreifend).
create or replace function public.kb_drop_tutorial_embeddings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.kb_embeddings where source_type = 'tutorial' and source_id = old.id;
  return null;
end $$;

drop trigger if exists tutorials_kb_cleanup_delete on public.tutorials;
create trigger tutorials_kb_cleanup_delete
  after delete on public.tutorials
  for each row execute function public.kb_drop_tutorial_embeddings();

-- 1b) Anleitung nicht mehr live (intern gestellt oder – außer Vorlagen – zurückgezogen).
--     Nur beim Übergang, damit der updated_at-Touch pro Schritt-Save nichts kostet.
drop trigger if exists tutorials_kb_cleanup_unlive on public.tutorials;
create trigger tutorials_kb_cleanup_unlive
  after update of status, visibility on public.tutorials
  for each row
  when (
    (old.status is distinct from new.status or old.visibility is distinct from new.visibility)
    and (new.visibility <> 'public' or (not new.is_template and new.status <> 'published'))
  )
  execute function public.kb_drop_tutorial_embeddings();

-- 1c) Wissensartikel gelöscht oder auf Entwurf gestellt → Index weg.
create or replace function public.kb_drop_article_embeddings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.kb_embeddings where source_type = 'kb_article' and source_id = old.id;
  return null;
end $$;

drop trigger if exists kb_articles_kb_cleanup_delete on public.kb_articles;
create trigger kb_articles_kb_cleanup_delete
  after delete on public.kb_articles
  for each row execute function public.kb_drop_article_embeddings();

drop trigger if exists kb_articles_kb_cleanup_unpublish on public.kb_articles;
create trigger kb_articles_kb_cleanup_unpublish
  after update of status on public.kb_articles
  for each row
  when (old.status is distinct from new.status and new.status <> 'published')
  execute function public.kb_drop_article_embeddings();

-- 2) Atomarer Austausch der Index-Zeilen einer Quelle (für EIN Konto).
--    SECURITY INVOKER: RLS von kb_embeddings (can_edit_account) greift wie beim direkten Insert.
--    p_rows = [{ "chunk": text, "embedding": "[…]", "metadata": {…} }, …]
create or replace function public.replace_kb_source(
  p_account     uuid,
  p_source_type text,
  p_source_id   uuid,
  p_rows        jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_source_type || ':' || p_source_id::text, 0));
  delete from public.kb_embeddings
   where account_id = p_account and source_type = p_source_type and source_id = p_source_id;
  -- Nur live Quellen neu befüllen: ein Hintergrund-Reindex, der ein gleichzeitiges
  -- Zurückziehen/Intern-Stellen überholt, darf keinen Entwurf in den Chatbot schreiben.
  if p_source_type = 'tutorial' and not exists (
       select 1 from public.tutorials t
        where t.id = p_source_id and t.visibility = 'public'
          and (t.is_template or t.status = 'published')) then
    return;
  end if;
  if p_source_type = 'kb_article' and not exists (
       select 1 from public.kb_articles a where a.id = p_source_id and a.status = 'published') then
    return;
  end if;
  insert into public.kb_embeddings (account_id, source_type, source_id, chunk, embedding, metadata)
  select p_account, p_source_type, p_source_id,
         r->>'chunk', (r->>'embedding')::vector, coalesce(r->'metadata', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r;
end $$;

revoke all on function public.replace_kb_source(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.replace_kb_source(uuid, text, uuid, jsonb) to authenticated, service_role;

-- 3) Vorhandene Waisen entfernen (Quelle existiert nicht mehr).
delete from public.kb_embeddings e
 where e.source_type = 'tutorial'
   and not exists (select 1 from public.tutorials t where t.id = e.source_id);
delete from public.kb_embeddings e
 where e.source_type = 'kb_article'
   and not exists (select 1 from public.kb_articles a where a.id = e.source_id);

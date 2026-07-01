-- Performance + Korrektheit (REVIEW E):

-- 1) Vektor-Index für match_kb: ohne ihn Seq-Scan über ALLE Embeddings pro Chat-Frage.
create index if not exists kb_embeddings_embedding_hnsw
  on public.kb_embeddings using hnsw (embedding vector_cosine_ops);

-- 2) Delete-Pfade in lib/kb.ts (source_type + source_id, account-übergreifend).
create index if not exists kb_embeddings_source_idx
  on public.kb_embeddings (source_type, source_id);

-- 3) tutorials.updated_at lügt: Step-/Branch-Änderungen bumpen es nicht ->
--    Dashboard-Sortierung + „Geändert vor …" stimmen nicht. Trigger fixt das.
create or replace function public.touch_tutorial_updated_at()
returns trigger language plpgsql security definer set search_path = public as $$
declare tid uuid;
begin
  if tg_table_name = 'steps' then
    tid := coalesce(new.tutorial_id, old.tutorial_id);
  else -- step_branches: Tutorial über den Schritt auflösen
    select s.tutorial_id into tid from public.steps s
      where s.id = coalesce(new.step_id, old.step_id);
  end if;
  if tid is not null then
    update public.tutorials set updated_at = now() where id = tid;
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists steps_touch_tutorial on public.steps;
create trigger steps_touch_tutorial
  after insert or update or delete on public.steps
  for each row execute function public.touch_tutorial_updated_at();

drop trigger if exists branches_touch_tutorial on public.step_branches;
create trigger branches_touch_tutorial
  after insert or update or delete on public.step_branches
  for each row execute function public.touch_tutorial_updated_at();

-- 4) Drift-Check-Cooldown (Kosten-Schutz, teuerster KI-Call): App prüft diesen Zeitstempel.
alter table public.tutorials add column if not exists drift_checked_at timestamptz;

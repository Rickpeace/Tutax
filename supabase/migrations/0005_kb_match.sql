-- ============================================================
-- Tutax – Vektor-Ähnlichkeitssuche für den Chatbot (§11)
-- ============================================================

create or replace function match_kb(
  p_account   uuid,
  p_embedding vector(1536),
  p_count     int default 5
)
returns table (
  id          uuid,
  source_type text,
  source_id   uuid,
  chunk       text,
  metadata    jsonb,
  similarity  float
)
language sql
stable
as $$
  select
    id, source_type, source_id, chunk, metadata,
    1 - (embedding <=> p_embedding) as similarity
  from kb_embeddings
  where account_id = p_account
    and embedding is not null
  order by embedding <=> p_embedding
  limit p_count;
$$;

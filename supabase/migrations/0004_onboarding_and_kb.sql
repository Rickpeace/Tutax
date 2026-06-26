-- ============================================================
-- Tutax – Onboarding-Flag + Knowledge-Base-Embeddings (§11)
-- ============================================================

-- Onboarding: wurde der Willkommens-Wizard durchlaufen?
alter table accounts add column if not exists onboarded boolean not null default false;

-- ------------------------------------------------------------
-- Knowledge Base Embeddings (Chatbot/RAG, §11) — pgvector
-- Dimension 1536 = OpenAI text-embedding-3-small (Entscheidung: OpenAI für
-- Embeddings, Anthropic Claude für Chat/Vision; Anthropic hat keine Embeddings).
-- ------------------------------------------------------------
create extension if not exists vector;

create table if not exists kb_embeddings (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  source_type   text not null,                       -- tutorial | kb_article
  source_id     uuid not null,
  chunk         text not null,
  embedding     vector(1536),
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists kb_embeddings_account_idx on kb_embeddings (account_id);
-- HNSW-Vektor-Index erst anlegen, wenn Daten vorhanden sind:
-- create index on kb_embeddings using hnsw (embedding vector_cosine_ops);

alter table kb_embeddings enable row level security;
drop policy if exists "owner kb_embeddings" on kb_embeddings;
create policy "owner kb_embeddings" on kb_embeddings
  for all using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));

-- ============================================================
-- Tutax – Initiales Schema (ARCHITEKTUR.md §4)
-- ============================================================
-- Dokumentierte Abweichungen von §4 (mit dem Nutzer abgestimmt):
--   1. tutorials.root_step_id  -> definierter Start-Schritt ("Anfangsfrage").
--      §4 hatte keinen expliziten Wurzel-Zeiger; im Verzweigungsmodell nötig.
--   2. steps.tutorial_id NOT NULL (NEU) + steps.chapter_id NULLABLE (geändert):
--      Schritte hängen direkt am Tutorial; Kapitel sind eine OPTIONALE
--      Gruppierungs-Schublade (Entscheidung: Kapitel bleiben, aber nicht
--      strukturzwingend). Der Ablauf ergibt sich aus step_branches, nicht aus
--      Kapiteln. Entspricht dem bestätigten Prototyp (steps direkt unter Tutorial).
--   3. unique (account_id, slug) auf tutorials als partieller Index
--      (slug ist bei Entwürfen NULL).
-- Alles Übrige folgt §4 wörtlich.
-- ============================================================

-- Extensions
create extension if not exists pgcrypto;        -- gen_random_uuid()
-- create extension if not exists vector;        -- erst für §11 (KB-Embeddings) aktivieren

-- ============================================================
-- Accounts (Tenant = Steuerberater/Kanzlei)
-- ============================================================
create table accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text unique not null,           -- für die Hilfe-Hub-URL /h/{slug}
  custom_domain text unique,                     -- optional/Premium: hilfe.kanzlei.de
  created_at    timestamptz not null default now()
);

-- Mapping Supabase-Auth-User -> Account (1 User = 1 Account im MVP; später Teams)
create table account_members (
  account_id    uuid not null references accounts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null default 'owner',   -- owner | editor
  primary key (account_id, user_id)
);

-- Theme / CI pro Account (von KI befüllt oder manuell)
create table themes (
  account_id      uuid primary key references accounts(id) on delete cascade,
  source_url      text,
  tokens          jsonb not null default '{}'::jsonb,   -- §8 Theme-Schema
  logo_path       text,
  status          text not null default 'draft',        -- draft | analyzing | ready | failed
  updated_at      timestamptz not null default now()
);

-- Kategorien zur Gruppierung von Tutorials auf der Hub-Seite (pro Account)
create table categories (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  name          text not null,
  icon          text,
  position      numeric not null default 0,
  created_at    timestamptz not null default now()
);
create index on categories (account_id, position);

-- ============================================================
-- Tutorials
-- ============================================================
create table tutorials (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid references accounts(id) on delete cascade,   -- NULL = globales Standard-Tutorial
  category_id   uuid references categories(id) on delete set null,
  title         text not null,
  description   text,
  is_template   boolean not null default false,
  status        text not null default 'draft',                    -- draft | published
  freshness     text not null default 'ok',                       -- ok | stale | checking
  slug          text,                                             -- /h/{account_slug}/{slug}
  public_token  text unique,
  root_step_id  uuid,                                             -- FK -> steps(id), s. u. (zyklische Ref.)
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Kapitel (OPTIONALE Gruppierung, s. Abweichung #2)
create table chapters (
  id            uuid primary key default gen_random_uuid(),
  tutorial_id   uuid not null references tutorials(id) on delete cascade,
  title         text not null,
  position      numeric not null,
  created_at    timestamptz not null default now()
);

-- Schritte
create table steps (
  id            uuid primary key default gen_random_uuid(),
  tutorial_id   uuid not null references tutorials(id) on delete cascade,   -- NEU: direkter Bezug
  chapter_id    uuid references chapters(id) on delete set null,            -- OPTIONAL: Gruppierungs-Bucket
  title         text,
  body          jsonb,                                            -- Tiptap-JSON
  image_path    text,
  image_width   integer,
  image_height  integer,
  highlights    jsonb not null default '[]'::jsonb,               -- §7.5
  position      numeric not null default 0,
  is_decision   boolean not null default false,
  created_at    timestamptz not null default now()
);

-- root_step_id erst jetzt verknüpfen (steps existiert nun)
alter table tutorials
  add constraint tutorials_root_step_fk
  foreign key (root_step_id) references steps(id) on delete set null;

-- Verzweigungen (§4)
create table step_branches (
  id             uuid primary key default gen_random_uuid(),
  step_id        uuid not null references steps(id) on delete cascade,
  label          text,                                            -- "Ja"/"Nein"/...; NULL = "Weiter"
  color          text,
  target_step_id uuid references steps(id) on delete set null,    -- NULL = Ende
  position       numeric not null default 0,
  created_at     timestamptz not null default now()
);
create index on step_branches (step_id, position);

-- Indexe
create index on chapters (tutorial_id, position);
create index on steps (tutorial_id, position);
create index on steps (chapter_id, position);
create index on tutorials (account_id);
create index on tutorials (public_token);
-- slug eindeutig pro Account (nur wenn gesetzt)
create unique index tutorials_account_slug_uniq
  on tutorials (account_id, slug)
  where slug is not null;

-- ============================================================
-- KI-Drift-Agent (§10)
-- ============================================================
create table change_alerts (
  id            uuid primary key default gen_random_uuid(),
  tutorial_id   uuid not null references tutorials(id) on delete cascade,
  severity      text not null default 'info',        -- info | warning | critical
  summary       text not null,
  details       jsonb not null default '{}'::jsonb,
  status        text not null default 'open',         -- open | acknowledged | resolved | dismissed
  detected_at   timestamptz not null default now(),
  resolved_at   timestamptz
);
create index on change_alerts (tutorial_id, status);

-- ============================================================
-- Standard-Tutorials beim Kunden (§14)
-- ============================================================
create table account_templates (
  id                 uuid primary key default gen_random_uuid(),
  account_id         uuid not null references accounts(id) on delete cascade,
  template_id        uuid not null references tutorials(id) on delete cascade,
  enabled            boolean not null default true,
  forked_tutorial_id uuid references tutorials(id) on delete set null,
  category_id        uuid references categories(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (account_id, template_id)
);
create index on account_templates (account_id);

-- Aufruf-Logging öffentlicher Tutorials (§9.5)
create table view_logs (
  id            uuid primary key default gen_random_uuid(),
  tutorial_id   uuid references tutorials(id) on delete set null,
  account_id    uuid references accounts(id) on delete set null,
  referrer_host text,
  viewed_at     timestamptz not null default now()
);
create index on view_logs (account_id, viewed_at);
create index on view_logs (referrer_host);

-- ============================================================
-- Knowledge Base & Chatbot (§11) — Tabellen vorbereitet, pgvector erst bei Bedarf
-- ============================================================
create table kb_articles (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references accounts(id) on delete cascade,
  title         text not null,
  body          jsonb,
  status        text not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- kb_embeddings: in eigener Migration anlegen, sobald `vector`-Extension aktiv ist
-- und der Embedding-Provider/-Dimension feststeht (Anthropic liefert KEINE Embeddings;
-- Voyage/OpenAI o.ä. wählen -> Dimension dann fixieren).

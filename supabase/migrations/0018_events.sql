-- Nutzungs-Events pro Konto: Anleitungs-Aufrufe, "War das hilfreich?"-Feedback,
-- unbeantwortete Chat-Fragen (Datenbasis für Insights + Frage-Lücken-Miner).
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  type text not null check (type in ('view', 'feedback', 'chat')),
  tutorial_slug text,
  helpful boolean,           -- feedback: 👍/👎
  question text,             -- chat: gekürzte Frage
  status text,               -- chat: answered | clarify | no_answer | off_topic
  created_at timestamptz not null default now()
);

create index if not exists events_account_created_idx
  on public.events (account_id, created_at desc);
create index if not exists events_account_type_idx
  on public.events (account_id, type, created_at desc);

alter table public.events enable row level security;

-- Mitglieder LESEN nur die Events ihres Kontos. INSERTs laufen ausschließlich
-- serverseitig über den Service-Role-Client (öffentliche Seiten) -> bewusst
-- KEINE Insert-Policy, damit Endkunden die Tabelle nicht direkt befüllen können.
drop policy if exists "members read own events" on public.events;
create policy "members read own events" on public.events for select
  using (account_id in (select account_id from public.account_members where user_id = auth.uid()));

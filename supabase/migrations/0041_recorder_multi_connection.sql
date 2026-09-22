-- ============================================================
-- 0041: Steply-Erweiterung — MEHRERE Verbindungen pro Person (eine je Browser/Gerät)
--
-- Bisher (0037) genau EIN Token je (account_id, user_id): wer die Erweiterung in Edge
-- verband, machte den Token in Chrome ungültig → Hochladen scheiterte dort mit „Die
-- Verbindung zu Steply ist nicht mehr gültig“. Jetzt legt jedes Verbinden eine eigene
-- Zeile an; in „Einstellungen → Steply-Erweiterung“ sieht die Person ihre Browser und
-- kann einzelne trennen.
--
-- - id:           öffentliche Kennung einer Verbindung (die UI trennt per id — der Token
--                 selbst verlässt den Server nie).
-- - label:        grober Name, z. B. „Chrome · Windows“ (aus dem User-Agent).
-- - last_used_at: zuletzt genutzt (die App schreibt es gedrosselt, höchstens alle 10 Min.).
-- Begrenzung auf 10 Verbindungen je Person/Konto macht die App beim Anlegen (älteste fliegt).
-- RLS unverändert: bewusst KEINE Policies (nur der Server liest/schreibt Tokens).
-- Idempotent (der Runner spielt alle Dateien erneut ein).
-- ============================================================

alter table public.recorder_tokens drop constraint if exists recorder_tokens_account_id_user_id_key;
drop index if exists public.recorder_tokens_account_id_user_id_key;
-- Sicherheitsnetz, falls der Constraint anders heißt: jeden Unique-Constraint genau auf
-- (account_id, user_id) entfernen.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.recorder_tokens'::regclass
      and con.contype = 'u'
      and (select array_agg(att.attname::text order by att.attname)
           from unnest(con.conkey) k join pg_attribute att
             on att.attrelid = con.conrelid and att.attnum = k)
          = array['account_id', 'user_id']
  loop
    execute format('alter table public.recorder_tokens drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.recorder_tokens add column if not exists id uuid not null default gen_random_uuid();
alter table public.recorder_tokens add column if not exists label text;
alter table public.recorder_tokens add column if not exists created_at timestamptz not null default now();
alter table public.recorder_tokens add column if not exists last_used_at timestamptz;

create unique index if not exists recorder_tokens_id_key on public.recorder_tokens (id);
-- Liste/Aufräumen/Team-Entfernen suchen immer nach (account_id, user_id) — ohne den
-- Unique-Index braucht es dafür einen normalen Index.
create index if not exists recorder_tokens_account_user_idx on public.recorder_tokens (account_id, user_id);

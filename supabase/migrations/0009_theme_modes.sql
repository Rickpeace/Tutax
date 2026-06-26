-- ============================================================
-- 0009: Zwei Design-Quellen je Kanzlei + Umschalter
--   tokens / logo_path     = Standard-CI (manuelle Toolbox)  [bestehend]
--   ai_tokens / ai_logo_path = KI-Design (aus Website abgeleitet) [neu]
--   mode = welches öffentlich aktiv ist ("manual" | "ai")
-- ============================================================
alter table themes add column if not exists mode text not null default 'manual';
alter table themes add column if not exists ai_tokens jsonb;
alter table themes add column if not exists ai_logo_path text;

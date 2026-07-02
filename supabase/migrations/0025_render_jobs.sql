-- Video-Export (Welle 18): Tutorial -> MP4. Wiederverwendet die video_jobs-Warteschlange,
-- unterschieden per kind: 'create' (Video->Tutorial, wie bisher) | 'render' (Tutorial->Video).

alter table public.video_jobs add column if not exists kind text not null default 'create';
alter table public.video_jobs drop constraint if exists video_jobs_kind_check;
alter table public.video_jobs add constraint video_jobs_kind_check
  check (kind in ('create', 'render'));

-- Render-Stil: 'classic' (Ken-Burns aus Screenshots) | 'screencast' (echte Clips + Cursor).
alter table public.video_jobs add column if not exists render_style text
  check (render_style in ('classic', 'screencast'));

-- Ergebnis: MP4-Pfad im privaten Bucket tutorial-videos + YouTube-Kapitelmarken als Text.
alter table public.video_jobs add column if not exists output_path text;
alter table public.video_jobs add column if not exists chapters text;

-- render-Jobs brauchen kein Quell-Video -> video_path nullable machen (create-Jobs
-- setzen ihn weiterhin immer; der Worker routet über kind).
alter table public.video_jobs alter column video_path drop not null;

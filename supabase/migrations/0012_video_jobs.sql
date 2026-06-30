-- Video -> Tutorial: Verarbeitungs-Jobs + privater Video-Storage.
create table if not exists video_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  video_path text not null,
  title text,
  status text not null default 'queued',           -- queued | processing | done | failed
  tutorial_id uuid references tutorials(id) on delete set null,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table video_jobs enable row level security;
drop policy if exists "members manage own video_jobs" on video_jobs;
create policy "members manage own video_jobs" on video_jobs
  for all
  using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));

-- Privater Bucket für hochgeladene Videos.
insert into storage.buckets (id, name, public)
  values ('tutorial-videos', 'tutorial-videos', false)
  on conflict (id) do nothing;

-- Storage-Policies: Mitglieder dürfen in ihren Account-Ordner laden/lesen (<account_id>/<datei>).
drop policy if exists "members upload videos" on storage.objects;
create policy "members upload videos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'tutorial-videos' and ((storage.foldername(name))[1])::uuid in (select my_account_ids()));

drop policy if exists "members read videos" on storage.objects;
create policy "members read videos" on storage.objects
  for select to authenticated
  using (bucket_id = 'tutorial-videos' and ((storage.foldername(name))[1])::uuid in (select my_account_ids()));

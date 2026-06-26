-- ============================================================
-- Tutax – Storage-Buckets & Policies (ARCHITEKTUR.md §5)
-- Pfad-Konvention: {account_id}/{tutorial_id}/{step_id}.webp
--   tutorial-images         (privat)    -> Entwürfe, Zugriff via Signed URLs
--   tutorial-images-public  (öffentlich) -> beim Publish kopierte Bilder (CDN)
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('tutorial-images',        'tutorial-images',        false),
  ('tutorial-images-public', 'tutorial-images-public', true)
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- Privater Bucket: Zugriff nur, wenn der erste Pfad-Abschnitt
-- (= account_id) zu den Accounts des Users gehört.
-- ------------------------------------------------------------
create policy "account members read private images" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'tutorial-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_account_ids())
  );

create policy "account members upload private images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tutorial-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_account_ids())
  );

create policy "account members update private images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tutorial-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_account_ids())
  )
  with check (
    bucket_id = 'tutorial-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_account_ids())
  );

create policy "account members delete private images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tutorial-images'
    and (storage.foldername(name))[1]::uuid in (select public.my_account_ids())
  );

-- ------------------------------------------------------------
-- Öffentlicher Bucket: jeder darf lesen.
-- Schreiben passiert beim Publish serverseitig mit Service-Role
-- (umgeht RLS) -> keine Insert-/Update-Policy für Clients nötig.
-- ------------------------------------------------------------
create policy "public read published images" on storage.objects
  for select
  using (bucket_id = 'tutorial-images-public');

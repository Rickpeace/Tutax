-- ============================================================
-- 0010: Team / Einladungen
-- ============================================================
create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references accounts(id) on delete cascade,
  email       text not null,
  role        text not null default 'editor',            -- editor | owner
  token       text not null unique,
  status      text not null default 'pending',           -- pending | accepted | revoked
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create index if not exists invitations_account_idx on invitations (account_id);
create index if not exists invitations_token_idx on invitations (token);

alter table invitations enable row level security;
drop policy if exists "members manage invitations" on invitations;
create policy "members manage invitations" on invitations
  for all
  using (account_id in (select my_account_ids()))
  with check (account_id in (select my_account_ids()));

-- Trigger: Eingeladene Nutzer bekommen KEIN eigenes Konto (sie treten via /invite bei).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_account_id uuid;
  base_slug text;
  final_slug text;
  n int := 0;
begin
  -- Per Einladung registrierte Nutzer: kein eigenes Konto anlegen.
  if (new.raw_user_meta_data ? 'tutax_invite_token') then
    return new;
  end if;

  base_slug := coalesce(
    nullif(regexp_replace(lower(split_part(new.email, '@', 1)), '[^a-z0-9]+', '-', 'g'), ''),
    'kanzlei'
  );
  final_slug := base_slug;
  while exists (select 1 from public.accounts where slug = final_slug) loop
    n := n + 1;
    final_slug := base_slug || '-' || n;
  end loop;

  insert into public.accounts (name, slug)
  values (coalesce(new.raw_user_meta_data->>'account_name', new.email), final_slug)
  returning id into new_account_id;

  insert into public.account_members (account_id, user_id, role)
  values (new_account_id, new.id, 'owner');

  insert into public.themes (account_id) values (new_account_id);

  return new;
end;
$$;

-- ============================================================
-- 0013: RLS verschärfen – Einladungen & Konto-Änderung nur für Inhaber
-- ============================================================
-- Vorher erlaubte `my_account_ids()` JEDEM Mitglied (auch "editor") Vollzugriff.
-- Owner-Beschränkung existierte nur in der App (requireOwner), nicht in RLS.
-- App-Reads/Cleanup laufen über den Service-Role-Client (bypass RLS) -> nichts bricht.

-- Einladungen: nur der INHABER darf Tokens sehen / anlegen / zurückziehen.
drop policy if exists "members manage invitations" on invitations;
create policy "owner manage invitations" on invitations
  for all
  using (account_id in (
    select account_id from public.account_members
    where user_id = auth.uid() and role = 'owner'
  ))
  with check (account_id in (
    select account_id from public.account_members
    where user_id = auth.uid() and role = 'owner'
  ));

-- Konto-Zeile (Name/Slug/onboarded) nur der INHABER ändern.
-- SELECT bleibt für alle Mitglieder (separate Policy "members read own account").
-- Onboarding-Nutzer ist per Signup-Trigger Owner -> completeOnboarding funktioniert weiter.
drop policy if exists "members update own account" on accounts;
create policy "owner update own account" on accounts
  for update
  using (id in (
    select account_id from public.account_members
    where user_id = auth.uid() and role = 'owner'
  ))
  with check (id in (
    select account_id from public.account_members
    where user_id = auth.uid() and role = 'owner'
  ));

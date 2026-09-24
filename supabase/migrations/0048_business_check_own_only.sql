-- ============================================================
-- 0048: account_is_business verrät den Tarif fremder Konten nicht mehr (Sicherheitsprüfung
-- Runde 4, 24.09.2026). Die Funktion ist für eingeloggte Nutzer aufrufbar (die Trigger
-- guard_tutorial_internal / guard_theme_mode laufen als Aufrufer und brauchen das Recht) —
-- per RPC ließ sich damit für JEDE Konto-ID „Business ja/nein“ abfragen.
-- Jetzt: Für Aufrufe aus dem Browser nur Konten, in denen man Mitglied ist (in den Triggern ist
-- das immer das eigene Konto); der Server (service_role) sieht weiter alles. Idempotent.
-- ============================================================

create or replace function public.account_is_business(aid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.accounts a
     where a.id = aid
       and a.plan = 'business'
       and (not public.is_user_request() or a.id in (select public.my_account_ids()))
  );
$$;
revoke all on function public.account_is_business(uuid) from public, anon;
grant execute on function public.account_is_business(uuid) to authenticated;

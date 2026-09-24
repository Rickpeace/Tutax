-- ============================================================
-- 0045: Schulungsnachweise nur für echte Schulungen des eigenen Kontos (Audit 24.09.2026).
--
-- Die Insert-Regel aus 0021 prüfte nur „für mich selbst“ und „Mitglied in account_id“ — nicht,
-- ob die Anleitung zu DIESEM Konto gehört, veröffentlicht und als Schulung freigegeben ist.
-- Live nachgestellt: eine Person aus Konto X legte per REST einen Nachweis für eine Schulung
-- von Konto Y an (Y's Liste zeigte „1 von 1“), und ein Mitarbeiter „absolvierte“ einen Entwurf.
-- Idempotent.
-- ============================================================

drop policy if exists "members insert own completion" on public.tutorial_completions;
create policy "members insert own completion" on public.tutorial_completions for insert
  with check (
    user_id = auth.uid()
    and account_id in (select account_id from public.account_members where user_id = auth.uid())
    and exists (
      select 1 from public.tutorials t
      where t.id = tutorial_completions.tutorial_id
        and t.account_id = tutorial_completions.account_id
        and t.status = 'published'
        and (t.visibility = 'internal' or t.in_lernen)
    )
  );

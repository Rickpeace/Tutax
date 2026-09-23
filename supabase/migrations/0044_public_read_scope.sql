-- ============================================================
-- 0044: Offene Lese-Regeln auf das Nötige beschränken (Bug-Audit 23.09.2026).
--
-- Die „public read …“-Regeln aus 0002/0021/0022 galten für JEDEN (auch ohne Login, mit dem
-- öffentlichen Schlüssel aus dem Browser-Bundle) und gaben ganze Zeilen frei: bei
-- veröffentlichten Anleitungen aller Konten u. a. Aufnahme-Adressen (page_url inkl.
-- Sitzungs-Parametern), Selektoren, Dateinamen; dazu Designs (themes) und Kategorien aller
-- Konten. Die öffentlichen Seiten (/h, Chat, Hub-Suche, Einbetten, Sitemap) lesen längst mit
-- Server-Rechten und filtern selbst (lib/public-step.ts) — diese Regeln braucht nur noch die
-- App für die globalen STANDARD-VORLAGEN (account_id IS NULL), und nur mit Login.
--
-- Eigene Daten bleiben über die Konto-Regeln („owner full …“, 0037/0039) lesbar.
-- Idempotent.
-- ============================================================

create or replace function public.is_published_template(tid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tutorials t
    where t.id = tid and t.is_template and t.account_id is null and t.status = 'published'
  );
$$;
revoke all on function public.is_published_template(uuid) from public, anon;
grant execute on function public.is_published_template(uuid) to authenticated;

-- tutorials
drop policy if exists "public read published tutorials" on public.tutorials;
drop policy if exists "read published templates" on public.tutorials;
create policy "read published templates" on public.tutorials for select to authenticated
  using (is_template and account_id is null and status = 'published');

-- steps
drop policy if exists "public read published steps" on public.steps;
drop policy if exists "read published template steps" on public.steps;
create policy "read published template steps" on public.steps for select to authenticated
  using (public.is_published_template(tutorial_id));

-- step_branches
drop policy if exists "public read published branches" on public.step_branches;
drop policy if exists "read published template branches" on public.step_branches;
create policy "read published template branches" on public.step_branches for select to authenticated
  using (exists (
    select 1 from public.steps s where s.id = step_branches.step_id and public.is_published_template(s.tutorial_id)
  ));

-- chapters (Altbestand, leer)
drop policy if exists "public read published chapters" on public.chapters;

-- Übersetzungen
drop policy if exists "public read published tutorial translations" on public.tutorial_translations;
drop policy if exists "read published template translations" on public.tutorial_translations;
create policy "read published template translations" on public.tutorial_translations for select to authenticated
  using (public.is_published_template(tutorial_id));

drop policy if exists "public read published step translations" on public.step_translations;
drop policy if exists "read published template step translations" on public.step_translations;
create policy "read published template step translations" on public.step_translations for select to authenticated
  using (exists (
    select 1 from public.steps s where s.id = step_translations.step_id and public.is_published_template(s.tutorial_id)
  ));

drop policy if exists "public read published branch translations" on public.branch_translations;
drop policy if exists "read published template branch translations" on public.branch_translations;
create policy "read published template branch translations" on public.branch_translations for select to authenticated
  using (exists (
    select 1 from public.step_branches b join public.steps s on s.id = b.step_id
    where b.id = branch_translations.branch_id and public.is_published_template(s.tutorial_id)
  ));

-- Designs, Kategorien, Wissensartikel: nur noch über die Konto-Regeln bzw. den Server.
drop policy if exists "public read themes" on public.themes;
drop policy if exists "public read categories" on public.categories;
drop policy if exists "public read published kb_articles" on public.kb_articles;

-- Tarif-Abfrage nicht für Anonyme (verriet den Tarif beliebiger Konten).
revoke execute on function public.account_is_business(uuid) from anon;

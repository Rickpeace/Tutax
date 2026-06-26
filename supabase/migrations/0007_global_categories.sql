-- ============================================================
-- 0007: Globale Standard-Kategorien (§14)
-- Admin pflegt Kategorien zentral (account_id IS NULL); Templates werden
-- ihnen zugeordnet. Sie sind öffentlich lesbar -> erscheinen automatisch
-- beim Kunden (Dashboard) und im Mandanten-Hub.
-- ============================================================

-- account_id darf NULL sein = globale Kategorie
alter table categories alter column account_id drop not null;

-- Globale Kategorienamen eindeutig (account-eigene bleiben unberührt)
create unique index if not exists categories_global_name_uniq
  on categories (name) where account_id is null;

-- "public read categories" (account_id-unabhängig, using true) deckt das Lesen ab.
-- Admin darf globale Kategorien anlegen/ändern/löschen:
drop policy if exists "admin manage global categories" on categories;
create policy "admin manage global categories" on categories
  for all
  using (account_id is null and is_admin())
  with check (account_id is null and is_admin());

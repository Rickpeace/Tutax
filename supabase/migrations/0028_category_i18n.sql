-- 0028: Kategorie-Namen mehrsprachig (Welle 29) - Uebersetzungen als jsonb
-- { "en": "...", "pl": "...", "tr": "..." }; null/fehlender Key = deutscher Name.
alter table public.categories add column if not exists name_i18n jsonb;
comment on column public.categories.name_i18n is
  'Uebersetzte Kategorienamen je Sprache {en,pl,tr} - Quelle bleibt name (de)';

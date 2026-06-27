-- Extrem-KI-Design: eigener CSS-Skin + Layout-Varianten je Kanzlei.
-- mode kann jetzt 'manual' | 'ai' | 'extreme' sein (Spalte ist text, kein Enum-Change nötig).
alter table themes
  add column if not exists extreme_tokens jsonb,
  add column if not exists extreme_css text,
  add column if not exists extreme_layout jsonb,
  add column if not exists extreme_logo_path text;

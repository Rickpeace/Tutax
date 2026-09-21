-- 0036: ERWEITERTE INTERAKTION (Welle 48). Ein Schritt kann mehr sein als „Klick" / „Eingabe":
-- Eingabe mit Enter abschicken (Google-Suche), Rechtsklick, Doppelklick, Ziehen (Drag&Drop),
-- Tastenkürzel, „erst mit der Maus über ein Menü fahren" (Hover) und Schritte in einem iframe.
--
-- interaction (jsonb) am Schritt, Vertrag s. extension/content.js („INTERACTION-Vertrag"):
--   { enter?: true,                                  -- nur action "type"/"fill"
--     variant?: 'right'|'double'|'drag'|'key',        -- nur Klick-Schritte
--     key?: 'Ctrl+S',                                -- nur variant 'key'
--     drop?: {css,text,role,shadow?}, dropLabel?,    -- nur variant 'drag'
--     hover?: {css,text,role,shadow?}, hoverLabel?,  -- vorher mit der Maus darüber (Menü)
--     frame?: {url} }                                -- Schritt liegt in einem iframe (origin+pathname)
-- NIE Feldinhalte. Der MENSCH bekommt passende Texte + Live-Führung, die AUTOMATION führt die
-- Interaktion aus. Fehlt interaction → heutiges Verhalten (normaler Klick/normale Eingabe).
-- Rein additiv + nullable: alte Schritte bleiben unverändert.
alter table public.steps add column if not exists interaction jsonb;
comment on column public.steps.interaction is
  'Erweiterte Interaktion {enter|variant|key|drop|hover|frame} — Anleitungstext, Live-Führung und Automations-Lauf werten sie aus (Welle 48)';

alter table public.automation_steps add column if not exists interaction jsonb;
comment on column public.automation_steps.interaction is
  'Kopie von steps.interaction im Automations-Snapshot — der Lauf führt Enter/Rechtsklick/Doppelklick/Ziehen/Kürzel/Hover/iframe aus';

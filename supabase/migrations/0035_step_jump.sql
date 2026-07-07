-- 0035: BEDINGTER SPRUNG / Block-Überspringen (Welle 47). Richards Kernbedarf: eine
-- Automation soll ein- UND ausgeloggt funktionieren. Das per-Schritt-„?" (Welle 42) reicht
-- dafür nicht, weil jeder Login-Schritt SEINE Login-/Google-Seite als page_url trägt und der
-- Lauf sich selbst dorthin navigiert, BEVOR die Bedingung greift. Der Sprung entscheidet
-- EINMAL, ganz vorne (bevor navigiert wird), und überspringt den ganzen Block.
--
-- jump (jsonb) am Schritt: „wenn ⟨Bedingung⟩ zutrifft → springe VORWÄRTS zu Schritt
-- ⟨to_position⟩ (die Schritte dazwischen werden übersprungen); sonst diesen Schritt normal
-- ausführen". Form:
--   { when: {kind:'element', selector:{css,text,role}, negate?:true} | {kind:'url', pattern, negate?},
--     to_position: <int, > position dieses Schritts> }
-- Typischer Login-Fall: when = „Anmelden-Element NICHT da" (negate) → springe hinter den Login.
-- Der MENSCH (Führung) ignoriert jump; nur der Automations-Lauf wertet ihn aus. Fehlt jump →
-- heutiges Verhalten. NUR VORWÄRTS (to_position > position), damit keine Endlosschleife.
alter table public.steps add column if not exists jump jsonb;
comment on column public.steps.jump is
  'Bedingter Vorwärts-Sprung {when:<condition>, to_position} — vom Automations-Lauf ausgewertet (Block-Überspringen, z. B. Login wenn eingeloggt)';

alter table public.automation_steps add column if not exists jump jsonb;
comment on column public.automation_steps.jump is
  'Kopie von steps.jump im Automations-Snapshot — Basis des bedingten Block-Sprungs im Lauf';

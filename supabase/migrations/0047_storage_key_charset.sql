-- ============================================================
-- 0047: Speicherpfade nur aus harmlosen Zeichen (Sicherheitsprüfung Runde 4, 24.09.2026).
--
-- path_in_account prüfte nur auf ein wörtliches „..“. Supabase-Storage dekodiert beim DOWNLOAD
-- aber Prozent-Kodierung: `<eigenes-konto>/%2e%2e/<fremdes-konto>/<anleitung>/<schritt>.webp`
-- lief durch, und das Veröffentlichen kopierte das fremde (unverpixelte) Original öffentlich.
-- Jetzt: nur A–Z, a–z, 0–9, „.“, „_“, „-“ und „/“ als Trenner; kein Abschnitt „.“/„..“, keine
-- leeren Abschnitte. Alle bestehenden Pfade erfüllen das (vorher live geprüft).
-- Wirkt auf alle Trigger, die path_in_account nutzen (steps, automation_steps, themes, video_jobs).
-- Idempotent.
-- ============================================================

create or replace function public.path_in_account(p_path text, p_account uuid)
returns boolean
language sql
immutable
as $$
  select p_path is null
      or (
        p_account is not null
        and p_path like p_account::text || '/%'
        and length(p_path) <= 512
        and p_path ~ '^[A-Za-z0-9._/-]+$'
        and p_path !~ '(^|/)\.{1,2}(/|$)'
        and position('//' in p_path) = 0
      );
$$;

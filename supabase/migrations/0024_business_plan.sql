-- Dritte Tarifstufe „business" (Welle Tier-Gates): free < pro < business.
-- Gating serverseitig in lib/plan.ts + Actions (Sprachen, KI-CI, Intern, TTS).

alter table public.accounts drop constraint if exists accounts_plan_check;
alter table public.accounts add constraint accounts_plan_check
  check (plan in ('free', 'pro', 'business'));

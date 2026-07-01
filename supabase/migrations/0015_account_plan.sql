-- Tarif pro Konto. 'pro' kann MANUELL vom Plattform-Admin vergeben werden
-- (Vollzugriff ohne Zahlungsanbieter — Richards Anforderung); später setzt
-- LemonSqueezy per Webhook denselben Wert automatisch.
alter table public.accounts add column if not exists plan text not null default 'free';
alter table public.accounts drop constraint if exists accounts_plan_check;
alter table public.accounts add constraint accounts_plan_check check (plan in ('free', 'pro'));

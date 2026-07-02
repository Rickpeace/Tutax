-- Steply Recorder (Extension) direkt-Upload: ein widerrufbarer Verbindungs-Token
-- pro Konto. Die Extension authentifiziert sich damit gegen /api/recorder/* —
-- keine Cookies/Sessions nötig. Neu generieren = alter Token sofort ungültig.

alter table public.accounts add column if not exists recorder_token uuid unique;

# Steply Auth-Mail-Templates (deutsch, warme CI)

Supabase verschickt Magic-Link/Passwort-Mails mit englischen Standard-Texten.
Diese Vorlagen ersetzen sie durch deutsche Steply-Mails im Warm-Design —
gleicher Stil wie die Team-Einladungs-Mail (Koralle `#ef6a4e`, warmes Ink).

## Einkleben (einmalig, ~5 Minuten)

Supabase-Dashboard → Projekt → **Authentication → Email Templates** → je Tab:
**Subject** ersetzen + **Message body** komplett durch den Inhalt der HTML-Datei
ersetzen → Save.

| Supabase-Tab       | Datei                          | Subject                                        |
| ------------------ | ------------------------------ | ---------------------------------------------- |
| Magic Link         | `magic-link.html`              | `Dein Anmelde-Link für Steply`                 |
| Reset Password     | `passwort-zuruecksetzen.html`  | `Neues Passwort für Steply festlegen`          |
| Change Email       | `e-mail-aendern.html`          | `Neue E-Mail-Adresse für Steply bestätigen`    |
| Confirm Signup     | `registrierung.html`           | `Willkommen bei Steply — Adresse bestätigen`   |

Hinweise:
- **Confirm Signup** ist aktuell AUS (Auto-Confirm aktiv) — Vorlage trotzdem
  einkleben, dann ist sie fertig, falls wir Bestätigung später einschalten.
- Die Team-Einladung läuft NICHT über Supabase, sondern über Resend direkt aus
  der App (`settings/team/actions.ts`) — dort ist das Design schon drin.
- `{{ .ConfirmationURL }}` ist die Supabase-Variable für den Aktions-Link;
  nichts daran ändern.

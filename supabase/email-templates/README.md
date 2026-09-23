# Steply Auth-Mail-Templates (deutsch, Sie-Form, warme CI)

Supabase verschickt Anmelde-Link-/Passwort-/E-Mail-Wechsel-Mails selbst. Diese Vorlagen
ersetzen die Standard-Texte durch Steply-Mails im **selben Design wie die App-Mails**
(Einladung, Willkommen, Team-Beitritt, Hinweise — `src/lib/email/`).

**Nicht von Hand bearbeiten:** Die HTML-Dateien werden erzeugt aus
`src/lib/email/layout.ts` + Texten in `scripts/build-email-templates.mjs`:

```
node scripts/build-email-templates.mjs
```

Vorschau aller Mails (App + Supabase) als Bilder: `npx tsx scripts/preview-emails.ts <ordner>`

## Einkleben (nach jeder Änderung, ~5 Minuten)

Supabase-Dashboard → Projekt → **Authentication → Emails** (Templates) → je Tab:
**Subject** ersetzen + **Message body** komplett durch den Inhalt der HTML-Datei ersetzen → Save.

| Supabase-Tab          | Datei                          | Subject                                                   |
| --------------------- | ------------------------------ | --------------------------------------------------------- |
| Magic Link            | `magic-link.html`              | `Ihr Anmelde-Link für Steply`                             |
| Reset Password        | `passwort-zuruecksetzen.html`  | `Neues Passwort für Steply festlegen`                     |
| Change Email Address  | `e-mail-aendern.html`          | `Neue E-Mail-Adresse für Steply bestätigen`               |
| Confirm signup        | `registrierung.html`           | `Willkommen bei Steply – bitte E-Mail-Adresse bestätigen` |

Hinweise:
- **Site URL** (Authentication → URL Configuration) OHNE Schrägstrich am Ende eintragen
  (`https://tutax-ivory.vercel.app`) — sonst stehen `//auth/confirm` in den Links.
- **Confirm signup** ist aktuell AUS (Auto-Confirm aktiv). Stattdessen schickt die App nach
  der Registrierung die Willkommens-Mail „Ihr Konto ist eingerichtet“ (`signUp` →
  `welcomeEmail`). Vorlage trotzdem einkleben, falls die Bestätigung später an geht.
- Team-Einladung, Willkommen, Team-Beitritt und Hinweis-Digest laufen NICHT über Supabase,
  sondern über Resend direkt aus der App (`src/lib/email/templates.ts`).
- **Link-Methode:** Die Vorlagen bauen den Link SELBST über
  `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…&next=…` — NICHT über
  `{{ .ConfirmationURL }}`: geht ohne Umweg über supabase.co auf unsere `/auth/confirm`
  (verifyOtp), funktioniert geräteübergreifend und hängt nicht an der Redirect-Allowlist.
  `type` je Vorlage: email (Magic Link, Registrierung) · recovery · email_change.

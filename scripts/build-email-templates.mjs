// Erzeugt die Supabase-Auth-Mails (supabase/email-templates/*.html) aus DEMSELBEN Layout wie
// die App-Mails (src/lib/email/layout.ts) — ein Design, eine Anrede (Sie) für alle Mails.
// Danach die Dateien im Supabase-Dashboard einkleben (siehe supabase/email-templates/README.md).
//
// Nutzung:  node scripts/build-email-templates.mjs
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderEmail } from "../src/lib/email/layout.ts";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "supabase", "email-templates");
const SITE = "{{ .SiteURL }}";
const link = (type, next) => `${SITE}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

export const TEMPLATES = [
  {
    file: "magic-link.html",
    tab: "Magic Link",
    subject: "Ihr Anmelde-Link für Steply",
    preheader: "Mit einem Klick angemeldet – ganz ohne Passwort.",
    title: "Ihr Anmelde-Link",
    blocks: [{ kind: "p", html: "Klicken Sie auf den Knopf, um sich bei Steply anzumelden – ganz ohne Passwort." }],
    button: { label: "Jetzt anmelden", href: link("email", "/app") },
    note: "Der Link ist nur kurze Zeit gültig und funktioniert einmal. Sie haben keine Anmeldung angefordert? Dann ignorieren Sie diese E-Mail – ohne Klick passiert nichts.",
    reason: "Sie erhalten diese E-Mail, weil für Ihre Adresse ein Anmelde-Link angefordert wurde.",
  },
  {
    file: "passwort-zuruecksetzen.html",
    tab: "Reset Password",
    subject: "Neues Passwort für Steply festlegen",
    preheader: "Legen Sie mit einem Klick ein neues Passwort fest.",
    title: "Neues Passwort festlegen",
    blocks: [
      {
        kind: "p",
        html: "Sie möchten Ihr Steply-Passwort zurücksetzen? Klicken Sie auf den Knopf und legen Sie direkt ein neues fest.",
      },
    ],
    button: { label: "Neues Passwort festlegen", href: link("recovery", "/reset") },
    note: "Der Link ist nur kurze Zeit gültig. Sie haben das nicht angefordert? Dann ignorieren Sie diese E-Mail – Ihr bisheriges Passwort bleibt gültig.",
    reason: "Sie erhalten diese E-Mail, weil für Ihr Steply-Konto ein neues Passwort angefordert wurde.",
  },
  {
    file: "e-mail-aendern.html",
    tab: "Change Email Address",
    subject: "Neue E-Mail-Adresse für Steply bestätigen",
    preheader: "Bitte bestätigen Sie die Änderung Ihrer E-Mail-Adresse.",
    title: "E-Mail-Adresse ändern",
    blocks: [
      {
        kind: "p",
        html: "Die E-Mail-Adresse Ihres Steply-Kontos soll geändert werden:",
      },
      { kind: "box", html: "Bisher: {{ .Email }}<br>Neu: <b>{{ .NewEmail }}</b>" },
      { kind: "p", html: "Bitte bestätigen Sie die Änderung mit einem Klick." },
    ],
    button: { label: "Änderung bestätigen", href: link("email_change", "/app/settings/profil") },
    note: "Sie haben keine Änderung angestoßen? Dann ignorieren Sie diese E-Mail und ändern Sie zur Sicherheit Ihr Passwort.",
    reason: "Sie erhalten diese E-Mail, weil die Adresse Ihres Steply-Kontos geändert werden soll.",
  },
  {
    file: "registrierung.html",
    tab: "Confirm signup",
    subject: "Willkommen bei Steply – bitte E-Mail-Adresse bestätigen",
    preheader: "Nur noch ein Klick, dann ist Ihr Konto startklar.",
    title: "Willkommen bei Steply!",
    blocks: [
      {
        kind: "p",
        html: "Schön, dass Sie da sind. Bitte bestätigen Sie kurz Ihre E-Mail-Adresse – dann ist Ihr Konto startklar.",
      },
    ],
    button: { label: "E-Mail-Adresse bestätigen", href: link("email", "/app") },
    note: "Sie haben sich nicht bei Steply registriert? Dann ignorieren Sie diese E-Mail – ohne Bestätigung wird kein Konto aktiv.",
    reason: "Sie erhalten diese E-Mail, weil mit dieser Adresse ein Steply-Konto erstellt wurde.",
  },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  for (const t of TEMPLATES) {
    const { html } = renderEmail({ ...t, baseUrl: SITE });
    writeFileSync(path.join(OUT, t.file), html + "\n");
    console.log(`${t.tab.padEnd(22)} ${t.file.padEnd(30)} Betreff: ${t.subject}`);
  }
}

import { escapeHtml, renderEmail } from "./layout";

/**
 * Inhalte der App-Mails (Resend). Alle im selben Design (./layout) und in der Sie-Form wie
 * die App. Die Supabase-Mails (Anmelde-Link, Passwort, E-Mail-Wechsel, Bestätigung) erzeugt
 * scripts/build-email-templates.mjs aus demselben Layout.
 */

type Role = { label: string; hint: string };

/** Nach der Registrierung: Bestätigung „Ihr Konto ist eingerichtet“ + erste Schritte. */
export function welcomeEmail(p: { baseUrl: string; email: string; orgName?: string | null }) {
  const org = p.orgName?.trim() ? escapeHtml(p.orgName.trim()) : null;
  const subject = "Willkommen bei Steply – Ihr Konto ist eingerichtet";
  return {
    subject,
    ...renderEmail({
      baseUrl: p.baseUrl,
      subject,
      preheader: "Ihre Registrierung hat geklappt. So starten Sie mit Ihrer ersten Anleitung.",
      title: "Willkommen bei Steply!",
      blocks: [
        {
          kind: "p",
          html: `Ihre Registrierung war erfolgreich – Ihr Konto${org ? ` für <b>${org}</b>` : ""} ist eingerichtet und sofort startklar.`,
        },
        {
          kind: "box",
          html: `<b>Ihre Anmeldung</b><br>E-Mail: ${escapeHtml(p.email)}<br>Passwort: das Passwort, das Sie bei der Registrierung gewählt haben`,
        },
        {
          kind: "steps",
          items: [
            { title: "Erste Anleitung erstellen", text: "Schritt für Schritt im Editor – mit Bildern und kurzen Texten." },
            { title: "Veröffentlichen", text: "Fertige Anleitungen erscheinen auf Ihrer eigenen Hilfe-Seite." },
            { title: "Teilen", text: "Den Link zur Hilfe-Seite an Ihre Kunden oder Ihr Team weitergeben." },
          ],
        },
      ],
      button: { label: "Zu Steply", href: `${p.baseUrl}/app` },
      note: "Sie haben sich nicht selbst bei Steply registriert? Dann setzen Sie auf der Anmeldeseite über „Passwort vergessen“ ein neues Passwort – danach haben nur noch Sie Zugriff auf das Konto.",
      reason: "Sie erhalten diese E-Mail, weil mit dieser Adresse ein Steply-Konto erstellt wurde.",
    }),
  };
}

/** Einladung ins Team (Link zur Beitritts-Seite). */
export function inviteEmail(p: { baseUrl: string; orgName: string; role: Role; link: string; validDays: number }) {
  const org = escapeHtml(p.orgName);
  const subject = `Einladung zu ${p.orgName} auf Steply`;
  return {
    subject,
    ...renderEmail({
      baseUrl: p.baseUrl,
      subject,
      preheader: `Treten Sie dem Team von ${org} bei – mit einem Klick.`,
      title: `Sie sind zu ${org} eingeladen`,
      blocks: [
        { kind: "p", html: `Sie wurden als <b>${p.role.label}</b> in das Team von <b>${org}</b> auf Steply eingeladen.` },
        {
          kind: "box",
          html: `<b>Ihre Rolle: ${p.role.label}</b><br>${p.role.hint}<br><br><b>So geht's</b><br>Neu bei Steply? Legen Sie beim Beitreten einfach ein Passwort fest.<br>Schon ein Konto? Melden Sie sich mit Ihrem bisherigen Passwort an – Ihr Konto bleibt, das Team kommt dazu.`,
        },
      ],
      button: { label: "Einladung annehmen", href: p.link },
      note: `Die Einladung ist ${p.validDays} Tage gültig. Sie kennen ${org} nicht? Dann ignorieren Sie diese E-Mail – ohne Klick passiert nichts.`,
      reason: "Sie erhalten diese E-Mail, weil Sie jemand in ein Steply-Team eingeladen hat.",
    }),
  };
}

/** Nach dem Annehmen einer Einladung: Bestätigung „Sie sind im Team“ (neues wie bestehendes Konto). */
export function teamJoinedEmail(p: {
  baseUrl: string;
  email: string;
  orgName: string;
  role: Role;
  newAccount: boolean;
}) {
  const org = escapeHtml(p.orgName);
  const subject = p.newAccount
    ? `Willkommen bei Steply – Sie sind im Team von ${p.orgName}`
    : `Sie sind jetzt im Team von ${p.orgName}`;
  const password = p.newAccount
    ? "das Passwort, das Sie beim Beitreten festgelegt haben"
    : "Ihr bisheriges Steply-Passwort";
  return {
    subject,
    ...renderEmail({
      baseUrl: p.baseUrl,
      subject,
      preheader: `Sie sind jetzt als ${p.role.label} im Team von ${org}.`,
      title: p.newAccount ? "Ihr Konto ist eingerichtet" : `Willkommen im Team von ${org}`,
      blocks: [
        {
          kind: "p",
          html: p.newAccount
            ? `Sie haben die Einladung angenommen und sind jetzt als <b>${p.role.label}</b> im Team von <b>${org}</b> auf Steply.`
            : `Sie haben die Einladung angenommen und sind jetzt zusätzlich als <b>${p.role.label}</b> im Team von <b>${org}</b>.`,
        },
        {
          kind: "box",
          html: `<b>Ihre Anmeldung</b><br>E-Mail: ${escapeHtml(p.email)}<br>Passwort: ${password}<br><br><b>Ihre Rolle: ${p.role.label}</b><br>${p.role.hint}`,
        },
        ...(p.newAccount
          ? []
          : [
              {
                kind: "p" as const,
                html: "Ihr bisheriges Konto und Ihre eigene Organisation bleiben unverändert. Zwischen Ihren Organisationen wechseln Sie jederzeit oben rechts über den Kreis mit Ihrem Anfangsbuchstaben → „Organisation wechseln“.",
              },
            ]),
      ],
      button: { label: "Zu Steply", href: `${p.baseUrl}/app` },
      reason: `Sie erhalten diese E-Mail, weil Sie eine Einladung von ${org} angenommen haben.`,
    }),
  };
}

/** Wöchentlicher Aktualitäts-Check (Business): Anleitungen, die veraltet wirken. */
export function driftDigestEmail(p: { baseUrl: string; accountName: string; titles: string[] }) {
  const n = p.titles.length;
  const subject = `${n} Anleitung${n === 1 ? "" : "en"} wirk${n === 1 ? "t" : "en"} veraltet`;
  const org = escapeHtml(p.accountName);
  return {
    subject,
    ...renderEmail({
      baseUrl: p.baseUrl,
      subject,
      preheader: `Der Aktualitäts-Check hat bei ${org} mögliche Änderungen gefunden.`,
      title: subject,
      blocks: [
        { kind: "p", html: `Unser wöchentlicher Aktualitäts-Check hat bei <b>${org}</b> mögliche Änderungen gefunden:` },
        { kind: "box", html: p.titles.map((t) => `• ${escapeHtml(t)}`).join("<br>") },
        { kind: "p", html: "Prüfen Sie die Hinweise und passen Sie die Anleitungen bei Bedarf an – so bleiben sie aktuell." },
      ],
      button: { label: "Hinweise ansehen", href: `${p.baseUrl}/app/alerts` },
      reason: `Sie erhalten diese E-Mail als Inhaber von ${org} auf Steply.`,
    }),
  };
}

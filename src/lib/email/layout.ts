/**
 * EIN Mail-Design für alle Steply-Mails (App-Mails über Resend UND die Supabase-Vorlagen,
 * die scripts/build-email-templates.mjs hieraus erzeugt). Warme CI wie die App: Koralle
 * #ef6a4e mit „hartem Schatten“, Ink #33291f, Off-White #fdf9f3, 2px-Linien #f0e7d9,
 * Nunito. Tabellen-Layout + Inline-Styles, damit es auch in Outlook/Gmail hält; die
 * Wortmarke ist reines HTML (kein Bild), sieht also auch bei blockierten Bildern richtig aus.
 *
 * Bewusst ohne Imports (reine Funktion): das Build-Skript lädt die Datei direkt mit Node.
 */

const C = {
  bg: "#fdf9f3",
  card: "#ffffff",
  line: "#f0e7d9",
  soft: "#f7f1e6",
  ink: "#33291f",
  ink2: "#6b5e4b",
  muted: "#8a7a63",
  coral: "#ef6a4e",
  coralPressed: "#d3543a",
};
const FONT = "'Nunito','Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Absatz-Baustein: `html` ist bereits sicheres HTML (Werte vorher mit escapeHtml!). */
export type EmailBlock =
  | { kind: "p"; html: string }
  /** Hervorgehobener Kasten (z. B. Anmeldedaten). */
  | { kind: "box"; html: string }
  /** Nummerierte Schritte „So geht es weiter“. */
  | { kind: "steps"; items: { title: string; text: string }[] };

export type EmailContent = {
  /** Betreff — auch <title>. */
  subject: string;
  /** Vorschauzeile im Posteingang (unsichtbar im Mail-Text). */
  preheader: string;
  title: string;
  blocks: EmailBlock[];
  button?: { label: string; href: string };
  /** Kleingedrucktes unter dem Knopf (Gültigkeit, „nicht angefordert?“). Sicheres HTML. */
  note?: string;
  /** Warum diese Mail kommt (Fußzeile). Sicheres HTML. */
  reason?: string;
  /** App-Adresse für Impressum/Datenschutz-Links (ohne Schrägstrich am Ende). */
  baseUrl: string;
};

const stripTags = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

function blockHtml(b: EmailBlock): string {
  if (b.kind === "p")
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${C.ink2}">${b.html}</p>`;
  if (b.kind === "box")
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px"><tr><td style="background:${C.soft};border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:${C.ink}">${b.html}</td></tr></table>`;
  const rows = b.items
    .map(
      (it, i) => `<tr>
        <td width="30" valign="top" style="padding:0 12px 14px 0"><div style="width:26px;height:26px;line-height:26px;border-radius:13px;background:${C.soft};color:${C.coral};font-weight:900;font-size:13px;text-align:center">${i + 1}</div></td>
        <td valign="top" style="padding:2px 0 14px;font-size:14px;line-height:1.55;color:${C.ink2}"><b style="color:${C.ink}">${it.title}</b><br>${it.text}</td>
      </tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 8px">${rows}</table>`;
}

function blockText(b: EmailBlock): string {
  if (b.kind === "steps") return b.items.map((it, i) => `${i + 1}. ${stripTags(it.title)} – ${stripTags(it.text)}`).join("\n");
  return stripTags(b.html);
}

/** Fertige Mail als HTML + Nur-Text-Fassung (bessere Zustellbarkeit, Text-Clients). */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px"><tr>
        <td style="background:${C.coral};border-radius:12px;border-bottom:3px solid ${C.coralPressed}">
          <a href="${c.button.href}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px">${c.button.label}</a>
        </td></tr></table>
      <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:${C.muted}">Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:</p>
      <p style="margin:0 0 18px;font-size:12px;line-height:1.5;word-break:break-all"><a href="${c.button.href}" style="color:${C.coral};text-decoration:underline">${c.button.href}</a></p>`
    : "";
  const note = c.note
    ? `<p style="margin:0;padding-top:16px;border-top:2px solid ${C.soft};font-size:13px;line-height:1.55;color:${C.muted}">${c.note}</p>`
    : "";
  const reason = c.reason ? `${c.reason}<br>` : "";

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(c.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${c.preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding:0 4px 16px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td width="28" height="28" align="center" valign="middle" style="width:28px;height:28px;border-radius:14px;background:${C.coral};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:900;line-height:28px">S</td>
          <td style="padding-left:8px;font-family:${FONT};font-size:19px;font-weight:900;letter-spacing:-0.3px;color:${C.ink}">Steply</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:${C.card};border:2px solid ${C.line};border-radius:18px;padding:30px 30px 26px;font-family:${FONT}">
        <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:900;color:${C.ink}">${c.title}</h1>
        ${c.blocks.map(blockHtml).join("\n        ")}
        ${button}
        ${note}
      </td></tr>
      <tr><td align="center" style="padding:18px 12px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${C.muted}">
        ${reason}Steply · Schritt-für-Schritt-Anleitungen für Ihr Team und Ihre Kunden<br>
        <a href="${c.baseUrl}/impressum" style="color:${C.muted};text-decoration:underline">Impressum</a> · <a href="${c.baseUrl}/datenschutz" style="color:${C.muted};text-decoration:underline">Datenschutz</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  const text = [
    "STEPLY",
    "",
    stripTags(c.title),
    "",
    ...c.blocks.map((b) => blockText(b) + "\n"),
    ...(c.button ? [`${stripTags(c.button.label)}: ${c.button.href}`, ""] : []),
    ...(c.note ? [stripTags(c.note), ""] : []),
    "—",
    ...(c.reason ? [stripTags(c.reason)] : []),
    "Steply · Schritt-für-Schritt-Anleitungen für Ihr Team und Ihre Kunden",
    `Impressum: ${c.baseUrl}/impressum · Datenschutz: ${c.baseUrl}/datenschutz`,
  ].join("\n");

  return { html, text };
}

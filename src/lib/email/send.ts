/**
 * App-Mails über Resend (Einladung, Willkommen, Team-Beitritt, Hinweis-Digest).
 * Braucht RESEND_API_KEY + INVITE_FROM_EMAIL (Absender, z. B. "Steply <noreply@…>").
 * Ohne Konfiguration -> "unconfigured" (Aufrufer entscheidet über Fallback), nie ein Wurf.
 */
export type SendResult = "sent" | "unconfigured" | "failed";

export async function sendEmail(mail: {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Kurzname fürs Server-Log. */
  tag: string;
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.INVITE_FROM_EMAIL;
  if (!key || !from) {
    console.log(`[mail:${mail.tag}] nicht konfiguriert — „${mail.subject}“ nicht verschickt`);
    return "unconfigured";
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: Array.isArray(mail.to) ? mail.to : [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok)
      console.error(`[mail:${mail.tag}] Resend lehnt ab:`, res.status, (await res.text().catch(() => "")).slice(0, 200));
    return res.ok ? "sent" : "failed";
  } catch (e) {
    console.error(`[mail:${mail.tag}] Versand fehlgeschlagen:`, e instanceof Error ? e.message : e);
    return "failed";
  }
}

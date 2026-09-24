import type { Metadata } from "next";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Bestätigen", robots: { index: false } };

// Zwischenschritt für E-Mail-Links (Runde 4): Link-Scanner (Outlook Safe Links, Defender,
// Mimecast …) rufen jeden Link vorab auf. Wurde das Einmal-Token schon beim bloßen Abruf
// eingelöst, war der Link für den Menschen danach „ungültig“. Jetzt löst erst der Knopf das
// Token ein (POST an /auth/confirm) — Scanner drücken keine Knöpfe.
const TEXT: Record<string, { title: string; body: string; button: string }> = {
  magiclink: {
    title: "Bei Steply anmelden",
    body: "Klicken Sie auf den Knopf, um die Anmeldung abzuschließen.",
    button: "Jetzt anmelden",
  },
  recovery: {
    title: "Neues Passwort festlegen",
    body: "Klicken Sie auf den Knopf, um ein neues Passwort für Ihr Steply-Konto festzulegen.",
    button: "Weiter zum neuen Passwort",
  },
  signup: {
    title: "E-Mail-Adresse bestätigen",
    body: "Klicken Sie auf den Knopf, um Ihre E-Mail-Adresse zu bestätigen.",
    button: "Adresse bestätigen",
  },
  email_change: {
    title: "Neue E-Mail-Adresse bestätigen",
    body: "Klicken Sie auf den Knopf, um die Änderung Ihrer E-Mail-Adresse abzuschließen.",
    button: "Änderung bestätigen",
  },
};

export default async function LinkConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string; next?: string }>;
}) {
  const { token_hash, type, next } = await searchParams;
  const text = TEXT[type ?? ""] ?? TEXT[type === "email" || type === "invite" ? "signup" : "magiclink"];
  if (!token_hash || !type) {
    return (
      <div className="space-y-2 text-center">
        <h1 className="text-lg font-extrabold text-ink">Link unvollständig</h1>
        <p className="text-sm text-muted-foreground">
          Bitte öffnen Sie den Link direkt aus der E-Mail oder fordern Sie einen neuen an.
        </p>
      </div>
    );
  }
  return (
    <form method="post" action="/auth/confirm" className="space-y-4 text-center">
      <input type="hidden" name="token_hash" value={token_hash} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="next" value={next ?? ""} />
      <h1 className="text-lg font-extrabold text-ink">{text.title}</h1>
      <p className="text-sm text-muted-foreground">{text.body}</p>
      <Button type="submit" className="w-full">
        {text.button}
      </Button>
      <p className="text-xs text-muted-foreground">
        Dieser Zwischenschritt schützt Ihren Link davor, dass automatische Link-Prüfungen Ihres
        E-Mail-Programms ihn vorab verbrauchen.
      </p>
    </form>
  );
}

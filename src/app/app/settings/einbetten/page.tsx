import Link from "next/link";
import { ExternalLink, Link2, Code2, MessageCircle } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { appBaseUrl } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";

export default async function EinbettenPage() {
  const { account } = await requireAccount();
  const appUrl = appBaseUrl();
  const link = `${appUrl}/h/${account.slug}`;
  const iframe = `<iframe src="${link}" width="100%" height="700" style="border:0" title="Hilfe & Anleitungen"></iframe>`;
  const bubble = `<script src="${appUrl}/h/embed.js?account=${account.slug}" async></script>`;
  const qrSrc = `/api/qr?url=${encodeURIComponent(link)}`;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Hilfe-Seite einbinden</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ihre Anleitungen liegen unter dieser Adresse – ganz im Look Ihrer Organisation.
          So bringen Sie Ihre Kunden dorthin.
        </p>
      </div>

      {/* Empfohlen: Link */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <Link2 className="size-4 text-primary" /> Empfohlen: einfach verlinken
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Setzen Sie diesen Link als Menüpunkt „Hilfe“ oder „Anleitungen“ auf Ihre
          Website. Funktioniert mit jedem Baukasten (WordPress, Wix, Jimdo …) – kein
          iFrame nötig.
        </p>
        <div className="mt-3">
          <CopyField value={link} />
        </div>
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={link} target="_blank" />}
          >
            <ExternalLink className="size-4" /> Hilfe-Seite öffnen
          </Button>
        </div>

        {/* QR-Code der Hilfe-Seite (H6): für Brief, Rechnung, Aushang, Gerät. */}
        <div className="mt-5 flex flex-col gap-3 border-t border-line-2 pt-5 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            width={160}
            height={160}
            alt="QR-Code zur Hilfe-Seite"
            className="size-40 shrink-0 rounded-lg border border-border bg-white p-1"
          />
          <div className="text-sm text-muted-foreground">
            <p className="font-semibold text-ink">QR-Code</p>
            <p className="mt-1">
              Führt direkt zu Ihrer Hilfe-Seite – ideal für Brief, Rechnung, Aushang
              oder ein Gerät.
            </p>
            <p className="mt-1 text-xs">
              Zum Ausdrucken: Rechtsklick → Bild speichern.
            </p>
          </div>
        </div>
      </section>

      {/* Optional: iFrame */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <Code2 className="size-4 text-primary" /> Optional: direkt einbetten (iFrame)
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Wenn Sie die Hilfe direkt auf einer Unterseite anzeigen möchten, fügen Sie
          diesen Code in Ihre Seite ein.
        </p>
        <div className="mt-3">
          <CopyField value={iframe} multiline />
        </div>
      </section>

      {/* KI-Hilfe als Chat-Bubble (H4): ein Script-Tag -> schwebende Bubble auf JEDER Seite. */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <MessageCircle className="size-4 text-primary" /> KI-Hilfe als Chat-Bubble (auf
          jeder Seite)
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Fügen Sie dieses eine Script-Tag einmal in Ihre Website ein – dann schwebt
          der Hilfe-Assistent unten rechts auf jeder Seite, nicht nur auf der Hilfe-Seite.
        </p>
        <div className="mt-3">
          <CopyField value={bubble} multiline />
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Tipp: Da alles auf Ihrer gebrandeten Hilfe-Seite liegt, trägt jeder geteilte
        Link sichtbar Ihr Organisations-Branding.
      </p>
    </div>
  );
}

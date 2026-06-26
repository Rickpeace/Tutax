import Link from "next/link";
import { ExternalLink, Link2, Code2 } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";

export default async function EinbettenPage() {
  const { account } = await requireAccount();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${appUrl}/h/${account.slug}`;
  const iframe = `<iframe src="${link}" width="100%" height="700" style="border:0" title="Hilfe & Anleitungen"></iframe>`;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-bold text-ink">Hilfe-Seite einbinden</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ihre Anleitungen liegen unter dieser Adresse – ganz im Look Ihrer Kanzlei.
          So bringen Sie Ihre Mandanten dorthin.
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

      <p className="text-xs text-muted-foreground">
        Tipp: Da alles auf Ihrer gebrandeten Hilfe-Seite liegt, trägt jeder geteilte
        Link sichtbar Ihr Kanzlei-Branding.
      </p>
    </div>
  );
}

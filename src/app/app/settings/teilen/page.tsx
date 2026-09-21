import Link from "next/link";
import { ExternalLink, Link2, Code2, QrCode, Globe, MessageCircle } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { appBaseUrl } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";
import { SlugForm } from "@/components/app/slug-form";
import { SettingsCard, SettingsHeader } from "@/components/app/settings-ui";

export default async function TeilenPage() {
  const { account } = await requireAccount();
  const appUrl = appBaseUrl();
  const link = `${appUrl}/h/${account.slug}`;
  const iframe = `<iframe src="${link}" width="100%" height="700" style="border:0" title="Hilfe & Anleitungen"></iframe>`;
  const qrSrc = `/api/qr?url=${encodeURIComponent(link)}`;

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Hilfe-Seite"
        title="Adresse & Teilen"
        lead="Unter dieser Adresse finden Ihre Kunden alle veröffentlichten Anleitungen – ganz in Ihrem Design. So bringen Sie sie dorthin."
      />

      <SettingsCard title="Adresse der Hilfe-Seite" icon={Globe}>
        <SlugForm name={account.name} initialSlug={account.slug} appUrl={appUrl} />
      </SettingsCard>

      <SettingsCard
        title="Link teilen"
        icon={Link2}
        aside={
          <span className="rounded-full bg-teal-soft px-2 py-px text-[11px] font-black text-teal-text">
            Empfohlen
          </span>
        }
        description="Setzen Sie diesen Link als Menüpunkt „Hilfe“ oder „Anleitungen“ auf Ihre Website. Das klappt mit jedem Baukasten (WordPress, Wix, Jimdo …) – ohne iFrame."
      >
        <CopyField value={link} />
        <div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={link} target="_blank" />}
          >
            <ExternalLink className="size-4" /> Hilfe-Seite öffnen
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="QR-Code" icon={QrCode}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrSrc}
            width={160}
            height={160}
            alt="QR-Code zur Hilfe-Seite"
            className="size-40 shrink-0 rounded-xl border-2 border-line bg-white p-1"
          />
          <div className="text-sm text-ink-2">
            <p>
              Führt direkt zu Ihrer Hilfe-Seite – ideal für Brief, Rechnung, Aushang oder
              ein Gerät.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Zum Ausdrucken: Rechtsklick auf den Code → „Bild speichern unter …“.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title="Auf Ihrer Website einbetten (iFrame)"
        icon={Code2}
        description="Wenn die Hilfe direkt auf einer Unterseite Ihrer Website erscheinen soll, fügen Sie diesen Code dort ein."
      >
        <CopyField value={iframe} multiline />
      </SettingsCard>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <MessageCircle className="mt-px size-3.5 shrink-0" />
        <span>
          Den KI-Assistenten als Chat-Blase auf jeder Seite Ihrer Website finden Sie unter{" "}
          <Link href="/app/settings/chat" className="font-extrabold text-primary hover:underline">
            Chat auf Ihrer Website
          </Link>
          .
        </span>
      </p>
    </div>
  );
}

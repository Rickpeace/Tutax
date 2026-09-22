import Link from "next/link";
import { MessageCircle, ExternalLink, LifeBuoy, BookOpen } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { appBaseUrl } from "@/lib/url";
import { Button } from "@/components/ui/button";
import { CopyField } from "@/components/app/copy-field";
import { SettingsCard, SettingsHeader } from "@/components/app/settings-ui";

export default async function ChatSettingsPage() {
  const { account } = await requireAccount();
  const appUrl = appBaseUrl();
  const bubble = `<script src="${appUrl}/h/embed.js?account=${account.slug}" async></script>`;

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="KI-Assistent"
        title="Chat auf Ihrer Website"
        lead="Der KI-Assistent beantwortet Fragen aus Ihren Anleitungen und Ihrem Wissen – auf Wunsch auf jeder Seite Ihrer Website."
      />

      <SettingsCard
        title="Chat-Blase einbauen"
        icon={MessageCircle}
        description="Fügen Sie diese eine Zeile einmal in Ihre Website ein (z. B. im Kopf- oder Fußbereich). Dann schwebt der KI-Assistent unten rechts auf jeder Seite – nicht nur auf der Hilfe-Seite."
      >
        <CopyField value={bubble} multiline />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/h/${account.slug}`} target="_blank" />}
          >
            <ExternalLink className="size-4" /> Auf der Hilfe-Seite testen
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title="Was der KI-Assistent weiß" icon={BookOpen}>
        <p className="text-sm text-ink-2">
          Er antwortet nur aus Ihren veröffentlichten Anleitungen und Ihrer Wissensdatenbank.
          Fragen, die er nicht beantworten konnte, sammelt Steply unter „Offene Fragen“.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/app/assistent/wissen" />}
          >
            <BookOpen className="size-4" /> Wissen pflegen
          </Button>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href="/app/assistent/eskalation" />}
          >
            <LifeBuoy className="size-4" /> Persönlicher Kontakt
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

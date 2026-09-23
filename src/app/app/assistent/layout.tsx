import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { AssistentNav } from "@/components/app/assistent-nav";
import { PageHeader } from "@/components/app/page-header";
import { ProLockCard } from "@/components/app/pro-lock";
import { isPro } from "@/lib/plan";

/**
 * Zentrale für alles rund um den Chat-Assistenten: Wissen pflegen, offene Fragen
 * beantworten, persönlichen Kontakt festlegen.
 *
 * Layout-Shell ist STATISCH (Cache Components/PPR): Kopf, Beschreibung, die
 * „einbetten“-Quick-Link und die Unternavigation zeichnen sofort. Nur der
 * „Chat testen“-Link braucht den Konto-Slug (requireAccount = uncached) und streamt
 * daher in einer eigenen Suspense-Boundary nach — sonst würde er die ganze Route
 * blockieren (Build-Error unter cacheComponents).
 */
export default function AssistentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
      <PageHeader
        className="mb-5"
        title="KI-Assistent"
        description="Der Chat auf Ihrer Hilfe-Seite: Wissen pflegen, offene Fragen beantworten, persönlichen Kontakt festlegen."
        actions={
          <>
            <Suspense
              fallback={<div className="h-8 w-28 animate-pulse rounded-full bg-line-2/70" />}
            >
              <ChatTestLink />
            </Suspense>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/app/settings/chat" />}
            >
              <MessageCircle className="size-4" /> Chat auf Ihrer Website
            </Button>
          </>
        }
      />

      <AssistentNav />

      <div className="mt-6">
        <Suspense fallback={<div className="h-40 animate-pulse rounded-card bg-line-2/70" />}>
          <ProOnly>{children}</ProOnly>
        </Suspense>
      </div>
    </main>
  );
}

/** Braucht den Konto-Slug (uncached) → streamt in die statische Shell. */
async function ChatTestLink() {
  const { account } = await requireAccount();
  // Den Chat gibt es auf der Hilfe-Seite erst ab Pro — sonst öffnete der Knopf eine Seite ohne Chat.
  if (!isPro(account)) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      nativeButton={false}
      render={<Link href={`/h/${account.slug}`} target="_blank" />}
    >
      <ExternalLink className="size-4" /> Chat testen
    </Button>
  );
}

/**
 * KI-Assistent, Wissensdatenbank und Offene Fragen erst ab Pro (Tarifseite). Die Actions/Routen
 * sperren serverseitig; hier nur die Erklärung statt der Bearbeitungs-Seiten.
 */
async function ProOnly({ children }: { children: React.ReactNode }) {
  const { account } = await requireAccount();
  if (isPro(account)) return <>{children}</>;
  return (
    <ProLockCard
      title="Der KI-Assistent ist Teil von Pro"
      text="Mit Pro beantwortet ein Chat auf Ihrer Hilfe-Seite Fragen aus Ihren Anleitungen und Ihrer Wissensdatenbank – inklusive Offene Fragen und persönlichem Kontakt."
    />
  );
}

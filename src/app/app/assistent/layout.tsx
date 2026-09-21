import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { AssistentNav } from "@/components/app/assistent-nav";
import { PageHeader } from "@/components/app/page-header";

/**
 * Zentrale für alles rund um den Chat-Assistenten: Wissen pflegen, offene Fragen
 * beantworten, Eskalation regeln.
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
        description="Der Chat auf Ihrer Hilfe-Seite: Wissen pflegen, offene Fragen beantworten, Eskalation regeln."
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
              render={<Link href="/app/settings/einbetten" />}
            >
              <MessageCircle className="size-4" /> Chat-Bubble einbetten
            </Button>
          </>
        }
      />

      <AssistentNav />

      <div className="mt-6">{children}</div>
    </main>
  );
}

/** Braucht den Konto-Slug (uncached) → streamt in die statische Shell. */
async function ChatTestLink() {
  const { account } = await requireAccount();
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

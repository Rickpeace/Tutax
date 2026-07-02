import Link from "next/link";
import { Suspense } from "react";
import { ExternalLink, MessageCircle } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { AssistentNav } from "@/components/app/assistent-nav";

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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink">KI-Assistent</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Der Chat-Assistent Ihrer Hilfe-Seite: Wissen pflegen, offene Fragen
            beantworten, Eskalation regeln.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Suspense
            fallback={
              <div className="h-8 w-28 animate-pulse rounded-md bg-line-2/70" />
            }
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
        </div>
      </div>

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

import Link from "next/link";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Hinweis-Karte für Pro-Funktionen im Gratis-Tarif (Produktentscheid 23.09.2026: KI-Assistent,
 * Wissensdatenbank, Chat-Bubble, Insights/Offene Fragen, eigenes Logo & CI erst ab Pro).
 * Server-tauglich. Die Sperre selbst sitzt in den Actions/Routen — die Karte erklärt sie nur.
 */
export function ProLockCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-card border-2 border-line bg-card p-6 text-center">
      <div className="mx-auto grid size-11 place-items-center rounded-full bg-teal-soft text-[#118576]">
        <Crown className="size-5" />
      </div>
      <h2 className="mt-3 text-lg font-black text-ink">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-ink-2">{text}</p>
      <Button className="mt-4" size="sm" nativeButton={false} render={<Link href="/app/settings/tarif" />}>
        Tarife ansehen
      </Button>
    </div>
  );
}

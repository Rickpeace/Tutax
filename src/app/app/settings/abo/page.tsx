import { Check, Crown, TriangleAlert } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { isPro, FREE_TUTORIAL_LIMIT } from "@/lib/plan";
import { Button } from "@/components/ui/button";

const plans = [
  {
    key: "free",
    name: "Kostenlos",
    price: "0 €",
    period: "/ Monat",
    features: ["1 Hilfe-Seite", `Bis zu ${FREE_TUTORIAL_LIMIT} Tutorials`, "Highlights & Verzweigungen", "Steply-Branding im Footer"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "29 €",
    period: "/ Monat",
    highlight: true,
    features: ["Unbegrenzte Tutorials", "Eigenes Logo & CI-Farben", "KI-CI-Übernahme", "Hilfe-Chatbot", "Kein Steply-Branding"],
  },
  {
    key: "premium",
    name: "Premium",
    price: "79 €",
    period: "/ Monat",
    features: ["Alles aus Pro", "Eigene Domain (hilfe.firma.de)", "Drift-Überwachung (KI)", "Analytics & Drop-off", "Priorisierter Support"],
  },
];

export default async function AboPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const { account } = await requireAccount();
  const { limit } = await searchParams;
  const pro = isPro(account);
  const currentKey = pro ? "pro" : "free";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Abo &amp; Tarif</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {pro ? (
            <>Für dieses Konto ist <b className="text-ink">Pro</b> freigeschaltet.</>
          ) : (
            <>Sie nutzen aktuell den kostenlosen Tarif.</>
          )}
        </p>
      </div>

      {limit === "tutorials" && !pro && (
        <div className="flex items-start gap-2 rounded-xl border border-no/30 bg-no-soft p-3 text-sm text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-no" />
          <p>
            <b>Free-Limit erreicht:</b> Im kostenlosen Tarif sind bis zu {FREE_TUTORIAL_LIMIT} eigene
            Tutorials möglich. Für unbegrenzte Tutorials wechseln Sie zu Pro — oder löschen Sie
            nicht mehr benötigte Entwürfe.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.key === currentKey;
          return (
            <div
              key={p.name}
              className={`flex flex-col rounded-2xl border bg-card p-5 ${
                p.highlight ? "border-primary shadow-[0_6px_24px_rgba(61,78,230,0.12)]" : "border-border"
              }`}
            >
              {p.highlight && (
                <span className="mb-2 inline-flex w-fit items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-primary">
                  {pro ? <Crown className="size-3" /> : null} {pro && p.key === "pro" ? "Ihr Plan" : "Beliebt"}
                </span>
              )}
              <div className="font-bold text-ink">{p.name}</div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-ink">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-yes" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5">
                {current ? (
                  <Button variant="outline" className="w-full" disabled>
                    Aktueller Plan
                  </Button>
                ) : (
                  <Button className="w-full" disabled>
                    Bald buchbar
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Die Online-Buchung folgt in Kürze. Bis dahin kann Pro manuell freigeschaltet werden —
        antworten Sie einfach auf Ihre Willkommens-Mail oder kontaktieren Sie Steply.
      </p>
    </div>
  );
}

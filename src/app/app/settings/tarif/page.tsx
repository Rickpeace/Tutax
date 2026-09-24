import { Check, TriangleAlert } from "lucide-react";
import { requireAccount } from "@/lib/account";
import { isPro, isBusiness, FREE_TUTORIAL_LIMIT } from "@/lib/plan";
import { PLANS as plans } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { SettingsHeader } from "@/components/app/settings-ui";

const ORDER = { free: 0, pro: 1, business: 2 } as const;

export default async function TarifPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string }>;
}) {
  const { account } = await requireAccount();
  const { limit } = await searchParams;
  const pro = isPro(account);
  const currentKey = isBusiness(account) ? "business" : pro ? "pro" : "free";
  const currentName = plans.find((p) => p.key === currentKey)?.name ?? "Kostenlos";

  return (
    <div className="grid gap-[18px]">
      <SettingsHeader
        group="Abrechnung"
        title="Tarif"
        lead={
          <>
            Sie nutzen den Tarif <b className="text-ink">{currentName}</b>.
          </>
        }
      />

      {limit === "tutorials" && !pro && (
        <div className="flex items-start gap-2 rounded-card border-2 border-no/25 bg-no-soft p-3 text-sm text-ink">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-no" />
          <p>
            <b>Grenze erreicht:</b> Im kostenlosen Tarif sind bis zu {FREE_TUTORIAL_LIMIT} eigene
            Anleitungen möglich. Für unbegrenzt viele wechseln Sie zu Pro – oder löschen Sie nicht
            mehr benötigte Entwürfe.
          </p>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((p) => {
          const current = p.key === currentKey;
          // „Buchbar" = höherer Tarif als der aktuelle. Nur dort gibt es „Bald buchbar"
          // und das „Beliebt"-Etikett; der aktive und kleinere Tarife bleiben ruhig.
          const upgrade = ORDER[p.key] > ORDER[currentKey];
          const popular = p.highlight && upgrade;
          return (
            <div
              key={p.key}
              data-plan={p.key}
              data-current={current ? "true" : undefined}
              className={`flex flex-col rounded-card border-2 bg-card p-5 ${
                current
                  ? "border-primary shadow-[0_0_0_3px_var(--accent)]"
                  : popular
                    ? "border-[#f6b8a8]"
                    : "border-line"
              }`}
            >
              <div className="flex min-h-6 items-center gap-2">
                <span className="font-black text-ink">{p.name}</span>
                {current && (
                  <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-px text-[11px] font-black text-teal-text">
                    <Check className="size-3" strokeWidth={3} /> Ihr Tarif
                  </span>
                )}
                {popular && (
                  <span className="ml-auto rounded-full bg-accent px-2 py-px text-[11px] font-black text-coral-text">
                    Beliebt
                  </span>
                )}
              </div>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-black text-ink">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal" /> {f}
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex min-h-9 items-center">
                {current ? (
                  <span className="text-sm font-extrabold text-teal-text">Aktiv für Ihre Organisation</span>
                ) : upgrade ? (
                  <Button className="w-full" disabled>
                    Bald buchbar
                  </Button>
                ) : (
                  // Kleinere Tarife: neutral — „In Ihrem Tarif enthalten“ stand sonst unter
                  // Einschränkungen wie „Bis zu 5 Anleitungen“ (Audit 24.09.).
                  <span className="text-sm font-bold text-muted-foreground">Kleinerer Tarif</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentKey !== "business" && (
        <p className="text-xs text-muted-foreground">
          Die Online-Buchung folgt in Kürze. Bis dahin schalten wir Pro oder Business gern von Hand
          frei.
        </p>
      )}
    </div>
  );
}

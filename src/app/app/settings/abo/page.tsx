import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Kostenlos",
    price: "0 €",
    period: "/ Monat",
    current: true,
    features: ["1 Hilfe-Seite", "Bis zu 5 Tutorials", "Highlights & Verzweigungen", "Steply-Branding im Footer"],
  },
  {
    name: "Pro",
    price: "29 €",
    period: "/ Monat",
    highlight: true,
    features: ["Unbegrenzte Tutorials", "Eigenes Logo & CI-Farben", "KI-CI-Übernahme", "Hilfe-Chatbot", "Kein Steply-Branding"],
  },
  {
    name: "Premium",
    price: "79 €",
    period: "/ Monat",
    features: ["Alles aus Pro", "Eigene Domain (hilfe.firma.de)", "Drift-Überwachung (KI)", "Analytics & Drop-off", "Priorisierter Support"],
  },
];

export default function AboPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-ink">Abo &amp; Tarif</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Sie nutzen aktuell den kostenlosen Tarif. Upgrades sind in Kürze verfügbar.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`flex flex-col rounded-2xl border bg-card p-5 ${
              p.highlight ? "border-primary shadow-[0_6px_24px_rgba(61,78,230,0.12)]" : "border-border"
            }`}
          >
            {p.highlight && (
              <span className="mb-2 inline-flex w-fit rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-primary">
                Beliebt
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
              {p.current ? (
                <Button variant="outline" className="w-full" disabled>
                  Aktueller Plan
                </Button>
              ) : (
                <Button className="w-full" disabled>
                  Bald verfügbar
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Preise sind Platzhalter. Zahlungsabwicklung (z. B. Stripe) wird später ergänzt.
      </p>
    </div>
  );
}

import { FREE_TUTORIAL_LIMIT } from "@/lib/plan";

// Quelle der Wahrheit für die Tarife (Landing + Abo-Seite teilen sich diese Liste).
// Preise/Features hier pflegen, nicht doppelt.

export type Plan = {
  key: "free" | "pro" | "premium";
  name: string;
  price: string;
  period: string;
  highlight?: boolean;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Kostenlos",
    price: "0 €",
    period: "/ Monat",
    features: [
      "1 Hilfe-Seite",
      `Bis zu ${FREE_TUTORIAL_LIMIT} Tutorials`,
      "Highlights & Verzweigungen",
      "Steply-Branding im Footer",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "29 €",
    period: "/ Monat",
    highlight: true,
    features: [
      "Unbegrenzte Tutorials",
      "Eigenes Logo & CI-Farben",
      "KI-CI-Übernahme",
      "Hilfe-Chatbot",
      "Kein Steply-Branding",
    ],
  },
  {
    key: "premium",
    name: "Premium",
    price: "79 €",
    period: "/ Monat",
    features: [
      "Alles aus Pro",
      "Eigene Domain (hilfe.firma.de)",
      "Drift-Überwachung (KI)",
      "Analytics & Drop-off",
      "Priorisierter Support",
    ],
  },
];

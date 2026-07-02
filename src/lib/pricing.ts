import { FREE_TUTORIAL_LIMIT } from "@/lib/plan";

// Quelle der Wahrheit für die Tarife (Landing + Abo-Seite teilen sich diese Liste).
// Preise/Features hier pflegen, nicht doppelt. Serverseitige Durchsetzung: lib/plan.ts
// (isPro/isBusiness) + Gates in den Actions (Sprachen, KI-CI, Intern, TTS, Free-Limit).

export type Plan = {
  key: "free" | "pro" | "business";
  name: string;
  price: string;
  period: string;
  tagline: string;
  highlight?: boolean;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Kostenlos",
    price: "0 €",
    period: "/ Monat",
    tagline: "Zum Ausprobieren",
    features: [
      "1 Hilfe-Seite",
      `Bis zu ${FREE_TUTORIAL_LIMIT} Tutorials`,
      "Voller Builder: Highlights, Lupe, Blur, Verzweigungen",
      "3 Video→Tutorials zum Antesten",
      "Link, QR-Codes & Druckansicht",
      "Steply-Branding im Footer",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    price: "29 €",
    period: "/ Monat",
    tagline: "Für den täglichen Einsatz",
    highlight: true,
    features: [
      "Unbegrenzte Tutorials & Videos",
      "Recorder-Extension mit Direkt-Upload",
      "KI-Chatbot + Wissensdatenbank (inkl. Import aus Website & Dokumenten)",
      "Chat-Bubble für Ihre Website",
      "Insights & Offene Fragen mit „Entwurf erstellen“",
      "Eigenes Logo & CI-Farben",
      "Team bis 5 Mitglieder",
      "Kein Steply-Branding",
    ],
  },
  {
    key: "business",
    name: "Business",
    price: "79 €",
    period: "/ Monat",
    tagline: "Automatisierung & Compliance",
    features: [
      "Alles aus Pro",
      "KI-Design: CI automatisch von Ihrer Website",
      "Mehrsprachige Hilfe-Seite (EN/PL/TR, Auto-Sync)",
      "Vorlesen per KI-Stimme",
      "Aktualitäts-Autopilot",
      "Interne Schulungen + Schulungsnachweis",
      "Unbegrenztes Team",
      "Eigene Domain (bald) · Priorisierter Support",
    ],
  },
];

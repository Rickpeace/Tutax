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
      `Bis zu ${FREE_TUTORIAL_LIMIT} Anleitungen`,
      "Voller Editor: Markierungen, Lupe, Verpixeln, Verzweigungen",
      "3 Anleitungen aus Video zum Antesten",
      "Link, QR-Codes & Druckansicht",
      "Hinweis „Erstellt mit Steply“ im Fußbereich",
      "Nur für Sie allein (ohne Team)",
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
      "Unbegrenzte Anleitungen & Videos",
      "Steply-Erweiterung mit Direkt-Upload",
      "KI-Assistent + Wissensdatenbank (inkl. Import aus Website & Dokumenten)",
      "Chat-Bubble für Ihre Website",
      "Insights & Offene Fragen mit „Entwurf erstellen“",
      "Eigenes Logo & CI-Farben",
      "Team bis 5 Personen – Inhaber, Bearbeiter & Mitarbeiter",
      "Schulungen mit Schulungsnachweis (aus Anleitungen Ihrer Hilfe-Seite)",
      "Ohne Hinweis „Erstellt mit Steply“",
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
      "Aktualität prüfen – automatisch jede Woche",
      "Interne Schulungen nur fürs Team (nicht auf der Hilfe-Seite)",
      "Unbegrenzt viele Personen im Team",
      "Eigene Domain (bald) · Priorisierter Support",
    ],
  },
];

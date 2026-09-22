"use client";

import { useEffect } from "react";

/**
 * Meldet die aktive Sprache der Hilfe-Seite im <html lang>-Attribut.
 *
 * Hintergrund: Das Wurzel-Layout (src/app/layout.tsx) rendert die gesamte App und steht
 * damit über allen Routen — es kennt weder `?lang=` noch die aktivierte Sprachliste eines
 * Kontos und muss wegen PPR statisch bleiben. Deshalb setzt nur der /h-Zweig das Attribut
 * nachträglich um; alles andere bleibt unverändert deutsch.
 *
 * Zwei Wege, damit es nie „blinkt“:
 *  - Ein Inline-Script läuft schon beim Parsen der Seite (vor der Hydration, vor dem
 *    Vorlesen durch Screenreader).
 *  - Der Effekt greift zusätzlich bei client-seitiger Navigation (Hilfe-Seite ↔ Anleitung,
 *    Sprachumschalter) und stellt beim Verlassen wieder auf Deutsch zurück.
 */
export function HtmlLang({ lang }: { lang: string }) {
  useEffect(() => {
    document.documentElement.lang = lang;
    return () => {
      document.documentElement.lang = "de";
    };
  }, [lang]);

  return (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.lang=${JSON.stringify(lang)}`,
      }}
    />
  );
}

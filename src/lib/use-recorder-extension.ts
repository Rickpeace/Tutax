"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Erkennt clientseitig (nach Mount) die installierte Steply-Erweiterung am DOM-Marker
 * `data-steply-recorder` (content.js setzt ihn früh; isolated world → nur das DOM ist geteilt).
 * `installed`: null = wird noch geprüft. Kurze Nachkontrollen (0,5 s / 1,5 s) fangen ein minimal
 * späteres Content-Script ab.
 *
 * `poll` (Einrichtungs-Seite): solange NICHT erkannt, alle 2 s nachprüfen. Nach dem Laden der
 * Erweiterung impft background.js content.js in bereits offene Tabs nach (onInstalled →
 * injectIntoOpenTabs) — die Seite springt dann ohne Neuladen weiter.
 */
export function useRecorderExtension({ poll = false }: { poll?: boolean } = {}) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [version, setVersion] = useState("");

  useEffect(() => {
    let cancelled = false;
    let found = false;
    const read = () => {
      if (cancelled || found) return;
      const v = document.documentElement.getAttribute("data-steply-recorder");
      if (v != null) {
        found = true;
        setInstalled(true);
        setVersion(v);
      }
    };
    // setState ASYNCHRON planen (kein synchrones setState im Effekt-Body).
    const t0 = setTimeout(() => {
      read();
      if (!found && !cancelled) setInstalled(false);
    }, 0);
    const t1 = setTimeout(read, 500);
    const t2 = setTimeout(read, 1500);
    const iv = poll ? setInterval(read, 2000) : null;
    return () => {
      cancelled = true;
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      if (iv) clearInterval(iv);
    };
  }, [poll]);

  return { installed, version };
}

export type BrowserKind = "chrome" | "edge";

const noopSubscribe = () => () => {};

/**
 * Chrome oder Edge? Nur für die passenden Installations-Hinweise (Adresse, Beschriftungen).
 * Edge meldet sich mit „Edg/“ im User-Agent. Alles andere (auch unbekannt, Server-Render)
 * gilt als Chrome — die Anleitung für Chrome passt auf die meisten Chromium-Browser.
 */
export function useBrowserKind(): BrowserKind {
  return useSyncExternalStore(
    noopSubscribe,
    () => (/\bEdg(?:A|iOS)?\//.test(navigator.userAgent) ? "edge" : "chrome"),
    () => "chrome",
  );
}

/** true, wenn Version a neuer als b ist (a/b wie „2.18.6“). */
export function isNewerVersion(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

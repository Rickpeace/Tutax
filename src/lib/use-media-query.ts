"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Touch-Gerät (Finger statt Maus) ODER schmaler Bildschirm — dort gibt es keine Browser-
 * Erweiterung (Handy-Audit 24.09.2026: Aufnahme-Wege dort nicht als Empfehlung zeigen). */
export const MOBILE_QUERY = "(pointer: coarse), (max-width: 639px)";
/** Nur Touch-Gerät (Finger statt Maus). */
export const COARSE_QUERY = "(pointer: coarse)";

/**
 * Trifft die CSS-Media-Query gerade zu? Hydration-sicher: Server und erster Client-Render
 * liefern `false` (wie ein Desktop mit Maus), danach der echte Wert — ohne Hydration-Fehler.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const mq = window.matchMedia?.(query);
      mq?.addEventListener?.("change", cb);
      return () => mq?.removeEventListener?.("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => !!window.matchMedia?.(query).matches,
    () => false,
  );
}

"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * „Mitarbeiter-Modus" der App-Navigation (Rolle „member" = nur Schulungen).
 * Die Kopfleiste/Handy-Leiste/Einstellungs-Leiste sind statisches Gerüst (Cache
 * Components) und kennen die Rolle nicht. Der gestreamte Avatar-Slot (kennt die Rolle)
 * rendert <MemberModeSync>, die Navigations-Teile lesen useMemberMode() und blenden
 * alles außer Schulungen/Profil aus. Rein kosmetisch — durchgesetzt wird serverseitig
 * (requireAccount leitet Mitarbeiter von gesperrten Seiten um; RLS sperrt Schreiben).
 */
let memberMode = false;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useMemberMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => memberMode,
    () => false,
  );
}

export function MemberModeSync({ on }: { on: boolean }) {
  useEffect(() => {
    if (memberMode === on) return;
    memberMode = on;
    listeners.forEach((l) => l());
  }, [on]);
  return null;
}

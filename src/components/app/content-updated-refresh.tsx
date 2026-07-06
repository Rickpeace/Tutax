"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Lauscht auf das „Inhalt aktualisiert"-Signal der Recorder-Extension: Nach einem
 * erfolgreichen Upload benachrichtigt die Seitenleiste alle offenen App-Tabs
 * (chrome.tabs.sendMessage → content.js → window.postMessage). Wir laden dann die
 * Server-Daten neu — frisch hochgeladene Aufnahmen erscheinen im offenen Builder
 * bzw. in der Bibliothek ohne F5 (Richards Wunsch, 06.07.).
 *
 * Sicherheit: nur Nachrichten aus dem eigenen Fenster + Origin, nur unser
 * __steply-Umschlag. router.refresh() ist idempotent und verwirft keinen
 * lokalen Eingabe-Zustand (Client-State bleibt erhalten).
 */
export function ContentUpdatedRefresh() {
  const router = useRouter();
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { __steply?: boolean; type?: string } | null;
      if (!d || d.__steply !== true || d.type !== "steply-content-updated") return;
      router.refresh();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}

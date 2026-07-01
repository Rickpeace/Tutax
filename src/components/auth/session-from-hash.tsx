"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Schließt den impliziten Magic-Link-Flow ab: Standard-Supabase-E-Mails leiten mit
 * der Session im URL-Fragment (#access_token=…) weiter — das kann ein Server-Handler
 * NICHT lesen. Diese Client-Komponente liest das Fragment, setzt die Session (Cookies)
 * und lädt dann `next` (ohne Fragment) neu, sodass der Server eingeloggt weitermacht.
 * Kein Fragment / Fehler -> `fallback`.
 */
export function SessionFromHash({ next, fallback }: { next: string; fallback: string }) {
  useEffect(() => {
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const p = new URLSearchParams(raw);
    if (p.get("error_description") || p.get("error")) {
      window.location.replace(fallback);
      return;
    }
    const access_token = p.get("access_token");
    const refresh_token = p.get("refresh_token");
    if (!access_token || !refresh_token) {
      window.location.replace(fallback);
      return;
    }
    createClient()
      .auth.setSession({ access_token, refresh_token })
      .then(({ error }) => window.location.replace(error ? fallback : next))
      .catch(() => window.location.replace(fallback));
  }, [next, fallback]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Anmeldung wird abgeschlossen …</p>
    </div>
  );
}

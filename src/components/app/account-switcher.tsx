"use client";

import { useState } from "react";
import { toast } from "sonner";
import { setActiveAccount } from "@/app/app/actions";

type Membership = { id: string; name: string; role: string };

/**
 * Organisation wechseln + frisch in /app landen. Gemeinsam für Auswahlfeld (Einstellungen)
 * und Avatar-Menü. Schlägt der Aufruf fehl, wird der Umschalter wieder freigegeben und der
 * Nutzer informiert. Wirft die Action selbst (typisch: Tab mit veralteter App-Version nach
 * einem Deploy -> „Server Action not found", oder Netz weg), lädt die Seite neu — danach
 * läuft die aktuelle Version und ein erneuter Versuch klappt.
 */
export function useSwitchAccount() {
  const [busy, setBusy] = useState(false);

  async function switchTo(accountId: string) {
    setBusy(true);
    try {
      const res = await setActiveAccount(accountId);
      if (!res?.ok) {
        toast.error(res?.error || "Organisation konnte nicht gewechselt werden.");
        setBusy(false);
        return false;
      }
      window.location.assign("/app"); // frisch in die gewechselte Org
      return true;
    } catch {
      toast.error("Wechsel hat nicht geklappt – die Seite wird neu geladen. Bitte danach erneut versuchen.");
      setTimeout(() => window.location.reload(), 1500);
      return false;
    }
  }

  return { busy, switchTo };
}

/**
 * Zeigt die aktive Organisation. Gehört der Nutzer mehreren an, wird ein
 * Umschalter angeboten (User-Metadaten `active_account_id` -> Reload mit neuem Konto).
 */
export function AccountSwitcher({
  currentId,
  currentName,
  memberships,
  full = false,
}: {
  currentId: string;
  currentName: string;
  memberships: Membership[];
  /** Volle Breite (Sidebar) statt kompakter Inline-Variante (frühere Topbar). */
  full?: boolean;
}) {
  const { busy, switchTo } = useSwitchAccount();
  // Kontrolliert, damit das Feld bei Fehlern auf die echte aktive Org zurückspringt.
  const [value, setValue] = useState(currentId);

  if (memberships.length <= 1) {
    return (
      <span
        className={
          full
            ? "block truncate rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-ink-2"
            : "hidden max-w-[12rem] truncate text-sm font-medium text-ink-2 sm:inline"
        }
      >
        {currentName}
      </span>
    );
  }

  return (
    <select
      value={value}
      disabled={busy}
      aria-label="Organisation wechseln"
      onChange={async (e) => {
        const next = e.target.value;
        if (next === currentId) return;
        setValue(next);
        if (!(await switchTo(next))) setValue(currentId);
      }}
      className={
        full
          ? "block w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium text-ink-2 outline-none focus:border-ring"
          : "inline-block max-w-[8.5rem] rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-ink-2 outline-none focus:border-ring sm:max-w-[13rem]"
      }
    >
      {memberships.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
          {m.role === "owner" ? " · Inhaber" : ""}
        </option>
      ))}
    </select>
  );
}

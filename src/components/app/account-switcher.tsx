"use client";

import { useState } from "react";
import { setActiveAccount } from "@/app/app/actions";

type Membership = { id: string; name: string; role: string };

/**
 * Zeigt die aktive Organisation. Gehört der Nutzer mehreren an, wird ein
 * Umschalter angeboten (Cookie `active_account` -> Reload mit neuem Konto).
 */
export function AccountSwitcher({
  currentId,
  currentName,
  memberships,
}: {
  currentId: string;
  currentName: string;
  memberships: Membership[];
}) {
  const [busy, setBusy] = useState(false);

  if (memberships.length <= 1) {
    return (
      <span className="hidden max-w-[12rem] truncate text-sm font-medium text-ink-2 sm:inline">
        {currentName}
      </span>
    );
  }

  return (
    <select
      defaultValue={currentId}
      disabled={busy}
      aria-label="Organisation wechseln"
      onChange={async (e) => {
        setBusy(true);
        await setActiveAccount(e.target.value);
        window.location.assign("/app"); // frisch in die gewechselte Org
      }}
      className="inline-block max-w-[8.5rem] rounded-md border border-border bg-card px-2 py-1 text-sm font-medium text-ink-2 outline-none focus:border-ring sm:max-w-[13rem]"
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
